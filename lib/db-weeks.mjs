/** Read the season's weeks from holm_tickets + holm_legs (the record since 2026-11-07) with the public key.
 *  Used by /api/weeks and the Week page share image. Both tables are readable by anyone. */
import { weeksFromRows } from './week-rows.mjs';

export const DB_URL = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_URL) || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
export const DB_KEY = (typeof process !== 'undefined' && process.env && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY)) || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';

async function rows(path, f) {
  const r = await f(`${DB_URL}/rest/v1/${path}`, { headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY } });
  if (!r.ok) throw Object.assign(new Error(`${path.split('?')[0]} read failed (${r.status})`), { status: r.status });
  return r.json();
}

export async function loadDbWeeks(season, fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const [tickets, legs] = await Promise.all([
    rows(`holm_tickets?season=eq.${season}&select=*&order=week.asc`, f),
    rows(`holm_legs?season=eq.${season}&select=*&order=week.asc,pos.asc`, f),
  ]);
  return weeksFromRows(tickets, legs);
}
