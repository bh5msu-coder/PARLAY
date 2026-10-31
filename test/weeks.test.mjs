import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { diffWeek, gradeStoredWeek, normalizeFile, summarizeParlay, tallyState } from '../lib/weeks.mjs';

const file = JSON.parse(fs.readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8'));
const weeks = normalizeFile(file).weeks;
const byWeek = Object.fromEntries(weeks.map((w) => [w.week, w]));

test('bets file is the only place a new week is added', () => {
  assert.match(file.howToAddAWeek, /weeks/);
  assert.deepEqual(weeks.map((w) => w.week), [2, 4, 5, 6, 7, 8]);
  for (const w of weeks) assert.equal(w.legs.length, w.week <= 4 ? 12 : 11);
});

test('week 5 is the recorded 5-6 bust', () => {
  const graded = gradeStoredWeek(byWeek[5]);
  assert.ok(graded);
  const summary = summarizeParlay(graded.graded);
  assert.equal(summary.state, 'busted');
  assert.equal(summary.won, 5);
  assert.equal(summary.lost, 6);
  assert.equal(summary.pending, 0);
  assert.deepEqual(summary.killers, ['John Sachs', 'DJ Dangerous', 'Adam Meltser']);
  const byWho = Object.fromEntries(graded.graded.map((g) => [g.leg.label, g.state]));
  assert.equal(byWho['McBride O70 yds'], 'lost');
  assert.equal(byWho['Henry anytime TD'], 'won');
  assert.equal(byWho['Amon-Ra anytime TD'], 'lost');
  assert.equal(byWho['Steelers -3'], 'won');
  assert.equal(byWho['Seahawks -3'], 'lost');
  assert.equal(byWho['Saints ML'], 'lost');
  assert.equal(byWho['PIT/IND Over'], 'won');
  assert.equal(byWho['Pats -3.5'], 'won');
  assert.equal(byWho['McBride TD'], 'won');
  assert.equal(byWho['HOU/TEN Over'], 'lost');
  assert.equal(byWho['JT anytime TD'], 'lost');
});

test('unknown weeks never become wins or losses', () => {
  for (const n of [6, 7, 8]) {
    const graded = gradeStoredWeek(byWeek[n]);
    assert.ok(graded, 'week ' + n);
    const summary = summarizeParlay(graded.graded);
    assert.equal(summary.state, 'open', 'week ' + n);
    assert.equal(summary.won, 0);
    assert.equal(summary.lost, 0);
    assert.equal(summary.pending, 11);
    assert.equal(summary.killers.length, 0);
    for (const g of graded.graded) assert.equal(tallyState(g.state), 'open');
  }
  const current = gradeStoredWeek(byWeek[8]);
  const chas = current.graded.find((g) => g.leg.who === 'Chas Rossman');
  assert.equal(chas.leg.label, 'TBD');
  assert.equal(chas.detail, 'Pick not in yet');
  const tnf = current.graded.find((g) => g.leg.label === 'Over Thursday night game');
  assert.deepEqual(tnf.leg.game, ['CAR', 'GB']);
  assert.equal(tnf.leg.line, undefined);
});

test('hit rate ignores open legs', () => {
  const row = { legs: 0, hit: 0, miss: 0, push: 0, open: 0, streak: [] };
  for (const g of gradeStoredWeek(byWeek[5]).graded) {
    row.legs++;
    const bucket = tallyState(g.state);
    if (bucket === 'hit') row.hit++;
    else if (bucket === 'miss') row.miss++;
    else row.open++;
  }
  for (const g of gradeStoredWeek(byWeek[8]).graded) {
    row.legs++;
    assert.equal(tallyState(g.state), 'open');
    row.open++;
  }
  assert.equal(row.hit, 5);
  assert.equal(row.miss, 6);
  assert.equal(row.open, 11);
  assert.equal(row.hit / (row.hit + row.miss), 5 / 11);
});

test('stored week 7 matches the database ticket', () => {
  const remote = {
    legs: [
      { who: 'Ryan Hoffman', label: 'Broncos ML', type: 'ml', team: 'DEN', game: ['DEN', 'ARI'] },
      { who: 'Joe Mckeon', label: 'Under 39.5', type: 'total', line: 39.5, game: ['MIA', 'NYJ'] },
      { who: 'Kyle McFadden', label: 'Panthers ML', type: 'ml', team: 'CAR', game: ['TB', 'CAR'] },
      { who: 'Chas Rossman', label: 'J.J. McCarthy over 0.5 INT thrown', type: 'player', player: 'J.J. McCarthy', line: 0.5, game: ['NYG', 'HOU'] },
      { who: 'John Sachs', label: 'Bears ML', type: 'ml', team: 'CHI', game: ['NE', 'CHI'] },
      { who: 'Jace Clark', label: 'Over 50.5', type: 'total', line: 50.5, game: ['NE', 'CHI'] },
      { who: 'DJ Dangerous', label: 'A.J. Brown anytime TD', type: 'player', player: 'A.J. Brown', line: 0.5, game: ['NE', 'CHI'] },
      { who: 'Kevin Sack', label: 'Lions ML', type: 'ml', team: 'DET', game: ['GB', 'DET'] },
      { who: 'Nick Curtis', label: 'Jordan Love 282+ pass yds', type: 'player', player: 'Jordan Love', line: 281.5, game: ['GB', 'DET'] },
      { who: 'Brad Holm', label: 'Christian Watson 80+ rec yds', type: 'player', player: 'Christian Watson', line: 79.5, game: ['GB', 'DET'] },
      { who: 'Adam Meltser', label: 'Jahmyr Gibbs anytime TD', type: 'player', player: 'Jahmyr Gibbs', line: 0.5, game: ['GB', 'DET'] },
    ],
  };
  assert.equal(diffWeek(byWeek[7], remote), null, 'Joseph McKeon / Jarn Sachs are not drift vs Joe Mckeon / John Sachs');
  const drifted = { legs: remote.legs.slice() };
  drifted.legs[0] = Object.assign({}, drifted.legs[0], { label: 'Broncos -3' });
  assert.equal(diffWeek(byWeek[7], drifted).week, 7);
});

test('a live leg with no recorded result is not invented here', () => {
  assert.equal(gradeStoredWeek({
    week: 9,
    legs: [{ type: 'ml', team: 'BUF', label: 'Bills ML', game: ['BUF', 'LV'] }],
  }), null);
  const half = gradeStoredWeek({
    week: 9,
    legs: [{ type: 'spread', team: 'ATL', line: 0.5, period: '1H', label: 'Atlanta 1st half +0.5', game: ['CHI', 'ATL'] }],
  });
  assert.equal(half.graded[0].state, 'unknown');
});

test('season Elo does not read weekly legs', () => {
  const src = fs.readFileSync(new URL('../lib/elo.mjs', import.meta.url), 'utf8');
  const start = src.indexOf('export function calcSeasonElo');
  assert.ok(start > 0);
  const fn = src.slice(start);
  assert.match(fn, /const K = 8, START = 1500/);
  assert.match(fn, /K \* \(s - e\) \/ \(field\.length - 1\)/);
  assert.doesNotMatch(src, /weeks\.mjs|state\.weeks|leg\.result|gradeStoredWeek/);
});
