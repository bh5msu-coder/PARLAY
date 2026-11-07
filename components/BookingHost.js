'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLeague, useReady } from './LeagueProvider';
import { ident } from '../lib/ident.mjs';
import { weeklyLegs } from '../lib/stats.mjs';
import { toast } from '../lib/clients.mjs';
import { HOST_NAME, hostBriefing, hostIntro, hostReply, markSeen, shouldAutoOpen } from '../lib/host.mjs';

/** Quick asks. Each one is answered from the store with lib/host.mjs; nothing here calls a model. */
const CHIPS = [
  ['Last week', 'last week recap'],
  ['Do I owe?', 'do I owe the stake'],
  ['My streaks', 'my streak and win rate'],
  ['Who do I play?', 'who do I play this week'],
  ['Thursday pick', 'when is my pick due'],
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

function Bubble({ from, lines, bet }) {
  const copy = async () => { try { await navigator.clipboard.writeText(bet); toast('Bet copied. Enter it on the Pick tab'); } catch (e) { toast('Copy failed'); } };
  return (
    <div className={'host__msg host__msg--' + from}>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
      {bet ? (
        <>
          <pre className="host__bet">{bet}</pre>
          <div className="host__betacts">
            <button type="button" className="btn btn--secondary btn--sm" onClick={copy}>Copy</button>
            <Link className="btn btn--primary btn--sm" href="/pick">Open Pick</Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Sarge, the sports book host: introduces itself once per NFL week, then waits behind its chip button.
 *  Read-only. It never saves or submits a pick (the pick endpoint has no auth yet) and never places a wager. */
export default function BookingHost() {
  const store = useLeague();
  const ready = useReady();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState('');
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
  const ask = (text) => {
    const q = String(text || '').trim();
    if (!q) return;
    const r = hostReply(q, b, { roster: store.state.config.roster });
    setThread((t) => t.concat([{ from: 'you', lines: [q] }, { from: 'host', lines: r.lines, bet: r.bet }]).slice(-20));
    setInput('');
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
            {thread.map((m, i) => <Bubble key={i} {...m} />)}
            <div ref={endRef} />
          </div>
          {b.you ? (
            <div className="host__chips">
              {CHIPS.map(([label, q]) => <button key={label} type="button" className="btn btn--secondary btn--sm" onClick={() => ask(q)}>{label}</button>)}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setInput('BUF at MIA Bills -3.5 -110'); if (inputRef.current) inputRef.current.focus(); }}>Type my bet back</button>
            </div>
          ) : null}
          <form className="host__form" onSubmit={submit}>
            <label className="sr-only" htmlFor="host-input">Ask the host</label>
            <input id="host-input" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} maxLength={200}
              placeholder="Ask, or type a bet: BUF at MIA Bills -3.5" autoComplete="off" />
            <button type="submit" className="btn btn--primary btn--sm">Ask</button>
          </form>
          <p className="host__fine host__foot">I can&apos;t place wagers or save picks. You enter picks on the Pick tab; a person places the ticket.</p>
        </section>
      ) : null}
    </>
  );
}
