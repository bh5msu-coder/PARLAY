import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/health.js';

const ENV_KEYS = ['ESPN_S2', 'espn_s2', 'ESPN_SWID', 'SWID', 'ESPN_LEAGUE_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_KEY'];

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(o) { this.body = o; return this; },
  };
}

function withEnv(env, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try { return fn(); } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('health flags missing ESPN credentials', () => {
  const res = withEnv({}, () => { const r = mockRes(); handler({ method: 'GET' }, r); return r; });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, false);
  assert.deepEqual(res.body.espn, { s2: false, swid: false, leagueIdOverride: false });
  assert.equal(res.body.supabase.usingBuiltInFallback, true);
  assert.match(res.body.problems[0], /ESPN_S2 and ESPN_SWID/);
});

test('health reports configured credentials without leaking values', () => {
  const res = withEnv({ ESPN_S2: 'secret-s2', ESPN_SWID: '{SECRET-SWID}', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'secret-key' }, () => {
    const r = mockRes(); handler({ method: 'GET' }, r); return r;
  });
  assert.equal(res.body.ok, true);
  assert.equal(res.body.espn.s2, true);
  assert.equal(res.body.supabase.usingBuiltInFallback, false);
  const text = JSON.stringify(res.body);
  for (const secret of ['secret-s2', 'SECRET-SWID', 'secret-key', 'x.supabase.co']) assert.ok(!text.includes(secret), secret);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('health rejects non-GET', () => {
  const r = mockRes();
  handler({ method: 'POST' }, r);
  assert.equal(r.statusCode, 405);
});
