import test from 'node:test';
import assert from 'node:assert/strict';
import { lineMove, movedPicks } from '../lib/line-move.mjs';
import { pickChanges, changesFromCurrent } from '../lib/pick-changes.mjs';
import { sweatChips, sweatOn } from '../lib/sweat.mjs';
import { ident, whoLabel } from '../lib/ident.mjs';
import { iouLedger } from '../lib/iou.mjs';

const games = [{ away: 'BUF', home: 'MIN', lines: { book: 'DraftKings', spread: { away: { line: -3, odds: -110 }, home: { line: 3, odds: -110 } }, total: { over: { line: 47.5, odds: -110 }, under: { line: 47.5, odds: -110 } }, ml: { away: { odds: -160 }, home: { odds: 135 } } } }];

test('line move: spread moved, ml price moved, prop unchecked, unchanged', () => {
  const m = lineMove({ type: 'spread', team: 'BUF', game: ['BUF', 'MIN'], line: -3.5, odds: -102 }, games);
  assert.equal(m.status, 'moved'); assert.match(m.text, /saved -3.5, now -3/);
  assert.equal(lineMove({ type: 'ml', team: 'BUF', game: ['BUF', 'MIN'], odds: -130 }, games).status, 'moved');
  assert.equal(lineMove({ type: 'ml', team: 'BUF', game: ['BUF', 'MIN'], odds: -155 }, games).status, 'same');
  assert.equal(lineMove({ type: 'total', side: 'over', game: ['BUF', 'MIN'], line: 47.5, odds: -110 }, games).status, 'same');
  assert.equal(lineMove({ type: 'player', game: ['BUF', 'MIN'] }, games).status, 'unchecked');
  assert.equal(lineMove({ type: 'spread', team: 'NYJ', game: ['NYJ', 'KC'], line: 10.5 }, games).status, 'unchecked');
  assert.equal(movedPicks([{ who: 'Brad Holm', leg: { type: 'spread', team: 'BUF', game: ['BUF', 'MIN'], line: -3.5 } }], games).length, 1);
});

test('pick changes: saves, edits, repeat saves collapse, clears', () => {
  const rows = [
    { who: 'Nick Curtis', op: 'insert', saved_at: '2026-11-04T10:00:00Z', leg: { type: 'player', label: 'Gibbs anytime TD' }, source: 'web' },
    { who: 'Nick Curtis', op: 'update', saved_at: '2026-11-04T11:00:00Z', leg: { type: 'player', label: 'Gibbs anytime TD' }, source: 'web' },
    { who: 'Nick Curtis', op: 'update', saved_at: '2026-11-05T11:00:00Z', leg: { type: 'ml', label: 'DET ML' }, source: 'web' },
    { who: 'Jace Clark', op: 'insert', saved_at: '2026-11-04T09:00:00Z', leg: { type: 'total', label: 'Over 52.5' }, source: 'web' },
  ];
  const out = pickChanges(rows);
  assert.equal(out[0].who, 'Nick Curtis'); assert.equal(out[0].changes, 1);
  assert.deepEqual(out[0].events.map((e) => e.kind), ['saved', 'changed']);
  assert.equal(out[0].events[1].from, 'Gibbs anytime TD');
  assert.equal(changesFromCurrent([{ who: 'A', leg: { label: 'x' }, updated_at: '2026-11-01' }])[0].events[0].kind, 'saved');
});

test('sweat: off before kickoff, on once a leg is live, chips carry tone', () => {
  const pre = [{ leg: { who: 'A', label: 'x' }, state: 'pending' }];
  assert.equal(sweatOn(pre), false);
  const mid = [{ leg: { who: 'A', label: 'x' }, state: 'won' }, { leg: { who: 'B', label: 'y' }, state: 'live', current: 'leading' }, { leg: { who: 'C', label: 'z' }, state: 'pending' }];
  assert.equal(sweatOn(mid), true);
  const chips = sweatChips(mid);
  assert.equal(chips[0].tone, 'live'); assert.equal(chips[0].trend, 'up');
  assert.ok(chips.some((c) => c.tone === 'win'));
  assert.equal(sweatOn([{ leg: {}, state: 'won' }, { leg: {}, state: 'lost' }]), false);
});

test('nickname overrides win over lore and clear cleanly', () => {
  ident.setNicknames({ 'Brad Holm': 'The Closer' });
  assert.equal(whoLabel('Brad Holm'), 'The Closer');
  assert.equal(ident.nick('Brad Holm'), 'The Closer');
  ident.setNicknames({});
  assert.notEqual(whoLabel('Brad Holm'), 'The Closer');
});

test('season ledger: stakes, payments, open', () => {
  const led = iouLedger([{ week: 1, stake: 10, payers: ['Brad Holm'] }, { week: 2, stake: 10, payers: ['Kyle McFadden'] }], [{ week: 1, who: 'Brad Holm', amount: 10 }]);
  assert.equal(led.totals.owed, 20); assert.equal(led.totals.recorded, 10); assert.equal(led.totals.open, 10);
});
