#!/usr/bin/env node
/** Upgrade data/bets.json to schemaVersion 2. Idempotent and additive:
 *    - adds `schemaVersion: 2`
 *    - adds `ticket: {state, evidence}` to each week, from explicit evidence only (lib/model.mjs deriveTicket)
 *    - adds empty `contributions` and `payouts` arrays (nothing is invented)
 *  It never changes a leg, a result, a stake or a payer, and it never reads parlay-history.json.
 *
 *  Usage: node scripts/migrate-bets-v2.mjs [--check] [path/to/bets.json]
 *    --check  exit 1 if the file would change (for CI), without writing. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, toV2Week } from '../lib/model.mjs';

export function migrateBets(file) {
  const out = {};
  for (const [k, v] of Object.entries(file)) {
    if (k === 'weeks') continue;
    out[k] = v;
  }
  out.schemaVersion = SCHEMA_VERSION;
  out.weeks = (file.weeks || []).map((w) => {
    const v2 = toV2Week(w);
    // keep the original key order, then append the new keys
    const ordered = Object.assign({}, w);
    ordered.ticket = v2.ticket;
    ordered.contributions = v2.contributions;
    ordered.payouts = v2.payouts;
    return ordered;
  });
  return out;
}

/** Apply the migration as text insertions so the hand-formatted file keeps its layout and the diff
 *  shows only the added fields: `"schemaVersion"` after the opening brace, and each week's new keys
 *  right after its `"week": N,` line. The result is checked against migrateBets() before writing. */
export function migrateText(text) {
  const file = JSON.parse(text);
  const target = migrateBets(file);
  let out = text;
  if (file.schemaVersion !== SCHEMA_VERSION) {
    out = out.replace(/^\{\n/, '{\n  "schemaVersion": ' + SCHEMA_VERSION + ',\n');
  }
  for (const w of target.weeks) {
    const orig = (file.weeks || []).find((x) => x.week === w.week) || {};
    const add = [];
    if (!orig.ticket) add.push('"ticket": ' + JSON.stringify(w.ticket).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }'));
    if (!Array.isArray(orig.contributions)) add.push('"contributions": []');
    if (!Array.isArray(orig.payouts)) add.push('"payouts": []');
    if (!add.length) continue;
    const re = new RegExp('^(\\s*)"week": ' + w.week + ',\\n', 'm');
    const m = out.match(re);
    if (!m) throw new Error('Could not find week ' + w.week + ' in the file text');
    out = out.replace(re, m[0] + add.map((a) => m[1] + a + ',\n').join(''));
  }
  const check = JSON.parse(out);
  if (!sameJson(check, target)) throw new Error('Text migration does not match the model migration; refusing to write');
  return out;
}

function sameJson(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return sameJson(ka, kb) && ka.every((k) => sameJson(a[k], b[k]));
  }
  return a === b;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const target = args.find((a) => !a.startsWith('--')) || new URL('../data/bets.json', import.meta.url).pathname;
  const before = fs.readFileSync(target, 'utf8');
  const next = migrateText(before);
  if (next === before) { console.log('data/bets.json is already schemaVersion 2'); process.exit(0); }
  if (check) { console.error('data/bets.json needs migration: run node scripts/migrate-bets-v2.mjs'); process.exit(1); }
  fs.writeFileSync(target, next);
  console.log('Migrated ' + target + ' to schemaVersion 2');
}
