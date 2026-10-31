// Serves parlay-history.json (static, read-only) for the Bets tab. GET only: there is no write path,
// and nothing from this file is ever sent to Supabase or merged into data/bets.json.
import history from '../../parlay-history.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(history, { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}
