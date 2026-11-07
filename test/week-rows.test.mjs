import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { weekToRows, rowsToWeek, comparableWeek } from '../lib/week-rows.mjs';

const file = JSON.parse(readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8'));

test('every week in data/bets.json survives week -> rows -> week unchanged', () => {
  assert.ok(file.weeks.length >= 6);
  for (const week of file.weeks) {
    const { ticket, legs } = weekToRows(2026, week);
    // What PostgREST hands back is JSON, so round-trip the rows through JSON too.
    const back = rowsToWeek(JSON.parse(JSON.stringify(ticket)), JSON.parse(JSON.stringify(legs)).reverse());
    assert.deepEqual(comparableWeek(back), comparableWeek(week), `week ${week.week}`);
    assert.equal(back.source, 'db');
  }
});

test('leg order, results, groups, payers and unknown keys are kept', () => {
  const week = {
    week: 9, stake: 10, payer: 'Joe Mckeon + Kyle Heller', payers: ['Joe Mckeon', 'Kyle Heller'], results: 'live',
    ticket: { state: 'placed', evidence: 'DK slip' }, groups: { 'sgp-det-min': { odds: 260, label: '2 pick SGP' } },
    overrides: { 'w9-brad': 'won' }, boost: '+10%', contributions: [],
    legs: [
      { id: 'w9-brad', who: 'Brad Holm', label: 'DET ML', type: 'ml', team: 'DET', game: ['DET', 'MIN'], group: 'sgp-det-min', result: 'win' },
      { id: 'w9-sachs', who: 'John Sachs', label: 'Over 47.5', type: 'total', side: 'over', line: 47.5, game: ['DET', 'MIN'], group: 'sgp-det-min', result: 'unknown', kickoff: '2026-11-08T18:00Z' },
      { id: 'w9-sack', who: 'Kevin Sack', label: 'TBD', type: 'tbd', game: [] },
    ],
  };
  const { ticket, legs } = weekToRows(2026, week);
  assert.deepEqual(legs.map((l) => [l.leg_id, l.pos, l.status]), [['w9-brad', 0, 'won'], ['w9-sachs', 1, 'unknown'], ['w9-sack', 2, 'open']]);
  assert.deepEqual(ticket.extra, { boost: '+10%', contributions: [] });
  assert.deepEqual(legs[1].extra, { kickoff: '2026-11-08T18:00Z' });
  assert.deepEqual(comparableWeek(rowsToWeek(ticket, legs)), comparableWeek(week));
});

test('a week with no ticket record stays without one (the page derives it)', () => {
  const { ticket, legs } = weekToRows(2026, { week: 7, stake: 10, legs: [] });
  assert.equal(ticket.state, null);
  assert.equal(rowsToWeek(ticket, legs).ticket, undefined);
});

test('money and lines read back as numbers when the database sends them as strings ("10.00")', () => {
  const { ticket, legs } = weekToRows(2026, { week: 2, stake: 10, toPay: 4349, legs: [{ id: 'a', who: 'Brad Holm', label: 'x', type: 'spread', line: -3.5, odds: -110, game: ['A', 'B'] }] });
  const asDb = Object.assign({}, ticket, { stake: '10.00', to_pay: '4349.00' });
  const legDb = Object.assign({}, legs[0], { line: '-3.5', odds: '-110' });
  const w = rowsToWeek(asDb, [legDb]);
  assert.equal(w.stake, 10);
  assert.equal(w.toPay, 4349);
  assert.equal(w.legs[0].line, -3.5);
  assert.equal(w.legs[0].odds, -110);
});

import { siteWeeks, backfillSql } from '../scripts/backfill-weeks.mjs';

test('the backfill copies what the site shows: the file wins, Supabase adds only weeks the file lacks', () => {
  const weeks = siteWeeks(
    { weeks: [{ week: 7, stake: 10, legs: [{ id: 'l1', who: 'Brad Holm', label: 'file', type: 'ml', game: [] }] }] },
    [{ week: 7, data: { legs: [{ id: 'l1', who: 'Brad Holm', label: 'supabase', type: 'ml', game: [] }] } }, { week: 9, data: { stake: 10, legs: [] } }, { week: 0, data: { roster: [] } }],
  );
  assert.deepEqual(weeks.map((w) => w.week), [7, 9]);
  assert.equal(weeks[0].legs[0].label, 'file');
  const sql = backfillSql(weeks);
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;$/);
  assert.match(sql, /week in \(7, 9\)/);
  assert.ok(!sql.includes('"supabase"'));
});
