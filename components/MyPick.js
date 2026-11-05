'use client';
import { useEffect, useRef } from 'react';
import { whoLabel } from '../lib/ident.mjs';
import { savedAtLabel, savedPickText, waShareHref } from '../lib/pick-share.mjs';
import { toast } from '../lib/clients.mjs';

/** Your saved pick, read back from the board (so it shows what is actually stored), with a
 *  Post to WhatsApp button. WhatsApp opens with the text filled in; the user picks the chat and sends. */
export function MyPick({ week, row, locked }) {
  if (!row || !row.leg) return null;
  const text = savedPickText(week, row);
  const game = (row.leg.game || []).filter(Boolean).join(' at ');
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Pick copied. Paste it in the Holm chat'); } catch (e) { toast('Copy failed'); } };
  return (
    <section className="card mypick" aria-live="polite">
      <div className="card__head"><h2>Your pick</h2><span className="sub">{whoLabel(row.who)}</span></div>
      <div className="card__body">
        <p className="mypick__leg"><strong>{row.leg.label}</strong>{row.leg.odds ? <span className="muted">{' ' + (row.leg.odds > 0 ? '+' : '') + row.leg.odds}</span> : null}</p>
        <p className="muted">{[game, savedAtLabel(row.updated_at), row.source === 'whatsapp' ? 'from WhatsApp' : 'on the website'].filter(Boolean).join(' · ')}</p>
        <p className="mypick__stored">{locked ? 'Stored on the league board. This game has kicked off, so the pick is locked.' : 'Stored on the league board. Change it any time before kickoff.'}</p>
        <div className="inline">
          <a className="btn btn--primary" href={waShareHref(text)} target="_blank" rel="noopener">Post to WhatsApp</a>
          <button className="btn btn--secondary" type="button" onClick={copy}>Copy</button>
        </div>
      </div>
    </section>
  );
}

/** A pick that has not reached the server yet (no signal, server down). It stays on this phone and is
 *  retried once when the page opens and whenever the phone comes back online. */
export function PendingPick({ pending, onRetry, onDiscard }) {
  const tried = useRef(false);
  useEffect(() => {
    if (!pending) return undefined;
    if (!tried.current) { tried.current = true; onRetry(true); }
    const again = () => onRetry(true);
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [pending && pending.keptAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pending) return null;
  return (
    <section className="rules rules--warn pending" role="status">
      <div>
        <p>{`Not saved yet: ${whoLabel(pending.who)}, ${pending.leg.label}. It is kept on this phone and will retry when you are back online.`}</p>
        <div className="inline">
          <button className="btn btn--primary" type="button" onClick={() => onRetry(false)}>Retry now</button>
          <button className="btn btn--secondary" type="button" onClick={onDiscard}>Discard</button>
        </div>
      </div>
    </section>
  );
}
