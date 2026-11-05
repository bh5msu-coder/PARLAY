import assert from 'node:assert/strict';
import test from 'node:test';
import { trackerRows, trackerCounts, legTrend } from '../lib/leg-tracker.mjs';
import { missingPickers, nudgeText, nudgeHref } from '../lib/nudge.mjs';

const g = (who, state, current = '', detail = '') => ({ leg: { who, label: who + ' pick' }, state, current, detail });

test('tracker puts live legs first, then the leg that broke it, then open, then settled, keeping ticket order within a group', () => {
  const rows = trackerRows([g('A', 'won'), g('B', 'pending'), g('C', 'live', 'trailing'), g('D', 'lost'), g('E', 'live', 'covering'), g('F', 'push')], 'E');
  assert.deepEqual(rows.map((r) => r.who), ['C', 'E', 'D', 'B', 'A', 'F']);
  assert.equal(rows[1].mine, true);
  assert.equal(rows[0].trend, 'down');
  assert.equal(rows[1].trend, 'up');
});

test('trend only applies to live legs with a direction', () => {
  assert.equal(legTrend(g('A', 'live', 'leading')), 'up');
  assert.equal(legTrend(g('A', 'live', '41 pts')), '');
  assert.equal(legTrend(g('A', 'won', 'covering')), '');
});

test('tracker counts', () => {
  const c = trackerCounts(trackerRows([g('A', 'won'), g('B', 'pending'), g('C', 'live', 'trailing'), g('D', 'unknown')]));
  assert.deepEqual(c, { live: 1, won: 1, lost: 0, push: 0, open: 2, up: 0, down: 1 });
  assert.deepEqual(trackerRows(null), []);
});

test('missing pickers and the nudge message', () => {
  const roster = ['Brad Holm', 'Jarn X', 'Hoss Y'];
  const missing = missingPickers(roster, [{ who: 'Brad Holm' }]);
  assert.deepEqual(missing, ['Jarn X', 'Hoss Y']);
  const nick = (n) => n.split(' ')[0];
  const t = nudgeText(9, missing, nick, { kick: 'Thu 8:15 PM ET' });
  assert.match(t, /Week 9 parlay still needs 2 picks: @Jarn, @Hoss\./);
  assert.match(t, /lock at kickoff \(Thu 8:15 PM ET\)/);
  assert.match(t, /holm-parlay\.vercel\.app\/pick$/);
  assert.match(nudgeText(9, ['Jarn X'], nick), /waiting on one pick: @Jarn\./);
  assert.match(nudgeText(9, [], nick), /all picks are in/);
  assert.ok(nudgeHref('a b&c').startsWith('https://wa.me/?text=a%20b%26c'));
});
