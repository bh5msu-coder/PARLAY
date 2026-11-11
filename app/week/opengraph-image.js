import { ImageResponse } from 'next/og';
import { loadDbWeeks } from '../../lib/db-weeks.mjs';
import { ident } from '../../lib/ident.mjs';
import { weekCardFacts } from '../../lib/share-card.mjs';
import { cardElement, ogFonts, OG_SIZE } from '../../components/og/card';

export const alt = 'This week’s parlay';
export const size = OG_SIZE;
export const contentType = 'image/png';
// Weeks live in the database now, so the card is rebuilt every 5 minutes instead of once per deploy.
export const revalidate = 300;

export default async function Image() {
  // The database is the record. If it can't be read, the card says only "The weekly parlay".
  let weeks;
  try { weeks = await loadDbWeeks(2026); } catch (e) { weeks = []; }
  const week = (weeks || []).slice().sort((a, b) => b.week - a.week)[0];
  const f = week ? weekCardFacts(week, (n) => ident.nick(n) || n) : null;
  return new ImageResponse(await cardElement({
    eyebrow: 'THE WEEKLY PARLAY',
    title: f ? `Week ${f.week} parlay` : 'The weekly parlay',
    status: f && f.status,
    line: f && f.line,
    stats: f ? [{ label: 'ODDS', value: f.odds }, { label: 'PAYS', value: f.pays }] : [],
  }), { ...size, fonts: await ogFonts() });
}
