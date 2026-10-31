import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hitRateOverTime, metric, selectionStats, ticketTotals, typePerformance, weeklyLegs, weeklyTickets, METRIC_HELP } from '../lib/stats.mjs';
import { historyLegs, historyTickets } from '../lib/history.mjs';
import { gradeWeek } from '../lib/grade.mjs';
import { normalizeFile } from '../lib/weeks.mjs';

const weeks = normalizeFile(JSON.parse(fs.readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8'))).weeks;
const history = JSON.parse(fs.readFileSync(new URL('../parlay-history.json', import.meta.url), 'utf8'));
const espn = { scoreboard: async () => ({ events: [] }), summary: async () => null };

test('hit rate excludes open and unknown legs and flags small samples', () => {
  const m = metric(['won', 'lost', 'lost', 'open', 'unknown']);
  assert.deepEqual([m.won, m.lost, m.n, m.open, m.unknown, m.smallSample], [1, 2, 3, 1, 1, true]);
  assert.equal(m.rate, 1 / 3);
  assert.equal(metric(['won', 'won', 'lost', 'won', 'lost']).smallSample, false);
  assert.equal(metric([]).rate, null);
});

test('selection stats on the history match the Bets table (decided legs only)', () => {
  const rows = selectionStats(historyLegs(history));
  const jarn = rows.find((r) => r.who === 'John Sachs');
  assert.deepEqual([jarn.hit.won, jarn.hit.lost, jarn.streak.current, jarn.streak.best, jarn.primetime.prime.n], [4, 1, 'W2', 2, 3]);
  const kyle = rows.find((r) => r.who === 'Kyle McFadden');
  assert.equal(kyle.hit.unknown, 1, "Ja'Marr Chase stays unknown");
  assert.equal(kyle.hit.n, 4);
  assert.equal(kyle.hit.smallSample, true);
  for (const r of rows) assert.equal(r.hit.won + r.hit.lost, r.hit.n);
});

test('hit rate over time and by type use decided legs; Week 8 has only DJ\'s graded loss', () => {
  const pts = hitRateOverTime(historyLegs(history));
  const w8 = pts.find((p) => p.week === 8);
  assert.equal(w8.week_.n, 1);
  assert.equal(w8.week_.open, 10);
  assert.equal(pts.find((p) => p.week === 2).week_.n, 12);
  const types = typePerformance(historyLegs(history));
  assert.equal(types.reduce((a, t) => a + t.n, 0), 57);
});

test('weekly tickets separate stake listed, recorded money and hypothetical payout', async () => {
  const graded = {};
  for (const w of weeks) graded[w.week] = await gradeWeek(w, { espn });
  const tickets = weeklyTickets(weeks, graded);
  const t = ticketTotals(tickets);
  assert.equal(t.stakeListed, 70);
  assert.equal(t.contributions, 0);
  assert.equal(t.payouts, 0);
  assert.equal(t.hypothetical, 2294.04 + 4349 + 7093 + 7967.8);
  const w7 = tickets.find((x) => x.week === 7);
  assert.deepEqual([w7.ticketState, w7.result, w7.payoutRecorded], ['placed', 'unknown', null]);
  assert.equal(tickets.find((x) => x.week === 5).result, 'busted');
  const legs = weeklyLegs(weeks, graded);
  assert.equal(legs.filter((l) => l.status === 'won' || l.status === 'lost').length, 34);
});

test('history tickets claim placement only where the history cites a slip', () => {
  const byWeek = Object.fromEntries(historyTickets(history).map((t) => [t.week, t]));
  assert.equal(byWeek[2].ticketState, 'settled');
  assert.equal(byWeek[5].ticketState, 'unknown');
  assert.equal(byWeek[8].ticketState, 'settled', 'week 8 cites the DraftKings receipt and has busted');
  assert.equal(byWeek[2].hypotheticalToPay, 4349);
  assert.equal(byWeek[2].contributions, null, 'history does not track who paid');
});

test('every metric has a plain-language explanation', () => {
  for (const k of ['hitRate', 'streak', 'byType', 'primetime', 'busts', 'smallSample', 'stake', 'contributions', 'hypothetical', 'payout', 'ticketState']) {
    assert.ok(METRIC_HELP[k] && METRIC_HELP[k].length > 20, k);
  }
  assert.match(METRIC_HELP.hypothetical, /no book paid/i);
});

test('season glance: one row per week, Week 3 shown as never placed, totals match the history', async () => {
  const { seasonGlance } = await import('../lib/history-stats.mjs');
  const g = seasonGlance(history);
  assert.deepEqual(g.weeks.map((w) => w.week), [2, 3, 4, 5, 6, 7, 8]);
  const w3 = g.weeks.find((w) => w.week === 3);
  assert.equal(w3.notPlaced, true);
  assert.equal(w3.win + w3.loss + w3.unknown + w3.pending, 0);
  const w4 = g.weeks.find((w) => w.week === 4);
  assert.deepEqual([w4.win, w4.loss, w4.unknown], [8, 3, 1]);
  const w8 = g.weeks.find((w) => w.week === 8);
  assert.deepEqual([w8.loss, w8.pending], [1, 10]);
  assert.deepEqual(g.tickets, { settled: 6, cashed: 0, staked: 70 });
  const legs = g.weeks.reduce((s, w) => s + w.win + w.loss, 0);
  assert.equal(legs, 57);
});
