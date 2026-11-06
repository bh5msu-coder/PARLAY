'use client';
import { movedPicks } from '../lib/line-move.mjs';
import { whoLabel } from '../lib/ident.mjs';

/** Week page (picks open): saved picks whose line or price has moved on the board since they were saved. */
export default function LineAlerts({ rows, games }) {
  const moved = movedPicks(rows, games);
  const props = (rows || []).filter((r) => r.leg && r.leg.type === 'player').length;
  if (!moved.length) return null;
  return (
    <section className="card card--alert" aria-live="polite">
      <div className="card__head"><h2>Line moves</h2><span className="sub">{`vs ${(games.find((g) => g.lines) || { lines: {} }).lines.book || 'the board'} now`}{props ? ` · ${props} prop${props === 1 ? '' : 's'} not on the feed` : ''}</span></div>
      <ul className="moves">
        {moved.map((m) => (
          <li key={m.who}><b>{whoLabel(m.who)}</b> <span>{m.label}</span> <span className="moves__text">{m.move.text}</span></li>
        ))}
      </ul>
    </section>
  );
}
