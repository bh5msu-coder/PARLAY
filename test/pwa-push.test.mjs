import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cronAuthorized, etParts, firstKick, gradeChanged, inMissingWindow, normalizeSubscription, planAlerts, pushEndpointAllowed, pushReady, pushStatus, secretMatch, subscriptionRoom, SUBSCRIPTION_CAP } from '../lib/push-events.mjs';
import pushHandler from '../pages/api/push.js';
import { readSnapshot, writeSnapshot } from '../lib/offline-cache.mjs';
import { claimAccepted, runSweep, targetWeek } from '../lib/push-run.mjs';

const THU = Date.parse('2026-11-12T21:30:00Z'); // Thursday 4:30pm ET
const WED = Date.parse('2026-11-11T21:30:00Z');
const MON = Date.parse('2026-11-16T15:00:00Z');

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function grade(rows, ticket) {
  return {
    summary: { state: ticket },
    graded: rows.map((r) => ({ state: r.state, gameDate: r.gameDate || null, leg: { id: r.id, who: r.who, label: r.label } })),
  };
}

test('offline cache: round-trips weeks and merges picks by week', () => {
  const s = mem();
  assert.equal(readSnapshot(s), null);
  assert.equal(readSnapshot(null), null);
  writeSnapshot(s, { weeks: [{ week: 8, legs: [] }] });
  writeSnapshot(s, { picks: { '8': { rows: [{ who: 'Brad' }] } } });
  const snap = readSnapshot(s);
  assert.equal(snap.weeks[0].week, 8);
  assert.equal(snap.picks['8'].rows[0].who, 'Brad');
  writeSnapshot(s, { picks: { '9': { rows: [] } } });
  assert.equal(readSnapshot(s).picks['8'].rows.length, 1);
  s.setItem('hp_offline_v1', '{');
  assert.equal(readSnapshot(s), null);
});

test('push status is booleans and ready needs every server secret name', () => {
  const env = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:h@example.com', SUPABASE_SERVICE_ROLE_KEY: 'srv' };
  assert.equal(pushReady(env), true);
  assert.equal(pushReady({ VAPID_PUBLIC_KEY: 'pub' }), false);
  const status = pushStatus(env);
  assert.equal(status.vapidPrivate, true);
  assert.equal(JSON.stringify(status).includes('priv'), false);
  const sub = normalizeSubscription({ who: 'Brad', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } } });
  assert.equal(sub.row.who, 'Brad');
  assert.equal(sub.row.endpoint, 'https://fcm.googleapis.com/fcm/send/abc');
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://push.example/a',
    'https://127.0.0.1/push',
    'https://10.0.0.8/push',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/push',
    'https://fcm.googleapis.com.evil.com/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
  ]) {
    assert.equal(pushEndpointAllowed(endpoint), false, endpoint);
    assert.equal(normalizeSubscription({ subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } } }).error, 'Need a browser push endpoint');
  }
  for (const endpoint of [
    'https://web.push.apple.com/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-pn1p.notify.windows.com/w/?token=abc',
  ]) assert.equal(pushEndpointAllowed(endpoint), true, endpoint);
  assert.ok(normalizeSubscription({}).error);
});

test('alerts: the first look records the week and does not replay hits', () => {
  const g = grade([{ id: 'a', state: 'won', who: 'Brad Holm', label: 'Chiefs ML' }], 'open');
  const plan = planAlerts({ grade: g, week: 9, roster: [], picked: [], now: MON });
  assert.equal(plan.baseline, true);
  assert.deepEqual(plan.alerts, []);
  assert.equal(plan.snapshot.seen, true);
  assert.equal(plan.snapshot.legs[0].state, 'won');
});

test('alerts: a leg that flips to won, a loss that kills the ticket, and a cash', () => {
  const prev = { seen: true, ticket: 'live', legs: [{ id: 'a', state: 'live' }, { id: 'b', state: 'pending' }], sent: [] };
  const hit = planAlerts({ prev, grade: grade([{ id: 'a', state: 'won', who: 'Brad Holm', label: 'Chiefs ML' }, { id: 'b', state: 'pending', who: 'Jarn', label: 'Over' }], 'live'), week: 9, now: MON });
  assert.deepEqual(hit.alerts.map((a) => a.kind), ['leg-hit']);
  assert.match(hit.alerts[0].body, /Brad — Chiefs ML/);
  assert.equal(hit.alerts[0].url, '/week');

  const dead = planAlerts({
    prev: { seen: true, ticket: 'live', legs: [{ id: 'a', state: 'won' }, { id: 'b', state: 'live' }], sent: hit.snapshot.sent },
    grade: grade([{ id: 'a', state: 'won', who: 'Brad Holm', label: 'Chiefs ML' }, { id: 'b', state: 'lost', who: 'Jarn', label: 'Over 44.5' }], 'busted'),
    week: 9,
    now: MON,
  });
  assert.deepEqual(dead.alerts.map((a) => a.kind), ['ticket-dies']);
  assert.match(dead.alerts[0].body, /Jarn missed: Over 44.5/);

  const again = planAlerts({ prev: dead.snapshot, grade: grade([{ id: 'a', state: 'won', who: 'Brad Holm', label: 'Chiefs ML' }, { id: 'b', state: 'lost', who: 'Jarn', label: 'Over 44.5' }], 'busted'), week: 9, now: MON });
  assert.deepEqual(again.alerts, []);

  const cashed = planAlerts({
    prev: { seen: true, ticket: 'live', legs: [{ id: 'a', state: 'won' }, { id: 'b', state: 'live' }], sent: [] },
    grade: grade([{ id: 'a', state: 'won', who: 'Brad Holm', label: 'Chiefs ML' }, { id: 'b', state: 'won', who: 'Hoss', label: 'Bills -3' }], 'cashed'),
    week: 9,
    now: MON,
  });
  assert.deepEqual(cashed.alerts.map((a) => a.kind), ['leg-hit', 'ticket-cash']);
  assert.match(cashed.alerts[1].body, /Week 9 hit/);
});

test('alerts: picks still missing only inside the Thursday-to-Sunday window, and only once', () => {
  assert.equal(etParts(THU).weekday, 'Thu');
  assert.equal(inMissingWindow(WED, null), false);
  assert.equal(inMissingWindow(THU, null), true);
  assert.equal(inMissingWindow(THU, THU - 1000), false);
  assert.equal(inMissingWindow(MON, null), false);
  const base = { week: 10, roster: ['Brad Holm', 'John Arnold', 'Kyle Heller'], picked: ['Brad Holm'], kickoff: THU + 60 * 60 * 1000 };
  const open = planAlerts(Object.assign({ grade: grade([], 'open'), now: THU }, base));
  assert.equal(open.alerts.length, 1);
  assert.equal(open.alerts[0].kind, 'picks-missing');
  assert.match(open.alerts[0].body, /John, Kyle/);
  assert.equal(open.alerts[0].url, '/week#pick');
  const second = planAlerts(Object.assign({ prev: open.snapshot, grade: grade([], 'open'), now: THU }, base));
  assert.deepEqual(second.alerts, []);
  const early = planAlerts(Object.assign({ grade: grade([], 'open'), now: WED }, base));
  assert.deepEqual(early.alerts, []);
});

test('alerts: the missing-picks job does not record leg movement', () => {
  const prev = { seen: true, ticket: 'live', legs: [{ id: 'a', state: 'live' }], sent: [] };
  const plan = planAlerts({
    prev,
    job: 'missing',
    grade: grade([{ id: 'a', state: 'won', who: 'Brad Holm', label: 'Chiefs ML' }], 'cashed'),
    week: 9,
    now: MON,
  });
  assert.deepEqual(plan.alerts, []);
  assert.equal(plan.snapshot.legs[0].state, 'live');
  assert.equal(plan.snapshot.ticket, 'live');
});

test('gradeChanged and firstKick follow the graded legs', () => {
  const a = grade([{ id: 'a', state: 'live', gameDate: '2026-11-15T18:00:00Z' }], 'live');
  const b = grade([{ id: 'a', state: 'won', gameDate: '2026-11-15T18:00:00Z' }], 'cashed');
  assert.equal(gradeChanged(null, a), true);
  assert.equal(gradeChanged(a, a), false);
  assert.equal(gradeChanged(a, b), true);
  assert.equal(firstKick(a), Date.parse('2026-11-15T18:00:00Z'));
  assert.equal(firstKick(grade([], 'open')), null);
});

test('reminder week is the open pick week, even when that week has no ticket yet', () => {
  const settled = { week: 9, legs: Array.from({ length: 11 }, (_, i) => ({ id: 'l' + i, type: 'ml', result: 'win', who: 'Brad Holm' })) };
  assert.equal(targetWeek([settled], { job: 'missing' }).number, 10);
  assert.equal(targetWeek([settled], { job: 'missing' }).record, null);
  assert.equal(targetWeek([settled], { job: 'grade' }).number, 9);
  assert.equal(targetWeek([settled], { job: 'missing', nfl: { active: 11 } }).number, 11);
  const open = { week: 10, legs: [{ id: 'a', type: 'tbd', result: 'unknown', who: 'Brad Holm' }], pendingTicket: true };
  assert.equal(targetWeek([settled, open], { job: 'missing' }).number, 10);
});

test('a claim is won only when the write returns the row', () => {
  assert.equal(claimAccepted({ ok: true, data: [{ version: 2 }] }), true);
  assert.equal(claimAccepted({ ok: true, data: [] }), false);
  assert.equal(claimAccepted({ ok: false, data: [{ version: 2 }] }), false);
});

function http(data, status = 200) {
  const body = JSON.stringify(data);
  return { ok: status >= 200 && status < 300, status, async json() { return data; }, async text() { return body; } };
}

const READY = {
  SUPABASE_SERVICE_ROLE_KEY: 'srv',
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  VAPID_SUBJECT: 'mailto:h@example.com',
};

function settledSeason() {
  const legs = Array.from({ length: 11 }, (_, i) => ({
    season: 2026, week: 9, pos: i, leg_id: 'l' + i, who: 'Brad Holm', label: 'ML', type: 'ml', status: 'won', game: ['BUF', 'MIN'],
  }));
  return { ticket: [{ season: 2026, week: 9, stake: 10, state: 'settled' }], legs };
}

test('Thursday reminder checks the open week with no ticket, and a lost claim does not send', async () => {
  const season = settledSeason();
  const sent = [];
  const calls = [];
  const webpush = { setVapidDetails() {}, async sendNotification(sub) { sent.push(sub.endpoint); } };
  const fetchImpl = async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    calls.push(method + ' ' + u);
    if (u.includes('site.api.espn.com')) throw new Error('clock down');
    if (u.includes('/holm_tickets')) return http(season.ticket);
    if (u.includes('/holm_legs')) return http(season.legs);
    if (u.includes('/holm_parlay_picks')) return http([]);
    if (u.includes('/holm_push_state') && method === 'GET') return http([]);
    if (u.includes('/holm_push_state')) return http([{ version: 1 }]);
    if (u.includes('/holm_push_subscriptions')) return http([{ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' }]);
    return http([]);
  };
  const out = await runSweep({ env: READY, fetchImpl, webpush, now: THU, job: 'missing' });
  assert.equal(out.week, 10);
  assert.ok(out.kinds.includes('picks-missing'));
  assert.equal(sent.length > 0, true);
  assert.ok(calls.some((c) => c.includes('/holm_parlay_picks') && c.includes('week=eq.10')));
  assert.equal(calls.some((c) => c.includes('/holm_parlay_picks') && c.includes('week=eq.9')), false);
  const claim = calls.find((c) => c.startsWith('POST') && c.includes('/holm_push_state'));
  assert.ok(claim);

  sent.length = 0;
  const lost = await runSweep({
    env: READY,
    webpush,
    now: THU,
    job: 'missing',
    fetchImpl: async (url, opts) => {
      const u = String(url);
      const method = (opts && opts.method) || 'GET';
      if (u.includes('site.api.espn.com')) throw new Error('clock down');
      if (u.includes('/holm_tickets')) return http(season.ticket);
      if (u.includes('/holm_legs')) return http(season.legs);
      if (u.includes('/holm_parlay_picks')) return http([]);
      if (u.includes('/holm_push_state') && method === 'GET') return http([]);
      if (u.includes('/holm_push_state')) return http([]);
      if (u.includes('/holm_push_subscriptions')) return http([{ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' }]);
      return http([]);
    },
  });
  assert.equal(lost.skipped, 'claimed');
  assert.equal(sent.length, 0);
});

test('sweeps require the cron secret and a wrong or missing one never matches', () => {
  assert.equal(cronAuthorized('', {}), false);
  assert.equal(cronAuthorized('Bearer secret', {}), false);
  assert.equal(cronAuthorized('Bearer no', { CRON_SECRET: 'secret' }), false);
  assert.equal(cronAuthorized('Bearer secret', { CRON_SECRET: 'secret' }), true);
  assert.equal(cronAuthorized('Bearer other', { PUSH_CRON_SECRET: 'other' }), true);
  assert.equal(secretMatch('a', 'ab'), false);
  assert.equal(secretMatch('', 'a'), false);
  assert.equal(subscriptionRoom(SUBSCRIPTION_CAP, false), false);
  assert.equal(subscriptionRoom(SUBSCRIPTION_CAP - 1, false), true);
  assert.equal(subscriptionRoom(SUBSCRIPTION_CAP, true), true);
});

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    send(s) { this.body = JSON.parse(s); return this; },
  };
}

test('the push route refuses an anonymous sweep and does not call the network', async () => {
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.PUSH_CRON_SECRET;
  let called = false;
  const orig = globalThis.fetch;
  globalThis.fetch = () => { called = true; throw new Error('network'); };
  try {
    const denied = mockRes();
    await pushHandler({ method: 'GET', query: { job: 'grade' }, headers: {}, body: {} }, denied);
    assert.equal(denied.statusCode, 401);
    assert.match(denied.body.error, /cron secret/);
    const post = mockRes();
    await pushHandler({ method: 'POST', query: {}, headers: {}, body: { op: 'sweep' } }, post);
    assert.equal(post.statusCode, 401);
    process.env.CRON_SECRET = 'secret';
    const wrong = mockRes();
    await pushHandler({ method: 'GET', query: { job: 'missing' }, headers: { authorization: 'Bearer nope' }, body: {} }, wrong);
    assert.equal(wrong.statusCode, 401);
    const info = mockRes();
    await pushHandler({ method: 'GET', query: {}, headers: {}, body: {} }, info);
    assert.equal(info.statusCode, 200);
    assert.equal(info.body.sweeps, true);
    assert.equal(JSON.stringify(info.body).includes('secret'), false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = orig;
    if (saved == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  }
});

test('sweep refuses to run without the service key, and does not call the network', async () => {
  let called = false;
  const out = await runSweep({ env: {}, fetchImpl: () => { called = true; throw new Error('no'); } });
  assert.equal(out.skipped, 'SUPABASE_SERVICE_ROLE_KEY not set');
  assert.equal(called, false);
  const partial = await runSweep({ env: { SUPABASE_SERVICE_ROLE_KEY: 'x' }, fetchImpl: () => { called = true; throw new Error('no'); } });
  assert.equal(partial.skipped, 'vapid not set');
  assert.equal(called, false);
});

test('shell: four tabs, old pages stay, manifest and the push migration do not touch the archive', () => {
  const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const nav = read('components/BottomNav.js');
  for (const label of ['Week', 'Standings', 'Stats', 'More']) assert.match(nav, new RegExp(label));
  const routes = read('components/LeagueProvider.js');
  assert.match(routes, /HOME_PATH = '\/week'/);
  for (const p of ['/week', '/standings', '/stats', '/more', '/pick', '/league', '/bets', '/chat', '/commissioner']) {
    assert.match(routes, new RegExp(p.replace('/', '\\/')));
  }
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/week');
  assert.equal(manifest.background_color, '#070d14');
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
  const sw = read('public/sw.js');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /\/api\/weeks/);
  const sql = read('supabase/migrations/012_web_push.sql');
  assert.match(sql, /create table if not exists public\.holm_push_subscriptions/);
  assert.match(sql, /create table if not exists public\.holm_push_state/);
  assert.match(sql, /grant select, insert, update, delete on public\.holm_push_subscriptions to service_role/);
  assert.match(sql, /version integer not null default 0/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /holm_parlay_weeks/);
  const server = (read('lib/push-run.mjs') + read('pages/api/push.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(server, /holm_parlay_weeks/);
});
