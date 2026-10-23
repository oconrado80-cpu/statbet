/**
 * Modelos predictivos simples, transparentes y medibles. Se calculan SOLO con los partidos guardados.
 *
 *  - Elo (deportes de 2 resultados): se actualiza partido a partido.
 *  - Poisson independiente (fútbol): fuerza de ataque/defensa con encogimiento hacia la media de la liga.
 *
 * Importante: son modelos de referencia, no oráculos. `backtest()` los evalúa "caminando hacia adelante"
 * (cada predicción usa únicamente datos anteriores al partido) y los compara contra una línea base ingenua.
 * Si el modelo no le gana a la línea base con la muestra disponible, la interfaz debe decirlo.
 */
import type { DB } from '../db.ts';

export interface FinalMatch {
  id: string;
  start_time: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  neutral_site: number;
}

export function loadFinals(db: DB, leagueId: string, season?: number): FinalMatch[] {
  return db
    .prepare(
      `SELECT id, start_time, home_team_id, away_team_id, home_score, away_score, neutral_site
       FROM matches WHERE league_id = ? AND status = 'final' AND home_score IS NOT NULL AND away_score IS NOT NULL
       ${season ? 'AND season = ?' : ''} ORDER BY start_time, id`,
    )
    .all(...(season ? [leagueId, season] : [leagueId])) as FinalMatch[];
}

// ───────────────────────── Elo ─────────────────────────

export interface EloParams {
  k: number;
  /** Ventaja de local en puntos Elo. */
  hfa: number;
  /** Multiplica K por (1 + ln(1 + |diferencia de goles|)). */
  margin: boolean;
}

/** Valores de partida razonables por deporte; el backtest sirve para comprobar si funcionan en TUS datos. */
export function defaultEloParams(sportId: string): EloParams {
  switch (sportId) {
    case 'basketball': return { k: 20, hfa: 70, margin: false };
    case 'nfl': return { k: 20, hfa: 48, margin: false };
    case 'baseball': return { k: 6, hfa: 24, margin: false };
    case 'hockey': return { k: 8, hfa: 40, margin: false };
    case 'tennis': return { k: 24, hfa: 0, margin: false };
    default: return { k: 20, hfa: 65, margin: false };
  }
}

export const eloExpected = (rHome: number, rAway: number, hfa: number) => 1 / (1 + 10 ** (-(rHome + hfa - rAway) / 400));

export interface EloState {
  ratings: Map<string, { rating: number; games: number }>;
}

export function eloUpdate(state: EloState, m: FinalMatch, p: EloParams): void {
  const h = state.ratings.get(m.home_team_id) ?? { rating: 1500, games: 0 };
  const a = state.ratings.get(m.away_team_id) ?? { rating: 1500, games: 0 };
  const hfa = m.neutral_site ? 0 : p.hfa;
  const e = eloExpected(h.rating, a.rating, hfa);
  const s = m.home_score > m.away_score ? 1 : m.home_score < m.away_score ? 0 : 0.5;
  const mult = p.margin ? 1 + Math.log(1 + Math.abs(m.home_score - m.away_score)) : 1;
  const delta = p.k * mult * (s - e);
  state.ratings.set(m.home_team_id, { rating: h.rating + delta, games: h.games + 1 });
  state.ratings.set(m.away_team_id, { rating: a.rating - delta, games: a.games + 1 });
}

export function computeElo(finals: FinalMatch[], p: EloParams): EloState {
  const state: EloState = { ratings: new Map() };
  for (const m of finals) eloUpdate(state, m, p);
  return state;
}

// ───────────────────────── Poisson (fútbol) ─────────────────────────

export interface PoissonParams {
  /** Peso del "prior" en partidos equivalentes (encogimiento hacia la media de la liga). */
  prior: number;
  maxGoals: number;
}
export const defaultPoissonParams: PoissonParams = { prior: 6, maxGoals: 10 };

interface TeamAgg { gf: number; ga: number; g: number }
export interface PoissonState {
  teams: Map<string, TeamAgg>;
  homeGoals: number;
  awayGoals: number;
  games: number;
}
export const newPoissonState = (): PoissonState => ({ teams: new Map(), homeGoals: 0, awayGoals: 0, games: 0 });

export function poissonUpdate(st: PoissonState, m: FinalMatch): void {
  const h = st.teams.get(m.home_team_id) ?? { gf: 0, ga: 0, g: 0 };
  const a = st.teams.get(m.away_team_id) ?? { gf: 0, ga: 0, g: 0 };
  h.gf += m.home_score; h.ga += m.away_score; h.g++;
  a.gf += m.away_score; a.ga += m.home_score; a.g++;
  st.teams.set(m.home_team_id, h);
  st.teams.set(m.away_team_id, a);
  st.homeGoals += m.home_score;
  st.awayGoals += m.away_score;
  st.games++;
}

export interface ScorePrediction {
  lambdaHome: number;
  lambdaAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver25: number;
  pBtts: number;
  topScores: { score: string; p: number }[];
  /** partidos previos de cada equipo usados (confianza) */
  gamesHome: number;
  gamesAway: number;
}

const pois = (lambda: number, maxK: number): number[] => {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= maxK; k++) out.push((out[k - 1] * lambda) / k);
  return out;
};

export function poissonPredict(st: PoissonState, homeId: string, awayId: string, p: PoissonParams = defaultPoissonParams): ScorePrediction | null {
  if (st.games < 20) return null;
  const muH = st.homeGoals / st.games;
  const muA = st.awayGoals / st.games;
  const muTeam = (muH + muA) / 2;
  if (muTeam <= 0) return null;
  const strength = (id: string) => {
    const t = st.teams.get(id) ?? { gf: 0, ga: 0, g: 0 };
    return {
      att: (t.gf + p.prior * muTeam) / (t.g + p.prior) / muTeam,
      def: (t.ga + p.prior * muTeam) / (t.g + p.prior) / muTeam,
      g: t.g,
    };
  };
  const h = strength(homeId);
  const a = strength(awayId);
  const lh = muH * h.att * a.def;
  const la = muA * a.att * h.def;
  const ph = pois(lh, p.maxGoals);
  const pa = pois(la, p.maxGoals);
  let pHome = 0, pDraw = 0, pAway = 0, pOver = 0, pBtts = 0;
  const scores: { score: string; p: number }[] = [];
  for (let i = 0; i <= p.maxGoals; i++) {
    for (let j = 0; j <= p.maxGoals; j++) {
      const pr = ph[i] * pa[j];
      if (i > j) pHome += pr; else if (i === j) pDraw += pr; else pAway += pr;
      if (i + j >= 3) pOver += pr;
      if (i > 0 && j > 0) pBtts += pr;
      scores.push({ score: `${i}-${j}`, p: pr });
    }
  }
  const total = pHome + pDraw + pAway; // cola truncada: se renormaliza
  scores.sort((x, y) => y.p - x.p);
  return {
    lambdaHome: lh, lambdaAway: la,
    pHome: pHome / total, pDraw: pDraw / total, pAway: pAway / total,
    pOver25: pOver / total, pBtts: pBtts / total,
    topScores: scores.slice(0, 5).map((s) => ({ score: s.score, p: s.p / total })),
    gamesHome: h.g, gamesAway: a.g,
  };
}

// ───────────────────────── Backtest ─────────────────────────

export type Model = 'elo' | 'poisson';

export interface BacktestResult {
  model: Model;
  params: EloParams | PoissonParams;
  matchesInLeague: number;
  evaluated: number;
  skippedDraws: number;
  warmup: number;
  metrics: { logLoss: number; brier: number; accuracy: number } | null;
  baseline: { logLoss: number; brier: number; accuracy: number } | null;
  /** Mejora relativa de log-loss frente a la línea base (positivo = el modelo es mejor). */
  skill: number | null;
  /** Diferencia media de log-loss (modelo − base) y su intervalo ~95 %. Si cruza 0 no hay evidencia de mejora. */
  paired: { meanDiff: number; ci95: [number, number]; significant: boolean } | null;
  calibration: { bin: string; predicted: number; observed: number; n: number }[];
  verdict: string;
}

const EPS = 1e-9;

export function backtest(finals: FinalMatch[], model: Model, params: EloParams | PoissonParams, minWarmupGames = 5): BacktestResult {
  const threeWay = model === 'poisson';
  const elo: EloState = { ratings: new Map() };
  const pst = newPoissonState();
  // Línea base: frecuencias acumuladas de la propia liga (lo mejor que se puede hacer sin saber nada de los equipos)
  let nBase = 0, bHome = 0, bDraw = 0, bAway = 0;

  const diffs: number[] = [];
  let llM = 0, brM = 0, accM = 0, llB = 0, brB = 0, accB = 0, n = 0, skippedDraws = 0;
  const bins = Array.from({ length: 10 }, () => ({ sumP: 0, sumY: 0, n: 0 }));
  const warmup = 20;

  finals.forEach((m, idx) => {
    const outcome = m.home_score > m.away_score ? 0 : m.home_score === m.away_score ? 1 : 2; // 0 local, 1 empate, 2 visita
    const homeGames = threeWay ? pst.teams.get(m.home_team_id)?.g ?? 0 : elo.ratings.get(m.home_team_id)?.games ?? 0;
    const awayGames = threeWay ? pst.teams.get(m.away_team_id)?.g ?? 0 : elo.ratings.get(m.away_team_id)?.games ?? 0;
    const ready = idx >= warmup && homeGames >= minWarmupGames && awayGames >= minWarmupGames && nBase >= warmup;

    if (ready) {
      if (threeWay) {
        const pr = poissonPredict(pst, m.home_team_id, m.away_team_id, params as PoissonParams);
        if (pr) {
          const pm = [pr.pHome, pr.pDraw, pr.pAway];
          const pb = [(bHome + 1) / (nBase + 3), (bDraw + 1) / (nBase + 3), (bAway + 1) / (nBase + 3)];
          const lm = -Math.log(Math.max(pm[outcome], EPS));
          const lb = -Math.log(Math.max(pb[outcome], EPS));
          llM += lm; llB += lb; diffs.push(lm - lb);
          brM += pm.reduce((s, p, i) => s + (p - (i === outcome ? 1 : 0)) ** 2, 0);
          brB += pb.reduce((s, p, i) => s + (p - (i === outcome ? 1 : 0)) ** 2, 0);
          accM += pm.indexOf(Math.max(...pm)) === outcome ? 1 : 0;
          accB += pb.indexOf(Math.max(...pb)) === outcome ? 1 : 0;
          const b = Math.min(9, Math.floor(pr.pHome * 10));
          bins[b].sumP += pr.pHome; bins[b].sumY += outcome === 0 ? 1 : 0; bins[b].n++;
          n++;
        }
      } else if (outcome === 1) {
        skippedDraws++;
      } else {
        const p = params as EloParams;
        const pHome = eloExpected(elo.ratings.get(m.home_team_id)!.rating, elo.ratings.get(m.away_team_id)!.rating, m.neutral_site ? 0 : p.hfa);
        const pbHome = (bHome + 1) / (bHome + bAway + 2);
        const y = outcome === 0 ? 1 : 0;
        const lm = -Math.log(Math.max(y ? pHome : 1 - pHome, EPS));
        const lb = -Math.log(Math.max(y ? pbHome : 1 - pbHome, EPS));
        llM += lm; llB += lb; diffs.push(lm - lb);
        brM += (pHome - y) ** 2; brB += (pbHome - y) ** 2;
        accM += (pHome >= 0.5) === (y === 1) ? 1 : 0;
        accB += (pbHome >= 0.5) === (y === 1) ? 1 : 0;
        const b = Math.min(9, Math.floor(pHome * 10));
        bins[b].sumP += pHome; bins[b].sumY += y; bins[b].n++;
        n++;
      }
    }

    // Recién ahora se "ve" el resultado (sin fuga de información)
    if (threeWay) poissonUpdate(pst, m); else eloUpdate(elo, m, params as EloParams);
    nBase++;
    if (outcome === 0) bHome++; else if (outcome === 1) bDraw++; else bAway++;
  });

  const base: BacktestResult = {
    model, params, matchesInLeague: finals.length, evaluated: n, skippedDraws, warmup,
    metrics: null, baseline: null, skill: null, paired: null, calibration: [], verdict: '',
  };
  if (n < 30) {
    base.verdict = `Muestra insuficiente (${n} partidos evaluables; se necesitan al menos 30). Sigue acumulando datos antes de sacar conclusiones.`;
    return base;
  }
  base.metrics = { logLoss: llM / n, brier: brM / n, accuracy: accM / n };
  base.baseline = { logLoss: llB / n, brier: brB / n, accuracy: accB / n };
  base.skill = 1 - base.metrics.logLoss / base.baseline.logLoss;
  const mean = diffs.reduce((s, d) => s + d, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  base.paired = { meanDiff: mean, ci95: [mean - 1.96 * se, mean + 1.96 * se], significant: mean + 1.96 * se < 0 || mean - 1.96 * se > 0 };
  base.calibration = bins
    .map((b, i) => ({ bin: `${i * 10}-${i * 10 + 10}%`, predicted: b.n ? b.sumP / b.n : 0, observed: b.n ? b.sumY / b.n : 0, n: b.n }))
    .filter((b) => b.n > 0);
  if (base.paired.significant && mean < 0) {
    base.verdict = `El modelo supera a la línea base (log-loss ${(-mean).toFixed(3)} menor por partido, IC95 % no cruza 0) con ${n} partidos.`;
  } else if (base.paired.significant) {
    base.verdict = `El modelo es PEOR que la línea base ingenua con ${n} partidos. No lo uses para decidir nada.`;
  } else {
    base.verdict = `Con ${n} partidos NO hay evidencia de que el modelo supere a la línea base (la diferencia es compatible con cero). Más datos o mejores variables antes de confiar en él.`;
  }
  return base;
}
