import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings, mergeNicknames, changedNicknames } from '../lib/league-config.mjs';

const fresh = { leagueName: 'Our Holm League', chat: 'x', roster: ['A'], abstain: ['Kyle Heller'], nicknames: { 'Brad Holm': 'Commish', 'John Sachs': 'Jarn' } };

test('settings save keeps nicknames saved since the page loaded', () => {
  const out = mergeSettings(fresh, { leagueName: 'Holm', roster: ['A', 'B'], you: 'Brad Holm', abstainText: 'x' });
  assert.deepEqual(out.nicknames, fresh.nicknames);
  assert.equal(out.leagueName, 'Holm');
  assert.deepEqual(out.roster, ['A', 'B']);
  assert.equal(out.you, undefined);
  assert.equal(out.abstainText, undefined);
});

test('nickname save changes only the edited names; blank clears one', () => {
  const out = mergeNicknames(fresh, { 'Ryan Hoffman': '  Hoss Repeat ', 'John Sachs': '' });
  assert.deepEqual(out.nicknames, { 'Brad Holm': 'Commish', 'Ryan Hoffman': 'Hoss Repeat' });
  assert.equal(out.leagueName, 'Our Holm League');
  assert.deepEqual(fresh.nicknames, { 'Brad Holm': 'Commish', 'John Sachs': 'Jarn' }, 'input unchanged');
});

test('nicknames are capped at 24 characters', () => {
  assert.equal(mergeNicknames({}, { X: 'a'.repeat(40) }).nicknames.X.length, 24);
});

test('changedNicknames lists only real edits', () => {
  assert.deepEqual(changedNicknames(fresh.nicknames, { 'Brad Holm': 'Commish', 'John Sachs': 'Jarn the Action', 'Kevin Sack': '' }), { 'John Sachs': 'Jarn the Action' });
  assert.deepEqual(changedNicknames(fresh.nicknames, { 'Brad Holm': '' }), { 'Brad Holm': '' });
});
