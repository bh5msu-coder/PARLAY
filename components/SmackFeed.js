'use client';
import { useState } from 'react';
import { smackFeed } from '../lib/smack.mjs';

const FIRST = 6;

/** Feed of needles built from recorded results. Each item can become a draft or go to WhatsApp. */
export default function SmackFeed({ records, onDraft, onShare }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState({});
  const items = records.flatMap((r) => smackFeed(r));
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <section className="card">
      <div className="card__head"><h2>Smack feed</h2><span className="sub">Nothing posts until you share</span></div>
      {items.length ? (<>
        <div className="chatlog">{shown.map((i) => (
          <article key={i.source + i.id} className="chatline">
            <p className={'chatline__text' + (open[i.source + i.id] ? ' is-open' : '')} onClick={() => setOpen({ ...open, [i.source + i.id]: !open[i.source + i.id] })}>{i.text}</p>
            <div className="chatline__foot">
              <span className="chatline__who">{i.kind === 'recap' ? 'Recap' : i.kind === 'bust' ? 'Bust' : i.kind === 'streak' ? 'Streak' : 'Rivalry'}</span>
              <span className="inline">
                <button className="btn btn--ghost btn--sm" type="button" aria-label="Use as draft" onClick={() => onDraft(i.text)}>Draft</button>
                <button className="btn btn--secondary btn--sm" type="button" aria-label="Share to WhatsApp" onClick={() => onShare(i.text)}>Share</button>
              </span>
            </div>
          </article>))}</div>
        {items.length > FIRST ? <div className="card__body"><button className="btn btn--ghost btn--sm" type="button" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button></div> : null}
      </>) : <div className="empty">Nothing to needle yet. Settle a ticket first.</div>}
    </section>
  );
}
