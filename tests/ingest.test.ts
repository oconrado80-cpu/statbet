import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ESPN_MIN_GAP_MS = '0';
process.env.LEAGUES = 'eng.1,nba';

import { openDb } from '../server/db.ts';
import { activeLeagues } from '../server/espn/config.ts';
import { Ingestor } from '../server/ingest/ingest.ts';
import { nbaSummary, soccerScoreboard, soccerSummary, standingsJson } from './fixtures/espn.ts';

function fakeFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    for (const [frag, body] of Object.entries(routes)) {
      if (String(url).includes(frag)) return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  return calls;
}

test('ingesta completa: scoreboard → boxscore → standings, idempotente', async () => {
  const db = openDb(':memory:');
  const calls = fakeFetch({
    '/soccer/eng.1/scoreboard': soccerScoreboard,
    '/soccer/eng.1/summary': soccerSummary,
    '/soccer/eng.1/standings': standingsJson,
    '/basketball/nba/scoreboard': { events: [] },
  });
  const ing = new Ingestor(db, activeLeagues());
  const league = activeLeagues().find((l) => l.id === 'eng.1')!;

  await ing.syncRange(league, new Date('2026-10-17'), new Date('2026-10-26'));
  assert.equal((db.prepare('SELECT COUNT(*) n FROM matches').get() as any).n, 2);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM teams').get() as any).n, 3);

  const done = await ing.detailBacklog();
  assert.equal(done, 1, 'solo el partido terminado tiene boxscore pendiente');
  const m = db.prepare("SELECT detail_final, detail_attempts FROM matches WHERE espn_id = '1001'").get() as any;
  assert.equal(m.detail_final, 1);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM team_match_stats').get() as any).n, 8);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM appearances').get() as any).n, 2);
  assert.equal((db.prepare("SELECT value FROM player_match_stats WHERE player_id='football:501' AND key='totalGoals'").get() as any).value, 2);
  // Los eventos del boxscore reemplazan a los del scoreboard
  assert.equal((db.prepare('SELECT COUNT(*) n FROM match_events').get() as any).n, 2);

  // Segunda pasada: no vuelve a pedir lo que ya está completo
  const before = calls.length;
  assert.equal(await ing.detailBacklog(), 0);
  assert.equal(calls.length, before);

  // Idempotencia: repetir el scoreboard no duplica nada
  await ing.syncRange(league, new Date('2026-10-17'), new Date('2026-10-26'));
  assert.equal((db.prepare('SELECT COUNT(*) n FROM matches').get() as any).n, 2);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM odds_snapshots').get() as any).n, 1, 'cuota sin cambios no se duplica');

  await ing.syncStandings(league);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM standings').get() as any).n, 2);

  // Re-procesar desde los JSON guardados reconstruye lo mismo
  await ing.reparse();
  assert.equal((db.prepare('SELECT COUNT(*) n FROM matches').get() as any).n, 2);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM player_match_stats').get() as any).n, 6);
});

test('si ESPN falla, no se rompe nada y queda en el log', async () => {
  const db = openDb(':memory:');
  fakeFetch({});
  const ing = new Ingestor(db, activeLeagues());
  const league = activeLeagues().find((l) => l.id === 'nba')!;
  const n = await ing.syncRange(league, new Date('2026-10-17'), new Date('2026-10-17'));
  assert.equal(n, 0);
  const log = db.prepare('SELECT ok, error FROM ingest_log').all() as any[];
  assert.equal(log.length, 1);
  assert.equal(log[0].ok, 0);
  assert.match(log[0].error, /404/);
});
