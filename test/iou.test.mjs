import test from 'node:test';
import assert from 'node:assert/strict';
import { iouLedger, settleWeek, splitPayers } from '../lib/iou.mjs';

test('a shared payer line splits into canonical names', () => {
  assert.deepEqual(splitPayers('Joseph McKeon + Kyle Heller'), ['Joe Mckeon', 'Kyle Heller']);
  assert.deepEqual(splitPayers('Brad Holm'), ['Brad Holm']);
  assert.deepEqual(splitPayers(''), []);
});

test('Week 4: Joey pays his half, Brad covers Heller', () => {
  const w = settleWeek(4, 20, ['Joseph McKeon', 'Kyle Heller'], [
    { id: 1, who: 'Brad Holm', amount: 10 },
    { id: 2, who: 'Joseph McKeon', amount: 10 },
  ]);
  assert.deepEqual(w.shares.map((s) => [s.who, s.share, s.paid, s.open]), [['Joseph McKeon', 10, 10, 0], ['Kyle Heller', 10, 0, 0]]);
  assert.deepEqual(w.shares[1].covered, [{ who: 'Brad Holm', amount: 10 }]);
  assert.deepEqual(w.extra, []);
});

test('a tie for last splits $10 into $5 shares', () => {
  const w = settleWeek(9, 10, ['Brad Holm', 'Chas Rossman'], [{ id: 1, who: 'Chas Rossman', amount: 5 }]);
  assert.deepEqual(w.shares.map((s) => [s.share, s.paid, s.open]), [[5, 0, 5], [5, 5, 0]]);
});

test('money past every share is extra, never lost', () => {
  const w = settleWeek(5, 10, ['Brad Holm'], [{ id: 1, who: 'Brad Holm', amount: 15 }]);
  assert.equal(w.shares[0].open, 0);
  assert.deepEqual(w.extra, [{ who: 'Brad Holm', amount: 5 }]);
});

test('the ledger totals by person, most open first', () => {
  const L = iouLedger([
    { week: 4, stake: 20, payers: ['Joseph McKeon', 'Kyle Heller'] },
    { week: 5, stake: 10, payers: ['Brad Holm'] },
    { week: 3, stake: 0, payers: ['Joseph McKeon'] },
  ], [
    { id: 1, week: 4, who: 'Brad Holm', amount: 10 },
    { id: 2, week: 4, who: 'Joseph McKeon', amount: 10 },
  ]);
  assert.deepEqual(L.weeks.map((w) => w.week), [4, 5]);
  assert.deepEqual(L.totals, { owed: 30, recorded: 20, open: 10 });
  const brad = L.people.find((p) => p.who === 'Brad Holm');
  assert.deepEqual([brad.owed, brad.open, brad.coveredForOthers], [10, 10, 10]);
  assert.equal(L.people[0].who, 'Brad Holm');
  assert.equal(L.people.find((p) => p.who === 'Kyle Heller').coveredByOthers, 10);
});
