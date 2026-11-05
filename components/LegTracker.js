'use client';
import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge } from './ui';
import { ident } from '../lib/ident.mjs';
import { trackerCounts, trackerRows } from '../lib/leg-tracker.mjs';

const TREND_TEXT = { up: 'looking good', down: 'in trouble' };

/** Every leg on this week's ticket, live ones first, right on the League hero. Updates whenever the
 *  store re-grades (the scheduled score refresh during games). */
export default function LegTracker({ graded, you }) {
  const [all, setAll] = useState(false);
  const rows = trackerRows(graded, you);
  if (!rows.length) return null;
  const c = trackerCounts(rows);
  const limit = Math.max(4, c.live);
  const shown = all ? rows : rows.slice(0, limit);
  const summary = [
    c.live ? `${c.live} live` : '',
    c.won ? `${c.won} hit` : '',
    c.lost ? `${c.lost} lost` : '',
    c.push ? `${c.push} push` : '',
    c.open ? `${c.open} to play` : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="track">
      <div className="track__head">
        <span className="label">{c.live ? <><span className="track__pulse" aria-hidden="true" />Live legs</> : 'Legs'}</span>
        <span className="muted track__sum">{summary}</span>
      </div>
      <ol className="track__list">{shown.map((r) => {
        const extra = r.current && !r.detail.includes(r.current) ? r.current : '';
        return (
          <li key={r.i} className={'track__row' + (r.mine ? ' track__row--me' : '')}>
            <span className={'track__dot track__dot--' + r.state + (r.trend ? ' track__dot--' + r.trend : '')} aria-hidden="true" />
            <span className="track__who">{ident.nick(r.who)}</span>
            <span className="track__pick">{r.label}</span>
            <span className="track__detail">
              {[r.detail, extra].filter(Boolean).join(' · ')}
              {r.trend ? <span className={'track__trend track__trend--' + r.trend}>{' · ' + TREND_TEXT[r.trend]}</span> : null}
            </span>
            <span className="track__state"><StatusBadge state={r.state} /></span>
          </li>);
      })}</ol>
      <div className="track__foot">
        {rows.length > shown.length ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(true)}>{`Show all ${rows.length}`}</button>
          : all && rows.length > limit ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(false)}>Show fewer</button> : null}
        <Link className="btn btn--ghost btn--sm" href="/week#legs">Full board</Link>
      </div>
    </div>
  );
}
