import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etParts, firstKick, gradeChanged, inMissingWindow, normalizeSubscription, planAlerts, pushReady, pushStatus } from '../lib/push-events.mjs';
import { readSnapshot, writeSnapshot } from '../lib/offline-cache.mjs';
import { runSweep } from '../lib/push-run.mjs';

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
  const sub = normalizeSubscription({ who: 'Brad', subscription: { endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } } });
  assert.equal(sub.row.who, 'Brad');
  assert.equal(normalizeSubscription({ subscription: { endpoint: 'http://insecure', keys: { p256dh: 'p', auth: 'a' } } }).error, 'Need an https push endpoint');
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
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /holm_parlay_weeks/);
  const server = (read('lib/push-run.mjs') + read('pages/api/push.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(server, /holm_parlay_weeks/);
});
