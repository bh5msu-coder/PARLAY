'use client';
import { useEffect, useState } from 'react';
import { PICK_API } from '../lib/clients.mjs';
import { whoLabel } from '../lib/ident.mjs';
import { changesFromCurrent, pickChanges } from '../lib/pick-changes.mjs';

const when = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT'; } catch (e) { return ''; }
};
const via = (s) => (s === 'whatsapp' ? 'from the chat' : s === 'web' ? 'on the site' : s ? s : '');

/** Week page: who saved what and when, and every edit since. Full edit history needs migration 005
 *  and a working server key; until then it shows each current pick's save time. */
export default function PickChanges({ week, rows }) {
  const [hist, setHist] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`${PICK_API}?history=1&week=${week}`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (live) setHist(d); })
      .catch(() => { if (live) setHist({ available: false, reason: 'offline' }); });
    return () => { live = false; };
  }, [week, (rows || []).length]);
  const full = hist && hist.available && Array.isArray(hist.rows) && hist.rows.length;
  const list = full ? pickChanges(hist.rows) : changesFromCurrent(rows);
  if (!list.length) return null;
  const edits = list.reduce((a, p) => a + p.changes, 0);
  return (
    <section className="card">
      <div className="card__head">
        <h2>Pick changes</h2>
        <span className="sub">{full ? (edits ? `${edits} edit${edits === 1 ? '' : 's'} this week` : 'No edits yet') : 'Save times · full edit history starts once pick history is on'}</span>
      </div>
      <ul className="changes">
        {list.map((p) => (
          <li key={p.who} className="changes__row">
            <span className="changes__who">{whoLabel(p.who)}{p.changes ? <span className="pill pill--warn">{p.changes} change{p.changes === 1 ? '' : 's'}</span> : null}</span>
            <ol className="changes__events">
              {p.events.map((e, i) => (
                <li key={i}>
                  {e.kind === 'changed' ? <><s className="muted">{e.from}</s> → <b>{e.label}</b></> : e.kind === 'cleared' ? <span className="muted">Cleared {e.label}</span> : <b>{e.label}</b>}
                  <span className="muted small">{[when(e.at), via(e.source)].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
