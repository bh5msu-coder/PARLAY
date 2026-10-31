'use client';
import { smackFeed } from '../lib/smack.mjs';

/** Feed of needles built from recorded results. Each item can become a draft or go to WhatsApp. */
export default function SmackFeed({ records, onDraft, onShare }) {
  const items = records.flatMap((r) => smackFeed(r));
  return (
    <section className="card">
      <div className="card__head"><h2>Smack feed</h2><span className="sub">Built from recorded results · nothing posts until you share</span></div>
      {items.length ? (
        <div className="chatlog">{items.map((i) => (
          <article key={i.source + i.id} className="chatline">
            <div className="chatline__who">{i.kind === 'recap' ? 'Recap' : i.kind === 'bust' ? 'Bust' : i.kind === 'streak' ? 'Streak' : 'Rivalry'} <span className="muted">{'· ' + i.source}</span></div>
            <p className="chatline__text">{i.text}</p>
            <div className="inline">
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => onDraft(i.text)}>Use as draft</button>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => onShare(i.text)}>Share to WhatsApp</button>
            </div>
          </article>))}</div>
      ) : <div className="empty">Nothing to needle yet. Settle a ticket first.</div>}
    </section>
  );
}
