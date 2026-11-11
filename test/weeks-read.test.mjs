import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { weekToRows, weeksFromRows, compareWeekSets } from '../lib/week-rows.mjs';
import { loadDbWeeks } from '../pages/api/weeks.js';
import handler from '../pages/api/weeks.js';
import { createLeagueStore } from '../lib/league-store.mjs';

const file = JSON.parse(readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8'));
const asDb = (weeks) => {
  const tickets = [];
  const legs = [];
  for (const w of weeks) { const r = weekToRows(2026, w); tickets.push(r.ticket); legs.push(...r.legs); }
  return JSON.parse(JSON.stringify({ tickets: tickets.reverse(), legs: legs.reverse() }));
};

test('weeks rebuilt from all of a season\'s rows match the file, week by week', () => {
  const { tickets, legs } = asDb(file.weeks);
  const weeks = weeksFromRows(tickets, legs);
  assert.deepEqual(weeks.map((w) => w.week), file.weeks.map((w) => Number(w.week)));
  assert.deepEqual(compareWeekSets(file.weeks, weeks), []);
});

test('the comparison names a week the database lacks, has extra, or holds differently', () => {
  const { tickets, legs } = asDb(file.weeks);
  const db = weeksFromRows(tickets, legs);
  const w8 = db.find((w) => w.week === 8);
  w8.legs[0] = Object.assign({}, w8.legs[0], { label: 'changed' });
  w8.payer = 'DJ Dangerous';
  const diffs = compareWeekSets(file.weeks.filter((w) => w.week !== 2), db.concat([{ week: 9, legs: [] }]).filter((w) => w.week !== 4));
  assert.deepEqual(diffs.map((d) => [d.week, d.kind]), [[2, 'missing-site'], [4, 'missing-db'], [8, 'differs'], [9, 'missing-site']]);
  const d8 = diffs.find((d) => d.week === 8);
  assert.deepEqual(d8.fields, ['payer']);
  assert.deepEqual(d8.legs, ['Adam Meltser']);
});

const okJson = (d, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, async json() { return d; } });

test('/api/weeks reads both tables with the public key and returns weeks; a failed read is a 502', async () => {
  const { tickets, legs } = asDb(file.weeks.slice(0, 2));
  const urls = [];
  const weeks = await loadDbWeeks(2026, async (u, o) => { urls.push([u, o.headers.apikey]); return okJson(u.includes('holm_tickets') ? tickets : legs); });
  assert.equal(weeks.length, 2);
  assert.ok(urls.every(([u, k]) => u.includes('season=eq.2026') && k.startsWith('sb_publishable_')));
  const prev = global.fetch;
  global.fetch = async () => okJson({ message: 'nope' }, 500);
  const res = { statusCode: 0, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(b) { this.body = b; return this; } };
  try { await handler({ method: 'GET' }, res); } finally { global.fetch = prev; }
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /holm_tickets read failed \(500\)/);
});

function storeWith(dbResponse) {
  const { tickets, legs } = asDb(file.weeks);
  const dbWeeks = weeksFromRows(tickets, legs);
  const urls = [];
  const store = createLeagueStore({ fetch: async (url) => {
    const u = String(url);
    urls.push(u);
    // A fresh copy per call, like a real fetch: the store tidies names in place after loading.
    if (u.includes('/api/weeks')) return dbResponse ? dbResponse(dbWeeks) : okJson({ weeks: JSON.parse(JSON.stringify(dbWeeks)) });
    if (u.includes('holm_settings')) return okJson([{ data: { leagueName: 'Our Holm League', nicknames: {} } }]);
    return okJson([]);
  } });
  store.urls = urls;
  return store;
}

test('the site reads weeks only from the database; the archive file and the old weeks table are never read', async () => {
  const store = storeWith();
  await store.loadData();
  assert.ok(store.state.weeks.length > 0);
  assert.ok(store.state.weeks.every((w) => w.source === 'db'));
  assert.deepEqual(store.state.weeks.map((w) => w.week), file.weeks.map((w) => Number(w.week)).sort((a, b) => a - b));
  assert.ok(!store.urls.some((u) => u.includes('bets.json') || u.includes('holm_parlay_weeks')), store.urls.join('\n'));
  assert.ok(store.urls.some((u) => u.includes('holm_settings')), 'settings come from holm_settings');
});

test('a failed weeks read stops the first load, and keeps what is on screen on a reload', async () => {
  let down = false;
  const store = storeWith((dbWeeks) => (down ? okJson({ error: 'down' }, 502) : okJson({ weeks: JSON.parse(JSON.stringify(dbWeeks)) })));
  await store.loadData();
  const shown = store.state.weeks.map((w) => w.week);
  down = true;
  await store.loadData();
  assert.deepEqual(store.state.weeks.map((w) => w.week), shown, 'last good copy stays');
  assert.match(store.state.weeksError, /down/);
  const fresh = storeWith(() => okJson({ error: 'down' }, 502));
  await assert.rejects(fresh.loadData(), /down/);
});
