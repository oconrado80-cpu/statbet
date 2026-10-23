/**
 * Genera una base de datos SINTÉTICA para probar la interfaz sin conexión a internet.
 *   npm run demo-data            →  crea data/demo.db
 *   DB_PATH=data/demo.db INGEST=off npm start
 *
 * ⚠ Los datos son aleatorios (equipos y jugadores "Demo"). La web muestra un aviso permanente cuando
 *   la base está marcada como sintética. NO mezclar con la base real (data/statbet.db).
 */
import fs from 'node:fs';
import { openDb, setMeta } from '../server/db.ts';
import { LEAGUES } from '../server/espn/config.ts';
import { ensureCatalog, saveStandings, saveSummary, upsertMatch } from '../server/ingest/store.ts';
import type { ParsedMatch, ParsedPlayer, ParsedStat, ParsedSummary, ParsedTeam } from '../server/espn/parse.ts';

const file = process.env.DEMO_DB || 'data/demo.db';
for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
const db = openDb(file);
ensureCatalog(db);
setMeta(db, 'dataset', 'synthetic');

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const poisson = (l: number) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const DAY = 86400000;
const now = Date.now();

function makeTeams(leagueId: string, sportId: string, n: number, prefix: string): { team: ParsedTeam; skill: number; players: ParsedPlayer[] }[] {
  return Array.from({ length: n }, (_, i) => {
    const espnId = String(({ 'eng.1': 1, 'col.1': 2, nba: 3 } as Record<string, number>)[leagueId] * 1000 + i + 1);
    const team: ParsedTeam = {
      id: `${sportId}:${espnId}`, sportId, espnId, name: `${prefix} ${String(i + 1).padStart(2, '0')}`, shortName: `${prefix.slice(0, 3)}${i + 1}`,
      abbreviation: `${prefix.slice(0, 2).toUpperCase()}${i + 1}`, logo: null, color: ['e11d48', '2563eb', '16a34a', 'f59e0b', '9333ea'][i % 5], country: 'Demo', kind: 'team',
    };
    const positions = sportId === 'football' ? ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'F', 'F', 'F', 'M', 'D', 'F'] : ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C'];
    const players = positions.map((pos, j) => ({
      id: `${sportId}:${espnId}${String(j).padStart(2, '0')}`, sportId, espnId: `${espnId}${String(j).padStart(2, '0')}`,
      name: `Jugador Demo ${i + 1}-${j + 1}`, shortName: `J. Demo ${i + 1}-${j + 1}`, position: pos, jersey: String(j + 1), headshot: null, teamId: team.id,
    }));
    return { team, skill: gauss() * 0.3, players };
  });
}

function statsOf(entries: [string, string, number, string?][]): ParsedStat[] {
  return entries.map(([key, label, value, display]) => ({ grp: '', key, label, value, display: display ?? String(value) }));
}

function simulateFootball(leagueId: string, nTeams: number, days: number) {
  const league = LEAGUES.find((l) => l.id === leagueId)!;
  const teams = makeTeams(leagueId, 'football', nTeams, 'Atlético Demo');
  const fixtures: [number, number][] = [];
  for (let i = 0; i < nTeams; i++) for (let j = 0; j < nTeams; j++) if (i !== j) fixtures.push([i, j]);
  fixtures.sort(() => rnd() - 0.5);
  const total = fixtures.length;
  const standing = teams.map(() => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }));
  fixtures.forEach(([h, a], idx) => {
    const t = now - days * DAY + (idx / total) * (days + 3) * DAY;
    const state: ParsedMatch['status'] = t < now - 2.5 * 3600e3 ? 'final' : t < now ? 'live' : 'scheduled';
    const H = teams[h], A = teams[a];
    const lh = 1.45 * Math.exp(H.skill - A.skill), la = 1.15 * Math.exp(A.skill - H.skill);
    const hg = state === 'scheduled' ? null : poisson(lh), ag = state === 'scheduled' ? null : poisson(la);
    const liveEvents = state === 'live' ? [...Array(hg!).fill(H), ...Array(ag!).fill(A)].map((T: typeof H, k: number) => ({ seq: 0, clock: `${5 + Math.floor(rnd() * 60)}'`, period: null, type: 'Goal', text: null, teamId: T.team.id, playerId: T.players[8].id, playerName: T.players[8].name, scoring: true, homeScore: null, awayScore: null })).sort((x, y) => parseInt(x.clock) - parseInt(y.clock)).map((e, k) => ({ ...e, seq: k })) : [];
    const m: ParsedMatch = {
      espnId: String(500000 + idx), season: 2026, stage: 'Temporada regular', startTime: new Date(t).toISOString(), status: state,
      statusDetail: state === 'final' ? 'FT' : state === 'live' ? "67'" : null, clock: state === 'live' ? "67'" : null, period: state === 'live' ? 2 : null,
      home: H.team, away: A.team, homeScore: hg, awayScore: ag, homeLine: null, awayLine: null,
      winner: state === 'final' ? (hg! > ag! ? 'home' : hg! < ag! ? 'away' : 'draw') : null, venue: `Estadio ${H.team.name}`, city: 'Ciudad Demo',
      attendance: 8000 + Math.floor(rnd() * 40000), neutral: false,
      odds: state === 'final' ? null : { provider: 'Demo (sintético)', homeMl: Math.round(-110 - (H.skill - A.skill) * 300), awayMl: Math.round(240 + (A.skill - H.skill) * 300), drawMl: 260, spread: null, total: 2.5, details: null }, events: liveEvents,
    };
    const id = upsertMatch(db, league, m);
    if (state === 'final') {
      standing[h].p += 1; standing[a].p += 1; standing[h].gf += hg!; standing[h].ga += ag!; standing[a].gf += ag!; standing[a].ga += hg!;
      if (hg! > ag!) { standing[h].w++; standing[a].l++; } else if (hg! < ag!) { standing[a].w++; standing[h].l++; } else { standing[h].d++; standing[a].d++; }
      // Boxscore
      const side = (T: typeof H, goals: number, oppSkill: number) => {
        const shots = Math.max(goals, Math.round(8 + goals * 2.2 + gauss() * 3 + (T.skill - oppSkill) * 6));
        const sot = Math.min(shots, Math.max(goals, Math.round(shots * (0.3 + rnd() * 0.15))));
        return { shots, sot, corners: Math.max(0, Math.round(shots / 2.4 + gauss() * 1.5)), fouls: Math.round(10 + gauss() * 3), yellow: poisson(1.7) };
      };
      const sh = side(H, hg!, A.skill), sa = side(A, ag!, H.skill);
      const possH = Math.min(75, Math.max(25, Math.round(50 + (H.skill - A.skill) * 25 + gauss() * 5)));
      const ev: ParsedSummary['events'] = [];
      const perTeam = (T: typeof H, goals: number, s: ReturnType<typeof side>, poss: number) => {
        const stats = statsOf([
          ['possessionPct', 'Posesión', poss, `${poss}`], ['totalShots', 'Tiros', s.shots], ['shotsOnTarget', 'Tiros a puerta', s.sot],
          ['wonCorners', 'Córners', s.corners], ['foulsCommitted', 'Faltas', s.fouls], ['yellowCards', 'Amarillas', s.yellow],
        ]);
        const squad = T.players.slice(0, 11);
        const scorers = Array.from({ length: goals }, () => pick(squad.filter((p) => p.position !== 'G')));
        const pstats = squad.map((p) => {
          const g = scorers.filter((s) => s.id === p.id).length;
          const sp = p.position === 'F' ? 3 : p.position === 'M' ? 1.5 : 0.6;
          const shotsP = poisson(sp), sotP = Math.min(shotsP, poisson(sp * 0.4));
          return { p, g, stats: statsOf([['appearances', 'Partidos', 1], ['totalGoals', 'Goles', g], ['goalAssists', 'Asistencias', poisson(0.15)], ['totalShots', 'Tiros', Math.max(shotsP, g)], ['shotsOnTarget', 'Tiros a puerta', Math.max(sotP, g)], ['yellowCards', 'Amarillas', rnd() < 0.12 ? 1 : 0]]) };
        });
        pstats.forEach(({ p, g }) => { for (let k = 0; k < g; k++) ev.push({ seq: 0, clock: `${1 + Math.floor(rnd() * 90)}'`, period: null, type: 'Goal', text: null, teamId: T.team.id, playerId: p.id, playerName: p.name, scoring: true, homeScore: null, awayScore: null }); });
        return { stats, pstats, squad };
      };
      const ph = perTeam(H, hg!, sh, possH), pa = perTeam(A, ag!, sa, 100 - possH);
      ev.sort((x, y) => parseInt(x.clock!) - parseInt(y.clock!)).forEach((e, i) => (e.seq = i));
      const summary: ParsedSummary = {
        teamStats: [{ teamId: H.team.id, stats: ph.stats }, { teamId: A.team.id, stats: pa.stats }],
        players: [...ph.squad, ...pa.squad],
        appearances: [...ph.squad.map((p) => ({ playerId: p.id, teamId: H.team.id, starter: true, position: p.position, jersey: p.jersey, formationPlace: ph.squad.indexOf(p) + 1 })), ...pa.squad.map((p) => ({ playerId: p.id, teamId: A.team.id, starter: true, position: p.position, jersey: p.jersey, formationPlace: pa.squad.indexOf(p) + 1 }))],
        playerStats: [...ph.pstats.map((x) => ({ playerId: x.p.id, teamId: H.team.id, stats: x.stats })), ...pa.pstats.map((x) => ({ playerId: x.p.id, teamId: A.team.id, stats: x.stats }))],
        lineups: [{ teamId: H.team.id, formation: '4-3-3' }, { teamId: A.team.id, formation: '4-3-3' }],
        injuries: [...H.players.slice(11, 12).map((p) => ({ teamId: H.team.id, playerId: p.id, name: p.name, position: p.position, status: 'Out', detail: 'Dato de prueba' })), ...A.players.slice(12, 13).map((p) => ({ teamId: A.team.id, playerId: p.id, name: p.name, position: p.position, status: 'Day-To-Day', detail: 'Dato de prueba' }))],
        events: ev, odds: null, attendance: m.attendance, venue: m.venue, city: m.city, teams: [H.team, A.team],
      };
      saveSummary(db, league, id, summary, true);
    }
  });
  saveStandings(db, league, {
    season: 2026,
    teams: teams.map((t) => t.team),
    rows: teams.map((t, i) => ({ group: '', teamId: t.team.id, rank: 0, stats: { gamesPlayed: standing[i].p, wins: standing[i].w, ties: standing[i].d, losses: standing[i].l, pointsFor: standing[i].gf, pointsAgainst: standing[i].ga, pointDifferential: standing[i].gf - standing[i].ga, points: standing[i].w * 3 + standing[i].d } }))
      .sort((a, b) => (b.stats.points as number) - (a.stats.points as number) || (b.stats.pointDifferential as number) - (a.stats.pointDifferential as number))
      .map((r, i) => ({ ...r, rank: i + 1 })),
  }, 2026);
}

function simulateNba(nTeams: number, days: number, gamesPerTeam: number) {
  const league = LEAGUES.find((l) => l.id === 'nba')!;
  const teams = makeTeams('nba', 'basketball', nTeams, 'Demo Hoopers');
  const nGames = Math.floor((nTeams * gamesPerTeam) / 2);
  for (let idx = 0; idx < nGames; idx++) {
    const h = Math.floor(rnd() * nTeams); let a = Math.floor(rnd() * nTeams); if (a === h) a = (a + 1) % nTeams;
    const t = now - days * DAY + (idx / nGames) * (days + 2) * DAY;
    const state: ParsedMatch['status'] = t < now - 3 * 3600e3 ? 'final' : t < now ? 'live' : 'scheduled';
    const H = teams[h], A = teams[a];
    const hs = state === 'scheduled' ? null : Math.round(112 + (H.skill - A.skill) * 22 + 2.5 + gauss() * 11);
    const as = state === 'scheduled' ? null : Math.round(112 + (A.skill - H.skill) * 22 + gauss() * 11);
    const m: ParsedMatch = {
      espnId: String(700000 + idx), season: 2026, stage: 'Temporada regular', startTime: new Date(t).toISOString(), status: state,
      statusDetail: state === 'final' ? 'Final' : state === 'live' ? 'Q3 05:21' : null, clock: state === 'live' ? '5:21' : null, period: state === 'live' ? 3 : null,
      home: H.team, away: A.team, homeScore: hs, awayScore: as, homeLine: null, awayLine: null,
      winner: state === 'final' ? (hs! > as! ? 'home' : 'away') : null, venue: `Arena ${H.team.name}`, city: 'Ciudad Demo', attendance: 15000 + Math.floor(rnd() * 5000), neutral: false,
      odds: state === 'scheduled' ? { provider: 'Demo', homeMl: -150, awayMl: 130, drawMl: null, spread: -3.5, total: 224.5, details: 'DEMO -3.5' } : null, events: [],
    };
    const id = upsertMatch(db, league, m);
    if (state === 'final') {
      const mk = (T: typeof H, pts: number) => {
        const w = T.players.map(() => 0.4 + rnd());
        const sw = w.reduce((x, y) => x + y, 0);
        return T.players.map((p, i) => {
          const share = w[i] / sw; const points = Math.round(pts * share); const mins = Math.round(8 + share * 120);
          return { p, stats: [
            ['minutes', 'MIN', mins], ['points', 'PTS', points], ['rebounds', 'REB', poisson(2 + share * 18)], ['assists', 'AST', poisson(1 + share * 12)],
            ['steals', 'STL', poisson(0.4 + share * 3)], ['blocks', 'BLK', poisson(0.2 + share * 2)], ['turnovers', 'TO', poisson(0.5 + share * 5)], ['fieldGoalsMade', 'FG (hechos)', Math.round(points / 2.3)], ['fieldGoalsAttempted', 'FG (intentos)', Math.round(points / 1.1)],
          ].map(([key, label, value]) => ({ grp: '', key, label, value, display: String(value) })) as ParsedStat[] };
        });
      };
      const pH = mk(H, hs!), pA = mk(A, as!);
      const tstats = (rows: typeof pH) => ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'].map((k) => { const v = rows.reduce((s, r) => s + (r.stats.find((x) => x.key === k)!.value as number), 0); return { grp: '', key: k === 'rebounds' ? 'totalRebounds' : k, label: k, value: v, display: String(v) } as ParsedStat; });
      saveSummary(db, league, id, {
        teamStats: [{ teamId: H.team.id, stats: tstats(pH) }, { teamId: A.team.id, stats: tstats(pA) }],
        players: [...H.players, ...A.players],
        appearances: [...pH.map((x, i) => ({ playerId: x.p.id, teamId: H.team.id, starter: i < 5, position: x.p.position, jersey: x.p.jersey, formationPlace: null })), ...pA.map((x, i) => ({ playerId: x.p.id, teamId: A.team.id, starter: i < 5, position: x.p.position, jersey: x.p.jersey, formationPlace: null }))],
        playerStats: [...pH.map((x) => ({ playerId: x.p.id, teamId: H.team.id, stats: x.stats })), ...pA.map((x) => ({ playerId: x.p.id, teamId: A.team.id, stats: x.stats }))],
        lineups: [], injuries: [], events: [], odds: null, attendance: m.attendance, venue: m.venue, city: m.city, teams: [H.team, A.team],
      }, true);
    }
  }
}

simulateFootball('eng.1', 20, 120);
simulateFootball('col.1', 12, 80);
simulateNba(30, 60, 28);
console.log('Base sintética creada en', file, db.prepare('SELECT COUNT(*) n FROM matches').get());
db.close();
