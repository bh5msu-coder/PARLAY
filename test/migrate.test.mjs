import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { migrateBets, migrateText } from '../scripts/migrate-bets-v2.mjs';
import { reconcile } from '../lib/reconcile.mjs';
import { normalizeFile } from '../lib/weeks.mjs';

const text = fs.readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8');
const historyText = fs.readFileSync(new URL('../parlay-history.json', import.meta.url), 'utf8');

/** data/bets.json as it was before schemaVersion 2 (the migration's additions stripped). */
function v1() {
  const f = JSON.parse(text);
  delete f.schemaVersion;
  for (const w of f.weeks) { delete w.ticket; delete w.contributions; delete w.payouts; }
  return f;
}

test('data/bets.json is migrated and the migration is idempotent', () => {
  assert.equal(JSON.parse(text).schemaVersion, 2);
  assert.equal(migrateText(text), text, 'running again changes nothing');
});

test('migration only adds fields: legs, results, stakes and payers are untouched', () => {
  const before = v1();
  const after = migrateBets(before);
  assert.equal(after.weeks.length, before.weeks.length);
  after.weeks.forEach((w, i) => {
    const b = before.weeks[i];
    for (const k of Object.keys(b)) assert.deepEqual(w[k], b[k], `week ${b.week} ${k}`);
    assert.deepEqual(Object.keys(w).filter((k) => !(k in b)).sort(), ['contributions', 'payouts', 'ticket']);
    assert.deepEqual(w.contributions, []);
    assert.deepEqual(w.payouts, []);
  });
});

test('text migration of the v1 file reproduces the committed file', () => {
  // Weeks 2 and 4 were added after the migration, already on schema 2; the round trip covers 5 to 8.
  const f = JSON.parse(text);
  const added = f.weeks.filter((w) => w.week < 5).map((w) => w.week);
  assert.deepEqual(added, [2, 4]);
  const migrated = text.replace(/\n {4}\{\n {6}"week": [24],[\s\S]*?\n {4}\},(?=\n {4}\{\n {6}"week": )/g, '');
  assert.deepEqual(JSON.parse(migrated).weeks.map((w) => w.week), [5, 6, 7, 8]);
  const v1Text = migrated.replace(/^  "schemaVersion": 2,\n/m, '').replace(/^ {6}"ticket": .*\n {6}"contributions": \[\],\n {6}"payouts": \[\],\n/gm, '');
  const before = v1();
  before.weeks = before.weeks.filter((w) => w.week >= 5);
  assert.deepEqual(JSON.parse(v1Text), before);
  assert.equal(migrateText(v1Text), migrated);
});

test('the migration never reads parlay-history.json', () => {
  const src = fs.readFileSync(new URL('../scripts/migrate-bets-v2.mjs', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /parlay-history/);
});

test('reconcile reports the $70 vs $60 stake gap without changing either source', () => {
  const weekly = normalizeFile(JSON.parse(text));
  const history = JSON.parse(historyText);
  const snapW = JSON.stringify(weekly);
  const r = reconcile(weekly, history);
  assert.equal(JSON.stringify(weekly), snapW, 'weekly data not mutated');
  assert.equal(JSON.stringify(history), JSON.stringify(JSON.parse(historyText)), 'history not mutated');
  const total = r.items.find((i) => i.kind === 'stake-total');
  assert.equal(total.weekly, 70);
  assert.equal(total.history, 60);
  const kinds = r.items.filter((i) => i.severity !== 'wording').map((i) => `${i.kind}:${i.week}`);
  assert.deepEqual(kinds, ['stake-total:null', 'result:6', 'result:7', 'leg-pick:8']);
  const w6 = weekly.weeks.find((w) => w.week === 6);
  assert.ok(w6.legs.every((l) => l.result === 'unknown'), 'history grades are not copied into the weekly file');
});
