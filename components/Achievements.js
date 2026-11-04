'use client';
import { useState } from 'react';
import { SmallSample } from './InfoTip';
import { whoLabel } from '../lib/ident.mjs';
import { computeAchievements } from '../lib/achievements.mjs';

/** Badges from recorded picks only. The two records (season tape, weekly bets file) are never
 *  mixed: one segmented switch picks which one you are looking at. */
export default function Achievements({ groups }) {
  const [pick, setPick] = useState(0);
  const g = groups[Math.min(pick, groups.length - 1)];
  const badges = g ? computeAchievements(g.legs, g.source) : [];
  return (
    <section className="card">
      <div className="card__head">
        <h2>Parlay achievements</h2>
        {groups.length > 1 ? (
          <div className="seg" role="group" aria-label="Which record">
            {groups.map((x, i) => (
              <button key={x.source} type="button" className="seg__btn" aria-pressed={i === pick} onClick={() => setPick(i)}>{x.title}</button>))}
          </div>
        ) : <span className="sub">{g ? g.title : 'Decided picks only'}</span>}
      </div>
      <div className="card__body">
        {badges.length ? (
          <div className="badges">{badges.map((b) => (
            <article key={b.id} className="badge" title={b.what}>
              <div className="badge__name">{b.name}</div>
              <div className="badge__who">{b.who.map((w) => whoLabel(w)).join(', ')}</div>
              <div className="badge__detail">{b.detail} {b.smallSample ? <SmallSample n={b.n} /> : null}</div>
            </article>))}</div>
        ) : <p className="muted">No badges yet.</p>}
        <p className="muted badges__note">Decided picks only.</p>
      </div>
    </section>
  );
}
