import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import { Worker } from 'node:worker_threads';
import type { DB } from './db.ts';
import { getMeta } from './db.ts';
import { activeLeagues } from './espn/config.ts';
import { backtest, defaultEloParams, defaultPoissonParams, loadFinals, type EloParams, type PoissonParams } from './analytics/models.ts';
import { answerQuestion } from './ai.ts';
import { headToHead, leagueElo, leagueSummary, predictMatch, teamRecord, teamStatAverages } from './analytics/stats.ts';

const asyncH = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};

const q = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const qn = (v: unknown, def: number, min: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};

// Memoización simple para consultas pesadas
const memoStore = new Map<string, { at: number; v: unknown }>();
function memo<T>(key: string, ttlMs: number, fn: () => T): T {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = fn();
  memoStore.set(key, { at: Date.now(), v });
  if (memoStore.size > 500) memoStore.delete(memoStore.keys().next().value!);
  return v;
}

// Tablas visibles en el explorador de datos (raw_payloads queda fuera a propósito: es binario y enorme)
const EXPLORABLE = ['matches', 'teams', 'players', 'team_match_stats', 'player_match_stats', 'appearances', 'match_events', 'standings', 'odds_snapshots', 'leagues', 'sports', 'ingest_log'] as const;

export function buildApi(db: DB, opts: { dbFile: string }): Router {
  const r = express.Router();

  // ───────────── meta ─────────────
  r.get('/meta', asyncH((_req, res) => {
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
    const range = db.prepare("SELECT MIN(start_time) first, MAX(start_time) last FROM matches WHERE status = 'final'").get() as { first: string | null; last: string | null };
    const failures = db.prepare("SELECT COUNT(*) n FROM ingest_log WHERE ok = 0 AND ts > datetime('now','-1 day')").get() as { n: number };
    const okRecent = db.prepare("SELECT COUNT(*) n FROM ingest_log WHERE ok = 1 AND ts > datetime('now','-1 day')").get() as { n: number };
    res.json({
      dataset: getMeta(db, 'dataset') ?? 'real',
      counts: {
        matches: count('matches'), finished: (db.prepare("SELECT COUNT(*) n FROM matches WHERE status='final'").get() as { n: number }).n,
        live: (db.prepare("SELECT COUNT(*) n FROM matches WHERE status='live'").get() as { n: number }).n,
        withBoxscore: (db.prepare('SELECT COUNT(*) n FROM matches WHERE detail_final = 1').get() as { n: number }).n,
        teams: count('teams'), players: count('players'), teamStats: count('team_match_stats'), playerStats: count('player_match_stats'), events: count('match_events'),
      },
      firstMatch: range.first, lastMatch: range.last,
      lastLiveCycle: getMeta(db, 'last_live_cycle'), lastSweep: getMeta(db, 'last_sweep'), backfillDoneAt: getMeta(db, 'backfill_done_at'),
      ingest24h: { ok: okRecent.n, failed: failures.n },
      sqlConsole: process.env.ENABLE_SQL_CONSOLE === 'true',
    });
  }));

  r.get('/ingest-log', asyncH((req, res) => {
    const onlyErrors = req.query.errors === '1';
    res.json(db.prepare(`SELECT ts, kind, target, ok, rows, ms, error FROM ingest_log ${onlyErrors ? 'WHERE ok = 0' : ''} ORDER BY id DESC LIMIT 100`).all());
  }));

  r.get('/sports', asyncH((_req, res) => res.json(db.prepare('SELECT id, name FROM sports ORDER BY name').all())));

  r.get('/leagues', asyncH((_req, res) => {
    const enabled = new Set(activeLeagues().map((l) => l.id));
    const rows = db.prepare(
      `SELECT l.id, l.sport_id sportId, l.name, l.country, l.kind, l.has_details hasDetails,
              COUNT(m.id) matches, SUM(m.status='final') finished, SUM(m.detail_final) withBoxscore, MAX(m.start_time) lastMatch
       FROM leagues l LEFT JOIN matches m ON m.league_id = l.id GROUP BY l.id ORDER BY l.sport_id, l.country, l.name`,
    ).all() as { id: string }[];
    res.json(rows.filter((x) => enabled.has(x.id)));
  }));

  // ───────────── partidos ─────────────
  const MATCH_SELECT = `
    SELECT m.id, m.league_id leagueId, l.name leagueName, m.sport_id sportId, m.season, m.stage, m.start_time startTime,
           m.status, m.status_detail statusDetail, m.clock, m.period, m.home_score homeScore, m.away_score awayScore,
           m.home_line homeLine, m.away_line awayLine, m.winner, m.venue, m.city, m.attendance, m.neutral_site neutral, m.detail_final hasBoxscore,
           (SELECT o.home_ml FROM odds_snapshots o WHERE o.match_id = m.id ORDER BY o.id DESC LIMIT 1) oddsHome,
           (SELECT o.draw_ml FROM odds_snapshots o WHERE o.match_id = m.id ORDER BY o.id DESC LIMIT 1) oddsDraw,
           (SELECT o.away_ml FROM odds_snapshots o WHERE o.match_id = m.id ORDER BY o.id DESC LIMIT 1) oddsAway,
           th.id homeId, th.name homeName, th.short_name homeShort, th.abbreviation homeAbbr, th.logo homeLogo, th.color homeColor,
           ta.id awayId, ta.name awayName, ta.short_name awayShort, ta.abbreviation awayAbbr, ta.logo awayLogo, ta.color awayColor
    FROM matches m JOIN leagues l ON l.id = m.league_id
    JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id`;

  const shapeMatch = (row: Record<string, any>): Record<string, any> => ({
    ...row,
    homeLine: row.homeLine ? JSON.parse(row.homeLine) : null,
    awayLine: row.awayLine ? JSON.parse(row.awayLine) : null,
    neutral: !!row.neutral,
    hasBoxscore: !!row.hasBoxscore,
  });

  r.get('/matches', asyncH((req, res) => {
    const where: string[] = [];
    const args: Record<string, unknown> = {};
    const from = q(req.query.from), to = q(req.query.to);
    if (from) { where.push('m.start_time >= @from'); args.from = from; }
    if (to) { where.push('m.start_time < @to'); args.to = to; }
    const sport = q(req.query.sport); if (sport) { where.push('m.sport_id = @sport'); args.sport = sport; }
    const league = q(req.query.league); if (league) { where.push('m.league_id = @league'); args.league = league; }
    const status = q(req.query.status); if (status) { where.push('m.status = @status'); args.status = status; }
    const team = q(req.query.team); if (team) { where.push('(m.home_team_id = @team OR m.away_team_id = @team)'); args.team = team; }
    const text = q(req.query.q); if (text) { where.push('(th.name LIKE @like OR ta.name LIKE @like)'); args.like = `%${text}%`; }
    const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
    const limit = qn(req.query.limit, 200, 1, 1000);
    const offset = qn(req.query.offset, 0, 0, 1_000_000);
    const rows = db.prepare(`${MATCH_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.start_time ${order}, m.id LIMIT ${limit} OFFSET ${offset}`).all(args) as Record<string, any>[];
    res.json(rows.map(shapeMatch));
  }));

  r.get('/matches/:id', asyncH((req, res) => {
    const id = String(req.params.id);
    const row = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(id) as Record<string, any> | undefined;
    if (!row) return res.status(404).json({ error: 'Partido no encontrado' });
    const match = shapeMatch(row);

    // Estadísticas de equipo, lado a lado
    const ts = db.prepare('SELECT team_id t, key, label, value, display FROM team_match_stats WHERE match_id = ?').all(id) as { t: string; key: string; label: string | null; value: number | null; display: string | null }[];
    const keys = new Map<string, { key: string; label: string | null; home: any; away: any }>();
    for (const s of ts) {
      const e = keys.get(s.key) ?? { key: s.key, label: s.label, home: null, away: null };
      const cell = { value: s.value, display: s.display };
      if (s.t === match.homeId) e.home = cell; else if (s.t === match.awayId) e.away = cell;
      if (!e.label && s.label) e.label = s.label;
      keys.set(s.key, e);
    }

    const events = db.prepare('SELECT seq, clock, period, type, text, team_id teamId, player_id playerId, player_name playerName, scoring, home_score homeScore, away_score awayScore FROM match_events WHERE match_id = ? ORDER BY seq').all(id);

    const pl = db.prepare(
      `SELECT a.player_id id, a.team_id teamId, a.starter, a.position, a.jersey, a.formation_place formationPlace, p.name, p.headshot
       FROM appearances a JOIN players p ON p.id = a.player_id WHERE a.match_id = ? ORDER BY a.starter DESC, a.jersey+0`,
    ).all(id) as { id: string; teamId: string; starter: number | null; position: string | null; jersey: string | null; name: string; headshot: string | null }[];
    const ps = db.prepare('SELECT player_id p, grp, key, label, value, display FROM player_match_stats WHERE match_id = ?').all(id) as { p: string; grp: string; key: string; label: string | null; value: number | null; display: string | null }[];
    const byPlayer = new Map<string, typeof ps>();
    for (const s of ps) (byPlayer.get(s.p) ?? byPlayer.set(s.p, []).get(s.p)!).push(s);
    const players = pl.map((p) => ({ ...p, starter: p.starter === null ? null : !!p.starter, stats: (byPlayer.get(p.id) ?? []).map(({ p: _p, ...rest }) => rest) }));

    // Cuotas publicadas por ESPN (si las hubo) y su evolución
    const lineups = db.prepare('SELECT team_id teamId, formation FROM lineups WHERE match_id = ?').all(id);
    const injuries = db.prepare('SELECT team_id teamId, player_name name, position, status, detail FROM injuries WHERE match_id = ? ORDER BY team_id, player_name').all(id);
    const odds = db.prepare('SELECT provider, captured_at capturedAt, home_ml homeMl, away_ml awayMl, draw_ml drawMl, spread, total, details FROM odds_snapshots WHERE match_id = ? ORDER BY id').all(id);

    // Forma ANTERIOR al partido (no se cuela información del futuro)
    const formBefore = (teamId: string) => db.prepare(
      `SELECT m.id, m.start_time date, m.home_team_id, m.home_score hs, m.away_score aws, th.name hn, ta.name an
       FROM matches m JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
       WHERE (m.home_team_id = @t OR m.away_team_id = @t) AND m.status='final' AND m.home_score IS NOT NULL AND m.start_time < @before
       ORDER BY m.start_time DESC LIMIT 5`,
    ).all({ t: teamId, before: match.startTime }).map((x: any) => {
      const isHome = x.home_team_id === teamId;
      const gf = isHome ? x.hs : x.aws, ga = isHome ? x.aws : x.hs;
      return { matchId: x.id, date: x.date, result: gf > ga ? 'W' : gf === ga ? 'D' : 'L', score: `${x.hs}-${x.aws}`, opponent: isHome ? x.an : x.hn, home: isHome };
    });

    const h2h = headToHead(db, match.homeId, match.awayId, 8);
    h2h.matches = h2h.matches.filter((m) => m.id !== id);

    res.json({
      match,
      teamStats: [...keys.values()],
      events,
      players,
      lineups,
      injuries,
      odds,
      form: { home: formBefore(match.homeId), away: formBefore(match.awayId) },
      h2h,
      prediction: memo(`pred:${id}:${match.status}`, 60_000, () => predictMatch(db, id)),
    });
  }));

  // ───────────── equipos ─────────────
  r.get('/teams', asyncH((req, res) => {
    const where: string[] = []; const args: Record<string, unknown> = {};
    const sport = q(req.query.sport); if (sport) { where.push('t.sport_id = @sport'); args.sport = sport; }
    const text = q(req.query.q); if (text) { where.push('t.name LIKE @like'); args.like = `%${text}%`; }
    const league = q(req.query.league);
    if (league) { where.push('t.id IN (SELECT home_team_id FROM matches WHERE league_id = @league UNION SELECT away_team_id FROM matches WHERE league_id = @league)'); args.league = league; }
    const limit = qn(req.query.limit, 100, 1, 500);
    res.json(db.prepare(`SELECT t.id, t.name, t.short_name shortName, t.abbreviation, t.logo, t.country, t.kind, t.sport_id sportId FROM teams t ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.name LIMIT ${limit}`).all(args));
  }));

  r.get('/teams/:id', asyncH((req, res) => {
    const id = String(req.params.id);
    const team = db.prepare('SELECT id, name, short_name shortName, abbreviation, logo, color, country, kind, sport_id sportId FROM teams WHERE id = ?').get(id) as { sportId: string } | undefined;
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });
    const leagues = db.prepare(
      `SELECT DISTINCT l.id, l.name FROM matches m JOIN leagues l ON l.id = m.league_id WHERE m.home_team_id = ? OR m.away_team_id = ? ORDER BY l.name`,
    ).all(id, id) as { id: string; name: string }[];
    const ratings = leagues.map((l) => {
      const elo = memo(`elo:${l.id}`, 120_000, () => leagueElo(db, l.id));
      const row = elo.rows.find((x) => x.teamId === id);
      return row ? { leagueId: l.id, leagueName: l.name, rating: row.rating, rank: row.rank, of: elo.rows.length, games: row.games } : null;
    }).filter(Boolean);
    const recent = db.prepare(`${MATCH_SELECT} WHERE (m.home_team_id = @t OR m.away_team_id = @t) AND m.status IN ('final','live') ORDER BY m.start_time DESC LIMIT 15`).all({ t: id }) as Record<string, any>[];
    const upcoming = db.prepare(`${MATCH_SELECT} WHERE (m.home_team_id = @t OR m.away_team_id = @t) AND m.status = 'scheduled' ORDER BY m.start_time ASC LIMIT 5`).all({ t: id }) as Record<string, any>[];
    const roster = db.prepare(
      `SELECT p.id, p.name, p.position, p.jersey, p.headshot, COUNT(a.match_id) games, SUM(COALESCE(a.starter,0)) starts
       FROM appearances a JOIN players p ON p.id = a.player_id WHERE a.team_id = ? GROUP BY p.id ORDER BY games DESC, p.name LIMIT 60`,
    ).all(id);
    res.json({
      team, leagues, ratings,
      record: teamRecord(db, id),
      statAverages: teamStatAverages(db, id),
      recent: recent.map(shapeMatch), upcoming: upcoming.map(shapeMatch), roster,
    });
  }));

  // ───────────── jugadores ─────────────
  r.get('/players', asyncH((req, res) => {
    const where: string[] = []; const args: Record<string, unknown> = {};
    const sport = q(req.query.sport); if (sport) { where.push('p.sport_id = @sport'); args.sport = sport; }
    const text = q(req.query.q); if (text) { where.push('p.name LIKE @like'); args.like = `%${text}%`; }
    const team = q(req.query.team); if (team) { where.push('p.team_id = @team'); args.team = team; }
    const limit = qn(req.query.limit, 60, 1, 300);
    res.json(db.prepare(
      `SELECT p.id, p.name, p.position, p.jersey, p.headshot, p.sport_id sportId, t.id teamId, t.name teamName, t.logo teamLogo,
              (SELECT COUNT(*) FROM appearances a WHERE a.player_id = p.id) games
       FROM players p LEFT JOIN teams t ON t.id = p.team_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY games DESC, p.name LIMIT ${limit}`,
    ).all(args));
  }));

  r.get('/players/:id', asyncH((req, res) => {
    const id = String(req.params.id);
    const player = db.prepare(
      `SELECT p.id, p.name, p.position, p.jersey, p.headshot, p.sport_id sportId, t.id teamId, t.name teamName, t.logo teamLogo
       FROM players p LEFT JOIN teams t ON t.id = p.team_id WHERE p.id = ?`,
    ).get(id);
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });
    const games = (db.prepare('SELECT COUNT(*) n FROM appearances WHERE player_id = ?').get(id) as { n: number }).n;
    const totals = db.prepare(
      `SELECT grp, key, MAX(label) label, COUNT(value) games, SUM(value) total, AVG(value) avg, MAX(value) max
       FROM player_match_stats WHERE player_id = ? AND value IS NOT NULL GROUP BY grp, key ORDER BY grp, key`,
    ).all(id);
    const log = db.prepare(
      `SELECT m.id matchId, m.start_time date, m.league_id leagueId, m.home_score hs, m.away_score aws,
              th.name homeName, ta.name awayName, a.team_id teamId, a.starter
       FROM appearances a JOIN matches m ON m.id = a.match_id JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
       WHERE a.player_id = ? ORDER BY m.start_time DESC LIMIT 40`,
    ).all(id) as { matchId: string }[];
    const stats = db.prepare('SELECT match_id matchId, grp, key, value, display FROM player_match_stats WHERE player_id = ? AND match_id IN (SELECT match_id FROM appearances WHERE player_id = ? ORDER BY rowid DESC LIMIT 400)').all(id, id) as { matchId: string; grp: string; key: string; value: number | null; display: string | null }[];
    const byMatch = new Map<string, Record<string, number | null>>();
    for (const s of stats) (byMatch.get(s.matchId) ?? byMatch.set(s.matchId, {}).get(s.matchId)!)[s.key] = s.value;
    res.json({ player, games, totals, log: log.map((l) => ({ ...l, stats: byMatch.get(l.matchId) ?? {} })) });
  }));

  // Estadísticas disponibles para rankings (solo las que tienen datos numéricos suficientes)
  r.get('/stat-keys', asyncH((req, res) => {
    const sport = q(req.query.sport), league = q(req.query.league);
    const rows = db.prepare(
      `SELECT s.grp, s.key, MAX(s.label) label, COUNT(*) n FROM player_match_stats s JOIN matches m ON m.id = s.match_id
       WHERE s.value IS NOT NULL ${sport ? 'AND m.sport_id = @sport' : ''} ${league ? 'AND m.league_id = @league' : ''}
       GROUP BY s.grp, s.key HAVING n >= 20 ORDER BY n DESC`,
    ).all({ sport, league });
    res.json(rows);
  }));

  r.get('/leaders', asyncH((req, res) => {
    const key = q(req.query.key);
    if (!key) return res.status(400).json({ error: 'Falta el parámetro key (p. ej. totalGoals, points)' });
    const grp = q(req.query.grp) ?? '';
    const mode = req.query.mode === 'avg' ? 'avg' : 'total';
    const minGames = qn(req.query.min_games, mode === 'avg' ? 5 : 1, 1, 500);
    const limit = qn(req.query.limit, 25, 1, 100);
    const where = ['s.key = @key', 's.grp = @grp', 's.value IS NOT NULL'];
    const args: Record<string, unknown> = { key, grp, minGames };
    const sport = q(req.query.sport); if (sport) { where.push('m.sport_id = @sport'); args.sport = sport; }
    const league = q(req.query.league); if (league) { where.push('m.league_id = @league'); args.league = league; }
    const season = q(req.query.season); if (season) { where.push('m.season = @season'); args.season = Number(season); }
    const rows = db.prepare(
      `SELECT p.id, p.name, p.headshot, t.id teamId, t.name teamName, t.logo teamLogo, COUNT(*) games, SUM(s.value) total, AVG(s.value) avg, MAX(s.value) best
       FROM player_match_stats s JOIN matches m ON m.id = s.match_id JOIN players p ON p.id = s.player_id LEFT JOIN teams t ON t.id = p.team_id
       WHERE ${where.join(' AND ')} GROUP BY p.id HAVING games >= @minGames ORDER BY ${mode} DESC, games ASC LIMIT ${limit}`,
    ).all(args);
    res.json({ key, grp, mode, minGames, rows });
  }));

  r.get('/standings', asyncH((req, res) => {
    const league = q(req.query.league);
    if (!league) return res.status(400).json({ error: 'Falta league' });
    const season = (db.prepare('SELECT MAX(season) s FROM standings WHERE league_id = ?').get(league) as { s: number | null }).s;
    if (season === null) return res.json({ season: null, groups: [] });
    const rows = db.prepare(
      `SELECT s.grp, s.rank, s.stats, s.fetched_at fetchedAt, t.id teamId, t.name, t.logo FROM standings s JOIN teams t ON t.id = s.team_id
       WHERE s.league_id = ? AND s.season = ? ORDER BY s.grp, s.rank`,
    ).all(league, season) as { grp: string; rank: number; stats: string; fetchedAt: string; teamId: string; name: string; logo: string | null }[];
    const groups = new Map<string, any[]>();
    for (const x of rows) (groups.get(x.grp) ?? groups.set(x.grp, []).get(x.grp)!).push({ rank: x.rank, teamId: x.teamId, name: x.name, logo: x.logo, stats: JSON.parse(x.stats) });
    res.json({ season, fetchedAt: rows[0]?.fetchedAt ?? null, groups: [...groups.entries()].map(([name, teams]) => ({ name, teams })) });
  }));

  // ───────────── análisis ─────────────
  r.get('/analytics/summary', asyncH((req, res) => {
    const league = q(req.query.league);
    if (!league) return res.status(400).json({ error: 'Falta league' });
    const season = q(req.query.season) ? Number(req.query.season) : undefined;
    res.json(memo(`sum:${league}:${season}`, 60_000, () => leagueSummary(db, league, season)));
  }));

  r.get('/analytics/summary-all', asyncH((_req, res) => {
    res.json(memo('sumall', 120_000, () => {
      const ids = (db.prepare("SELECT DISTINCT league_id id FROM matches WHERE status='final'").all() as { id: string }[]).map((x) => x.id);
      const names = new Map((db.prepare('SELECT id, name, sport_id FROM leagues').all() as { id: string; name: string; sport_id: string }[]).map((l) => [l.id, l]));
      return ids.map((id) => ({ ...leagueSummary(db, id), name: names.get(id)?.name ?? id, sportId: names.get(id)?.sport_id ?? '' })).sort((a, b) => b.matches - a.matches);
    }));
  }));

  r.get('/analytics/elo', asyncH((req, res) => {
    const league = q(req.query.league);
    if (!league) return res.status(400).json({ error: 'Falta league' });
    const override: Partial<EloParams> = {};
    if (q(req.query.k)) override.k = qn(req.query.k, 20, 1, 100);
    if (q(req.query.hfa)) override.hfa = qn(req.query.hfa, 65, 0, 200);
    if (q(req.query.margin)) override.margin = req.query.margin === '1';
    res.json(memo(`elo:${league}:${JSON.stringify(override)}`, 60_000, () => leagueElo(db, league, override)));
  }));

  r.get('/analytics/backtest', asyncH((req, res) => {
    const league = q(req.query.league);
    if (!league) return res.status(400).json({ error: 'Falta league' });
    const sport = (db.prepare('SELECT sport_id s FROM leagues WHERE id = ?').get(league) as { s: string } | undefined)?.s;
    if (!sport) return res.status(404).json({ error: 'Liga desconocida' });
    const model = q(req.query.model) ?? (sport === 'football' ? 'poisson' : 'elo');
    if (model !== 'elo' && model !== 'poisson') return res.status(400).json({ error: 'model debe ser elo o poisson' });
    if (model === 'poisson' && sport !== 'football') return res.status(400).json({ error: 'Poisson solo aplica a fútbol' });
    const params: EloParams | PoissonParams = model === 'poisson'
      ? { ...defaultPoissonParams, prior: qn(req.query.prior, defaultPoissonParams.prior, 0, 50) }
      : { ...defaultEloParams(sport), ...(q(req.query.k) ? { k: qn(req.query.k, 20, 1, 100) } : {}), ...(q(req.query.hfa) ? { hfa: qn(req.query.hfa, 65, 0, 200) } : {}), ...(q(req.query.margin) ? { margin: req.query.margin === '1' } : {}) };
    res.json(memo(`bt:${league}:${model}:${JSON.stringify(params)}`, 120_000, () => backtest(loadFinals(db, league), model, params)));
  }));

  r.get('/analytics/h2h', asyncH((req, res) => {
    const a = q(req.query.a), b = q(req.query.b);
    if (!a || !b) return res.status(400).json({ error: 'Faltan a y b (ids de equipo)' });
    res.json(headToHead(db, a, b, 20));
  }));

  // ───────────── portada: destacados y tendencias ─────────────
  // ───────────── centro en vivo ─────────────
  r.get('/live', asyncH((_req, res) => {
    const since = new Date(Date.now() - 3 * 3600e3).toISOString();
    const rows = db.prepare(`${MATCH_SELECT} WHERE m.status = 'live' OR (m.status = 'final' AND m.start_time > @since AND m.start_time < @now)
      ORDER BY CASE m.status WHEN 'live' THEN 0 ELSE 1 END, m.league_id, m.start_time`).all({ since, now: new Date().toISOString() }) as Record<string, any>[];
    const evStmt = db.prepare(`SELECT clock, type, text, team_id teamId, player_name playerName, scoring FROM match_events WHERE match_id = ? ORDER BY seq DESC LIMIT 4`);
    res.json({
      now: new Date().toISOString(),
      lastCycle: getMeta(db, 'last_live_cycle'),
      matches: rows.map((m) => ({ ...shapeMatch(m), lastEvents: evStmt.all(m.id) })),
    });
  }));

  r.get('/highlights', asyncH((_req, res) => {
    const nowMs = Date.now();
    const rows = db.prepare(`${MATCH_SELECT}
      WHERE m.status = 'live'
         OR (m.status = 'final' AND m.start_time > @since AND m.detail_final = 1)
         OR (m.status = 'scheduled' AND m.start_time BETWEEN @now AND @until)
      ORDER BY CASE m.status WHEN 'live' THEN 0 WHEN 'final' THEN 1 ELSE 2 END, m.start_time DESC LIMIT 80`)
      .all({ since: new Date(nowMs - 36 * 3600e3).toISOString(), now: new Date(nowMs).toISOString(), until: new Date(nowMs + 24 * 3600e3).toISOString() }) as Record<string, any>[];
    // Diversidad: reparte por deporte (round-robin), priorizando en vivo y partidos con más goles/puntos
    const by = new Map<string, Record<string, any>[]>();
    for (const m of rows) (by.get(m.sportId) ?? by.set(m.sportId, []).get(m.sportId)!).push(m);
    const rank = (m: Record<string, any>) => (m.status === 'live' ? 1000 : 0) + ((m.homeScore ?? 0) + (m.awayScore ?? 0)) * (m.sportId === 'basketball' || m.sportId === 'nfl' ? 0.1 : 1);
    for (const list of by.values()) list.sort((a, b) => rank(b) - rank(a));
    const out: Record<string, any>[] = [];
    while (out.length < 8 && [...by.values()].some((l) => l.length)) for (const l of by.values()) { const m = l.shift(); if (m && out.length < 8) out.push(m); }
    res.json(out.map(shapeMatch));
  }));

  r.get('/analytics/trends', asyncH((req, res) => {
    const days = qn(req.query.days, 7, 2, 90);
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const rows = db.prepare(
      `SELECT substr(start_time,1,10) day, sport_id sportId, COUNT(*) n, AVG(home_score + away_score) avgTotal,
              100.0 * SUM(winner = 'home') / COUNT(*) homeWinPct, 100.0 * SUM(winner = 'draw') / COUNT(*) drawPct
       FROM matches WHERE status = 'final' AND home_score IS NOT NULL AND start_time >= ? GROUP BY day, sport_id ORDER BY day`,
    ).all(since);
    res.json({ days, rows });
  }));

  r.post('/ai/chat', express.json({ limit: '10kb' }), asyncH(async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 800) : '';
    if (!message) return res.status(400).json({ error: 'Escribe una pregunta.' });
    const matchId = typeof req.body?.matchId === 'string' ? req.body.matchId : undefined;
    res.json(await answerQuestion(db, message, matchId));
  }));

  // ───────────── explorador de datos ─────────────
  const columnsOf = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[]).map((c) => ({ name: c.name, type: c.type }));

  r.get('/data/tables', asyncH((_req, res) => {
    res.json(EXPLORABLE.map((t) => ({ name: t, rows: (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n, columns: columnsOf(t) })));
  }));

  function dataQuery(req: Request, forExport: boolean) {
    const table = String(req.params.table);
    if (!(EXPLORABLE as readonly string[]).includes(table)) throw Object.assign(new Error('Tabla no disponible'), { status: 404 });
    const cols = columnsOf(table).map((c) => c.name);
    const where: string[] = []; const args: unknown[] = [];
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v !== 'string' || v === '') continue;
      const m = k.match(/^f_(.+?)(?:__(like|gte|lte|ne))?$/);
      if (!m || !cols.includes(m[1])) continue;
      const col = m[1], op = m[2];
      if (op === 'like') { where.push(`"${col}" LIKE ?`); args.push(`%${v}%`); }
      else if (op === 'gte') { where.push(`"${col}" >= ?`); args.push(v); }
      else if (op === 'lte') { where.push(`"${col}" <= ?`); args.push(v); }
      else if (op === 'ne') { where.push(`"${col}" != ?`); args.push(v); }
      else { where.push(`"${col}" = ?`); args.push(v); }
    }
    const orderCol = q(req.query.order);
    const order = orderCol && cols.includes(orderCol) ? `ORDER BY "${orderCol}" ${req.query.dir === 'desc' ? 'DESC' : 'ASC'}` : '';
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return { table, cols, w, args, order, limit: forExport ? qn(req.query.limit, 100_000, 1, 200_000) : qn(req.query.limit, 50, 1, 500), offset: forExport ? 0 : qn(req.query.offset, 0, 0, 10_000_000) };
  }

  r.get('/data/:table', asyncH((req, res) => {
    const d = dataQuery(req, false);
    const total = (db.prepare(`SELECT COUNT(*) n FROM ${d.table} ${d.w}`).get(...d.args) as { n: number }).n;
    const rows = db.prepare(`SELECT * FROM ${d.table} ${d.w} ${d.order} LIMIT ${d.limit} OFFSET ${d.offset}`).all(...d.args);
    res.json({ table: d.table, columns: d.cols, total, rows });
  }));

  r.get('/data/:table/export.:fmt', asyncH((req, res) => {
    const d = dataQuery(req, true);
    const fmt = String(req.params.fmt);
    if (fmt !== 'csv' && fmt !== 'json') return res.status(400).json({ error: 'Formato: csv o json' });
    const stmt = db.prepare(`SELECT * FROM ${d.table} ${d.w} ${d.order} LIMIT ${d.limit}`);
    res.setHeader('Content-Disposition', `attachment; filename="statbet_${d.table}.${fmt}"`);
    if (fmt === 'json') {
      res.type('application/json');
      res.write('[');
      let first = true;
      for (const row of stmt.iterate(...d.args)) { res.write((first ? '' : ',') + JSON.stringify(row)); first = false; }
      return res.end(']');
    }
    res.type('text/csv; charset=utf-8');
    res.write('﻿' + d.cols.join(',') + '\n');
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    for (const row of stmt.iterate(...d.args) as Iterable<Record<string, unknown>>) res.write(d.cols.map((c) => esc(row[c])).join(',') + '\n');
    res.end();
  }));

  // Consola SQL de solo lectura: apagada por defecto (ENABLE_SQL_CONSOLE=true para activarla)
  r.post('/sql', express.json({ limit: '20kb' }), asyncH(async (req, res) => {
    if (process.env.ENABLE_SQL_CONSOLE !== 'true') return res.status(403).json({ error: 'La consola SQL está desactivada en este servidor.' });
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!/^(select|with)\b/i.test(query)) return res.status(400).json({ error: 'Solo se permiten consultas SELECT / WITH.' });
    const result = await new Promise<any>((resolve) => {
      const worker = new Worker(new URL('./sqlWorker.ts', import.meta.url), { workerData: { file: opts.dbFile, query, maxRows: 1000 } });
      const timer = setTimeout(() => { worker.terminate(); resolve({ ok: false, error: 'La consulta tardó más de 5 s y fue cancelada.' }); }, 5000);
      worker.once('message', (m) => { clearTimeout(timer); resolve(m); });
      worker.once('error', (e: Error) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
    });
    res.status(result.ok ? 200 : 400).json(result);
  }));

  return r;
}
