/** Nombres en español de las estadísticas más frecuentes (para el texto del analista). */
const L: Record<string, string> = {
  possessionPct: 'posesión %', totalShots: 'tiros', shotsOnTarget: 'tiros a puerta', wonCorners: 'córners', foulsCommitted: 'faltas', yellowCards: 'amarillas', redCards: 'rojas',
  saves: 'paradas', offsides: 'fueras de juego', accuratePasses: 'pases precisos', passPct: 'precisión de pase %', totalRebounds: 'rebotes', rebounds: 'rebotes', assists: 'asistencias',
  points: 'puntos', steals: 'robos', blocks: 'tapones', turnovers: 'pérdidas', fieldGoalPct: 'tiros de campo %', threePointFieldGoalPct: 'triples %', freeThrowPct: 'libres %',
};
export const statEs = (key: string, label?: string | null) => L[key] ?? label ?? key;
