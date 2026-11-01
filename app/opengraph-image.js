import { ImageResponse } from 'next/og';
import lore from '../league-lore.json';
import { cardElement, ogFonts, OG_SIZE } from '../components/og/card';
import { ident } from '../lib/ident.mjs';

export const alt = 'Our Holm League';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const last = (lore.champions || []).slice().sort((a, b) => b.year - a.year)[0];
  return new ImageResponse(await cardElement({
    eyebrow: `EST. 2010 · ${lore.seasonCount || 16} SEASONS`,
    title: 'League, chat and the weekly parlay',
    stats: [{ label: 'REIGNING CHAMP', value: last ? `${ident.nick(last.owner) || last.owner} · ${last.year}` : '' }],
  }), { ...size, fonts: await ogFonts() });
}
