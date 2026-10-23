import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backtest, computeElo, defaultEloParams, defaultPoissonParams, eloExpected, type FinalMatch } from '../server/analytics/models.ts';

// RNG determinista (mulberry32) para que el test sea reproducible
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const poisson = (r: () => number, lambda: number) => { let L = Math.exp(-lambda), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };

function league(nTeams: number, nMatches: number, skill: (i: number) => number, seed: number): FinalMatch[] {
  const r = rng(seed);
  const out: FinalMatch[] = [];
  for (let i = 0; i < nMatches; i++) {
    const h = Math.floor(r() * nTeams); let a = Math.floor(r() * nTeams); if (a === h) a = (a + 1) % nTeams;
    const lh = 1.4 * Math.exp(skill(h) - skill(a)) , la = 1.1 * Math.exp(skill(a) - skill(h));
    out.push({ id: `m${i}`, start_time: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString(), home_team_id: `t${h}`, away_team_id: `t${a}`, home_score: poisson(r, lh), away_score: poisson(r, lh * 0 + la), neutral_site: 0 });
  }
  return out;
}

test('Elo: el equipo más fuerte termina con mejor rating', () => {
  const finals = league(10, 1500, (i) => (i - 5) * 0.12, 7);
  const st = computeElo(finals, defaultEloParams('football'));
  assert.ok(st.ratings.get('t9')!.rating > st.ratings.get('t0')!.rating + 100);
});

test('eloExpected es simétrico y suma 1 sin ventaja de local', () => {
  assert.ok(Math.abs(eloExpected(1600, 1500, 0) + eloExpected(1500, 1600, 0) - 1) < 1e-12);
});

test('backtest Poisson: con fuerzas reales distintas gana a la línea base', () => {
  const r = backtest(league(12, 2500, (i) => (i - 6) * 0.15, 11), 'poisson', defaultPoissonParams);
  assert.ok(r.evaluated > 1500);
  assert.ok(r.skill! > 0.005, `skill ${r.skill}`);
  assert.equal(r.paired!.significant && r.paired!.meanDiff < 0, true);
});

test('backtest Poisson: si todos los equipos son iguales NO debe presumir de mejora', () => {
  const r = backtest(league(12, 2500, () => 0, 13), 'poisson', defaultPoissonParams);
  assert.ok(r.skill! < 0.005, `skill ${r.skill}`);
  assert.doesNotMatch(r.verdict, /supera a la línea base \(/);
});

test('backtest Elo: sin diferencias reales no hay evidencia de mejora; con ellas sí', () => {
  const flat = backtest(league(12, 2500, () => 0, 21), 'elo', { k: 20, hfa: 65, margin: false });
  assert.notEqual(flat.paired?.significant && flat.paired.meanDiff < 0, true);
  const real = backtest(league(12, 2500, (i) => (i - 6) * 0.2, 22), 'elo', { k: 20, hfa: 65, margin: false });
  assert.equal(real.paired!.significant && real.paired!.meanDiff < 0, true);
});

test('backtest advierte cuando la muestra es pequeña', () => {
  const r = backtest(league(6, 25, () => 0, 5), 'elo', defaultEloParams('football'));
  assert.match(r.verdict, /Muestra insuficiente/);
  assert.equal(r.metrics, null);
});
