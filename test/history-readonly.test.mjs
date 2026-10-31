import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { deepFreeze, historyLegs, historyTickets, loadHistory, resetHistoryCache } from '../lib/history.mjs';
import { calcParlayStats } from '../lib/history-stats.mjs';
import { selectionStats, hitRateOverTime, typePerformance, ticketTotals } from '../lib/stats.mjs';
import { reconcile } from '../lib/reconcile.mjs';
import { normalizeFile } from '../lib/weeks.mjs';

const betsPath = new URL('../data/bets.json', import.meta.url);
const historyText = fs.readFileSync(new URL('../parlay-history.json', import.meta.url), 'utf8');

test('the Bets data load is a single GET of parlay-history.json, and the result is frozen', async () => {
  resetHistoryCache();
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    return { ok: true, async json() { return JSON.parse(historyText); } };
  };
  const h = await loadHistory(fakeFetch);
  await loadHistory(fakeFetch);
  assert.deepEqual(calls, [{ url: '/parlay-history.json', method: 'GET', body: undefined }]);
  assert.ok(Object.isFrozen(h) && Object.isFrozen(h.parlays[0]) && Object.isFrozen(h.parlays[0].legs[0]));
  assert.throws(() => { 'use strict'; h.parlays[0].legs[0].result = 'win'; }, TypeError);
  resetHistoryCache();
});

test('computing every Bets stat from history leaves data/bets.json and the history unchanged', () => {
  const before = fs.readFileSync(betsPath, 'utf8');
  const weekly = normalizeFile(JSON.parse(before));
  const weeklySnap = JSON.stringify(weekly);
  const history = deepFreeze(JSON.parse(historyText));
  calcParlayStats(history, (n) => n);
  selectionStats(historyLegs(history));
  hitRateOverTime(historyLegs(history));
  typePerformance(historyLegs(history));
  ticketTotals(historyTickets(history));
  reconcile(weekly, history);
  assert.equal(JSON.stringify(weekly), weeklySnap, 'weekly data in memory unchanged');
  assert.equal(fs.readFileSync(betsPath, 'utf8'), before, 'data/bets.json on disk unchanged');
  assert.equal(JSON.stringify(history), JSON.stringify(JSON.parse(historyText)));
  const w6 = weekly.weeks.find((w) => w.week === 6);
  assert.ok(w6.legs.every((l) => l.result === 'unknown'), 'history grades never reach weekly legs');
});

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const WRITE_PATTERNS = [/\.rpc\(/, /\bsb\./, /method:\s*['"](POST|PUT|PATCH|DELETE)/i, /holm_parlay_/, /createSupabase/, /PICK_API/, /SUPABASE_/, /writeFile/, /\.loadData\(/];

test('Bets code paths contain no Supabase or write calls', () => {
  for (const f of ['../components/BetsView.js', '../lib/history.mjs', '../lib/history-stats.mjs', '../lib/stats.mjs', '../lib/reconcile.mjs', '../components/Dashboard.js', '../app/parlay-history.json/route.js']) {
    const src = strip(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
    for (const re of WRITE_PATTERNS) assert.doesNotMatch(src, re, `${f} must not match ${re}`);
  }
});

test('the parlay-history.json route only answers GET', async () => {
  const route = fs.readFileSync(new URL('../app/parlay-history.json/route.js', import.meta.url), 'utf8');
  assert.match(route, /export function GET/);
  assert.doesNotMatch(route, /export (async )?function (POST|PUT|PATCH|DELETE)/);
});

test('no Supabase SQL accepts history data', () => {
  for (const f of ['../supabase/picks.sql', '../supabase/migrations/002_expanded_model.sql']) {
    const sql = fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /history/i, f);
  }
});
