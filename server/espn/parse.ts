/**
 * Parsers PUROS (sin red ni base de datos) que convierten el JSON de ESPN en filas listas para guardar.
 * Todo es defensivo: ESPN no documenta estos endpoints, así que cualquier campo puede faltar.
 * Regla de oro: si ESPN no lo da, NO se inventa — queda como null.
 */
import type { LeagueConfig } from './config.ts';

type J = any;

export interface ParsedTeam {
  id: string;
  sportId: string;
  espnId: string;
  name: string;
  shortName: string | null;
  abbreviation: string | null;
  logo: string | null;
  color: string | null;
  country: string | null;
  kind: 'team' | 'individual';
}

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';

export interface ParsedEvent {
  seq: number;
  clock: string | null;
  period: number | null;
  type: string | null;
  text: string | null;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  scoring: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ParsedOdds {
  provider: string | null;
  homeMl: number | null;
  awayMl: number | null;
  drawMl: number | null;
  spread: number | null;
  total: number | null;
  details: string | null;
}

export interface ParsedMatch {
  espnId: string;
  season: number | null;
  stage: string | null;
  startTime: string;
  status: MatchStatus;
  statusDetail: string | null;
  clock: string | null;
  period: number | null;
  home: ParsedTeam;
  away: ParsedTeam;
  homeScore: number | null;
  awayScore: number | null;
  homeLine: number[] | null;
  awayLine: number[] | null;
  winner: 'home' | 'away' | 'draw' | null;
  venue: string | null;
  city: string | null;
  attendance: number | null;
  neutral: boolean;
  odds: ParsedOdds | null;
  events: ParsedEvent[];
}

export interface ParsedStat {
  grp: string;
  key: string;
  label: string | null;
  value: number | null;
  display: string | null;
}

export interface ParsedPlayer {
  id: string;
  sportId: string;
  espnId: string;
  name: string;
  shortName: string | null;
  position: string | null;
  jersey: string | null;
  headshot: string | null;
  teamId: string | null;
}

export interface ParsedSummary {
  teamStats: { teamId: string; stats: ParsedStat[] }[];
  players: ParsedPlayer[];
  appearances: { playerId: string; teamId: string; starter: boolean | null; position: string | null; jersey: string | null; formationPlace: number | null }[];
  lineups: { teamId: string; formation: string }[];
  injuries: { teamId: string; playerId: string | null; name: string; position: string | null; status: string | null; detail: string | null }[];
  playerStats: { playerId: string; teamId: string; stats: ParsedStat[] }[];
  events: ParsedEvent[];
  odds: ParsedOdds | null;
  attendance: number | null;
  venue: string | null;
  city: string | null;
  teams: ParsedTeam[];
}

export interface ParsedStandings {
  season: number | null;
  rows: { group: string; teamId: string; rank: number; stats: Record<string, number | string> }[];
  teams: ParsedTeam[];
}

// ───────────────────────── helpers ─────────────────────────

const str = (x: unknown): string | null => (x === undefined || x === null || x === '' ? null : String(x));

export function num(x: unknown): number | null {
  if (x === undefined || x === null || x === '' || x === '--') return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const s = String(x).trim().replace(/,/g, '').replace(/%$/, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "32" → 32 · "58.3%" → 58.3 · "18:32" (min:seg) → 18.53 · "10-18" → null (se separa en otro paso). */
function statValue(x: unknown): number | null {
  const direct = num(x);
  if (direct !== null) return direct;
  const m = typeof x === 'string' ? x.match(/^(\d+):(\d{2})$/) : null;
  if (m) return Number((Number(m[1]) + Number(m[2]) / 60).toFixed(2));
  return null;
}

const teamKey = (sportId: string, espnId: string | number) => `${sportId}:${espnId}`;

function iso(x: unknown): string | null {
  if (!x) return null;
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function mapStatus(type: J): { status: MatchStatus; detail: string | null } {
  const name = String(type?.name || '').toUpperCase();
  const state = String(type?.state || '').toLowerCase();
  const detail = str(type?.detail) ?? str(type?.description);
  if (name.includes('POSTPONED') || name.includes('SUSPENDED')) return { status: 'postponed', detail };
  if (name.includes('CANCEL') || name.includes('ABANDON')) return { status: 'cancelled', detail };
  if (state === 'in') return { status: 'live', detail };
  if (state === 'post' || type?.completed === true) return { status: 'final', detail };
  return { status: 'scheduled', detail };
}

export function parseTeam(l: LeagueConfig, t: J, countryHint?: string | null): ParsedTeam | null {
  if (!t || t.id === undefined || t.id === null) return null;
  const name = str(t.displayName) ?? str(t.name) ?? str(t.location);
  if (!name) return null;
  return {
    id: teamKey(l.sportId, t.id),
    sportId: l.sportId,
    espnId: String(t.id),
    name,
    shortName: str(t.shortDisplayName) ?? str(t.name),
    abbreviation: str(t.abbreviation),
    logo: str(t.logo) ?? str(t.logos?.[0]?.href),
    color: str(t.color),
    country: countryHint ?? null,
    kind: 'team',
  };
}

function parseAthleteAsTeam(l: LeagueConfig, c: J): ParsedTeam | null {
  const a = c?.athlete;
  const id = c?.id ?? a?.id;
  const name = str(a?.displayName) ?? str(a?.fullName) ?? str(c?.team?.displayName);
  if (id === undefined || id === null || !name) return null;
  return {
    id: teamKey(l.sportId, id),
    sportId: l.sportId,
    espnId: String(id),
    name,
    shortName: str(a?.shortName),
    abbreviation: null,
    logo: str(a?.flag?.href) ?? str(a?.headshot),
    color: null,
    country: str(a?.flag?.alt),
    kind: 'individual',
  };
}

/** Cuotas: ESPN las entrega en dos formatos distintos según el deporte/año. */
export function parseOdds(item: J): ParsedOdds | null {
  if (!item || typeof item !== 'object') return null;
  const pick = (...vals: unknown[]): number | null => {
    for (const v of vals) {
      const n = num(v);
      if (n !== null) return n;
    }
    return null;
  };
  const homeMl = pick(item.homeTeamOdds?.moneyLine, item.moneyline?.home?.close?.odds, item.moneyline?.home?.open?.odds);
  const awayMl = pick(item.awayTeamOdds?.moneyLine, item.moneyline?.away?.close?.odds, item.moneyline?.away?.open?.odds);
  const drawMl = pick(item.drawOdds?.moneyLine, item.moneyline?.draw?.close?.odds, item.moneyline?.draw?.open?.odds);
  const spread = pick(item.spread, item.pointSpread?.home?.close?.line);
  const total = pick(item.overUnder, item.total?.over?.close?.line);
  if (homeMl === null && awayMl === null && spread === null && total === null) return null;
  return {
    provider: str(item.provider?.name),
    homeMl,
    awayMl,
    drawMl,
    spread,
    total,
    details: str(item.details),
  };
}

function lineOf(c: J): number[] | null {
  const ls = c?.linescores;
  if (!Array.isArray(ls) || !ls.length) return null;
  const vals = ls.map((x: J) => num(x?.value));
  return vals.every((v: number | null) => v !== null) ? (vals as number[]) : null;
}

/** Eventos de la jugada que ESPN adjunta al scoreboard de fútbol (competition.details). */
function parseScoreboardDetails(l: LeagueConfig, comp: J, homeEspnId: string): ParsedEvent[] {
  const out: ParsedEvent[] = [];
  const details = Array.isArray(comp?.details) ? comp.details : [];
  details.forEach((d: J, i: number) => {
    const who = d.athletesInvolved?.[0];
    let type = str(d.type?.text);
    if (d.redCard) type = 'Red Card';
    else if (d.yellowCard) type = 'Yellow Card';
    else if (d.ownGoal) type = 'Own Goal';
    else if (d.penaltyKick && d.scoringPlay) type = 'Penalty - Scored';
    out.push({
      seq: i,
      clock: str(d.clock?.displayValue),
      period: null,
      type,
      text: null,
      teamId: d.team?.id !== undefined ? teamKey(l.sportId, d.team.id) : null,
      playerId: who?.id !== undefined ? teamKey(l.sportId, who.id) : null,
      playerName: str(who?.displayName),
      scoring: !!d.scoringPlay,
      homeScore: null,
      awayScore: null,
    });
  });
  void homeEspnId;
  return out;
}

// ───────────────────────── scoreboard ─────────────────────────

export interface ParsedScoreboard {
  matches: ParsedMatch[];
  skipped: number;
}

export function parseScoreboard(l: LeagueConfig, json: J): ParsedScoreboard {
  const out: ParsedMatch[] = [];
  let skipped = 0;
  const events: J[] = Array.isArray(json?.events) ? json.events : [];
  const leagueSeason = num(json?.leagues?.[0]?.season?.year);

  for (const ev of events) {
    try {
      if (l.kind === 'individual') {
        const before = out.length;
        parseTennisEvent(l, ev, leagueSeason, out);
        if (out.length === before) skipped++;
        continue;
      }
      const comp = ev?.competitions?.[0];
      if (!ev?.id || !comp) {
        skipped++;
        continue;
      }
      const comps: J[] = comp.competitors || [];
      const hc = comps.find((c) => c.homeAway === 'home') ?? comps[0];
      const ac = comps.find((c) => c.homeAway === 'away') ?? comps[1];
      const home = parseTeam(l, hc?.team, l.country);
      const away = parseTeam(l, ac?.team, l.country);
      const start = iso(comp.date ?? ev.date);
      if (!home || !away || !start) {
        skipped++;
        continue;
      }
      const { status, detail } = mapStatus(comp.status?.type ?? ev.status?.type);
      const hasScore = status === 'live' || status === 'final';
      const homeScore = hasScore ? num(hc.score) : null;
      const awayScore = hasScore ? num(ac.score) : null;

      let winner: ParsedMatch['winner'] = null;
      if (status === 'final') {
        if (hc.winner === true) winner = 'home';
        else if (ac.winner === true) winner = 'away';
        else if (homeScore !== null && awayScore !== null) {
          winner = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
        }
      }

      out.push({
        espnId: String(ev.id),
        season: num(ev.season?.year) ?? leagueSeason,
        stage: str(comp.type?.text) ?? str(ev.season?.slug) ?? str(comp.notes?.[0]?.headline),
        startTime: start,
        status,
        statusDetail: detail,
        clock: str(comp.status?.displayClock ?? ev.status?.displayClock),
        period: num(comp.status?.period ?? ev.status?.period),
        home,
        away,
        homeScore,
        awayScore,
        homeLine: hasScore ? lineOf(hc) : null,
        awayLine: hasScore ? lineOf(ac) : null,
        winner,
        venue: str(comp.venue?.fullName),
        city: str(comp.venue?.address?.city),
        attendance: num(comp.attendance) || null,
        neutral: comp.neutralSite === true,
        odds: parseOdds(comp.odds?.[0]),
        events: l.sportId === 'football' ? parseScoreboardDetails(l, comp, home.espnId) : [],
      });
    } catch {
      skipped++;
    }
  }
  return { matches: out, skipped };
}

function parseTennisEvent(l: LeagueConfig, ev: J, leagueSeason: number | null, out: ParsedMatch[]): void {
  const tournament = str(ev?.name) ?? l.name;
  for (const grp of ev?.groupings || []) {
    for (const comp of grp?.competitions || []) {
      const comps: J[] = comp?.competitors || [];
      if (comps.length < 2 || comp.id === undefined) continue;
      const sorted = [...comps].sort((a, b) => (num(a.order) ?? 99) - (num(b.order) ?? 99));
      const c0 = sorted[0];
      const c1 = sorted[1];
      const home = parseAthleteAsTeam(l, c0);
      const away = parseAthleteAsTeam(l, c1);
      const start = iso(comp.date ?? comp.startDate ?? ev.date);
      if (!home || !away || !start) continue;
      const { status, detail } = mapStatus(comp.status?.type);
      const l0 = lineOf(c0);
      const l1 = lineOf(c1);
      let sets0 = 0;
      let sets1 = 0;
      if (l0 && l1) {
        l0.forEach((g, i) => {
          if (g > (l1[i] ?? 0)) sets0++;
          else if (g < (l1[i] ?? 0)) sets1++;
        });
      }
      const hasScore = status === 'live' || status === 'final';
      let winner: ParsedMatch['winner'] = null;
      if (status === 'final') winner = c0.winner === true ? 'home' : c1.winner === true ? 'away' : sets0 > sets1 ? 'home' : sets1 > sets0 ? 'away' : null;
      out.push({
        espnId: String(comp.id),
        season: num(ev.season?.year) ?? leagueSeason,
        stage: [tournament, str(comp.round?.displayName)].filter(Boolean).join(' · ') || null,
        startTime: start,
        status,
        statusDetail: detail,
        clock: null,
        period: null,
        home,
        away,
        homeScore: hasScore && l0 ? sets0 : null,
        awayScore: hasScore && l1 ? sets1 : null,
        homeLine: hasScore ? l0 : null,
        awayLine: hasScore ? l1 : null,
        winner,
        venue: str(comp.venue?.court) ?? str(comp.venue?.fullName),
        city: str(comp.venue?.fullName),
        attendance: null,
        neutral: true,
        odds: parseOdds(comp.odds?.[0]),
        events: [],
      });
    }
  }
}

// ───────────────────────── summary (boxscore) ─────────────────────────

/** Convierte (clave, texto) en 1 o 2 estadísticas: "10-18" con clave "a-b" → a=10, b=18. */
function expandStat(grp: string, key: string, label: string | null, raw: unknown): ParsedStat[] {
  const display = str(raw);
  if (display === null) return [];
  if (key.includes('-') && typeof raw === 'string') {
    const parts = key.split('-');
    const vals = raw.split('-');
    if (parts.length === 2 && vals.length === 2 && num(vals[0]) !== null && num(vals[1]) !== null) {
      return [
        { grp, key: parts[0], label: label ? `${label} (hechos)` : null, value: num(vals[0]), display: vals[0] },
        { grp, key: parts[1], label: label ? `${label} (intentos)` : null, value: num(vals[1]), display: vals[1] },
      ];
    }
  }
  return [{ grp, key, label, value: statValue(raw), display }];
}

function parsePlayer(l: LeagueConfig, a: J, teamId: string | null, extra?: { jersey?: unknown; position?: unknown }): ParsedPlayer | null {
  if (!a || a.id === undefined || a.id === null) return null;
  const name = str(a.displayName) ?? str(a.fullName) ?? str(a.shortName);
  if (!name) return null;
  return {
    id: teamKey(l.sportId, a.id),
    sportId: l.sportId,
    espnId: String(a.id),
    name,
    shortName: str(a.shortName),
    position: str(a.position?.abbreviation) ?? str(extra?.position),
    jersey: str(a.jersey) ?? str(extra?.jersey),
    headshot: str(a.headshot?.href) ?? str(a.headshot),
    teamId,
  };
}

export function parseSummary(l: LeagueConfig, json: J): ParsedSummary {
  const res: ParsedSummary = {
    teamStats: [],
    players: [],
    appearances: [],
    lineups: [],
    injuries: [],
    playerStats: [],
    events: [],
    odds: null,
    attendance: null,
    venue: null,
    city: null,
    teams: [],
  };
  if (!json || typeof json !== 'object') return res;
  const seenPlayers = new Map<string, ParsedPlayer>();
  const addPlayer = (p: ParsedPlayer | null) => {
    if (p && !seenPlayers.has(p.id)) seenPlayers.set(p.id, p);
  };

  // 1) Estadísticas por equipo
  for (const t of json.boxscore?.teams || []) {
    const team = parseTeam(l, t.team, l.country);
    if (!team) continue;
    res.teams.push(team);
    const stats: ParsedStat[] = [];
    for (const s of t.statistics || []) {
      const key = str(s.name);
      if (!key) continue;
      const raw = s.displayValue ?? s.value;
      stats.push(...expandStat('', key, str(s.label) ?? str(s.abbreviation), raw));
    }
    if (stats.length) res.teamStats.push({ teamId: team.id, stats });
  }

  // 2) Estadísticas por jugador — formato "boxscore.players" (NBA, NFL, MLB, NHL…)
  for (const tp of json.boxscore?.players || []) {
    const team = parseTeam(l, tp.team, l.country);
    if (!team) continue;
    const perPlayer = new Map<string, ParsedStat[]>();
    for (const group of tp.statistics || []) {
      const grp = str(group.name) ?? '';
      const keys: string[] = group.keys || group.names || [];
      const labels: string[] = group.labels || [];
      for (const row of group.athletes || []) {
        if (row.didNotPlay === true) continue;
        const player = parsePlayer(l, row.athlete, team.id);
        if (!player) continue;
        const values: unknown[] = Array.isArray(row.stats) ? row.stats : [];
        if (!values.length) continue;
        addPlayer(player);
        res.appearances.push({
          playerId: player.id,
          teamId: team.id,
          starter: typeof row.starter === 'boolean' ? row.starter : null,
          position: player.position,
          jersey: player.jersey,
          formationPlace: null,
        });
        const acc = perPlayer.get(player.id) ?? [];
        values.forEach((v, i) => {
          const key = keys[i];
          if (!key) return;
          acc.push(...expandStat(grp, key, labels[i] ?? null, v));
        });
        perPlayer.set(player.id, acc);
      }
    }
    for (const [playerId, stats] of perPlayer) res.playerStats.push({ playerId, teamId: team.id, stats });
  }

  // 3) Estadísticas por jugador — formato "rosters" (fútbol)
  for (const r of json.rosters || []) {
    const team = parseTeam(l, r.team, l.country);
    if (!team) continue;
    if (str(r.formation)) res.lineups.push({ teamId: team.id, formation: String(r.formation) });
    for (const row of r.roster || []) {
      const player = parsePlayer(l, row.athlete, team.id, { jersey: row.jersey, position: row.position?.abbreviation });
      if (!player) continue;
      const stats: ParsedStat[] = [];
      for (const s of row.stats || []) {
        const key = str(s.name);
        if (!key) continue;
        const value = num(s.value) ?? num(s.displayValue);
        stats.push({ grp: '', key, label: str(s.abbreviation) ?? str(s.shortDisplayName) ?? str(s.displayName), value, display: str(s.displayValue) ?? (value !== null ? String(value) : null) });
      }
      const appearedStat = stats.find((s) => s.key === 'appearances')?.value ?? 0;
      const played = row.starter === true || !!row.subbedIn || appearedStat > 0;
      if (!played) continue;
      addPlayer({ ...player, position: player.position ?? str(row.position?.abbreviation) });
      res.appearances.push({
        playerId: player.id,
        teamId: team.id,
        starter: typeof row.starter === 'boolean' ? row.starter : null,
        position: str(row.position?.abbreviation) ?? player.position,
        jersey: str(row.jersey) ?? player.jersey,
        formationPlace: num(row.formationPlace),
      });
      if (stats.length) res.playerStats.push({ playerId: player.id, teamId: team.id, stats });
    }
  }
  res.players = [...seenPlayers.values()];

  // Lesionados (ESPN los incluye en algunos deportes/partidos)
  for (const grp of Array.isArray(json.injuries) ? json.injuries : []) {
    if (grp?.team?.id === undefined || grp?.team?.id === null) continue;
    const team = { id: teamKey(l.sportId, grp.team.id) };
    for (const inj of grp.injuries || []) {
      const a = inj.athlete;
      const name = str(a?.displayName) ?? str(a?.fullName);
      if (!name) continue;
      res.injuries.push({
        teamId: team.id,
        playerId: a?.id !== undefined ? teamKey(l.sportId, a.id) : null,
        name,
        position: str(a?.position?.abbreviation),
        status: str(inj.status) ?? str(inj.type?.description),
        detail: str(inj.details?.detail) ?? str(inj.details?.type) ?? str(inj.shortComment) ?? str(inj.longComment),
      });
    }
  }

  // 4) Eventos clave (goles, tarjetas, cambios…)
  const keyEvents: J[] = Array.isArray(json.keyEvents) ? json.keyEvents : [];
  const scoringPlays: J[] = Array.isArray(json.scoringPlays) ? json.scoringPlays : [];
  const source = keyEvents.length ? keyEvents : scoringPlays;
  source.forEach((e, i) => {
    const part = e.participants?.[0]?.athlete;
    res.events.push({
      seq: i,
      clock: str(e.clock?.displayValue),
      period: num(e.period?.number),
      type: str(e.type?.text) ?? str(e.type?.type),
      text: str(e.shortText) ?? str(e.text),
      teamId: e.team?.id !== undefined ? teamKey(l.sportId, e.team.id) : null,
      playerId: part?.id !== undefined ? teamKey(l.sportId, part.id) : null,
      playerName: str(part?.displayName),
      scoring: e.scoringPlay === true || scoringPlays.includes(e),
      homeScore: num(e.homeScore),
      awayScore: num(e.awayScore),
    });
  });

  // 5) Cuotas, asistencia, estadio
  res.odds = parseOdds(json.pickcenter?.[0]) ?? parseOdds(json.odds?.[0]);
  res.attendance = num(json.gameInfo?.attendance) || null;
  res.venue = str(json.gameInfo?.venue?.fullName);
  res.city = str(json.gameInfo?.venue?.address?.city);
  return res;
}

// ───────────────────────── standings ─────────────────────────

export function parseStandings(l: LeagueConfig, json: J): ParsedStandings {
  const rows: ParsedStandings['rows'] = [];
  const teams: ParsedTeam[] = [];
  const groups: { name: string; entries: J[] }[] = [];
  if (Array.isArray(json?.children) && json.children.length) {
    for (const c of json.children) {
      groups.push({ name: str(c.name) ?? str(c.abbreviation) ?? '', entries: c.standings?.entries || [] });
    }
  } else if (json?.standings?.entries) {
    groups.push({ name: '', entries: json.standings.entries });
  }
  const seasonRaw =
    num(json?.children?.[0]?.standings?.season) ??
    num(json?.standings?.season) ??
    num(json?.seasons?.[0]?.year) ??
    num(json?.season?.year);
  for (const g of groups) {
    g.entries.forEach((e, idx) => {
      const team = parseTeam(l, e.team, l.country);
      if (!team) return;
      teams.push(team);
      const stats: Record<string, number | string> = {};
      for (const s of e.stats || []) {
        const key = str(s.name);
        if (!key) continue;
        const v = num(s.value);
        stats[key] = v !== null ? v : str(s.displayValue) ?? '';
      }
      const rank = num(stats.rank) ?? num(stats.playoffSeed) ?? idx + 1;
      rows.push({ group: g.name, teamId: team.id, rank, stats });
    });
  }
  return { season: seasonRaw, rows, teams };
}
