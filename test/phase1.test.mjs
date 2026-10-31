import test from 'node:test';
import assert from 'node:assert/strict';
import { rankLabels } from '../lib/standings.mjs';

const row = (hit, miss, busts) => ({ hit, miss, busts });

test('managers level on hit rate, busts and hits share a tied rank', () => {
  const rows = [row(1, 0, 0), row(1, 0, 0), row(1, 0, 0), row(1, 1, 1), row(0, 1, 1)];
  assert.deepEqual(rankLabels(rows), ['T-1', 'T-1', 'T-1', '4', '5']);
});

test('no ties gives plain ranks', () => {
  assert.deepEqual(rankLabels([row(3, 1, 0), row(2, 2, 1), row(0, 4, 2)]), ['1', '2', '3']);
});

test('managers with no decided legs tie at the bottom', () => {
  assert.deepEqual(rankLabels([row(1, 0, 0), row(0, 0, 0), row(0, 0, 0)]), ['1', 'T-2', 'T-2']);
});
