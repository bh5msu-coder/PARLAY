import test from 'node:test';
import assert from 'node:assert/strict';
import { payerFor, pickPayerRow } from '../lib/league-store.mjs';

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
