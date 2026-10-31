// Serves league-lore.json (read-only) at its historical URL.
import lore from '../../league-lore.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(lore, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
}
