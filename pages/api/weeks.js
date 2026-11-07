/** GET /api/weeks: the season's weeks from holm_tickets + holm_legs, in the shape the pages use
 *  (lib/week-rows.mjs). Read-only, public key. Every page reads its weeks from here (lib/league-store.mjs);
 *  if this fails, the store falls back to data/bets.json + holm_parlay_weeks. */
import { loadDbWeeks } from '../../lib/db-weeks.mjs';

export { loadDbWeeks };

const SEASON = 2026;

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
