import type { DB } from '../db.ts';
import { getMeta, setMeta } from '../db.ts';
import { activeLeagues, urls, type LeagueConfig } from '../espn/config.ts';
import { fetchJson } from '../espn/client.ts';
import { parseScoreboard, parseStandings, parseSummary } from '../espn/parse.ts';
import { ensureCatalog, logIngest, matchId, saveRaw, saveStandings, saveSummary, upsertMatch } from './store.ts';

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

async function timed<T>(db: DB, kind: string, target: string, fn: () => Promise<{ rows: number; value: T }>): Promise<T | null> {
  const t0 = Date.now();
  try {
    const { rows, value } = await fn();
    logIngest(db, kind, target, true, rows, Date.now() - t0);
    return value;
  } catch (err) {
    logIngest(db, kind, target, false, 0, Date.now() - t0, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export class Ingestor {
  private busy = new Set<string>();
  constructor(
    private db: DB,
    private leagues: LeagueConfig[] = activeLeagues(),
  ) {
    ensureCatalog(db);
  }

  /** Evita que dos ciclos del mismo tipo se solapen. */
  private async once(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.busy.has(name)) return;
    this.busy.add(name);
    try {
      await fn();
    } finally {
      this.busy.delete(name);
    }
  }

  // ───────────── scoreboard ─────────────

  /** Descarga todos los partidos de una liga entre dos fechas (inclusive). */
  async syncRange(league: LeagueConfig, from: Date, to: Date): Promise<number> {
    const dates = from.toISOString().slice(0, 10) === to.toISOString().slice(0, 10) ? ymd(from) : `${ymd(from)}-${ymd(to)}`;
    const total = await timed(this.db, 'scoreboard', `${league.id} ${dates}`, async () => {
      let json: unknown;
      try {
        json = await fetchJson(urls.scoreboard(league, dates));
      } catch (err) {
        if (!dates.includes('-')) throw err;
        // Algunas ligas no aceptan rangos: se cae a día por día.
        let n = 0;
        for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
          const day = await fetchJson(urls.scoreboard(league, ymd(d)));
          saveRaw(this.db, 'scoreboard', `${league.id}:${ymd(d)}`, league.id, day);
          n += this.saveScoreboard(league, day);
        }
        return { rows: n, value: n };
      }
      saveRaw(this.db, 'scoreboard', `${league.id}:${dates}`, league.id, json);
      const n = this.saveScoreboard(league, json);
      return { rows: n, value: n };
    });
    return total ?? 0;
  }

  private saveScoreboard(league: LeagueConfig, json: unknown): number {
    const { matches, skipped } = parseScoreboard(league, json);
    this.db.transaction(() => {
      for (const m of matches) upsertMatch(this.db, league, m);
    })();
    if (skipped > 0) logIngest(this.db, 'parse-warning', league.id, true, skipped, 0, `${skipped} eventos del scoreboard no se pudieron interpretar`);
    return matches.length;
  }

  // ───────────── boxscore por partido ─────────────

  async syncDetails(id: string): Promise<boolean> {
    const row = this.db.prepare('SELECT league_id, espn_id, status FROM matches WHERE id = ?').get(id) as { league_id: string; espn_id: string; status: string } | undefined;
    const league = row && this.leagues.find((l) => l.id === row.league_id);
    if (!row || !league || !league.hasDetails) return false;
    const res = await timed(this.db, 'summary', id, async () => {
      const json = await fetchJson(urls.summary(league, row.espn_id));
      saveRaw(this.db, 'summary', id, league.id, json);
      const parsed = parseSummary(league, json);
      const rows = saveSummary(this.db, league, id, parsed, row.status === 'final');
      return { rows, value: true };
    });
    return res === true;
  }

  /** Partidos terminados cuyo boxscore aún no se ha bajado completo. Más recientes primero. */
  async detailBacklog(limit = 60): Promise<number> {
    let done = 0;
    await this.once('details', async () => {
      const ids = this.db
        .prepare(
          `SELECT m.id FROM matches m JOIN leagues l ON l.id = m.league_id
           WHERE m.status = 'final' AND m.detail_final = 0 AND m.detail_attempts < 3 AND l.has_details = 1
             AND m.league_id IN (${this.leagues.map(() => '?').join(',')})
           ORDER BY m.start_time DESC LIMIT ?`,
        )
        .all(...this.leagues.map((l) => l.id), limit) as { id: string }[];
      // Un pequeño paralelismo; el cliente HTTP ya limita la concurrencia global.
      const chunks = 4;
      for (let i = 0; i < ids.length; i += chunks) {
        const results = await Promise.all(ids.slice(i, i + chunks).map((r) => this.syncDetails(r.id)));
        done += results.filter(Boolean).length;
      }
    });
    return done;
  }

  async syncStandings(league: LeagueConfig): Promise<number> {
    if (league.kind === 'individual') return 0;
    const n = await timed(this.db, 'standings', league.id, async () => {
      const json = await fetchJson(urls.standings(league));
      saveRaw(this.db, 'standings', league.id, league.id, json);
      const parsed = parseStandings(league, json);
      const season = (this.db.prepare('SELECT MAX(season) AS s FROM matches WHERE league_id = ?').get(league.id) as { s: number | null }).s ?? new Date().getUTCFullYear();
      const rows = saveStandings(this.db, league, parsed, season);
      return { rows, value: rows };
    });
    return n ?? 0;
  }

  // ───────────── orquestación ─────────────

  /** Carga histórica: últimos N días para todas las ligas, y luego sus boxscores. */
  async backfill(days: number, opts: { details?: boolean; onProgress?: (msg: string) => void } = {}): Promise<void> {
    const say = opts.onProgress ?? (() => {});
    const end = addDays(new Date(), 2);
    const start = addDays(new Date(), -days);
    const CHUNK = 14;
    for (const league of this.leagues) {
      let n = 0;
      for (let from = new Date(start); from <= end; from = addDays(from, CHUNK)) {
        const to = new Date(Math.min(addDays(from, CHUNK - 1).getTime(), end.getTime()));
        n += await this.syncRange(league, from, to);
      }
      say(`${league.id}: ${n} partidos`);
      await this.syncStandings(league);
    }
    setMeta(this.db, 'backfill_done_at', new Date().toISOString());
    if (opts.details !== false) {
      say('Descargando boxscores (estadísticas de equipos y jugadores)…');
      for (;;) {
        const n = await this.detailBacklog(120);
        say(`  boxscores guardados en esta pasada: ${n}`);
        if (n === 0) break;
      }
    }
  }

  /** Ciclo corto (cada ~60 s): solo ligas con partidos en juego o a punto de empezar. */
  async liveCycle(): Promise<void> {
    await this.once('live', async () => {
      const nowIso = new Date().toISOString();
      const soon = new Date(Date.now() + 40 * 60000).toISOString();
      const rows = this.db
        .prepare(
          `SELECT DISTINCT league_id FROM matches
           WHERE status = 'live' OR (status = 'scheduled' AND start_time <= ? AND start_time >= ?)`,
        )
        .all(soon, new Date(Date.now() - 6 * 3600000).toISOString()) as { league_id: string }[];
      const wanted = new Set(rows.map((r) => r.league_id));
      const today = new Date();
      for (const league of this.leagues.filter((l) => wanted.has(l.id))) {
        await this.syncRange(league, addDays(today, -1), addDays(today, 1));
      }
      // Boxscore de los partidos en vivo (como mucho cada 2 minutos por partido).
      const live = this.db
        .prepare(
          `SELECT m.id FROM matches m JOIN leagues l ON l.id = m.league_id
           WHERE m.status = 'live' AND l.has_details = 1 AND (m.detail_fetched_at IS NULL OR m.detail_fetched_at < ?)`,
        )
        .all(new Date(Date.now() - Number(process.env.LIVE_DETAIL_MS || 40_000)).toISOString()) as { id: string }[];
      for (const r of live) await this.syncDetails(r.id);
      // Los que acaban de terminar: boxscore definitivo.
      await this.detailBacklog(40);
      setMeta(this.db, 'last_live_cycle', nowIso);
    });
  }

  /** Barrido completo (cada ~30 min): ayer → +3 días en todas las ligas. */
  async sweep(): Promise<void> {
    await this.once('sweep', async () => {
      const today = new Date();
      for (const league of this.leagues) await this.syncRange(league, addDays(today, -1), addDays(today, 3));
      await this.detailBacklog(80);
      setMeta(this.db, 'last_sweep', new Date().toISOString());
    });
  }

  async standingsAll(): Promise<void> {
    await this.once('standings', async () => {
      for (const league of this.leagues) await this.syncStandings(league);
      setMeta(this.db, 'last_standings', new Date().toISOString());
    });
  }

  /** Re-procesa los JSON guardados (por si se corrige un parser) sin tocar la red. */
  async reparse(onProgress?: (m: string) => void): Promise<void> {
    const { readRaw } = await import('./store.ts');
    const rows = this.db.prepare('SELECT kind, key, league_id, body FROM raw_payloads ORDER BY kind').all() as { kind: string; key: string; league_id: string; body: Buffer }[];
    let n = 0;
    for (const r of rows) {
      const league = this.leagues.find((l) => l.id === r.league_id);
      if (!league) continue;
      const json = readRaw(r.body);
      if (r.kind === 'scoreboard') this.saveScoreboard(league, json);
      else if (r.kind === 'summary') {
        const status = (this.db.prepare('SELECT status FROM matches WHERE id = ?').get(r.key) as { status: string } | undefined)?.status;
        if (status) saveSummary(this.db, league, r.key, parseSummary(league, json), status === 'final');
      }
      n++;
    }
    onProgress?.(`Re-procesados ${n} documentos guardados`);
  }

  get lastBackfill(): string | null {
    return getMeta(this.db, 'backfill_done_at');
  }
}

export { matchId };
