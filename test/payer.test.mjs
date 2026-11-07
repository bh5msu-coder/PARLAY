import test from 'node:test';
import assert from 'node:assert/strict';
import { payerFor, pickPayerRow, payerShare } from '../lib/league-store.mjs';

test('the payer is whoever is last on ESPN, even over a recorded payer', () => {
  assert.equal(payerFor({ who: 'Brad Holm' }, 'Joseph McKeon'), 'Brad Holm');
  assert.equal(payerFor({ who: 'Brad Holm' }, ''), 'Brad Holm');
});

test('with no ESPN last place the recorded payer stands', () => {
  assert.equal(payerFor(null, 'DJ Dangerous'), 'DJ Dangerous');
  assert.equal(payerFor({ who: '' }, ''), '');
});

test('when Heller is last the next lowest scorer pays', () => {
  const rows = [{ who: 'Kyle Heller', points: 61.2 }, { who: 'Ryan Hoffman', points: 70.4 }, { who: 'Brad Holm', points: 99 }];
  const { last, skipped } = pickPayerRow(rows, 17);
  assert.equal(last.who, 'Ryan Hoffman');
  assert.equal(skipped.who, 'Kyle Heller');
});

test('with Heller not last, the lowest scorer pays and nobody is skipped', () => {
  const rows = [{ who: 'Brad Holm', points: 60 }, { who: 'Kyle Heller', points: 61 }];
  const { last, skipped } = pickPayerRow(rows, 17);
  assert.equal(last.who, 'Brad Holm');
  assert.equal(skipped, null);
});

test('unscored rows are ignored', () => {
  assert.equal(pickPayerRow([{ who: 'Brad Holm', points: null }], 17).last, null);
});

test('Heller still counts as last for tickets before Week 5 (he left the bet Oct 3)', () => {
  const rows = [{ who: 'Kyle Heller', points: 61.2 }, { who: 'Ryan Hoffman', points: 70.4 }];
  assert.equal(pickPayerRow(rows, 4).last.who, 'Kyle Heller');
  assert.equal(pickPayerRow(rows, 5).last.who, 'Ryan Hoffman');
});

test('managers tied for last (to the cent) are all listed and split the stake', () => {
  const rows = [{ who: 'Brad Holm', points: 60.1 }, { who: 'Ryan Hoffman', points: 60.1 }, { who: 'Kevin Sack', points: 71 }];
  const { last, tied } = pickPayerRow(rows, 17);
  assert.equal(last.who, 'Brad Holm');
  assert.deepEqual(tied.map((r) => r.who), ['Brad Holm', 'Ryan Hoffman']);
  assert.equal(payerShare(10, tied.length), 5);
});

test('no tie means one payer who owes the whole stake', () => {
  const { tied } = pickPayerRow([{ who: 'Brad Holm', points: 60 }, { who: 'Kevin Sack', points: 61 }], 17);
  assert.equal(tied.length, 1);
  assert.equal(payerShare(10, 1), 10);
});

test('Heller is not counted in a tie after he left, and a rollover stake splits evenly', () => {
  const rows = [{ who: 'Kyle Heller', points: 50 }, { who: 'Brad Holm', points: 60 }, { who: 'Kevin Sack', points: 60 }];
  assert.deepEqual(pickPayerRow(rows, 17).tied.map((r) => r.who), ['Brad Holm', 'Kevin Sack']);
  assert.equal(payerShare(20, 2), 10);
});

// Standings, the Week page and the Money page name payers the same way.
import { recordedPayers } from '../lib/iou.mjs';
import { computeStandings, computeBettingStyles } from '../lib/standings.mjs';
import { createLeagueStore } from '../lib/league-store.mjs';

const W4 = { week: 4, stake: 20, payer: 'Joe Mckeon + Kyle Heller', payers: ['Joe Mckeon', 'Kyle Heller'], legs: [] };
const W5 = { week: 5, stake: 10, payer: 'Brad Holm', legs: [] };

test('recorded payers: the payers list, else the payer text split into names', () => {
  assert.deepEqual(recordedPayers(W4), ['Joe Mckeon', 'Kyle Heller']);
  assert.deepEqual(recordedPayers({ payer: 'Joseph McKeon + Kyle Heller' }), ['Joe Mckeon', 'Kyle Heller']);
  assert.deepEqual(recordedPayers(W5), ['Brad Holm']);
  assert.deepEqual(recordedPayers({ payer: '' }), []);
});

test('Standings credits each payer of a split stake with their share, and no "A + B" manager appears', () => {
  const noList = Object.assign({}, W4, { payers: undefined });
  for (const w4 of [W4, noList]) {
    const rows = computeStandings([w4, W5], {}, {});
    const paid = Object.fromEntries(rows.map((r) => [r.who, r.paid]));
    assert.equal(paid['Joe Mckeon'], 10, 'half of the $20 Week 4 stake');
    assert.equal(paid['Brad Holm'], 10);
    assert.ok(!rows.some((r) => r.who.includes('+')));
  }
  const styles = computeBettingStyles([W4, W5], {});
  assert.ok(![...styles.keys()].some((k) => k.includes('+')), 'no phantom manager in betting styles');
  assert.equal(styles.get('Joe Mckeon').paidWeeks, 1);
});

test('Standings uses the page\'s payer rule when given it (ESPN last place for the current week)', () => {
  const w9 = { week: 9, stake: 10, payer: '', legs: [] };
  const rows = computeStandings([w9], {}, {}, (w) => (w.week === 9 ? ['DJ Dangerous'] : []));
  assert.equal(rows.find((r) => r.who === 'DJ Dangerous').paid, 10);
  assert.equal(computeStandings([w9], {}, {}).find((r) => r.who === 'DJ Dangerous').paid, 0, 'nothing recorded, no ESPN: nobody credited');
});

test('with no ESPN last place, the store splits a recorded "A + B" payer instead of naming "A + B"', () => {
  const store = createLeagueStore({ fetch: async () => ({ ok: true, json: async () => ({}) }) });
  assert.deepEqual(store.weekPayers({ week: 4, payer: 'Joseph McKeon + Kyle Heller' }), ['Joe Mckeon', 'Kyle Heller']);
  assert.deepEqual(store.weekPayers(W4), ['Joe Mckeon', 'Kyle Heller']);
  store.state.lastPlace = { week: 8, who: 'DJ Dangerous', tied: ['DJ Dangerous'] };
  assert.deepEqual(store.weekPayers({ week: 9, payer: 'Brad Holm' }), ['DJ Dangerous'], 'ESPN last place still names the current week\'s payer (league rule, 2026-10-31)');
});
