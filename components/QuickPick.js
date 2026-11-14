'use client';
import Link from 'next/link';
import { useLeague } from './LeagueProvider';
import { ident, whoLabel } from '../lib/ident.mjs';
import { formToLeg, placedTicketPicks } from '../lib/pick-form.mjs';
import { validatePick } from '../lib/ticket.mjs';
import { PICK_API, toast } from '../lib/clients.mjs';
import LineBoard from './LineBoard';
import { MyPick, PendingPick } from './MyPick';
import { clearPending, readPending } from '../lib/pick-share.mjs';
import { ImportReport } from './PickView';
import NudgeButton from './NudgeButton';
import { missingPickers } from '../lib/nudge.mjs';

/** The two-tap pick: choose yourself once, tap a line, tap Save. The long form stays on /pick. */
export default function QuickPick() {
  const store = useLeague();
  const { state } = store;
  const week = state.pick.week;
  if (!week) return null;
  const record = state.weeks.find((w) => w.week === week) || {};
  const roster = ident.parlayRoster();
  const onTicket = placedTicketPicks(record);
  if (onTicket.length) return null;
  const f = state.pick.form;
  const you = ident.canonical(f.who) || ident.canonical(state.config.you || '');
  const submissions = (state.pick.rows || []).map((p) => ({ who: ident.canonical(p.who), source: p.source, leg: p.leg }));
  const myRow = submissions.find((p) => p.who === you) || null;
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  if (storage && state.pick.pendingWeek !== week) {
    state.pick.pending = readPending(storage, week);
    state.pick.pendingWeek = week;
  }

  const submit = async () => {
    const who = ident.canonical(f.who);
    const leg = formToLeg(f);
    const errs = validatePick(leg, who, roster);
    if (errs.length) { toast(errs[0]); return; }
    store.setYou(who);
    await store.savePick({ week, who, leg, source: 'web' });
  };

  const importPaste = async () => {
    const text = state.pick.waText || '';
    if (!text.trim()) { toast('Paste the summary first'); return; }
    let data = {};
    let ok = false;
    try {
      const r = await fetch(PICK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, import: true, text }) });
      data = await r.json().catch(() => ({}));
      ok = r.ok;
    } catch (e) { data = { error: 'Import failed' }; }
    if (!ok) { toast(data.error || 'Import failed'); state.pick.importReport = { error: data.error || 'Import failed' }; store.emit(); return; }
    state.pick.importReport = data;
    const n = (data.saved || []).length;
    toast(n ? `Saved ${n} pick${n === 1 ? '' : 's'}` : 'No new picks saved');
    if (data.picks) state.pick.rows = data.picks;
    if (data.committed) await store.loadData();
    store.emit();
  };

  const missing = missingPickers(roster, submissions);

  return (
    <section className="card" id="pick">
      <div className="card__head">
        <h2>{myRow ? 'Change my pick' : 'My pick'}</h2>
        <NudgeButton className="btn--sm" week={week} missing={missing} kick={state.nfl && state.nfl.active === week ? state.nfl.firstKickLabel || '' : ''} />
      </div>
      <div className="card__body form">
        <PendingPick pending={state.pick.pending} onRetry={() => store.savePick({ week, who: state.pick.pending.who, leg: state.pick.pending.leg, source: state.pick.pending.source || 'web' })}
          onDiscard={() => { if (storage) clearPending(storage); state.pick.pending = null; store.emit(); }} />
        <MyPick week={week} row={myRow} locked={false} games={state.pick.games || []} />
        {you && !state.pick.changeWho ? (
          <p className="pickas">Picking as <strong>{whoLabel(you)}</strong>
            <button type="button" className="linkbtn" onClick={() => { state.pick.changeWho = true; store.emit(); }}>Change</button></p>
        ) : (
          <div className="field"><label htmlFor="quick-who">I am</label>
            <select id="quick-who" value={you} onChange={(e) => { state.pick.changeWho = false; store.setYou(e.target.value); }}>
              <option value="">Select yourself</option>
              {roster.map((n) => <option key={n} value={n}>{whoLabel(n)}</option>)}
            </select>
          </div>
        )}
        <LineBoard games={state.pick.games} form={f} submissions={submissions} you={you} espn={store.espn}
          onTap={(next) => { Object.assign(state.pick.form, next, { who: f.who }); store.emit(); }}
          onClear={() => { store.resetPickForm(); store.emit(); }}
          onSave={submit}
          onManual={() => { window.location.href = '/pick#pick-manual'; }} />
        <div className="slots slots--compact">{roster.map((name) => {
          const row = submissions.find((s) => s.who === name);
          return (
            <div key={name} className={'slot' + (row ? ' slot--in' : '')}>
              <div className="slot__who">{whoLabel(name)}</div>
              <div className="slot__pick">{row ? (row.leg.label || 'In') : 'Waiting'}</div>
            </div>
          );
        })}</div>
        <details className="manual">
          <summary>Paste a WhatsApp or Meta AI summary</summary>
          <p className="muted">Paste the group’s FINAL summary, a HOLM PICK block, or a chat export. Unknown lines are listed and not saved.</p>
          <div className="field"><label htmlFor="quick-wa">Paste</label>
            <textarea id="quick-wa" placeholder="Paste the summary…" value={state.pick.waText || ''} onChange={(e) => { state.pick.waText = e.target.value; store.emit(); }} />
          </div>
          <button className="btn btn--primary" type="button" onClick={importPaste}>Import picks</button>
          <ImportReport report={state.pick.importReport} />
        </details>
        <p className="muted"><Link href="/pick">Type a pick by hand, or open the full form</Link></p>
      </div>
    </section>
  );
}
