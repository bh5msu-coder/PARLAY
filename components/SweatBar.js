'use client';
import { sweatChips, sweatOn } from '../lib/sweat.mjs';
import { whoLabel } from '../lib/ident.mjs';

/** Game-day sweat bar: every leg as a chip that turns green or red as it settles. Pinned under the
 *  top on phones. Only shows once games have started and the ticket still has legs to play. */
export default function SweatBar({ graded }) {
  if (!sweatOn(graded)) return null;
  const chips = sweatChips(graded, whoLabel);
  const lost = chips.some((c) => c.tone === 'loss');
  return (
    <a className={'sweat' + (lost ? ' sweat--dead' : '')} href="#legs" aria-label="Live sweat: every leg's status">
      <span className="sweat__title">{lost ? 'Ticket busted · still watching' : 'Sweat mode'}</span>
      <span className="sweat__chips">
        {chips.map((c, i) => (
          <span key={i} className={'sweatchip sweatchip--' + c.tone + (c.trend ? ' sweatchip--' + c.trend : '')} title={c.detail || c.label}>
            <b>{c.who}</b><span>{c.label}</span>
          </span>
        ))}
      </span>
    </a>
  );
}
