import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPickLock, gameStatus, kickedOff } from '../lib/pick-lock.mjs';
import { assembleTicket, PARLAY_11, slipText } from '../lib/ticket.mjs';
import handler from '../pages/api/pick.js';

const board = (state) => ({
  events: [{
    id: '1', date: '2026-11-01T17:00Z', status: { type: { state, completed: state === 'post' } },
    competitions: [{ competitors: [
      { homeAway: 'home', team: { abbreviation: 'LV' }, score: '0' },
      { homeAway: 'away', team: { abbreviation: 'KC' }, score: '0' },
    ] }],
  }],
});
const kc = { type: 'ml', team: 'KC', label: 'Chiefs ML', game: ['KC', 'LV'] };

test('a pick saved after kickoff goes through with a warning; nothing is refused', () => {
  const before = Date.parse('2026-11-01T16:00Z');
  const after = Date.parse('2026-11-01T17:01Z');
  assert.equal(gameStatus(board('pre'), kc.game), 'pre');
  assert.deepEqual(checkPickLock(board('pre'), kc, null, before), { ok: true, checked: true, late: false });
  const live = checkPickLock(board('in'), kc, null, before);
  assert.equal(live.ok, true);
  assert.equal(live.late, true);
  assert.match(live.warning, /KC at LV already kicked off\. Saved, but the book may not take this leg pre-game/);
  const other = { type: 'ml', team: 'DEN', label: 'Broncos ML', game: ['DEN', 'ARI'] };
  assert.match(checkPickLock(board('post'), other, { leg: kc }, before).warning, /earlier pick \(Chiefs ML\) was in a game that already kicked off/);
});

test('the scheduled kickoff counts even while ESPN still shows the game as not started', () => {
  assert.equal(kickedOff(board('pre'), kc.game, Date.parse('2026-11-01T16:59Z')), false);
  assert.equal(kickedOff(board('pre'), kc.game, Date.parse('2026-11-01T17:00Z')), true);
  assert.equal(checkPickLock(board('pre'), kc, null, Date.parse('2026-11-01T17:02Z')).late, true);
});

test('if ESPN is unreachable the check is skipped, and says so', () => {
  assert.deepEqual(checkPickLock(null, kc, null), { ok: true, checked: false, late: false });
});

test('a short ticket still produces a slip, marked with how many picks are in', () => {
  const t = assembleTicket([{ who: 'Brad Holm', leg: kc }], PARLAY_11);
  assert.equal(t.complete, false);
  const slip = slipText(t, 9);
  assert.match(slip, /1 of 11 picks in/);
  assert.match(slip, /any book \(boosts encouraged\)/);
  assert.match(slip, /screenshot/);
});

test('the API saves a pick whose game already kicked off and warns about it', async () => {
  const calls = [];
  const prev = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    calls.push({ u, method: (opts && opts.method) || 'GET' });
    const ok = (d) => ({ ok: true, status: 200, async json() { return d; }, async text() { return JSON.stringify(d); } });
    if (u.includes('site.api.espn.com')) return ok(board('in'));
    if (u.includes('holm_parlay_picks') && opts && opts.method === 'POST') return ok([JSON.parse(opts.body)]);
    return ok([]);
  };
  const res = { statusCode: 200, headers: {}, setHeader() {}, status(n) { this.statusCode = n; return this; }, send(t) { this.body = JSON.parse(t); return this; }, end() { return this; } };
  try { await handler({ method: 'POST', query: {}, body: { week: 9, who: 'Brad Holm', leg: kc } }, res); } finally { global.fetch = prev; }
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.late, true);
  assert.match(res.body.warning, /already kicked off/);
  assert.equal(calls.filter((c) => c.u.includes('holm_parlay_picks') && c.method === 'POST').length, 1);
});
