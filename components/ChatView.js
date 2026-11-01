'use client';
import Fold from './Fold';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLeague } from './LeagueProvider';
import { Page } from './Topbar';
import { buildReceipt, ident, lorePerson, RIVALRIES } from '../lib/ident.mjs';
import { saveTape, shareTape, tapeCanvas } from '../lib/tape.mjs';
import { CHAT_LS, lsGet, lsSet, toast } from '../lib/clients.mjs';
import { DEFAULT_CHAT_URL } from '../lib/pick-form.mjs';
import SmackFeed from './SmackFeed';
import { cachedHistory, historyLegs, historyTickets, loadHistory } from '../lib/history.mjs';
import { weeklyLegs, weeklyTickets } from '../lib/stats.mjs';

function TapeImage({ a, b, rec, canvasRef }) {
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    tapeCanvas(a, b, rec, c);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (c.isConnected) tapeCanvas(a, b, rec, c); });
  });
  return <canvas ref={canvasRef} className="tape__img" role="img" aria-label={'League tape: ' + rec.line} />;
}

export default function ChatView() {
  const store = useLeague();
  const { state } = store;
  const router = useRouter();
  const params = useSearchParams();
  const tapeRef = useRef(null);
  const boxRef = useRef(null);
  const [drafts, setDrafts] = useState([]);
  const [text, setText] = useState('');
  const youNick = state.config.you ? ident.nick(state.config.you) : '';
  const [who, setWho] = useState('');

  const [history, setHistory] = useState(cachedHistory());
  useEffect(() => { setDrafts(lsGet(CHAT_LS, [])); }, []);
  useEffect(() => { let live = true; loadHistory().then((h) => { if (live) setHistory(h); }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (state.pendingChatDraft) {
      setText(state.pendingChatDraft);
      state.pendingChatDraft = '';
      setTimeout(() => boxRef.current && boxRef.current.focus(), 0);
    }
  });

  if (!state.ready) return <Page title="Chat" />;
  const sub = 'Receipts from real tape · share to WhatsApp';
  if (!ident.lore) return <Page title="Chat" sub={sub}><div className="card"><div className="empty">League history did not load. Refresh and try again.</div></div></Page>;

  const pair = {
    a: lorePerson(params.get('a') || 'meltser') || lorePerson('meltser') || ident.people[0],
    b: lorePerson(params.get('b') || 'heller') || lorePerson('heller') || ident.people[0],
  };
  const rec = buildReceipt(pair.a, pair.b);
  const named = RIVALRIES.find((r) => r.a === pair.a.id && r.b === pair.b.id);
  const chatUrl = state.config.chat || DEFAULT_CHAT_URL;
  const whoValue = who || youNick || (ident.people[0].nick || ident.people[0].name);

  const openPair = (a, b, draft) => {
    if (draft) state.pendingChatDraft = draft;
    router.push('/chat?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b));
    store.emit();
  };
  const share = (t, by) => {
    const line = (by ? by + ': ' : '') + t;
    window.open('https://wa.me/?text=' + encodeURIComponent(line + '\n\nHolm chat: ' + chatUrl), '_blank');
  };
  const receiptText = (r) => (whoValue ? whoValue + ': ' : '') + r.line + '\n' + r.stat + '\n\nHolm chat: ' + chatUrl;
  const shareReceipt = (r) => share(r.line + '\n' + r.stat, whoValue);
  const shareBoth = (pa, pb, r) => shareTape(tapeCanvas(pa, pb, r), pa, pb, receiptText(r));
  const pairSelect = (which, current, otherId) => (
    <select value={current} onChange={(e) => {
      const id = e.target.value;
      openPair(which === 'a' ? id : otherId, which === 'b' ? id : otherId);
    }}>{ident.people.map((p) => <option key={p.id} value={p.id}>{p.nick || p.name}</option>)}</select>
  );
  const pin = () => {
    const t = text.trim();
    if (!t) { toast('Write something first'); return; }
    const next = [{ who: whoValue, text: t, at: Date.now() }].concat(lsGet(CHAT_LS, [])).slice(0, 40);
    lsSet(CHAT_LS, next);
    setText('');
    setDrafts(next);
    toast('Pinned locally');
  };

  return (
    <Page title="Chat" sub={sub}>
      <section className="card" id="chat-receipt">
        <div className="card__head"><h2>Receipt and tape</h2><span className="sub">{named ? named.title : 'Shared seasons only'}</span></div>
        <div className="card__body">
          <div className="prompt-row">{RIVALRIES.map((r) => (
            <button key={r.title} className={'chip' + (r.a === pair.a.id && r.b === pair.b.id ? ' on' : '')} type="button" onClick={() => openPair(r.a, r.b)}>{r.pair}</button>))}</div>
          <div className="row">
            <div className="field"><label>You</label>{pairSelect('a', pair.a.id, pair.b.id)}</div>
            <div className="field"><label>Them</label>{pairSelect('b', pair.b.id, pair.a.id)}</div>
          </div>
          <p className="receipt">{rec.line}</p>
          <p className="rivalry__stat">{rec.stat}</p>
          <div className="tape"><TapeImage a={pair.a} b={pair.b} rec={rec} canvasRef={tapeRef} /></div>
          <div className="inline" style={{ marginTop: 12 }}>
            <button className="btn btn--primary btn--sm" type="button" onClick={() => shareTape(tapeRef.current, pair.a, pair.b, receiptText(rec))}>Share tape + receipt</button>
            <button className="btn btn--secondary btn--sm" type="button" onClick={() => shareReceipt(rec)}>Text only to WhatsApp</button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => saveTape(tapeRef.current, pair.a, pair.b, 'png')}>Save PNG</button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => saveTape(tapeRef.current, pair.a, pair.b, 'jpeg')}>Save JPEG</button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => saveTape(tapeRef.current, pair.a, pair.b, 'pdf')}>Save PDF</button>
          </div>
        </div>
      </section>

      <SmackFeed
        records={[
          ...(history ? [{ legs: historyLegs(history), tickets: historyTickets(history), source: 'parlay-history.json' }] : []),
          { legs: weeklyLegs(state.weeks, state.graded), tickets: weeklyTickets(state.weeks, state.graded), source: 'data/bets.json' },
        ]}
        onDraft={(t) => { setText(t); setTimeout(() => boxRef.current && boxRef.current.focus(), 0); }}
        onShare={(t) => share(t, whoValue)} />

      <section className="card">
        <div className="card__head"><h2>Receipts</h2><span className="sub">Counted from 2010–2025 final place</span></div>
        <Fold>{RIVALRIES.map((r) => {
          const pa = lorePerson(r.a);
          const pb = lorePerson(r.b);
          if (!pa || !pb) return null;
          const card = buildReceipt(pa, pb);
          const on = r.a === pair.a.id && r.b === pair.b.id;
          return (
            <article key={r.title} className={'rivalry' + (on ? ' on' : '')}>
              <div className="rivalry__pair">{r.pair}</div>
              <div className="rivalry__title">{r.title}</div>
              <p className="rivalry__why">{card.line}</p>
              <p className="rivalry__stat">{card.stat}</p>
              <div className="inline">
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => openPair(r.a, r.b, card.line + '\n' + card.stat)}>Use as draft</button>
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => shareBoth(pa, pb, card)}>Share tape + receipt</button>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => shareReceipt(card)}>Text only</button>
              </div>
            </article>);
        })}</Fold>
      </section>

      <section className="card">
        <div className="card__head"><h2>Write a line</h2><span className="sub">Pinned on this device</span></div>
        <div className="card__body form">
          <div className="field"><label htmlFor="chat-who">I am</label>
            <select id="chat-who" value={whoValue} onChange={(e) => setWho(e.target.value)}>{ident.people.map((p) => <option key={p.id} value={p.nick || p.name}>{p.nick || p.name}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="chat-box">Draft</label>
            <textarea id="chat-box" ref={boxRef} placeholder="Keep it about titles, finishes, PF — not 2026 auction." value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="inline">
            <button className="btn btn--primary" type="button" onClick={pin}>Pin on this phone</button>
            <button className="btn btn--secondary" type="button" onClick={() => { const t = text.trim(); if (!t) { toast('Write something first'); return; } share(t, whoValue); }}>Share to WhatsApp</button>
            {state.config.chat ? <a className="btn btn--ghost" href={state.config.chat} target="_blank" rel="noopener">Open group</a> : null}
          </div>
        </div>
      </section>

      {drafts.length ? (
        <section className="card">
          <div className="card__head"><h2>Pinned on this phone</h2><span className="sub">Not synced</span></div>
          <div className="chatlog">{drafts.map((d, i) => (
            <div key={i} className="chatline"><div className="chatline__who">{d.who}</div><p className="chatline__text">{d.text}</p></div>))}</div>
        </section>) : null}
    </Page>
  );
}
