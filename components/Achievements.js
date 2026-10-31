'use client';
import { SmallSample } from './InfoTip';
import { whoLabel } from '../lib/ident.mjs';
import { computeAchievements } from '../lib/achievements.mjs';

/** Badges from recorded picks only, grouped by source so the two records are never mixed. */
export default function Achievements({ groups }) {
  return (
    <section className="card">
      <div className="card__head"><h2>Parlay achievements</h2><span className="sub">From recorded picks only · open and unknown picks never count</span></div>
      <div className="card__body">
        {groups.map((g) => {
          const badges = computeAchievements(g.legs, g.source);
          return (
            <div key={g.source} className="badges-group">
              <h3 className="h3">{g.title} <span className="muted">{'· ' + g.source}</span></h3>
              {badges.length ? (
                <div className="badges">{badges.map((b) => (
                  <article key={b.id} className="badge" title={'Reads: ' + b.fields.join(', ')}>
                    <div className="badge__name">{b.name}</div>
                    <div className="badge__who">{b.who.map((w) => whoLabel(w)).join(', ')}</div>
                    <div className="badge__detail">{b.detail} {b.smallSample ? <SmallSample n={b.n} /> : null}</div>
                    <div className="badge__what muted">{b.what}</div>
                  </article>))}</div>
              ) : <p className="muted">No badges yet — not enough decided picks in this record.</p>}
            </div>);
        })}
      </div>
    </section>
  );
}
