import type { DB } from '../db.ts';
import { computeElo, defaultEloParams, defaultPoissonParams, eloExpected, loadFinals, newPoissonState, poissonPredict, poissonUpdate, type EloParams } from './models.ts';

// ───────────────────────── resumen de liga ─────────────────────────

export interface LeagueSummary {
  leagueId: string;
  season: number | null;
  matches: number;
  avgHome: number | null;
  avgAway: number | null;
  avgTotal: number | null;
  homeWinPct: number | null;
  drawPct: number | null;
  awayWinPct: number | null;
  over: { line: number; pct: number }[];
  bttsPct: number | null;
  cleanSheetPct: number | null;
  byMonth: { month: string; matches: number; avgTotal: number; homeWinPct: number }[];
  teams: number;
}

export function leagueSummary(db: DB, leagueId: string, season?: number): LeagueSummary {
  const rows = db
    .prepare(
      `SELECT home_score h, away_score a, substr(start_time,1,7) ym FROM matches
       WHERE league_id = ? AND status = 'final' AND home_score IS NOT NULL AND away_score IS NOT NULL ${season ? 'AND season = ?' : ''}`,
    )
    .all(...(season ? [leagueId, season] : [leagueId])) as { h: number; a: number; ym: string }[];
  const n = rows.length;
  const empty: LeagueSummary = { leagueId, season: season ?? null, matches: 0, avgHome: null, avgAway: null, avgTotal: null, homeWinPct: null, drawPct: null, awayWinPct: null, over: [], bttsPct: null, cleanSheetPct: null, byMonth: [], teams: 0 };
  if (!n) return empty;
  const sum = (f: (r: { h: number; a: number }) => number) => rows.reduce((s, r) => s + f(r), 0);
  const avgTotal = sum((r) => r.h + r.a) / n;
  // Líneas "over" en torno a la mediana real del total (sirven igual para fútbol que para baloncesto)
  const totals = rows.map((r) => r.h + r.a).sort((x, y) => x - y);
  const med = totals[Math.floor(n / 2)];
  const lines = avgTotal < 12 ? [0.5, 1.5, 2.5, 3.5, 4.5] : [med - 10, med, med + 10].map((x) => Math.floor(x) + 0.5);
  const byMonth = new Map<string, { n: number; tot: number; hw: number }>();
  for (const r of rows) {
    const b = byMonth.get(r.ym) ?? { n: 0, tot: 0, hw: 0 };
    b.n++; b.tot += r.h + r.a; if (r.h > r.a) b.hw++;
    byMonth.set(r.ym, b);
  }
  const teams = (db.prepare(`SELECT COUNT(DISTINCT t) c FROM (SELECT home_team_id t FROM matches WHERE league_id = ? UNION SELECT away_team_id FROM matches WHERE league_id = ?)`).get(leagueId, leagueId) as { c: number }).c;
  return {
    leagueId, season: season ?? null, matches: n,
    avgHome: sum((r) => r.h) / n, avgAway: sum((r) => r.a) / n, avgTotal,
    homeWinPct: (sum((r) => (r.h > r.a ? 1 : 0)) / n) * 100,
    drawPct: (sum((r) => (r.h === r.a ? 1 : 0)) / n) * 100,
    awayWinPct: (sum((r) => (r.h < r.a ? 1 : 0)) / n) * 100,
    over: lines.map((line) => ({ line, pct: (sum((r) => (r.h + r.a > line ? 1 : 0)) / n) * 100 })),
    bttsPct: (sum((r) => (r.h > 0 && r.a > 0 ? 1 : 0)) / n) * 100,
    cleanSheetPct: (sum((r) => (r.h === 0 || r.a === 0 ? 1 : 0)) / n) * 100,
    byMonth: [...byMonth.entries()].sort().map(([month, b]) => ({ month, matches: b.n, avgTotal: b.tot / b.n, homeWinPct: (b.hw / b.n) * 100 })),
    teams,
  };
}

// ───────────────────────── Elo por liga ─────────────────────────

export function leagueElo(db: DB, leagueId: string, params?: Partial<EloParams>) {
  const sport = (db.prepare('SELECT sport_id FROM leagues WHERE id = ?').get(leagueId) as { sport_id: string } | undefined)?.sport_id ?? 'football';
  const p = { ...defaultEloParams(sport), ...params };
  const finals = loadFinals(db, leagueId);
  const st = computeElo(finals, p);
  const names = db.prepare('SELECT id, name, logo FROM teams WHERE id IN (SELECT home_team_id FROM matches WHERE league_id = ? UNION SELECT away_team_id FROM matches WHERE league_id = ?)').all(leagueId, leagueId) as { id: string; name: string; logo: string | null }[];
  const nm = new Map(names.map((t) => [t.id, t]));
  const rows = [...st.ratings.entries()]
    .map(([teamId, v]) => ({ teamId, name: nm.get(teamId)?.name ?? teamId, logo: nm.get(teamId)?.logo ?? null, rating: Math.round(v.rating), games: v.games }))
    .sort((a, b) => b.rating - a.rating)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { params: p, matches: finals.length, rows };
}

// ───────────────────────── predicción de un partido ─────────────────────────

export function predictMatch(db: DB, matchId: string) {
  const m = db.prepare('SELECT id, league_id, sport_id, start_time, home_team_id, away_team_id, neutral_site, status FROM matches WHERE id = ?').get(matchId) as
    | { id: string; league_id: string; sport_id: string; start_time: string; home_team_id: string; away_team_id: string; neutral_site: number; status: string }
    | undefined;
  if (!m) return null;
  // Solo datos ANTERIORES al partido (así la predicción mostrada para un partido ya jugado no hace trampa)
  const finals = loadFinals(db, m.league_id).filter((f) => f.start_time < m.start_time);
  const eloP = defaultEloParams(m.sport_id);
  if (finals.length < 20) {
    return { available: false as const, reason: `Aún no hay suficientes partidos previos de esta liga en la base (${finals.length}; mínimo 20).`, sample: finals.length };
  }
  if (m.sport_id === 'football') {
    const st = newPoissonState();
    for (const f of finals) poissonUpdate(st, f);
    const p = poissonPredict(st, m.home_team_id, m.away_team_id, defaultPoissonParams);
    if (!p) return { available: false as const, reason: 'Datos insuficientes.', sample: finals.length };
    const low = Math.min(p.gamesHome, p.gamesAway) < 5;
    return {
      available: true as const, model: 'poisson' as const, sample: finals.length,
      caution: low ? 'Alguno de los equipos tiene menos de 5 partidos previos en la base: la predicción se apoya sobre todo en la media de la liga.' : null,
      ...p,
    };
  }
  const st = computeElo(finals, eloP);
  const h = st.ratings.get(m.home_team_id) ?? { rating: 1500, games: 0 };
  const a = st.ratings.get(m.away_team_id) ?? { rating: 1500, games: 0 };
  const pHome = eloExpected(h.rating, a.rating, m.neutral_site ? 0 : eloP.hfa);
  return {
    available: true as const, model: 'elo' as const, sample: finals.length,
    caution: Math.min(h.games, a.games) < 5 ? 'Alguno de los equipos tiene menos de 5 partidos previos en la base: el rating aún es poco fiable.' : null,
    ratingHome: Math.round(h.rating), ratingAway: Math.round(a.rating), gamesHome: h.games, gamesAway: a.games,
    pHome, pAway: 1 - pHome,
  };
}

// ───────────────────────── equipos ─────────────────────────

export interface RecordLine { played: number; w: number; d: number; l: number; gf: number; ga: number; }

export function teamRecord(db: DB, teamId: string, season?: number, leagueId?: string) {
  const rows = db
    .prepare(
      `SELECT m.id, m.start_time, m.league_id, m.home_team_id, m.away_team_id, m.home_score hs, m.away_score as_, m.winner,
              th.name home_name, ta.name away_name
       FROM matches m JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
       WHERE (m.home_team_id = @t OR m.away_team_id = @t) AND m.status = 'final' AND m.home_score IS NOT NULL
         ${season ? 'AND m.season = @s' : ''} ${leagueId ? 'AND m.league_id = @l' : ''}
       ORDER BY m.start_time DESC`,
    )
    .all({ t: teamId, s: season, l: leagueId }) as { id: string; start_time: string; league_id: string; home_team_id: string; away_team_id: string; hs: number; as_: number; winner: string | null; home_name: string; away_name: string }[];

  const zero = (): RecordLine => ({ played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  const total = zero(), home = zero(), away = zero();
  const form: { matchId: string; result: 'W' | 'D' | 'L'; score: string; opponent: string; home: boolean; date: string }[] = [];
  let over25 = 0, btts = 0, clean = 0;
  for (const r of rows) {
    const isHome = r.home_team_id === teamId;
    const gf = isHome ? r.hs : r.as_;
    const ga = isHome ? r.as_ : r.hs;
    const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    for (const t of [total, isHome ? home : away]) {
      t.played++; t.gf += gf; t.ga += ga;
      if (res === 'W') t.w++; else if (res === 'D') t.d++; else t.l++;
    }
    if (r.hs + r.as_ > 2.5) over25++;
    if (r.hs > 0 && r.as_ > 0) btts++;
    if (ga === 0) clean++;
    form.push({ matchId: r.id, result: res, score: `${r.hs}-${r.as_}`, opponent: isHome ? r.away_name : r.home_name, home: isHome, date: r.start_time });
  }
  const n = rows.length;
  return {
    total, home, away,
    form: form.slice(0, 10),
    rates: n ? { over25Pct: (over25 / n) * 100, bttsPct: (btts / n) * 100, cleanSheetPct: (clean / n) * 100, n } : null,
  };
}

/** Promedio por partido de cada estadística de equipo guardada (posesión, tiros, rebotes…). */
export function teamStatAverages(db: DB, teamId: string, limit = 400) {
  return db
    .prepare(
      `SELECT s.key, MAX(s.label) label, COUNT(*) games, AVG(s.value) avg
       FROM team_match_stats s JOIN matches m ON m.id = s.match_id
       WHERE s.team_id = ? AND s.value IS NOT NULL AND m.id IN (SELECT id FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'final' ORDER BY start_time DESC LIMIT ?)
       GROUP BY s.key ORDER BY games DESC, s.key`,
    )
    .all(teamId, teamId, teamId, limit) as { key: string; label: string | null; games: number; avg: number }[];
}

export function headToHead(db: DB, a: string, b: string, limit = 10) {
  const rows = db
    .prepare(
      `SELECT m.id, m.start_time, m.league_id, m.home_team_id, m.away_team_id, m.home_score hs, m.away_score aws
       FROM matches m WHERE m.status = 'final' AND m.home_score IS NOT NULL
         AND ((m.home_team_id = @a AND m.away_team_id = @b) OR (m.home_team_id = @b AND m.away_team_id = @a))
       ORDER BY m.start_time DESC`,
    )
    .all({ a, b }) as { id: string; start_time: string; league_id: string; home_team_id: string; away_team_id: string; hs: number; aws: number }[];
  let aW = 0, bW = 0, d = 0, goals = 0, btts = 0, over = 0;
  for (const r of rows) {
    const aGoals = r.home_team_id === a ? r.hs : r.aws;
    const bGoals = r.home_team_id === a ? r.aws : r.hs;
    if (aGoals > bGoals) aW++; else if (aGoals < bGoals) bW++; else d++;
    goals += r.hs + r.aws;
    if (r.hs > 0 && r.aws > 0) btts++;
    if (r.hs + r.aws > 2.5) over++;
  }
  const n = rows.length;
  return {
    n, aWins: aW, bWins: bW, draws: d,
    avgTotal: n ? goals / n : null,
    bttsPct: n ? (btts / n) * 100 : null,
    over25Pct: n ? (over / n) * 100 : null,
    matches: rows.slice(0, limit),
  };
}
