import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gradeLeg, gradeWeek } from '../lib/grade.mjs';
import { resolveNflWeek } from '../lib/nfl-clock.mjs';
import { computeStandings, parlayExtras } from '../lib/standings.mjs';
import { calcParlayStats } from '../lib/history-stats.mjs';
import { nextUnusedWeek, openPickWeek } from '../lib/pick-form.mjs';
import { normalizeFile } from '../lib/weeks.mjs';

const file = JSON.parse(fs.readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8'));
const weeks = normalizeFile(file).weeks;
const history = JSON.parse(fs.readFileSync(new URL('../parlay-history.json', import.meta.url), 'utf8'));

const game = (away, awayScore, home, homeScore, state) => ({
  state, completed: state === 'post', detail: 'Q4', date: '2026-10-25T17:00Z', id: '1',
  away: { abbr: away, score: awayScore }, home: { abbr: home, score: homeScore },
});

test('gradeLeg settles moneyline, spread and total legs from a final score', () => {
  const g = game('NE', 17, 'CHI', 24, 'post');
  assert.equal(gradeLeg({ type: 'ml', team: 'CHI' }, { game: g }).state, 'won');
  assert.equal(gradeLeg({ type: 'spread', team: 'CHI', line: -7 }, { game: g }).state, 'push');
  assert.equal(gradeLeg({ type: 'total', side: 'over', line: 40.5 }, { game: g }).state, 'won');
  assert.equal(gradeLeg({ type: 'total', side: 'under', line: 40.5 }, { game: game('NE', 21, 'CHI', 24, 'in') }).state, 'lost');
});

test('gradeLeg never invents a result for unknown, TBD or first-half legs', () => {
  assert.equal(gradeLeg({ type: 'tbd' }, { game: null }).state, 'unknown');
  assert.equal(gradeLeg({ type: 'ml', team: 'CHI', result: 'unknown' }, { game: game('NE', 0, 'CHI', 30, 'post') }).state, 'unknown');
  assert.equal(gradeLeg({ type: 'spread', team: 'ATL', line: 0.5, period: '1H' }, { game: game('CHI', 0, 'ATL', 30, 'post') }).state, 'unknown');
  assert.equal(gradeLeg({ type: 'ml', team: 'CHI' }, { game: null }).state, 'pending');
});

test('gradeWeek uses recorded results without calling ESPN', async () => {
  const espn = { scoreboard: async () => { throw new Error('should not fetch'); }, summary: async () => { throw new Error('should not fetch'); } };
  const w5 = weeks.find((w) => w.week === 5);
  const r = await gradeWeek(w5, { espn });
  assert.equal(r.fromLock, true);
  assert.equal(r.summary.state, 'busted');
});

test('NFL clock rolls forward only when the current slate is final', () => {
  assert.equal(resolveNflWeek(8, { count: 14, allFinal: true }, { allFinal: true }), 9);
  assert.equal(resolveNflWeek(8, { count: 14, allFinal: false }, { allFinal: false }), 7);
  assert.equal(resolveNflWeek(18, null, { allFinal: true }), 18);
});

test('standings hit rate counts decided legs only', async () => {
  const graded = {};
  const espn = { scoreboard: async () => ({ events: [] }), summary: async () => null };
  for (const w of weeks) graded[w.week] = await gradeWeek(w, { espn });
  const rows = computeStandings(weeks, graded, file.config);
  const hit = rows.reduce((a, r) => a + r.hit, 0);
  const miss = rows.reduce((a, r) => a + r.miss, 0);
  // Weeks 2 and 4 to 7 are graded; Heller abstains from standings, so his two legs are left out.
  assert.equal(hit + miss, 55, 'weeks 2 and 4 to 7 are graded');
  assert.equal(hit, 23);
  assert.ok(rows.every((r) => r.open >= 0));
  const extras = parlayExtras(weeks, graded);
  assert.deepEqual(extras.killList.map(([who]) => who).sort(), ['Adam Meltser', 'Brad Holm', 'Chas Rossman', 'DJ Dangerous', 'Joe Mckeon', 'John Sachs', 'Kevin Sack', 'Kyle McFadden', 'Nick Curtis', 'Ryan Hoffman']);
});

test('Bets stats keep unknown legs out of the hit rate', () => {
  const S = calcParlayStats(history, (n) => n);
  const decidedWins = S.decided.filter((l) => l.result === 'win').length;
  assert.ok(S.decided.every((l) => l.result === 'win' || l.result === 'loss'));
  const open = S.legs.filter((l) => l.result === 'unknown' || l.result === 'pending').length;
  assert.equal(S.legs.length, S.decided.length + open);
  assert.equal(S.rows.reduce((a, r) => a + r.w, 0), decidedWins);
});

test('pick week and new-week helpers follow the NFL clock', () => {
  assert.equal(openPickWeek(weeks, { active: 9 }), 9);
  assert.equal(openPickWeek(weeks, null), 8);
  assert.equal(nextUnusedWeek(weeks, { active: 8 }), 9);
  assert.equal(nextUnusedWeek(weeks, { active: 10 }), 10);
});
