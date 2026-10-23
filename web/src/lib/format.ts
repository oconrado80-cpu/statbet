export const fmt = (n: number | null | undefined, d = 1): string => (n === null || n === undefined || Number.isNaN(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (n: number | null | undefined, d = 0): string => (n === null || n === undefined ? '—' : `${fmt(n, d)} %`);

export function localDayRange(date: Date): { from: string; to: string } {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(a.getTime() + 86400000);
  return { from: a.toISOString(), to: b.toISOString() };
}
export const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromInputDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export const dateOf = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateTimeOf = (iso: string) => `${new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${timeOf(iso)}`;
export const ago = (iso: string | null) => {
  if (!iso) return 'nunca';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};

// ───── cuotas (ESPN publica moneyline americano) ─────
export type OddsFormat = 'decimal' | 'american' | 'fractional';
export const mlToDecimal = (ml: number) => (ml > 0 ? 1 + ml / 100 : 1 + 100 / Math.abs(ml));
export const mlToProb = (ml: number) => (ml > 0 ? 100 / (ml + 100) : Math.abs(ml) / (Math.abs(ml) + 100));
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
export function showOdds(ml: number | null | undefined, f: OddsFormat): string {
  if (ml === null || ml === undefined) return '—';
  if (f === 'american') return ml > 0 ? `+${ml}` : `${ml}`;
  if (f === 'decimal') return mlToDecimal(ml).toFixed(2);
  const num = ml > 0 ? ml : 100, den = ml > 0 ? 100 : Math.abs(ml);
  const g = gcd(num, den);
  return `${num / g}/${den / g}`;
}

// ───── etiquetas en español de las estadísticas más comunes ─────
const LABELS: Record<string, string> = {
  possessionPct: 'Posesión (%)', totalShots: 'Tiros', shotsOnTarget: 'Tiros a puerta', blockedShots: 'Tiros bloqueados', wonCorners: 'Córners',
  foulsCommitted: 'Faltas cometidas', foulsSuffered: 'Faltas recibidas', yellowCards: 'Tarjetas amarillas', redCards: 'Tarjetas rojas', offsides: 'Fuera de juego',
  saves: 'Paradas', accuratePasses: 'Pases precisos', totalPasses: 'Pases', passPct: 'Precisión de pase (%)', accurateCrosses: 'Centros precisos', totalCrosses: 'Centros',
  totalTackles: 'Entradas', effectiveTackles: 'Entradas ganadas', interceptions: 'Intercepciones', effectiveClearance: 'Despejes', totalClearance: 'Despejes',
  totalGoals: 'Goles', goalAssists: 'Asistencias', appearances: 'Partidos', ownGoals: 'Autogoles', goalsConceded: 'Goles recibidos', shotsFaced: 'Tiros recibidos',
  subIns: 'Entradas desde el banco', penaltyKickGoals: 'Penaltis marcados',
  points: 'Puntos', rebounds: 'Rebotes', totalRebounds: 'Rebotes', offensiveRebounds: 'Rebotes ofensivos', defensiveRebounds: 'Rebotes defensivos', assists: 'Asistencias',
  steals: 'Robos', blocks: 'Tapones', turnovers: 'Pérdidas', fouls: 'Faltas', minutes: 'Minutos', plusMinus: '+/-',
  fieldGoalsMade: 'Tiros de campo anotados', fieldGoalsAttempted: 'Tiros de campo intentados', fieldGoalPct: 'Tiros de campo (%)',
  threePointFieldGoalsMade: 'Triples anotados', threePointFieldGoalsAttempted: 'Triples intentados', threePointFieldGoalPct: 'Triples (%)',
  freeThrowsMade: 'Libres anotados', freeThrowsAttempted: 'Libres intentados', freeThrowPct: 'Libres (%)',
  goals: 'Goles', shots: 'Tiros', hits: 'Hits', atBats: 'Turnos al bate', runs: 'Carreras', RBIs: 'Carreras impulsadas', homeRuns: 'Jonrones', strikeouts: 'Ponches',
  passingYards: 'Yardas por pase', rushingYards: 'Yardas por carrera', receivingYards: 'Yardas por recepción', passingTouchdowns: 'TD de pase', timeOnIce: 'Tiempo en hielo', penaltyMinutes: 'Minutos de penalización',
  gamesPlayed: 'PJ', wins: 'G', losses: 'P', ties: 'E', draws: 'E', pointsFor: 'GF', pointsAgainst: 'GC', pointDifferential: 'Dif', winPercent: '% victorias', streak: 'Racha', gamesBehind: 'Dif. con líder',
};
export function statLabel(key: string, espnLabel?: string | null): string {
  if (LABELS[key]) return LABELS[key];
  if (espnLabel && espnLabel.length > 1) return espnLabel;
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export const SPORT_NAMES: Record<string, string> = { football: 'Fútbol', basketball: 'Baloncesto', nfl: 'Fútbol americano', baseball: 'Béisbol', hockey: 'Hockey', tennis: 'Tenis' };
export const STATUS_NAMES: Record<string, string> = { scheduled: 'Programado', live: 'En vivo', final: 'Finalizado', postponed: 'Aplazado', cancelled: 'Cancelado' };

const EVENTS: Record<string, string> = {
  'Goal': 'Gol', 'Goal - Header': 'Gol de cabeza', 'Goal - Free-kick': 'Gol de tiro libre', 'Penalty - Scored': 'Penalti marcado', 'Penalty - Missed': 'Penalti fallado', 'Penalty - Saved': 'Penalti parado',
  'Own Goal': 'Autogol', 'Yellow Card': 'Tarjeta amarilla', 'Red Card': 'Tarjeta roja', 'Second Yellow': 'Segunda amarilla', 'Substitution': 'Cambio', 'Halftime': 'Descanso', 'Kickoff': 'Inicio', 'Full Time': 'Final',
  'Made Shot': 'Tiro anotado', 'Touchdown': 'Touchdown', 'Field Goal': 'Gol de campo', 'Home Run': 'Jonrón',
};
export const eventName = (t: string | null) => (t ? EVENTS[t] ?? t : '');
