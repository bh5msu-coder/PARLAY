// Serves data/bets.json at its historical URL. data/bets.json is the only record that adds or
// grades a week; this route only reads it (bundled at build, so edits ship with a deploy).
import bets from '../../../data/bets.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(bets, { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}
