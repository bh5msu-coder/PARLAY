/** GET /api/weeks: the season's weeks from holm_tickets + holm_legs (migration 007), in the same shape
 *  the pages already use (lib/week-rows.mjs). Read-only, public key: both tables are readable by anyone,
 *  as holm_parlay_weeks always was. The site does not read from here by default yet; the Commissioner
 *  page compares it with what the site shows, and a phone can opt in to read from it (see league-store). */
import { weeksFromRows } from '../../lib/week-rows.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';
const SEASON = 2026;

async function rows(path, fetchImpl) {
  const r = await fetchImpl(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
  if (!r.ok) throw Object.assign(new Error(`${path.split('?')[0]} read failed (${r.status})`), { status: r.status });
  return r.json();
}

/** Exported for tests: the weeks for a season, read with the given fetch. */
export async function loadDbWeeks(season, fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const [tickets, legs] = await Promise.all([
    rows(`holm_tickets?season=eq.${season}&select=*&order=week.asc`, f),
    rows(`holm_legs?season=eq.${season}&select=*&order=week.asc,pos.asc`, f),
  ]);
  return weeksFromRows(tickets, legs);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  try {
    const weeks = await loadDbWeeks(SEASON);
    res.status(200).json({ season: SEASON, source: 'db', weeks });
  } catch (e) {
    res.status(502).json({ error: e.message || 'database read failed' });
  }
}
