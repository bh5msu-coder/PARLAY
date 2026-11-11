// Serves the season archive (data/bets.json) at its historical URL, read-only. The site no longer reads
// it: weeks are recorded in the league database (holm_tickets + holm_legs, through /api/weeks).
import bets from '../../../data/bets.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(bets, { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}
