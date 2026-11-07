import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleTicket, PARLAY_11 } from '../lib/ticket.mjs';
import { commitPayload, frozenWeek } from '../lib/commit.mjs';
import { withoutMergedPayments } from '../lib/payments.mjs';
import { createLeagueStore } from '../lib/league-store.mjs';
import handler from '../pages/api/pick.js';

// Eleven legal picks on eleven different games, plus Brad and Joey on the same game (an SGP).
const TEAMS = [['DET', 'MIN'], ['BUF', 'MIA'], ['KC', 'LV'], ['SF', 'LAR'], ['DAL', 'NYG'], ['PHI', 'WAS'], ['GB', 'CHI'], ['BAL', 'PIT'], ['CIN', 'CLE'], ['HOU', 'IND'], ['DEN', 'LAC']];
function picks(at, over) {
  const list = PARLAY_11.map((who, i) => ({
    who, source: 'web', updated_at: at,
    leg: { type: 'ml', team: TEAMS[i][0], label: TEAMS[i][0] + ' ML', game: TEAMS[i].slice() },
  }));
  list[1].leg = { type: 'total', side: 'over', line: 47.5, label: 'DET/MIN over 47.5', game: ['DET', 'MIN'] };
  return over ? over(list) : list;
}
const T1 = '2026-11-05T10:00:00.000Z';
const ROW_AT = '2026-11-05T12:00:00.000Z';
const T2 = '2026-11-05T13:00:00.000Z';

test('leg and SGP ids come from the week, manager and game, not chance', () => {
  const a = assembleTicket(picks(T1), PARLAY_11, { week: 9 });
  const b = assembleTicket(picks(T1).reverse(), PARLAY_11, { week: 9 });
  assert.equal(a.complete, true);
  assert.deepEqual(a.legs.map((l) => l.id), b.legs.map((l) => l.id));
  assert.equal(a.legs.find((l) => l.who === 'Brad Holm').id, 'w9-brad');
  assert.deepEqual(Object.keys(a.groups), ['sgp-det-min']);
  assert.deepEqual(Object.keys(b.groups), ['sgp-det-min']);
});

test('a placed, settled or locked week is never rebuilt from picks', () => {
  const ticket = assembleTicket(picks(T1), PARLAY_11, { week: 9 });
  for (const prev of [
    { ticket: { state: 'placed', evidence: 'DK slip' }, legs: [] },
    { ticket: { state: 'settled', evidence: 'DK slip' }, legs: [] },
    { locked: { at: 'x', results: {} }, legs: [] },
  ]) {
    assert.equal(frozenWeek(prev), true);
    assert.equal(commitPayload(prev, ROW_AT, ticket, picks(T1)), null);
  }
  assert.equal(frozenWeek({ ticket: { state: 'proposed' } }), false);
  assert.equal(frozenWeek(null), false);
});

test('an override and a commissioner line fix survive when someone else changes their pick', () => {
  const first = commitPayload(null, null, assembleTicket(picks(T1), PARLAY_11, { week: 9 }), picks(T1));
  // Commissioner fixes Joey's line and forces Brad's leg; the row is saved at ROW_AT.
  const joey = first.legs.find((l) => l.who === 'Joe Mckeon');
  joey.line = 48.5; joey.label = 'DET/MIN over 48.5';
  first.overrides = { 'w9-brad': 'won' };
  first.groups['sgp-det-min'].odds = 260;
  // Then Chas changes his pick at T2.
  const later = picks(T1, (l) => { const c = l.find((p) => p.who === 'Chas Rossman'); c.updated_at = T2; c.leg = { type: 'ml', team: 'PIT', label: 'PIT ML', game: ['BAL', 'PIT'] }; return l; });
  const out = commitPayload(first, ROW_AT, assembleTicket(later, PARLAY_11, { week: 9 }), later);
  assert.equal(out.legs.find((l) => l.who === 'Joe Mckeon').line, 48.5, 'line fix kept');
  assert.equal(out.legs.find((l) => l.who === 'Chas Rossman').label, 'PIT ML', 'changed pick rebuilt');
  assert.deepEqual(out.overrides, { 'w9-brad': 'won' });
  assert.equal(out.groups['sgp-det-min'].odds, 260, 'SGP price kept while the same managers are in it');
});

test('an override is dropped when that manager changes their pick, kept when they re-save the same one', () => {
  const first = commitPayload(null, null, assembleTicket(picks(T1), PARLAY_11, { week: 9 }), picks(T1));
  first.overrides = { 'w9-brad': 'won' };
  const resaved = picks(T1, (l) => { l[0].updated_at = T2; return l; });
  assert.deepEqual(commitPayload(first, ROW_AT, assembleTicket(resaved, PARLAY_11, { week: 9 }), resaved).overrides, { 'w9-brad': 'won' });
  const changed = picks(T1, (l) => { l[0].updated_at = T2; l[0].leg = { type: 'ml', team: 'MIN', label: 'MIN ML', game: ['DET', 'MIN'] }; return l; });
  assert.deepEqual(commitPayload(first, ROW_AT, assembleTicket(changed, PARLAY_11, { week: 9 }), changed).overrides, {});
});

test('the SGP price resets when the group gains or loses a manager', () => {
  const first = commitPayload(null, null, assembleTicket(picks(T1), PARLAY_11, { week: 9 }), picks(T1));
  first.groups['sgp-det-min'].odds = 260;
  const moved = picks(T1, (l) => { l[2].updated_at = T2; l[2].leg = { type: 'ml', team: 'MIN', label: 'MIN ML', game: ['DET', 'MIN'] }; return l; });
  const out = commitPayload(first, ROW_AT, assembleTicket(moved, PARLAY_11, { week: 9 }), moved);
  assert.equal(out.groups['sgp-det-min'].odds, '');
});

test('payments shown on a week are never written back into it', () => {
  const list = [{ who: 'Brad Holm', amount: 10, source: { kind: 'commissioner' } }, { who: 'Brad Holm', amount: 10, source: 'supabase' }];
  assert.deepEqual(withoutMergedPayments(list), [list[0]]);
  const prev = { legs: [], contributions: list };
  const out = commitPayload(prev, ROW_AT, assembleTicket(picks(T1), PARLAY_11, { week: 9 }), picks(T1));
  assert.deepEqual(out.contributions, [list[0]]);
});

test('loading a week that already holds a saved copy of a payment counts it once', async () => {
  const sbRows = [{ week: 9, data: { stake: 10, legs: [], contributions: [{ who: 'Brad Holm', amount: 10, source: 'supabase' }] } }];
  const payments = [{ id: 1, week: 9, who: 'Brad Holm', amount: 10, recorded_at: '2026-11-06T00:00:00Z', source: { date_known: false } }];
  const ok = (d) => ({ ok: true, status: 200, async json() { return d; } });
  const store = createLeagueStore({ fetch: async (url) => {
    const u = String(url);
    if (u.includes('/data/bets.json')) return ok({ weeks: [] });
    if (u.includes('holm_payments')) return ok(payments);
    if (u.includes('holm_parlay_weeks')) return ok(sbRows);
    return ok({});
  } });
  await store.loadData();
  const w9 = store.state.weeks.find((w) => w.week === 9);
  assert.equal(w9.contributions.length, 1);
  assert.equal(w9.contributions.reduce((a, c) => a + c.amount, 0), 10);
});

function apiRes() {
  return { statusCode: 200, headers: {}, setHeader() {}, status(n) { this.statusCode = n; return this; }, send(t) { this.body = JSON.parse(t); return this; }, end() { return this; } };
}

test('the API refuses pick saves and imports for a week whose ticket is placed', async () => {
  const calls = [];
  const prev = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    calls.push({ u, method: (opts && opts.method) || 'GET' });
    const ok = (d) => ({ ok: true, status: 200, async json() { return d; }, async text() { return JSON.stringify(d); } });
    if (u.includes('holm_tickets') && u.includes('week=eq.9')) return ok([{ season: 2026, week: 9, state: 'placed', evidence: 'DK slip', updated_at: ROW_AT }]);
    return ok([]);
  };
  const kc = { type: 'ml', team: 'KC', label: 'Chiefs ML', game: ['KC', 'LV'] };
  const save = apiRes();
  const imp = apiRes();
  try {
    await handler({ method: 'POST', query: {}, body: { week: 9, who: 'Brad Holm', leg: kc } }, save);
    await handler({ method: 'POST', query: {}, body: { week: 9, import: true, text: 'Brad: KC ML KC at LV' } }, imp);
  } finally { global.fetch = prev; }
  for (const res of [save, imp]) {
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /Week 9's ticket is placed/);
  }
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'nothing written');
});
