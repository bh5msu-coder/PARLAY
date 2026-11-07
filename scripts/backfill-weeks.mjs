#!/usr/bin/env node
// Copy the weeks the site shows today into holm_tickets + holm_legs (migration 007).
//
// The site shows every week in data/bets.json, plus each Supabase holm_parlay_weeks row whose week is
// not in the file (the file wins for a week in both). This script applies the same rule, maps each
// week with lib/week-rows.mjs and prints SQL. It never runs anything itself.
//
//   node scripts/backfill-weeks.mjs --supabase rows.json --overwrite-db   # SQL to stdout, summary to stderr
//
// Since 2026-11-07 the site reads weeks FROM these tables: they are the record and data/bets.json is the
// archive. Running this SQL now would overwrite commissioner saves and auto-commits with the archive,
// so the script refuses unless --overwrite-db is passed.
//
// rows.json: [{ "week": 9, "data": { ... } }, ...] exported from holm_parlay_weeks (season 2026, week > 0).
// The SQL is idempotent: re-running it rewrites the same rows, and the audit trigger skips no-op saves.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { weekToRows } from '../lib/week-rows.mjs';

const SEASON = 2026;
const TICKET_COLS = ['season', 'week', 'state', 'evidence', 'stake', 'odds', 'to_pay', 'book', 'placed_by', 'payer', 'payers', 'payer_note', 'results', 'dates', 'note', 'groups', 'overrides', 'locked', 'submissions', 'extra'];
const LEG_COLS = ['season', 'week', 'leg_id', 'pos', 'who', 'label', 'type', 'game', 'team', 'side', 'line', 'player', 'stat', 'odds', 'sgp_group', 'status', 'confidence', 'source', 'detail', 'game_date', 'period', 'note', 'extra'];
const TAG = '$wk$';

/** The weeks the site shows: the file's, plus Supabase weeks the file does not have. */
export function siteWeeks(file, supabaseRows) {
  const weeks = (file.weeks || []).map((w) => Object.assign({}, w, { week: Number(w.week) }));
  const inFile = new Set(weeks.map((w) => w.week));
  for (const r of supabaseRows || []) {
    const n = Number(r.week);
    if (n > 0 && !inFile.has(n)) weeks.push(Object.assign({}, r.data, { week: n }));
  }
  return weeks.sort((a, b) => a.week - b.week);
}

// Null fields are left out: jsonb_populate_recordset reads a missing key as null anyway.
const dropNulls = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)));
const lit = (v) => {
  const s = JSON.stringify(Array.isArray(v) ? dropNulls(v) : v);
  if (s.includes(TAG)) throw new Error('data contains the SQL quote tag ' + TAG);
  return TAG + s + TAG + '::jsonb';
};
const upd = (cols, key) => cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');

export function backfillSql(weeks, season = SEASON) {
  const tickets = [];
  const legs = [];
  for (const week of weeks) {
    const rows = weekToRows(season, week);
    tickets.push(rows.ticket);
    legs.push(...rows.legs);
  }
  const nums = weeks.map((w) => Number(w.week)).join(', ');
  const keep = legs.map((l) => `(${l.week}, '${l.leg_id.replace(/'/g, "''")}')`).join(', ');
  return [
    'begin;',
    `-- Weeks ${nums}: ${tickets.length} tickets, ${legs.length} legs`,
    `insert into public.holm_tickets (${TICKET_COLS.join(', ')})
  select ${TICKET_COLS.join(', ')} from jsonb_populate_recordset(null::public.holm_tickets, ${lit(tickets)})
  on conflict (season, week) do update set ${upd(TICKET_COLS, ['season', 'week'])}, updated_at = now();`,
    `delete from public.holm_legs where season = ${season} and week in (${nums})${keep ? ` and (week, leg_id) not in (${keep})` : ''};`,
    `insert into public.holm_legs (${LEG_COLS.join(', ')})
  select ${LEG_COLS.join(', ')} from jsonb_populate_recordset(null::public.holm_legs, ${lit(legs)})
  on conflict (season, week, leg_id) do update set ${upd(LEG_COLS, ['season', 'week', 'leg_id'])}, synced_at = now();`,
    'commit;',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--overwrite-db')) {
    console.error('Refusing: holm_tickets + holm_legs are the record now (since 2026-11-07). This SQL would overwrite them with data/bets.json. Pass --overwrite-db only if that is what you want.');
    process.exit(2);
  }
  const at = process.argv.indexOf('--supabase');
  if (at < 0 || !process.argv[at + 1]) { console.error('usage: node scripts/backfill-weeks.mjs --supabase rows.json'); process.exit(2); }
  const file = JSON.parse(readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8'));
  const rows = JSON.parse(readFileSync(process.argv[at + 1], 'utf8'));
  const weeks = siteWeeks(file, rows);
  console.error('Weeks: ' + weeks.map((w) => `${w.week} (${(w.legs || []).length} legs, ${w.source === undefined && (file.weeks || []).some((f) => Number(f.week) === w.week) ? 'file' : 'supabase'})`).join(', '));
  process.stdout.write(backfillSql(weeks) + '\n');
}
