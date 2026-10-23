import zlib from 'node:zlib';
import type { DB } from '../db.ts';
import { SPORTS, LEAGUES, type LeagueConfig } from '../espn/config.ts';
import type { ParsedEvent, ParsedMatch, ParsedOdds, ParsedPlayer, ParsedStandings, ParsedSummary, ParsedTeam } from '../espn/parse.ts';

const now = () => new Date().toISOString();

export function ensureCatalog(db: DB): void {
  const sp = db.prepare('INSERT INTO sports(id, name) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name');
  const lg = db.prepare(
    `INSERT INTO leagues(id, sport_id, name, country, kind, has_details) VALUES(?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, country = excluded.country, kind = excluded.kind, has_details = excluded.has_details`,
  );
  db.transaction(() => {
    for (const [id, name] of Object.entries(SPORTS)) sp.run(id, name);
    for (const l of LEAGUES) lg.run(l.id, l.sportId, l.name, l.country, l.kind, l.hasDetails ? 1 : 0);
  })();
}

export function upsertTeam(db: DB, t: ParsedTeam): void {
  db.prepare(
    `INSERT INTO teams(id, sport_id, espn_id, name, short_name, abbreviation, logo, color, country, kind, updated_at)
     VALUES(@id,@sportId,@espnId,@name,@shortName,@abbreviation,@logo,@color,@country,@kind,@ts)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       short_name = COALESCE(excluded.short_name, short_name),
       abbreviation = COALESCE(excluded.abbreviation, abbreviation),
       logo = COALESCE(excluded.logo, logo),
       color = COALESCE(excluded.color, color),
       country = COALESCE(teams.country, excluded.country),
       updated_at = excluded.updated_at`,
  ).run({ ...t, ts: now() });
}

export function upsertPlayer(db: DB, p: ParsedPlayer): void {
  db.prepare(
    `INSERT INTO players(id, sport_id, espn_id, name, short_name, position, jersey, headshot, team_id, updated_at)
     VALUES(@id,@sportId,@espnId,@name,@shortName,@position,@jersey,@headshot,@teamId,@ts)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       short_name = COALESCE(excluded.short_name, short_name),
       position = COALESCE(excluded.position, position),
       jersey = COALESCE(excluded.jersey, jersey),
       headshot = COALESCE(excluded.headshot, headshot),
       team_id = COALESCE(excluded.team_id, team_id),
       updated_at = excluded.updated_at`,
  ).run({ ...p, ts: now() });
}

export function matchId(league: LeagueConfig, espnId: string): string {
  return `${league.id}:${espnId}`;
}

export function upsertMatch(db: DB, league: LeagueConfig, m: ParsedMatch): string {
  const id = matchId(league, m.espnId);
  upsertTeam(db, m.home);
  upsertTeam(db, m.away);
  const ts = now();
  db.prepare(
    `INSERT INTO matches(id, league_id, sport_id, espn_id, season, stage, start_time, status, status_detail, clock, period,
        home_team_id, away_team_id, home_score, away_score, home_line, away_line, winner, venue, city, attendance, neutral_site,
        created_at, updated_at)
     VALUES(@id,@leagueId,@sportId,@espnId,@season,@stage,@startTime,@status,@statusDetail,@clock,@period,
        @homeId,@awayId,@homeScore,@awayScore,@homeLine,@awayLine,@winner,@venue,@city,@attendance,@neutral,@ts,@ts)
     ON CONFLICT(id) DO UPDATE SET
       season = COALESCE(excluded.season, season),
       stage = COALESCE(excluded.stage, stage),
       start_time = excluded.start_time,
       status = excluded.status,
       status_detail = excluded.status_detail,
       clock = excluded.clock,
       period = excluded.period,
       home_score = excluded.home_score,
       away_score = excluded.away_score,
       home_line = COALESCE(excluded.home_line, home_line),
       away_line = COALESCE(excluded.away_line, away_line),
       winner = excluded.winner,
       venue = COALESCE(excluded.venue, venue),
       city = COALESCE(excluded.city, city),
       attendance = COALESCE(excluded.attendance, attendance),
       neutral_site = excluded.neutral_site,
       updated_at = excluded.updated_at`,
  ).run({
    id,
    leagueId: league.id,
    sportId: league.sportId,
    espnId: m.espnId,
    season: m.season,
    stage: m.stage,
    startTime: m.startTime,
    status: m.status,
    statusDetail: m.statusDetail,
    clock: m.clock,
    period: m.period,
    homeId: m.home.id,
    awayId: m.away.id,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    homeLine: m.homeLine ? JSON.stringify(m.homeLine) : null,
    awayLine: m.awayLine ? JSON.stringify(m.awayLine) : null,
    winner: m.winner,
    venue: m.venue,
    city: m.city,
    attendance: m.attendance,
    neutral: m.neutral ? 1 : 0,
    ts,
  });

  if (m.odds) insertOddsIfChanged(db, id, m.odds);
  if (m.events.length) {
    const has = db.prepare('SELECT COUNT(*) AS n FROM match_events WHERE match_id = ?').get(id) as { n: number };
    // Los eventos del boxscore (summary) son más ricos: el scoreboard solo rellena si no hay nada.
    if (has.n === 0 || m.status === 'live') replaceEvents(db, id, m.events);
  }
  return id;
}

export function insertOddsIfChanged(db: DB, matchId: string, o: ParsedOdds): void {
  const last = db
    .prepare('SELECT provider, home_ml, away_ml, draw_ml, spread, total FROM odds_snapshots WHERE match_id = ? ORDER BY id DESC LIMIT 1')
    .get(matchId) as { provider: string | null; home_ml: number | null; away_ml: number | null; draw_ml: number | null; spread: number | null; total: number | null } | undefined;
  if (last && last.provider === o.provider && last.home_ml === o.homeMl && last.away_ml === o.awayMl && last.draw_ml === o.drawMl && last.spread === o.spread && last.total === o.total) return;
  db.prepare(
    `INSERT INTO odds_snapshots(match_id, provider, captured_at, home_ml, away_ml, draw_ml, spread, total, details)
     VALUES(?,?,?,?,?,?,?,?,?)`,
  ).run(matchId, o.provider, now(), o.homeMl, o.awayMl, o.drawMl, o.spread, o.total, o.details);
}

export function replaceEvents(db: DB, matchId: string, events: ParsedEvent[]): void {
  db.prepare('DELETE FROM match_events WHERE match_id = ?').run(matchId);
  const ins = db.prepare(
    `INSERT INTO match_events(match_id, seq, clock, period, type, text, team_id, player_id, player_name, scoring, home_score, away_score)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const e of events) {
    ins.run(matchId, e.seq, e.clock, e.period, e.type, e.text, e.teamId, e.playerId, e.playerName, e.scoring ? 1 : 0, e.homeScore, e.awayScore);
  }
}

/** Guarda el boxscore completo de un partido. Devuelve cuántas filas de estadísticas se escribieron. */
export function saveSummary(db: DB, league: LeagueConfig, id: string, s: ParsedSummary, finalNow: boolean): number {
  let rows = 0;
  const tx = db.transaction(() => {
    for (const t of s.teams) upsertTeam(db, t);
    for (const p of s.players) upsertPlayer(db, p);

    const delTms = db.prepare('DELETE FROM team_match_stats WHERE match_id = ?');
    const insTms = db.prepare('INSERT OR REPLACE INTO team_match_stats(match_id, team_id, key, label, value, display) VALUES(?,?,?,?,?,?)');
    delTms.run(id);
    for (const t of s.teamStats) {
      for (const st of t.stats) {
        insTms.run(id, t.teamId, st.key, st.label, st.value, st.display);
        rows++;
      }
    }

    db.prepare('DELETE FROM appearances WHERE match_id = ?').run(id);
    db.prepare('DELETE FROM player_match_stats WHERE match_id = ?').run(id);
    const insApp = db.prepare('INSERT OR REPLACE INTO appearances(match_id, player_id, team_id, starter, position, jersey, formation_place) VALUES(?,?,?,?,?,?,?)');
    for (const a of s.appearances) insApp.run(id, a.playerId, a.teamId, a.starter === null ? null : a.starter ? 1 : 0, a.position, a.jersey, a.formationPlace);
    db.prepare('DELETE FROM lineups WHERE match_id = ?').run(id);
    for (const l of s.lineups) db.prepare('INSERT OR REPLACE INTO lineups(match_id, team_id, formation) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM teams WHERE id = ?)').run(id, l.teamId, l.formation, l.teamId);
    db.prepare('DELETE FROM injuries WHERE match_id = ?').run(id);
    for (const i of s.injuries) db.prepare('INSERT OR REPLACE INTO injuries(match_id, team_id, player_id, player_name, position, status, detail) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM teams WHERE id = ?)').run(id, i.teamId, i.playerId, i.name, i.position, i.status, i.detail, i.teamId);
    const insPms = db.prepare('INSERT OR REPLACE INTO player_match_stats(match_id, player_id, team_id, grp, key, label, value, display) VALUES(?,?,?,?,?,?,?,?)');
    for (const p of s.playerStats) {
      for (const st of p.stats) {
        insPms.run(id, p.playerId, p.teamId, st.grp, st.key, st.label, st.value, st.display);
        rows++;
      }
    }

    if (s.events.length) replaceEvents(db, id, s.events);
    if (s.odds) insertOddsIfChanged(db, id, s.odds);

    db.prepare(
      `UPDATE matches SET detail_fetched_at = ?, detail_attempts = detail_attempts + 1,
         detail_final = CASE WHEN ? = 1 AND ? > 0 THEN 1 ELSE detail_final END,
         attendance = COALESCE(attendance, ?), venue = COALESCE(venue, ?), city = COALESCE(city, ?)
       WHERE id = ?`,
    ).run(now(), finalNow ? 1 : 0, rows, s.attendance, s.venue, s.city, id);
  });
  tx();
  void league;
  return rows;
}

export function saveStandings(db: DB, league: LeagueConfig, st: ParsedStandings, seasonFallback: number): number {
  const season = st.season ?? seasonFallback;
  const ins = db.prepare(
    `INSERT INTO standings(league_id, season, grp, team_id, rank, stats, fetched_at) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(league_id, season, grp, team_id) DO UPDATE SET rank = excluded.rank, stats = excluded.stats, fetched_at = excluded.fetched_at`,
  );
  db.transaction(() => {
    for (const t of st.teams) upsertTeam(db, t);
    for (const r of st.rows) ins.run(league.id, season, r.group, r.teamId, r.rank, JSON.stringify(r.stats), now());
  })();
  return st.rows.length;
}

export function saveRaw(db: DB, kind: string, key: string, leagueId: string | null, json: unknown): void {
  if (process.env.STORE_RAW === 'false') return;
  const body = zlib.gzipSync(Buffer.from(JSON.stringify(json)));
  db.prepare(
    `INSERT INTO raw_payloads(kind, key, league_id, fetched_at, body) VALUES(?,?,?,?,?)
     ON CONFLICT(kind, key) DO UPDATE SET fetched_at = excluded.fetched_at, body = excluded.body, league_id = excluded.league_id`,
  ).run(kind, key, leagueId, now(), body);
}

export function readRaw(body: Buffer): unknown {
  return JSON.parse(zlib.gunzipSync(body).toString('utf8'));
}

export function logIngest(db: DB, kind: string, target: string, ok: boolean, rows: number, ms: number, error?: string): void {
  db.prepare('INSERT INTO ingest_log(ts, kind, target, ok, rows, ms, error) VALUES(?,?,?,?,?,?,?)').run(now(), kind, target, ok ? 1 : 0, rows, ms, error ?? null);
  // El log no debe crecer sin límite.
  db.prepare('DELETE FROM ingest_log WHERE id < (SELECT MAX(id) FROM ingest_log) - 5000').run();
}
