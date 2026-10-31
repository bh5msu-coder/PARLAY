import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPickLock, gameStatus } from '../lib/pick-lock.mjs';
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

test('a pick can be saved or changed until its game kicks off', () => {
  assert.equal(gameStatus(board('pre'), kc.game), 'pre');
  assert.deepEqual(checkPickLock(board('pre'), kc, null), { ok: true, checked: true });
  assert.match(checkPickLock(board('in'), kc, null).reason, /KC at LV already kicked off/);
  const other = { type: 'ml', team: 'DEN', label: 'Broncos ML', game: ['DEN', 'ARI'] };
  assert.match(checkPickLock(board('post'), other, { leg: kc }).reason, /saved pick \(Chiefs ML\) is in a game that already kicked off/);
});

test('if ESPN is unreachable the lock is skipped, and says so', () => {
  assert.deepEqual(checkPickLock(null, kc, null), { ok: true, checked: false });
});

test('a short ticket still produces a slip, marked with how many picks are in', () => {
  const t = assembleTicket([{ who: 'Brad Holm', leg: kc }], PARLAY_11);
  assert.equal(t.complete, false);
  const slip = slipText(t, 9);
  assert.match(slip, /1 of 11 picks in/);
  assert.match(slip, /any book \(boosts encouraged\)/);
  assert.match(slip, /screenshot/);
});

test('the API refuses a pick whose game already kicked off', async () => {
  const calls = [];
  const prev = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    calls.push({ u, method: (opts && opts.method) || 'GET' });
    const ok = (d) => ({ ok: true, status: 200, async json() { return d; }, async text() { return JSON.stringify(d); } });
    if (u.includes('site.api.espn.com')) return ok(board('in'));
    if (u.includes('holm_parlay_picks')) return ok([]);
    return ok([]);
  };
  const res = { statusCode: 200, headers: {}, setHeader() {}, status(n) { this.statusCode = n; return this; }, send(t) { this.body = JSON.parse(t); return this; }, end() { return this; } };
  try { await handler({ method: 'POST', query: {}, body: { week: 9, who: 'Brad Holm', leg: kc } }, res); } finally { global.fetch = prev; }
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /already kicked off/);
  assert.equal(calls.filter((c) => c.u.includes('holm_parlay_picks') && c.method === 'POST').length, 0);
});
