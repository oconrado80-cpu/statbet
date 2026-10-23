import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES } from '../server/espn/config.ts';
import { num, parseScoreboard, parseStandings, parseSummary } from '../server/espn/parse.ts';
import { nbaSummary, soccerScoreboard, soccerSummary, standingsJson, tennisScoreboard } from './fixtures/espn.ts';

const L = (id: string) => LEAGUES.find((l) => l.id === id)!;

test('num() entiende números sucios y rechaza lo que no lo es', () => {
  assert.equal(num('58.3%'), 58.3);
  assert.equal(num('1,250'), 1250);
  assert.equal(num('+7'), 7);
  assert.equal(num('--'), null);
  assert.equal(num('10-18'), null);
  assert.equal(num(''), null);
  assert.equal(num(undefined), null);
});

test('scoreboard de fútbol: partido terminado, programado y evento roto', () => {
  const { matches, skipped } = parseScoreboard(L('eng.1'), soccerScoreboard);
  assert.equal(matches.length, 2);
  assert.equal(skipped, 1);
  const [fin, sched] = matches;
  assert.equal(fin.status, 'final');
  assert.equal(fin.homeScore, 2);
  assert.equal(fin.awayScore, 1);
  assert.equal(fin.winner, 'home');
  assert.equal(fin.home.id, 'football:11');
  assert.equal(fin.attendance, 52000);
  assert.equal(fin.events.length, 4);
  assert.equal(fin.events.filter((e) => e.scoring).length, 3);
  assert.equal(fin.events[1].type, 'Yellow Card');
  assert.equal(fin.events[3].type, 'Penalty - Scored');
  // Un partido programado NO tiene marcador (ESPN manda "0", que no es un resultado)
  assert.equal(sched.status, 'scheduled');
  assert.equal(sched.homeScore, null);
  assert.equal(sched.winner, null);
  assert.equal(sched.odds?.homeMl, -120);
  assert.equal(sched.odds?.drawMl, 240);
  assert.equal(sched.odds?.total, 2.5);
});

test('summary de fútbol: stats de equipo, jugadores que jugaron y eventos', () => {
  const s = parseSummary(L('eng.1'), soccerSummary);
  assert.equal(s.teamStats.length, 2);
  const poss = s.teamStats[0].stats.find((x) => x.key === 'possessionPct');
  assert.equal(poss?.value, 58.3);
  // El suplente que nunca entró no cuenta como aparición
  assert.deepEqual(s.appearances.map((a) => a.playerId).sort(), ['football:501', 'football:602']);
  const goals = s.playerStats.find((p) => p.playerId === 'football:501')!.stats.find((x) => x.key === 'totalGoals');
  assert.equal(goals?.value, 2);
  assert.equal(s.events.length, 2);
  assert.equal(s.events[0].playerId, 'football:501');
  assert.equal(s.attendance, 52000);
  assert.deepEqual(s.lineups, [{ teamId: 'football:11', formation: '4-3-3' }]);
  assert.equal(s.appearances.find((a) => a.playerId === 'football:501')?.formationPlace, 9);
  assert.equal(s.injuries.length, 1);
  assert.equal(s.injuries[0].name, 'Lesionado Uno');
  assert.equal(s.injuries[0].detail, 'Rodilla');
});

test('summary de NBA: separa "42-88" en hechos/intentos y salta a quien no jugó', () => {
  const s = parseSummary(L('nba'), nbaSummary);
  const teamKeys = s.teamStats[0].stats.map((x) => x.key);
  assert.ok(teamKeys.includes('fieldGoalsMade') && teamKeys.includes('fieldGoalsAttempted'));
  assert.equal(s.teamStats[0].stats.find((x) => x.key === 'fieldGoalsAttempted')?.value, 88);
  assert.equal(s.appearances.length, 1);
  const p = s.playerStats[0].stats;
  assert.equal(p.find((x) => x.key === 'points')?.value, 30);
  assert.equal(p.find((x) => x.key === 'fieldGoalsMade')?.value, 11);
  assert.equal(p.find((x) => x.key === 'plusMinus')?.value, 7);
  assert.equal(s.events[0].scoring, true);
  assert.equal(s.odds?.spread, -3.5);
});

test('tenis: sets ganados salen de los juegos por set', () => {
  const { matches } = parseScoreboard(L('atp'), tennisScoreboard);
  assert.equal(matches.length, 1);
  const m = matches[0];
  assert.equal(m.homeScore, 2);
  assert.equal(m.awayScore, 1);
  assert.deepEqual(m.homeLine, [6, 3, 7]);
  assert.equal(m.winner, 'home');
  assert.equal(m.home.kind, 'individual');
});

test('standings: grupos, rank y estadísticas', () => {
  const st = parseStandings(L('eng.1'), standingsJson);
  assert.equal(st.season, 2026);
  assert.equal(st.rows.length, 2);
  assert.equal(st.rows[0].stats.points, 25);
  assert.equal(st.rows[0].rank, 1);
});

test('respuestas vacías o basura no revientan', () => {
  assert.deepEqual(parseScoreboard(L('nba'), {}).matches, []);
  assert.deepEqual(parseScoreboard(L('nba'), null).matches, []);
  assert.equal(parseSummary(L('nba'), null).teamStats.length, 0);
  assert.equal(parseStandings(L('nba'), {}).rows.length, 0);
});
