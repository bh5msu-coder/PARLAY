import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler, { HOST_MODEL, LIMITS, SYSTEM, rateLimit, resetLimits, validateBody } from '../pages/api/host.js';
import { slimFfl } from '../pages/api/espn.js';
import { healthReport } from '../pages/api/health.js';
import { hostBriefing, hostFacts } from '../lib/host.mjs';

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(o) { this.body = o; return this; },
  };
}

async function call(req, { key = 'test-key', fetchImpl } = {}) {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const prevFetch = global.fetch;
  const calls = [];
  if (key) process.env.ANTHROPIC_API_KEY = key; else delete process.env.ANTHROPIC_API_KEY;
  global.fetch = fetchImpl || (async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Ask the Standings tab, friend.' }], usage: { input_tokens: 40, cache_read_input_tokens: 600 } }) };
  });
  const res = mockRes();
  try {
    await handler(Object.assign({ headers: { 'x-forwarded-for': '1.2.3.4' } }, req), res);
  } finally {
    global.fetch = prevFetch;
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
  }
  return { res, calls };
}

test('host api: POST only, and off (503) without an API key, with no model call', async () => {
  resetLimits();
  assert.equal((await call({ method: 'GET' })).res.statusCode, 405);
  const off = await call({ method: 'POST', body: { question: 'hi' } }, { key: '' });
  assert.equal(off.res.statusCode, 503);
  assert.equal(off.calls.length, 0);
});

test('host api: rejects empty, oversized and malformed input before calling the model', async () => {
  resetLimits();
  for (const body of [null, [], { question: '' }, { question: 'x'.repeat(LIMITS.questionChars + 1) }, { question: 'hi', facts: [1] }, { question: 'hi', facts: { blob: 'x'.repeat(LIMITS.factsBytes) } }]) {
    const { res, calls } = await call({ method: 'POST', body });
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(calls.length, 0);
  }
  assert.equal(validateBody({ question: ' who wins? ', facts: { a: 1 } }).question, 'who wins?');
});

test('host api: one small cached call with no tools, and the reply passes through', async () => {
  resetLimits();
  const { res, calls } = await call({ method: 'POST', body: { question: 'who is the best?', facts: { you: 'Brad Holm' } } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, 'Ask the Standings tab, friend.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  const sent = JSON.parse(calls[0].opts.body);
  assert.equal(sent.model, HOST_MODEL);
  assert.equal(sent.max_tokens, LIMITS.maxTokens);
  assert.deepEqual(sent.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(sent.tools, undefined);
  assert.equal(sent.messages.length, 1);
});

test('host api: an upstream failure is a 502 with no details leaked', async () => {
  resetLimits();
  const { res } = await call({ method: 'POST', body: { question: 'hi' } }, { fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'bad key sk-123' }) }) });
  assert.equal(res.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(res.body), /sk-/);
});

test('host api: per-IP and daily limits', () => {
  resetLimits();
  const t = Date.parse('2026-11-10T12:00:00Z');
  for (let n = 0; n < LIMITS.perIpPerHour; n++) assert.equal(rateLimit('9.9.9.9', t + n), '');
  assert.notEqual(rateLimit('9.9.9.9', t + 100), '');
  assert.equal(rateLimit('9.9.9.9', t + 3601e3), '');
  resetLimits();
  for (let n = 0; n < LIMITS.perDay; n++) rateLimit('ip' + n, t);
  assert.match(rateLimit('fresh', t), /resting/);
  assert.equal(rateLimit('fresh', t + 86400e3), '');
  resetLimits();
});

test('host api: the system prompt carries the house rules and is long enough to cache', () => {
  assert.match(SYSTEM, /cannot place a wager/);
  assert.match(SYSTEM, /saved pick is not a placed bet/);
  assert.match(SYSTEM, /hypothetical/);
  assert.doesNotMatch(SYSTEM, /Oct 3/);
  // Roughly 4 characters per token; caching needs 512+ tokens on Haiku 5.5.
  assert.ok(SYSTEM.length / 4 >= 512, 'system prompt ~' + Math.round(SYSTEM.length / 4) + ' tokens');
  const src = readFileSync(new URL('../pages/api/host.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\/api\/pick|supabase|sb_publishable/i);
});

test('espn ffl: matchups are an additive field, with byes and live points', () => {
  const out = slimFfl({
    members: [],
    teams: [{ id: 1, pointsByScoringPeriod: { 9: 100 } }, { id: 2, pointsByScoringPeriod: { 9: 90 } }, { id: 3 }],
    schedule: [
      { matchupPeriodId: 9, home: { teamId: 1, totalPoints: 100 }, away: { teamId: 2, totalPoints: 90 } },
      { matchupPeriodId: 9, home: { teamId: 3, totalPointsLive: 12.5 } },
      { matchupPeriodId: 8, home: { teamId: 1, totalPoints: 1 }, away: { teamId: 3, totalPoints: 2 } },
    ],
  }, 9);
  assert.deepEqual(Object.keys(out), ['scoringPeriodId', 'last', 'standings', 'matchups']);
  assert.deepEqual(out.matchups, [
    { homeId: 1, awayId: 2, homePoints: 100, awayPoints: 90 },
    { homeId: 3, awayId: null, homePoints: 12.5, awayPoints: null },
  ]);
  assert.equal(out.last.id, 3);
});

test('health: reports the Host AI key as a boolean that never changes "ok"', () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'secret-value';
  const r = healthReport();
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
  assert.deepEqual(r.host, { anthropic: true });
  assert.doesNotMatch(JSON.stringify(r), /secret-value/);
  assert.ok(!r.problems.some((p) => /ANTHROPIC/.test(p)));
});

test('host facts: small, precomputed and under the 2 KB cap', () => {
  const rows = Array.from({ length: 12 }, (_, n) => ({ id: n + 1, who: 'Manager ' + n, team: 'Team ' + n, points: 80 + n }));
  const b = hostBriefing({
    you: 'Manager 3', nick: 'Three', clock: { active: 10, payerWeek: 9, firstKick: '2026-11-13T01:15:00Z' },
    lastPlace: { week: 9, rows, who: 'Manager 0' }, currentMatchups: [{ homeId: 4, awayId: 5 }], payers: ['Manager 0'],
    currentWeek: { week: 10, stake: 10 }, now: new Date('2026-11-10T18:00:00Z'),
  });
  const f = hostFacts(b);
  assert.ok(JSON.stringify(f).length <= 2000);
  assert.equal(f.thisWeekOpponent, 'Manager 4');
  assert.equal(f.fantasyLastWeek.rank, 9);
  assert.equal(f.owe.status, 'clear');
  assert.equal(validateBody({ question: 'q', facts: f }).ok, true);
});
