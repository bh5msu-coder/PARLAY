'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLeague, useReady } from './LeagueProvider';
import { ident } from '../lib/ident.mjs';
import { weeklyLegs } from '../lib/stats.mjs';
import { toast } from '../lib/clients.mjs';
import { legToForm, placedTicketPicks } from '../lib/pick-form.mjs';
import { savedPickText, waShareHref } from '../lib/pick-share.mjs';
import { HOST_NAME, hostBriefing, hostIntro, hostReply, markSeen, shouldAutoOpen } from '../lib/host.mjs';

/** Quick asks. Each one is answered from the store with lib/host.mjs; nothing here calls a model. */
const CHIPS = [
  ['Last week', 'last week recap'],
  ['Do I owe?', 'do I owe the stake'],
  ['My streaks', 'my streak and win rate'],
  ['Who do I play?', 'who do I play this week'],
  ['Pick due?', 'when is my pick due'],
];

function Chip({ cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22M4.9 4.9l2.3 2.3M16.8 16.8l2.3 2.3M4.9 19.1l2.3-2.3M16.8 7.2l2.3-2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function briefingFrom(store) {
  const s = store.state;
  const you = s.config.you || '';
  const clock = s.nfl;
  const active = s.pick.week || (clock && clock.active) || null;
  const prior = clock && clock.payerWeek ? clock.payerWeek : (active ? Math.max(1, active - 1) : null);
  const currentWeek = active ? store.weekRecord(active) : null;
  const person = you ? ident.person(you) : null;
  return hostBriefing({
    you,
    nick: you ? ident.nick(you) || you : '',
    hour: new Date().getHours(),
    now: new Date(),
    clock,
    pickWeek: active,
    lastPlace: s.lastPlace,
    currentWeek,
    payers: currentWeek ? store.weekPayers(currentWeek) : [],
    payerNote: currentWeek ? store.weekPayerNote(currentWeek) : '',
    priorWeek: prior ? s.weeks.find((w) => w.week === prior) || null : null,
    priorGraded: prior ? s.graded[prior] : null,
    legs: weeklyLegs(s.weeks, s.graded),
    career: person && person.career,
    pickRows: s.pick.rows,
  });
}

/** One message. A bet Sarge read back carries Save pick (when it can be saved) and Edit; a saved pick carries
 *  Post to WhatsApp, which opens WhatsApp with the text filled in for the manager to send. */
function Bubble({ from, lines, bet, canSave, busy, done, share, onSave, onEdit }) {
  const copy = async (text, note) => { try { await navigator.clipboard.writeText(text); toast(note); } catch (e) { toast('Copy failed'); } };
  return (
    <div className={'host__msg host__msg--' + from}>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
      {bet ? (
        <>
          <pre className="host__bet">{bet}</pre>
          {done ? null : (
            <div className="host__betacts">
              {canSave ? <button type="button" className="btn btn--cta" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save pick'}</button> : null}
              <button type="button" className="btn btn--secondary" onClick={onEdit}>Edit on Pick tab</button>
            </div>
          )}
        </>
      ) : null}
      {share ? (
        <div className="host__betacts">
          <a className="btn btn--primary" href={waShareHref(share)} target="_blank" rel="noopener">Post to WhatsApp</a>
          <button type="button" className="btn btn--secondary" onClick={() => copy(share, 'Pick copied. Paste it in the Holm chat')}>Copy</button>
        </div>
      ) : null}
    </div>
  );
}

/** Sarge, the sports book host: introduces itself once per NFL week, then waits behind its chip button.
 *  Type a bet and Sarge reads it back; the pick is saved only when the manager taps Save pick (the same
 *  store.savePick the Pick page uses). It never places a wager. */
export default function BookingHost() {
  const store = useLeague();
  const ready = useReady();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(-1);
  const router = useRouter();
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const active = ready ? (store.state.pick.week || (store.state.nfl && store.state.nfl.active)) : null;

  useEffect(() => {
    if (!active) return;
    try {
      if (shouldAutoOpen(localStorage, active)) { setOpen(true); markSeen(localStorage, active); }
    } catch (e) { /* storage blocked: stay closed */ }
  }, [active]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => { if (open && endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: 'end' }); }, [open, thread.length]);

  if (pathname === '/' || !ready) return null;

  const b = briefingFrom(store);
  const roster = ident.parlayRoster();
  const placed = active ? placedTicketPicks(store.weekRecord(active)).length > 0 : false;
  const canPick = !!b.you && roster.includes(b.you) && !placed;
  const ask = (text) => {
    const q = String(text || '').trim();
    if (!q) return;
    const r = hostReply(q, b, { roster, games: store.state.pick.games });
    const lines = r.leg && r.ok && placed ? [`Week ${active} is already placed, so I can't take a new pick for it.`] : r.lines;
    setThread((t) => t.concat([{ from: 'you', lines: [q] }, { from: 'host', lines, bet: r.bet, leg: r.leg, canSave: !!(r.ok && r.leg && canPick) }]).slice(-20));
    setInput('');
  };
  const say = (lines, extra) => setThread((t) => t.concat([Object.assign({ from: 'host', lines }, extra || {})]).slice(-20));
  const closeBet = (m) => setThread((t) => t.map((x) => (x === m ? Object.assign({}, x, { done: true }) : x)));
  const save = async (m, i) => {
    setBusy(i);
    const r = await store.savePick({ week: active, who: b.you, leg: m.leg, source: 'web' });
    setBusy(-1);
    if (r.ok) {
      closeBet(m);
      say([`Saved to the board: ${m.leg.label}. ${r.data.warning ? r.data.warning + ' ' : ''}Post it to the chat so the room sees it.`], { share: savedPickText(active, { who: b.you, leg: m.leg }) });
    } else if (store.state.pick.pending) {
      closeBet(m);
      say(['No connection to the board. I kept the pick on this phone and it will retry when you are back online.']);
    } else say([(r.data && r.data.error) || 'That did not save. Try it on the Pick tab.']);
  };
  const edit = (m) => {
    Object.assign(store.state.pick.form, legToForm(m.leg, b.you));
    store.state.pick.manualOpen = true;
    store.emit();
    setOpen(false);
    router.push('/pick');
  };
  const submit = (e) => { e.preventDefault(); ask(input); };

  return (
    <>
      <button type="button" className={'host__launch' + (open ? ' host__launch--open' : '')} aria-expanded={open} aria-controls="host-panel"
        onClick={() => setOpen((o) => !o)} title={HOST_NAME}>
        <Chip cls="host__chip" />
        <span className="host__launchtxt">{HOST_NAME}</span>
      </button>
      {open ? (
        <section id="host-panel" className="host card" role="dialog" aria-label={HOST_NAME}>
          <header className="host__head">
            <Chip cls="host__chip" />
            <div className="host__title">
              <span className="eyebrow">Sports book host</span>
              <h2>{HOST_NAME}</h2>
            </div>
            <button type="button" className="iconbtn host__close" aria-label="Close the host" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </header>
          <div className="host__body" aria-live="polite">
            <Bubble from="host" lines={hostIntro(b)} />
            {!b.you ? (
              <label className="field host__who">
                <span className="label">Who are you?</span>
                <select value="" onChange={(e) => store.setYou(e.target.value)}>
                  <option value="">Pick yourself</option>
                  {ident.people.map((p) => <option key={p.id} value={p.name}>{p.nick || p.name}</option>)}
                </select>
                <span className="host__fine">Saved on this phone only.</span>
              </label>
            ) : null}
            {thread.map((m, i) => <Bubble key={i} {...m} busy={busy === i} onSave={() => save(m, i)} onEdit={() => edit(m)} />)}
            <div ref={endRef} />
          </div>
          {b.you ? (
            <div className="host__chips">
              {canPick ? <button type="button" className="btn btn--cta btn--sm" onClick={() => { say(['Type your bet below, like "Bills -3.5", "Chiefs ML" or "KC at LV Kelce anytime TD". I\u2019ll read it back before anything is saved.']); if (inputRef.current) inputRef.current.focus(); }}>Make my pick</button> : null}
              {CHIPS.map(([label, q]) => <button key={label} type="button" className="btn btn--secondary btn--sm" onClick={() => ask(q)}>{label}</button>)}

            </div>
          ) : null}
          <form className="host__form" onSubmit={submit}>
            <label className="sr-only" htmlFor="host-input">Ask the host</label>
            <input id="host-input" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} maxLength={200}
              placeholder="Type a bet (Bills -3.5) or ask" autoComplete="off" />
            <button type="submit" className="btn btn--primary btn--sm">Send</button>
          </form>
          <p className="host__fine host__foot">A pick is saved only when you tap Save pick. I never place a wager; a person places the ticket.</p>
        </section>
      ) : null}
    </>
  );
}
