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
