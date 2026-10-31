import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayments, paymentsByWeek, paymentTotal, paidOn } from '../lib/payments.mjs';

const rows = [
  { id: 2, week: 4, who: 'Joseph McKeon', amount: '10.00', recorded_at: '2026-10-31T06:02:09Z', note: 'Joey' },
  { id: 1, week: 4, who: 'Brad Holm', amount: '10.00', recorded_at: '2026-10-03T17:00:00Z', note: 'Brad for Heller' },
  { id: 3, week: 0, who: 'Brad Holm', amount: '10', recorded_at: '' },
  { id: 4, week: 5, who: '', amount: '10', recorded_at: '' },
  { id: 5, week: 5, who: 'Brad Holm', amount: '0', recorded_at: '' },
];

test('payments are cleaned, typed and ordered oldest first', () => {
  const p = normalizePayments(rows);
  assert.deepEqual(p.map((x) => x.id), [1, 2]);
  assert.equal(p[0].amount, 10);
  assert.equal(typeof p[0].week, 'number');
});

test('payments group by week and total', () => {
  const by = paymentsByWeek(normalizePayments(rows));
  assert.deepEqual(Object.keys(by), ['4']);
  assert.equal(paymentTotal(by[4]), 20);
  assert.equal(paymentTotal(null), 0);
});

test('a noon Oct 3 payment shows as Oct 3', () => {
  assert.equal(paidOn('2026-10-03T17:00:00Z'), 'Oct 3');
  assert.equal(paidOn('garbage'), '');
});
