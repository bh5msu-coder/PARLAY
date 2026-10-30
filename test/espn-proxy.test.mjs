import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/espn.js';

const ENV_KEYS = ['ESPN_S2', 'espn_s2', 'ESPN_SWID', 'SWID', 'ESPN_LEAGUE_ID'];

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(o) { this.body = o; return this; },
    send(t) { this.body = t; return this; },
    end() { return this; },
  };
}

function leaguePayload(owner = 'Holm Owner') {
  return JSON.stringify({
    members: [{ id: '1', firstName: owner.split(' ')[0], lastName: owner.split(' ')[1] || 'Owner' }],
    teams: [{
      id: 7,
      location: 'Pinned',
      nickname: 'Squad',
      owners: ['1'],
      abbrev: 'PIN',
      pointsByScoringPeriod: { 1: 88 },
    }],
    schedule: [],
    settings: { name: 'should not leak' },
  });
}

async function call(query, fetchImpl) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const prevFetch = global.fetch;
  const calls = [];
  global.fetch = fetchImpl || (async (url, opts) => {
    calls.push({ url: String(url), headers: (opts && opts.headers) || {}, redirect: opts && opts.redirect });
    return {
      status: 200,
      ok: true,
      async text() { return leaguePayload(); },
    };
  });
  const res = mockRes();
  try {
    await handler({ method: 'GET', query }, res);
  } finally {
    global.fetch = prevFetch;
    for (const k of ENV_KEYS) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return { res, calls };
}

function withCreds() {
  process.env.ESPN_S2 = 'session-secret';
  process.env.ESPN_SWID = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
  delete process.env.ESPN_LEAGUE_ID;
}

test('ffl refuses another league and does not call ESPN with the session', async () => {
  withCreds();
  const { res, calls } = await call({ path: 'ffl', league: '999999', season: '2026', week: '1' });
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
  assert.equal(res.body.error, 'Invalid fantasy league or season');
});

test('ffl refuses every season except the server year', async () => {
  withCreds();
  for (const season of ['2019', '2025', '2027', '0000', '9999']) {
    const { res, calls } = await call({ path: 'ffl', league: '182263', season, week: '1' });
    assert.equal(res.statusCode, 400, season);
    assert.equal(calls.length, 0, season);
  }
});

test('ffl refuses a scoring period that is not one NFL week', async () => {
  withCreds();
  for (const week of ['0', '19', '100', '1\n', ['1', '2']]) {
    const { res, calls } = await call({ path: 'ffl', league: '182263', season: '2026', week });
    assert.equal(res.statusCode, 400, JSON.stringify(week));
    assert.equal(calls.length, 0, JSON.stringify(week));
  }
});

test('ffl refuses season path injection that would select another league', async () => {
  withCreds();
  const attacks = [
    '2026/segments/0/leagues/999999?',
    '2026/segments/0/leagues/999999?view=mTeam&x=',
    '2026\n',
    '2026\n/segments/0/leagues/999999?',
    '2026\r\n',
    '2026/../999999',
    '2026%2F9999',
    ' 2026',
    '2026 ',
    ['2026', '2026/segments/0/leagues/999999?'],
  ];
  for (const season of attacks) {
    const { res, calls } = await call({ path: 'ffl', league: '182263', season, week: '1' });
    assert.equal(res.statusCode, 400, JSON.stringify(season));
    assert.equal(calls.length, 0, JSON.stringify(season));
  }
});

test('ffl refuses a league query array and a non-numeric configured league id', async () => {
  withCreds();
  const arrayQuery = await call({ path: 'ffl', league: ['182263', '999999'], season: '2026', week: '1' });
  assert.equal(arrayQuery.res.statusCode, 400);
  assert.equal(arrayQuery.calls.length, 0);

  process.env.ESPN_LEAGUE_ID = '182263/segments/0/leagues/999999';
  const badEnv = await call({ path: 'ffl', season: '2026', week: '1' });
  assert.equal(badEnv.res.statusCode, 400);
  assert.equal(badEnv.calls.length, 0);
});

test('ffl reads only the configured league and attaches the session only to that request', async () => {
  withCreds();
  const { res, calls } = await call({ path: 'ffl', league: '182263', season: '2026', week: '1' });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  const fetched = new URL(calls[0].url);
  assert.equal(fetched.origin, 'https://lm-api-reads.fantasy.espn.com');
  assert.equal(fetched.pathname, '/apis/v3/games/ffl/seasons/2026/segments/0/leagues/182263');
  assert.equal(fetched.searchParams.get('scoringPeriodId'), '1');
  assert.match(calls[0].headers.Cookie, /espn_s2=session-secret/);
  assert.match(calls[0].headers.Cookie, /SWID=\{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE\}/);
  assert.equal(calls[0].redirect, 'manual');
  assert.equal(res.body.last.owner, 'Holm Owner');
  assert.equal(res.body.settings, undefined);
  assert.equal(JSON.stringify(res.body).includes('should not leak'), false);
});

test('omitted league query still uses the server league, not a caller default', async () => {
  withCreds();
  process.env.ESPN_LEAGUE_ID = '182263';
  const { res, calls } = await call({ path: 'ffl', season: '2026', week: '1' });
  assert.equal(res.statusCode, 200);
  assert.equal(new URL(calls[0].url).pathname, '/apis/v3/games/ffl/seasons/2026/segments/0/leagues/182263');
});

test('a configured league id is the only id the session will read', async () => {
  withCreds();
  process.env.ESPN_LEAGUE_ID = '424242';
  const denied = await call({ path: 'ffl', league: '182263', season: '2026', week: '1' });
  assert.equal(denied.res.statusCode, 400);
  assert.equal(denied.calls.length, 0);
  const allowed = await call({ path: 'ffl', league: '424242', season: '2026', week: '1' });
  assert.equal(allowed.res.statusCode, 200);
  assert.equal(new URL(allowed.calls[0].url).pathname, '/apis/v3/games/ffl/seasons/2026/segments/0/leagues/424242');
});

test('public scoreboard and summary do not receive the ESPN session', async () => {
  withCreds();
  const board = await call({ path: 'scoreboard', season: '2026/segments/0/leagues/999999?', week: '1' });
  assert.equal(board.res.statusCode, 200);
  assert.equal(board.calls.length, 1);
  assert.equal(board.calls[0].headers.Cookie, undefined);
  const boardUrl = new URL(board.calls[0].url);
  assert.equal(boardUrl.origin, 'https://site.api.espn.com');
  assert.equal(boardUrl.pathname, '/apis/site/v2/sports/football/nfl/scoreboard');
  assert.equal(boardUrl.hostname.includes('fantasy'), false);

  const summary = await call({ path: 'summary', event: '401772938' });
  assert.equal(summary.calls[0].headers.Cookie, undefined);
  assert.equal(new URL(summary.calls[0].url).origin, 'https://site.api.espn.com');
});

test('ffl does not follow a redirect with the ESPN session', async () => {
  withCreds();
  let calls = 0;
  const { res } = await call({ path: 'ffl', league: '182263', season: '2026', week: '1' }, async () => {
    calls += 1;
    return { status: 302, ok: false, headers: { location: 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/999999' }, async text() { return ''; } };
  });
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.settings, undefined);
});
