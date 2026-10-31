'use client';
import { useRef, useState } from 'react';
import { useLeague } from './LeagueProvider';
import { Page } from './Topbar';
import { ident } from '../lib/ident.mjs';
import { uniq } from '../lib/format.mjs';
import { blankLeg, newWeek, nextUnusedWeek, STAT_OPTS } from '../lib/pick-form.mjs';
import { SEASON, toast } from '../lib/clients.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Uncontrolled text/number input bound to obj[key] (edits mutate the draft, like the legacy form). */
function Bound({ obj, k, num, placeholder, style, upper, onChange }) {
  return (
    <input type={num ? 'number' : 'text'} step={num ? 'any' : undefined} placeholder={placeholder} style={style}
      defaultValue={obj[k] == null ? '' : obj[k]}
      onInput={(e) => {
        const v = e.target.value;
        obj[k] = num ? (v === '' ? '' : Number(v)) : upper ? v.toUpperCase() : v;
        if (onChange) onChange();
      }} />
  );
}

function BoundSelect({ obj, k, options, onChange }) {
  return (
    <select defaultValue={obj[k] == null ? '' : String(obj[k])} onChange={(e) => { obj[k] = e.target.value; if (onChange) onChange(); }}>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );
}

function Unlock({ store }) {
  const [pass, setPass] = useState('');
  const unlock = async () => {
    try {
      const ok = await store.sb.rpc('holm_parlay_check_pass', { p_pass: pass });
      if (!ok) { toast('Wrong passphrase'); return; }
      store.state.admin.pass = pass;
      try { sessionStorage.setItem('hp_pass', pass); } catch (e) { /* ignore */ }
      store.emit();
    } catch (e) { toast('Could not check: ' + e.message); }
  };
  return (
    <section className="card"><div className="card__body form">
      <div className="field"><label htmlFor="pass">Commissioner passphrase</label><input id="pass" type="password" autoComplete="current-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} /></div>
      <div><button className="btn btn--primary" type="button" onClick={unlock}>Unlock</button></div>
    </div></section>
  );
}

function LegEditor({ leg, idx, roster, onRemove, onLayout }) {
  const typeSpecific = [];
  if (leg.type === 'ml' || leg.type === 'spread') typeSpecific.push(<div key="team" className="field"><label>Team (abbr)</label><Bound obj={leg} k="team" placeholder="CHI" /></div>);
  if (leg.type === 'spread') typeSpecific.push(<div key="line" className="field"><label>Line (e.g. -3.5)</label><Bound obj={leg} k="line" num placeholder="-3.5" /></div>);
  if (leg.type === 'total') {
    typeSpecific.push(<div key="side" className="field"><label>Side</label><BoundSelect obj={leg} k="side" options={[['over', 'Over'], ['under', 'Under']]} /></div>);
    typeSpecific.push(<div key="line" className="field"><label>Total line</label><Bound obj={leg} k="line" num placeholder="50.5" /></div>);
  }
  if (leg.type === 'player') {
    typeSpecific.push(<div key="player" className="field"><label>Player (as ESPN lists it)</label><Bound obj={leg} k="player" placeholder="Jordan Love" /></div>);
    typeSpecific.push(<div key="stat" className="field"><label>Stat</label><BoundSelect obj={leg} k="stat" options={STAT_OPTS} /></div>);
    typeSpecific.push(<div key="side" className="field"><label>Side</label><BoundSelect obj={leg} k="side" options={[['over', 'Over'], ['under', 'Under']]} /></div>);
    typeSpecific.push(<div key="line" className="field"><label>Line (282+ = 281.5)</label><Bound obj={leg} k="line" num placeholder="281.5" /></div>);
  }
  const setGame = (i, v) => { const g = (leg.game || ['', '']).slice(); g[i] = v.toUpperCase(); leg.game = [g[0] || '', g[1] || '']; };
  return (
    <div className="legedit">
      <div className="row">
        <div className="field"><label>{`Leg ${idx + 1} · manager`}</label><BoundSelect obj={leg} k="who" options={[['', '—']].concat(roster.map((r) => [r, r]))} /></div>
        <div className="field"><label>Label shown</label><Bound obj={leg} k="label" placeholder="Bears ML" /></div>
        <div className="field"><label>Type</label><BoundSelect obj={leg} k="type" options={[['ml', 'Moneyline'], ['spread', 'Spread'], ['total', 'Total'], ['player', 'Player prop']]} onChange={onLayout} /></div>
        <div className="field"><label>Game</label>
          <div className="inline">
            <input type="text" placeholder="Away (NE)" style={{ width: 90 }} defaultValue={(leg.game || [])[0] || ''} onInput={(e) => setGame(0, e.target.value)} />
            <span className="muted">at</span>
            <input type="text" placeholder="Home (CHI)" style={{ width: 90 }} defaultValue={(leg.game || [])[1] || ''} onInput={(e) => setGame(1, e.target.value)} />
          </div>
        </div>
      </div>
      <div className="row">{typeSpecific}</div>
      <div className="row">
        <div className="field"><label>Odds (blank if in SGP)</label><Bound obj={leg} k="odds" num placeholder="-110" /></div>
        <div className="field"><label>SGP group id (e.g. sgp1)</label><Bound obj={leg} k="group" placeholder="" onChange={onLayout} /></div>
        <div className="field"><label>Grade override</label><BoundSelect obj={leg} k="override" options={[['', 'Auto grade'], ['won', 'Force WON'], ['lost', 'Force LOST'], ['push', 'Force PUSH'], ['void', 'Force VOID']]} /></div>
        <div className="field"><label> </label><button className="btn btn--ghost btn--sm" type="button" onClick={onRemove}>Remove leg</button></div>
      </div>
    </div>
  );
}

function LeagueSettings({ store }) {
  const { state } = store;
  const cfgRef = useRef(null);
  if (!cfgRef.current) {
    cfgRef.current = clone(state.config);
    cfgRef.current.abstainText = (cfgRef.current.abstain || []).join(', ');
  }
  const cfg = cfgRef.current;
  const save = async () => {
    try {
      const out = clone(cfg);
      out.abstain = (out.abstainText != null ? out.abstainText : (out.abstain || []).join(', ')).split(',').map((s) => ident.canonical(s.trim()) || s.trim()).filter(Boolean);
      out.roster = uniq((out.roster || []).map((s) => ident.canonical(s)));
      out.you = ident.canonical(out.you) || out.you;
      delete out.abstainText;
      await store.sb.rpc('holm_parlay_save_week', { p_pass: state.admin.pass, p_season: SEASON, p_week: 0, p_data: out });
      toast('Settings saved'); await store.loadData(); cfgRef.current = null; store.emit();
    } catch (e) { toast('Save failed: ' + e.message); }
  };
  return (
    <section className="card">
      <div className="card__head"><h2>League settings</h2></div>
      <div className="card__body form">
        <div className="row">
          <div className="field"><label>League name</label><Bound obj={cfg} k="leagueName" /></div>
          <div className="field"><label>Chat link</label><Bound obj={cfg} k="chat" placeholder="https://chat.whatsapp.com/…" /></div>
          <div className="field"><label>Abstains (comma separated)</label><Bound obj={cfg} k="abstainText" /></div>
          <div className="field"><label>Highlight as “you”</label><Bound obj={cfg} k="you" /></div>
        </div>
        <div className="field"><label>Roster, one per line (full names; nicknames like Hoss / Jarn still map)</label>
          <textarea defaultValue={(cfg.roster || ident.parlayRoster()).join('\n')} onInput={(e) => { cfg.roster = e.target.value.split('\n').map((s) => ident.canonical(s.trim()) || s.trim()).filter(Boolean); }} />
        </div>
        <div><button className="btn btn--primary" type="button" onClick={save}>Save settings</button></div>
      </div>
    </section>
  );
}

function WeekEditor({ store }) {
  const { state } = store;
  const [, setLayout] = useState(0);
  const relayout = () => setLayout((n) => n + 1);
  const defaultNew = nextUnusedWeek(state.weeks, state.nfl);
  const fillAutoPayer = (ticket) => {
    const lp = store.lastPlaceFor(Number(ticket.week) - 1);
    if (lp && lp.who && !ticket.payer) {
      ticket.payer = lp.who;
      ticket.payerNote = store.weekPayerNote({ week: ticket.week, payer: '', payerNote: '' });
    }
    return ticket;
  };
  if (!state.admin.editing) {
    state.admin.editing = state.weeks.length ? clone(state.weeks[state.weeks.length - 1]) : fillAutoPayer(newWeek(defaultNew));
    // restore overrides into legs for editing
    const w = state.admin.editing;
    for (const l of w.legs || []) if (w.overrides && w.overrides[l.id] && !l.override) l.override = w.overrides[l.id];
  }
  const wk = state.admin.editing;
  const formKey = String(wk.week) + ':' + (wk.__rev || 0);
  const isSaved = !!state.weeks.find((w) => w.week === wk.week);
  const pickWeek = (v) => {
    const next = v === 'new' ? fillAutoPayer(newWeek(defaultNew)) : clone(state.weeks.find((w) => w.week === Number(v)));
    for (const l of next.legs || []) if (next.overrides && next.overrides[l.id] && !l.override) l.override = next.overrides[l.id];
    state.admin.editing = next;
    store.emit();
  };
  const roster = ident.parlayRoster();
  const payers = store.payerRoster();
  const lp = store.lastPlaceFor(Number(wk.week) - 1);
  const payerHint = lp && lp.who
    ? `ESPN last place Week ${lp.week}: ${ident.nick(lp.who)}${lp.points != null ? ' · ' + Number(lp.points).toFixed(1) + ' PF' : ''}. Heller still pays if he finished last.`
    : (state.lastPlace && state.lastPlace.unauthorized
      ? 'Private ESPN league — add ESPN_S2 and ESPN_SWID on Vercel to auto-fill last place.'
      : 'Payer is last place the week before. Auto-fills from ESPN when the league is readable.');
  const groups = wk.groups || (wk.groups = {});
  const legs = wk.legs || (wk.legs = []);
  const ids = Array.from(new Set(legs.map((l) => l.group).filter(Boolean)));
  for (const id of ids) groups[id] = groups[id] || { label: '', odds: '' };
  for (const k of Object.keys(groups)) if (!ids.includes(k)) delete groups[k];

  const save = async (lock) => {
    try {
      const payload = clone(wk);
      delete payload.__rev;
      payload.payer = ident.canonical(payload.payer);
      payload.placedBy = ident.canonical(payload.placedBy);
      payload.overrides = {};
      for (const l of payload.legs || []) {
        l.who = ident.canonical(l.who);
        if (l.override) payload.overrides[l.id] = l.override;
        delete l.override;
      }
      if (lock) {
        const g = await store.grade(payload, { force: true });
        if (!['cashed', 'busted'].includes(g.summary.state) && !confirm('Not every leg is final. Lock anyway?')) return;
        payload.locked = { at: new Date().toISOString(), results: {} };
        for (const r of g.graded) payload.locked.results[r.leg.id] = { state: r.state, detail: r.detail, current: r.current, gameDate: r.gameDate };
      } else {
        delete payload.locked;
      }
      const week = Number(payload.week);
      delete payload.week;
      await store.sb.rpc('holm_parlay_save_week', { p_pass: state.admin.pass, p_season: SEASON, p_week: week, p_data: payload });
      toast(lock ? `Week ${week} locked` : `Week ${week} saved`);
      state.admin.editing = null; state.selectedWeek = week;
      await store.loadData(); await store.refreshScores(true); store.emit();
    } catch (e) { toast('Save failed: ' + e.message); }
  };
  const remove = async () => {
    if (!confirm(`Delete Week ${wk.week}?`)) return;
    try {
      await store.sb.rpc('holm_parlay_delete_week', { p_pass: state.admin.pass, p_season: SEASON, p_week: Number(wk.week) });
      state.admin.editing = null; await store.loadData(); store.emit();
    } catch (e) { toast(e.message); }
  };
  const lockAdmin = () => {
    state.admin.pass = '';
    try { sessionStorage.removeItem('hp_pass'); } catch (e) { /* ignore */ }
    state.admin.editing = null;
    store.emit();
  };
  const useEspnPayer = () => {
    wk.payer = lp.who;
    wk.payerNote = store.weekPayerNote({ week: wk.week, payer: '', payerNote: '' });
    wk.__rev = (wk.__rev || 0) + 1;
    store.emit();
  };

  return (
    <section className="card">
      <div className="card__head"><h2>Week ticket</h2><button className="btn btn--ghost btn--sm" type="button" onClick={lockAdmin}>Lock admin</button></div>
      <p className="muted" style={{ margin: '0 16px 8px' }}>Add a week by editing data/bets.json. Weeks in that file stay on the board. A Supabase week shows up only when its week number is not in the file.</p>
      <div className="card__body form" key={formKey}>
        <div className="row">
          <div className="field"><label>Week</label>
            <select value={isSaved ? String(wk.week) : 'new'} onChange={(e) => pickWeek(e.target.value)}>
              {state.weeks.map((w) => <option key={w.week} value={String(w.week)}>{'Week ' + w.week}</option>)}
              <option value="new">+ New week</option>
            </select>
          </div>
          <div className="field"><label>Week number</label><Bound obj={wk} k="week" num /></div>
          <div className="field"><label>Payer (last place prior week)</label><BoundSelect obj={wk} k="payer" options={[''].concat(payers).map((o) => [o, o])} /></div>
          <div className="field"><label>Placed by</label><BoundSelect obj={wk} k="placedBy" options={[''].concat(roster).map((o) => [o, o])} /></div>
        </div>
        <p className="muted" style={{ margin: 0 }}>{payerHint}</p>
        {lp && lp.who ? <div className="inline"><button className="btn btn--ghost btn--sm" type="button" onClick={useEspnPayer}>Use ESPN last place</button></div> : null}
        <div className="row">
          <div className="field"><label>Stake $</label><Bound obj={wk} k="stake" num /></div>
          <div className="field"><label>Parlay odds (e.g. 22840)</label><Bound obj={wk} k="odds" num /></div>
          <div className="field"><label>To pay $</label><Bound obj={wk} k="toPay" num /></div>
          <div className="field"><label>Book</label><Bound obj={wk} k="book" /></div>
        </div>
        <div className="field"><label>Note (shown under the legs)</label><Bound obj={wk} k="note" /></div>
      </div>
      <div className="card__head"><h2>Legs</h2><button className="btn btn--secondary btn--sm" type="button" onClick={() => { legs.push(blankLeg()); relayout(); }}>Add leg</button></div>
      <div key={formKey + ':legs'}>
        {legs.map((leg, idx) => (
          <LegEditor key={leg.id || idx} leg={leg} idx={idx} roster={roster} onLayout={relayout} onRemove={() => { legs.splice(idx, 1); relayout(); }} />))}
        {ids.map((id) => (
          <div key={'sgp-' + id} className="legedit"><div className="row">
            <div className="field"><label>{`SGP ${id} · label`}</label><Bound obj={groups[id]} k="label" placeholder="3 pick SGP" /></div>
            <div className="field"><label>SGP odds</label><Bound obj={groups[id]} k="odds" num placeholder="525" /></div>
          </div></div>))}
      </div>
      <div className="card__body inline">
        <button className="btn btn--primary" type="button" onClick={() => save(false)}>Save week</button>
        <button className="btn btn--secondary" type="button" onClick={() => save(true)}>Lock results</button>
        {wk.locked ? <span className="muted">{'Locked ' + new Date(wk.locked.at).toLocaleDateString()}</span> : <span className="muted">Lock once every leg is final so standings stop hitting ESPN for this week.</span>}
        {isSaved ? <button className="btn btn--ghost" type="button" onClick={remove}>Delete week</button> : null}
      </div>
    </section>
  );
}

export default function CommissionerView() {
  const store = useLeague();
  const { state } = store;
  return (
    <Page title="Commissioner" sub="Enter the week’s ticket, fix a grade, lock a settled week.">
      {!state.admin.pass ? <Unlock store={store} /> : (
        <>
          <WeekEditor store={store} />
          <LeagueSettings store={store} />
        </>)}
    </Page>
  );
}
