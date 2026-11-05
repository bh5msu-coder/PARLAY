import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateNicknames, withNicknames, nicknameChanges } from '../lib/nicknames.mjs';
import { ident } from '../lib/ident.mjs';

const lore = JSON.parse(readFileSync(new URL('../league-lore.json', import.meta.url)));
const shipped = JSON.parse(readFileSync(new URL('../data/nicknames.json', import.meta.url)));
const file = (people) => ({ version: 1, updated: '2026-11-15', people });
const ok = { nickname: 'Hoss the Repeat', why: 'Back-to-back titles in 2024 and 2025.', since: '2026-11-15', past: [] };

test('shipped nicknames file is valid', () => {
  assert.deepEqual(validateNicknames(shipped, lore.people), []);
});

test('a good nickname passes', () => {
  assert.deepEqual(validateNicknames(file({ hoffman: ok }), lore.people), []);
});

test('rejects unknown ids, bad lengths, odd characters and missing reasons', () => {
  const errs = validateNicknames(file({
    nobody: ok,
    brad: { nickname: 'B', why: 'Too short a nickname.' },
    sack: { nickname: 'Kev <script>', why: 'Has markup in it.' },
    curtis: { nickname: 'Nick the Quick', why: '' },
  }), lore.people);
  assert.equal(errs.length, 4);
  assert.match(errs.join('\n'), /nobody: not a manager/);
});

test("rejects a nickname that already points at another manager", () => {
  const errs = validateNicknames(file({ brad: { nickname: 'Jarn the Action', why: 'Stealing Jarn’s alias.' } }), lore.people);
  assert.match(errs.join('\n'), /already points at sachs/);
});

test('rejects two managers with the same nickname and blocked words', () => {
  const two = validateNicknames(file({ brad: { nickname: 'The Lock', why: 'Hit three straight legs.' }, sack: { nickname: 'the lock', why: 'Also hit three straight.' } }), lore.people);
  assert.match(two.join('\n'), /same as brad/);
  const rude = validateNicknames(file({ brad: { nickname: 'Shitty Picks', why: 'Went 2–4 on legs.' } }), lore.people);
  assert.match(rude.join('\n'), /family-friendly/);
});

test('withNicknames adds a title and alias without touching the short handle', () => {
  const l = withNicknames(lore, file({ hoffman: ok }));
  const p = l.people.find((x) => x.id === 'hoffman');
  assert.equal(p.nick, 'Hoss');
  assert.equal(p.title, 'Hoss the Repeat');
  assert.ok(p.aliases.includes('Hoss the Repeat'));
  assert.ok(!lore.people.find((x) => x.id === 'hoffman').aliases.includes('Hoss the Repeat'), 'input unchanged');
  ident.load(l);
  assert.equal(ident.canonical('hoss the repeat'), 'Ryan Hoffman');
  assert.equal(ident.nick('Ryan Hoffman'), 'Hoss');
  ident.load(lore);
});

test('nicknameChanges lists only new or changed rows', () => {
  const before = file({ hoffman: ok, brad: { nickname: 'Low Man Brad', why: 'Two last-place finishes.' } });
  const after = file({ hoffman: ok, brad: { nickname: 'Holm Field', why: 'Title in 2023, top four since.' } });
  assert.deepEqual(nicknameChanges(before, after, lore.people).map((r) => [r.id, r.from, r.to]), [['brad', 'Low Man Brad', 'Holm Field']]);
});
