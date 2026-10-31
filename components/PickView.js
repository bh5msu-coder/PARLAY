'use client';
import Link from 'next/link';
import { useLeague } from './LeagueProvider';
import { Page } from './Topbar';
import { ident } from '../lib/ident.mjs';
import { assembleTicket, parseWhatsApp, slipText, validatePick } from '../lib/ticket.mjs';
import { DEFAULT_CHAT_URL, formToLeg, openPickWeek, STAT_OPTS, waBlock } from '../lib/pick-form.mjs';
import { PICK_API, toast } from '../lib/clients.mjs';

export default function PickView() {
  const store = useLeague();
  const { state } = store;
  if (!state.ready) return <Page title="Picks" />;
  const week = state.pick.week || openPickWeek(state.weeks, state.nfl);
  state.pick.week = week;
  const roster = ident.parlayRoster();
  const f = state.pick.form;
  const payer = store.weekPayer({ week, payer: (state.weeks.find((w) => w.week === week) || {}).payer });
  const kick = store.weekKickNote(week);
  const submissions = (state.pick.rows || []).map((p) => ({ who: ident.canonical(p.who), source: p.source, leg: p.leg }));
  const ticket = assembleTicket(submissions, roster);
  const setF = (key, val, rerender) => { state.pick.form[key] = val; if (rerender !== false) store.emit(); };

  const submitPick = async (source) => {
    const who = ident.canonical(f.who);
    const leg = formToLeg(f);
    const errs = validatePick(leg, who, roster);
    if (errs.length) { toast(errs[0]); return; }
    try { localStorage.setItem('hp_who', who); } catch (e) { /* ignore */ }
    const r = await fetch(PICK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, who, source, leg }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { toast(data.error || 'Submit failed'); if (data.error) state.pick.setupError = data.error; store.emit(); return; }
    toast(data.committed ? 'You are in — ticket saved. 11/11.' : 'Pick saved');
    state.pick.rows = data.picks || state.pick.rows;
    state.pick.ticket = data.ticket || null;
    state.pick.committed = !!data.committed;
    if (data.committed) await store.loadData();
    store.emit();
  };

  const shareToWhatsApp = () => {
    const who = ident.canonical(f.who);
    const leg = formToLeg(f);
    if (!who || !leg.game[0]) { toast('Fill in who + game first'); return; }
    const text = waBlock(week, who, leg);
    const url = state.config.chat || DEFAULT_CHAT_URL;
    window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n\nDrop this in the Holm chat: ' + url), '_blank');
  };

  const importPaste = async () => {
    const parsed = parseWhatsApp(state.pick.waText, roster);
    if (!parsed.length) { toast('No picks found in that paste'); return; }
    const r = await fetch(PICK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, import: true, picks: parsed }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { toast(data.error || 'Import failed'); return; }
    toast(`Imported ${(data.saved || parsed).length} pick(s)` + (data.committed ? ' — ticket saved' : ''));
    state.pick.rows = data.picks || state.pick.rows;
    state.pick.committed = !!data.committed;
    if (data.committed) await store.loadData();
    store.emit();
  };

  const gameValue = f.gameAway && f.gameHome ? f.gameAway + '|' + f.gameHome : '';

  return (
    <Page title={`Week ${week} picks`} sub="One bet each">
      {kick ? <p className="rules rules--warn">{kick}</p> : null}
      {state.pick.setupError ? (
        <section className="card"><div className="card__body">
          <p className="rules">{state.pick.setupError}</p>
          <p className="muted">Bradley: run supabase/picks.sql once in the Supabase SQL editor, then this board goes live for the group.</p>
        </div></section>) : null}

      <section className="stats">
        <div className="card stat"><span className="label">Picks in</span><span className="stat__value">{`${ticket.count} / ${ticket.need}`}</span><span className="stat__delta">{ticket.complete ? 'Ticket ready' : 'Waiting on the room'}</span></div>
        <div className="card stat"><span className="label">Heller</span><span className="stat__value stat__value--name">Sits</span><span className="stat__delta">Does not pick</span></div>
        <div className="card stat"><span className="label">Book</span><span className="stat__value stat__value--name">MI</span><span className="stat__delta">One parlay at DK / FanDuel / BetMGM</span></div>
        <div className="card stat"><span className="label">Stake</span><span className="stat__value">$10</span><span className="stat__delta">{payer ? ident.nick(payer) + ' pays' : 'Last place last week pays'}</span></div>
      </section>

      {ticket.complete ? (
        <section className="card"><div className="card__body">
          <p className="rules">{state.pick.committed
            ? 'All 11 are in, unique, and grouped so a Michigan book can take this as one wager. Ticket is saved to the Week tab.'
            : 'All 11 are in and the ticket is legal. Copy the slip below and place $10 as one parlay. If auto-save did not fire, the commissioner can paste it from Admin.'}</p>
          <pre className="slip">{slipText(ticket, week)}</pre>
          <div className="inline">
            <button className="btn btn--primary" type="button" onClick={async () => {
              try { await navigator.clipboard.writeText(slipText(ticket, week)); toast('Bet slip copied'); } catch (e) { toast('Copy failed'); }
            }}>Copy bet slip</button>
            <Link className="btn btn--secondary" href="/week">Open week tab</Link>
          </div>
        </div></section>) : null}

      {(ticket.issues || []).map((iss, i) => <p key={i} className={'rules rules--' + iss.level}>{iss.text}</p>)}

      <section className="card">
        <div className="card__head"><h2>The 11</h2><span className="sub">H-Bomb sits</span></div>
        <div className="card__body"><div className="slots">{roster.map((name) => {
          const row = submissions.find((s) => s.who === name);
          return (
            <div key={name} className={'slot' + (row ? ' slot--in' : '')}>
              <div className="slot__who">{name}</div>
              <div className="slot__pick">{row ? (row.leg.label || 'In') : 'Waiting'}</div>
              <div className="muted">{row ? (row.source === 'whatsapp' ? 'WhatsApp' : 'Website') : '—'}</div>
            </div>);
        })}</div></div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Enter your bet</h2><span className="sub">Website · remembered on this phone</span></div>
        <div className="card__body form">
          <div className="row">
            <div className="field"><label>I am</label>
              <select value={ident.canonical(f.who) || ''} onChange={(e) => setF('who', e.target.value)}>
                <option value="">Select yourself</option>
                {roster.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="field"><label>Game</label>
              <select value={gameValue} onChange={(e) => { const [away, home] = e.target.value.split('|'); state.pick.form.gameAway = away || ''; setF('gameHome', home || ''); }}>
                <option value="">Select NFL game</option>
                {state.pick.games.map((g) => <option key={g.away + '|' + g.home} value={g.away + '|' + g.home}>{g.detail + (g.pre ? '' : ' · started')}</option>)}
              </select>
            </div>
            <div className="field"><label>Market</label>
              <select value={f.type} onChange={(e) => setF('type', e.target.value)}>
                {[['ml', 'Moneyline'], ['spread', 'Spread'], ['total', 'Total'], ['player', 'Player prop']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            {f.type === 'ml' || f.type === 'spread' ? <div className="field"><label>Team</label><input type="text" placeholder={f.gameAway || 'KC'} value={f.team} onChange={(e) => setF('team', e.target.value.toUpperCase())} /></div> : null}
            {f.type === 'spread' || f.type === 'total' || f.type === 'player' ? <div className="field"><label>Line</label><input type="number" step="any" value={f.line} onChange={(e) => setF('line', e.target.value)} /></div> : null}
            {f.type === 'total' || f.type === 'player' ? (
              <div className="field"><label>Side</label>
                <select value={f.side} onChange={(e) => setF('side', e.target.value)}>{[['over', 'Over'], ['under', 'Under']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              </div>) : null}
            {f.type === 'player' ? (
              <>
                <div className="field"><label>Player (ESPN spelling)</label><input type="text" value={f.player} placeholder="Patrick Mahomes" onChange={(e) => setF('player', e.target.value)} /></div>
                <div className="field"><label>Stat</label>
                  <select value={f.stat} onChange={(e) => setF('stat', e.target.value)}>{STAT_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                </div>
              </>) : null}
          </div>
          <div className="row">
            <div className="field"><label>Label on the ticket</label><input type="text" placeholder="Chiefs ML" value={f.label} onChange={(e) => setF('label', e.target.value)} /></div>
            <div className="field"><label>Your price (optional)</label><input type="number" placeholder="-110" value={f.odds} onChange={(e) => setF('odds', e.target.value)} /></div>
          </div>
          <div className="inline">
            <button className="btn btn--primary" type="button" onClick={() => submitPick('web')}>Save my pick</button>
            <button className="btn btn--secondary" type="button" onClick={shareToWhatsApp}>Share to WhatsApp</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>From WhatsApp</h2><span className="sub">No bot required — paste the thread, we parse the 11</span></div>
        <div className="card__body form">
          <p className="muted">{'Best format (copy from the Share button): HOLM PICK W' + week + ' / Who / Game / Type / Pick. One-liners like “Brad | Chiefs ML | KC at LV | -130” also work.'}</p>
          <div className="field"><label>Paste</label><textarea placeholder="Paste the group chat (or a HOLM PICK block)…" value={state.pick.waText || ''} onChange={(e) => { state.pick.waText = e.target.value; store.emit(); }} /></div>
          <button className="btn btn--primary" type="button" onClick={importPaste}>Import picks</button>
        </div>
      </section>
    </Page>
  );
}
