import test from 'node:test';
import assert from 'node:assert/strict';
import { payerFor } from '../lib/league-store.mjs';

test('the payer is whoever is last on ESPN, even over a recorded payer', () => {
  assert.equal(payerFor({ who: 'Brad Holm' }, 'Joseph McKeon'), 'Brad Holm');
  assert.equal(payerFor({ who: 'Brad Holm' }, ''), 'Brad Holm');
});

test('Heller is never named from ESPN: the recorded payer is used', () => {
  assert.equal(payerFor({ who: 'Kyle Heller' }, 'Joseph McKeon'), 'Joseph McKeon');
  assert.equal(payerFor({ who: 'Heller' }, ''), '');
});

test('with no ESPN last place the recorded payer stands', () => {
  assert.equal(payerFor(null, 'DJ Dangerous'), 'DJ Dangerous');
  assert.equal(payerFor({ who: '' }, ''), '');
});
