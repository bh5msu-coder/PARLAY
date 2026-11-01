import test from 'node:test';
import assert from 'node:assert/strict';
import { heroFacts } from '../lib/hero.mjs';

const label = (w) => w.toUpperCase();
const sum = (o) => ({ state: 'open', won: 0, lost: 0, pushes: 0, live: 0, pending: 0, killers: [], total: 0, ...o });

test('hero: a busted week names the killer and draws hit and miss segments', () => {
  const f = heroFacts(sum({ state: 'busted', won: 1, lost: 1, pending: 9, killers: ['dj'], total: 11 }), { state: 'settled' }, label);
  assert.equal(f.label, 'Busted');
  assert.equal(f.tone, 'loss');
  assert.equal(f.line, '1 of 11 hit · killed by DJ');
  assert.deepEqual(f.segments, [['win', 1], ['pending', 9], ['loss', 1]]);
  assert.equal(f.wantsPicks, false);
});

test('hero: an ungraded open week asks for picks until a book has the ticket', () => {
  assert.equal(heroFacts(null, null, label).wantsPicks, true);
  assert.equal(heroFacts(null, null, label).line, 'Picks are coming in');
  assert.equal(heroFacts(sum({ pending: 11, total: 11 }), { state: 'placed' }, label).wantsPicks, false);
  assert.equal(heroFacts(sum({ pending: 11, total: 11 }), { state: 'proposed' }, label).wantsPicks, true);
});

test('hero: a live week with a leg in stops asking for picks', () => {
  const f = heroFacts(sum({ state: 'live', won: 2, live: 1, pending: 8, total: 11 }), null, label);
  assert.equal(f.label, 'Live');
  assert.equal(f.line, '2 of 11 hit · 8 to play');
  assert.equal(f.wantsPicks, false);
});
