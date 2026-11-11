import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PEOPLE as ROSTER } from '../lib/roster.mjs';
import { PEOPLE, PARLAY_11, nicknameAliases, strictWho, canonicalWho } from '../lib/ticket.mjs';
import { FALLBACK_PEOPLE, ident } from '../lib/ident.mjs';
import { parseWhatsAppExport } from '../lib/import/whatsapp.mjs';
import { createLeagueStore } from '../lib/league-store.mjs';
import handler from '../pages/api/pick.js';

const lore = JSON.parse(readFileSync(new URL('../league-lore.json', import.meta.url), 'utf8'));
const pick = (p) => ({ id: p.id, name: p.name, nick: p.nick, aliases: p.aliases, parlay: !!p.parlay, abstain: !!p.abstain });

test('one roster: the server and the client use the same list, and it matches league-lore.json', () => {
  assert.equal(PEOPLE, ROSTER);
  assert.equal(FALLBACK_PEOPLE, ROSTER);
  assert.deepEqual(ROSTER.map(pick), lore.people.map(pick));
  assert.equal(PARLAY_11.length, 11);
});

test('a commissioner nickname or Claude title works as a name, but never takes another manager\'s spelling', () => {
  const aliases = nicknameAliases(
    { 'Kevin Sack': 'Wally', 'Brad Holm': 'Hoss', 'Joe Mckeon': 'Ginger', 'DJ Dangerous': 'Ginger' },
    { people: { mckeon: { nickname: 'The Under Lord' } } },
  );
  assert.equal(strictWho('wally', aliases), 'Kevin Sack');
  assert.equal(strictWho('The Under Lord', aliases), 'Joe Mckeon');
  assert.equal(strictWho('Hoss', aliases), 'Ryan Hoffman', 'Hoss stays Ryan Hoffman');
  assert.equal(strictWho('Ginger', aliases), '', 'a nickname two managers share points at neither');
  assert.equal(strictWho('Wally'), '', 'without the settings it is unknown, as before');
  assert.equal(canonicalWho('Wally', PARLAY_11, aliases), 'Kevin Sack');
});

test('a WhatsApp pick posted under a commissioner nickname is imported for that manager', () => {
  const aliases = nicknameAliases({ 'Kevin Sack': 'Wally' }, null);
  const r = parseWhatsAppExport('Wally: Chiefs ML KC at LV', { roster: PARLAY_11, week: 9, aliases });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.picks[0].who, 'Kevin Sack');
});

test('on the page, commissioner nicknames resolve to the manager without stealing anyone\'s name', () => {
  try {
    ident.setNicknames({ 'Kevin Sack': 'Wally', 'Brad Holm': 'Hoss' });
    assert.equal(ident.canonical('Wally'), 'Kevin Sack');
    assert.equal(ident.canonical('Hoss'), 'Ryan Hoffman');
    assert.equal(ident.nick('Brad Holm'), 'Hoss', 'still shown as Brad\'s nickname');
  } finally { ident.setNicknames({}); }
  assert.equal(ident.canonical('Wally'), 'Wally');
});

test('roster lines that are not a manager are set aside, not used as names', async () => {
  const ok = (d) => ({ ok: true, status: 200, async json() { return d; } });
  const cfg = { roster: ['Ryan Hoffman; H0$$', 'Brad Holm', 'Hoss'], abstain: ['Kyle Heller'] };
  const store = createLeagueStore({ fetch: async (url) => {
    const u = String(url);
    if (u.includes('/api/weeks')) return ok({ weeks: [] });
    if (u.includes('holm_payments')) return ok([]);
    if (u.includes('holm_settings')) return ok([{ data: cfg }]);
    return ok({});
  } });
  await store.loadData();
  assert.deepEqual(store.state.config.roster, ['Brad Holm', 'Ryan Hoffman']);
  assert.deepEqual(store.state.config.rosterProblems, ['Ryan Hoffman; H0$$']);
  assert.ok(!store.payerRoster().includes('Ryan Hoffman; H0$$'), 'never offered as a payer');
  assert.deepEqual(cfg.roster, ['Ryan Hoffman; H0$$', 'Brad Holm', 'Hoss'], 'the saved settings are not changed by loading');
});

test('the pick API saves a pick sent under a commissioner nickname for the right manager', async () => {
  const posts = [];
  const prev = global.fetch;
  const ok = (d) => ({ ok: true, status: 200, async json() { return d; }, async text() { return JSON.stringify(d); } });
  const board = { events: [{ id: '1', date: '2026-11-08T18:00Z', status: { type: { state: 'pre', completed: false } }, competitions: [{ competitors: [
    { homeAway: 'home', team: { abbreviation: 'LV' }, score: '0' }, { homeAway: 'away', team: { abbreviation: 'KC' }, score: '0' }] }] }] };
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') { posts.push({ u, body: JSON.parse(opts.body) }); return ok([JSON.parse(opts.body)]); }
    if (u.includes('holm_settings')) return ok([{ data: { nicknames: { 'Kevin Sack': 'Wally' } } }]);
    if (u.includes('site.api.espn.com')) return ok(board);
    return ok([]);
  };
  const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, send(t) { this.body = JSON.parse(t); return this; }, end() { return this; } };
  try {
    await handler({ method: 'POST', query: {}, body: { week: 9, who: 'Wally', leg: { type: 'ml', team: 'KC', label: 'Chiefs ML', game: ['KC', 'LV'] } } }, res);
  } finally { global.fetch = prev; }
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const saved = posts.find((p) => p.u.includes('holm_parlay_picks'));
  assert.equal(saved.body.who, 'Kevin Sack');
});
