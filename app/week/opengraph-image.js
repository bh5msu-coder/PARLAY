import { ImageResponse } from 'next/og';
import bets from '../../data/bets.json';
import { normalizeFile } from '../../lib/weeks.mjs';
import { ident } from '../../lib/ident.mjs';
import { weekCardFacts } from '../../lib/share-card.mjs';
import { cardElement, ogFonts, OG_SIZE } from '../../components/og/card';

export const alt = 'This week’s parlay';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const weeks = normalizeFile(bets).weeks;
  const week = weeks.slice().sort((a, b) => b.week - a.week)[0];
  const f = weekCardFacts(week, (n) => ident.nick(n) || n);
  return new ImageResponse(await cardElement({
    eyebrow: 'THE WEEKLY PARLAY',
    title: f ? `Week ${f.week} parlay` : 'The weekly parlay',
    status: f && f.status,
    line: f && f.line,
    stats: f ? [{ label: 'ODDS', value: f.odds }, { label: 'PAYS', value: f.pays }] : [],
  }), { ...size, fonts: await ogFonts() });
}
