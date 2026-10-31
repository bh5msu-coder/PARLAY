'use client';
import Link from 'next/link';
import { useLeague } from './LeagueProvider';
import { Page } from './Topbar';
import { StatusBadge } from './ui';
import { fmtMoney, fmtOdds } from '../lib/format.mjs';
import { ident, sitHandle, whoLabel } from '../lib/ident.mjs';
import { summarizeParlay } from '../lib/weeks.mjs';
import { seasonRecord } from '../lib/standings.mjs';
import { weekStates, weekMoney } from '../lib/model.mjs';
import { rule } from '../lib/rules.mjs';
import InfoTip from './InfoTip';
import PaymentChips from './PaymentChips';
import { payerShare } from '../lib/league-store.mjs';
import { buildRecap } from '../lib/recap.mjs';
import { weeklyLegs, weeklyTickets } from '../lib/stats.mjs';
import { toast } from '../lib/clients.mjs';
import { DEFAULT_CHAT_URL } from '../lib/pick-form.mjs';

/** Recap of a settled week (busted or cashed). Open or unrecorded weeks get no recap. */
function RecapCard({ week, state }) {
  const t = weeklyTickets([week], state.graded)[0];
  const legs = weeklyLegs([week], state.graded);
  const r = buildRecap(Object.assign({}, t, { legs }), 'data/bets.json');
  if (!r.settled) return null;
  const share = () => window.open('https://wa.me/?text=' + encodeURIComponent(r.text + '\n\nHolm chat: ' + (state.config.chat || DEFAULT_CHAT_URL)), '_blank');
  const copy = async () => { try { await navigator.clipboard.writeText(r.text); toast('Recap copied'); } catch (e) { toast('Copy failed'); } };
  return (
    <section className="card">
      <div className="card__head"><h2>{r.title}</h2><span className="sub">From recorded results · data/bets.json</span></div>
      <div className="card__body">
        <p className="recap">{r.text}</p>
        <div className="inline">
          <button className="btn btn--secondary btn--sm" type="button" onClick={share}>Share to WhatsApp</button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={copy}>Copy</button>
        </div>
      </div>
    </section>
  );
}

/** Names for a sentence: "A, B and C", or the first four and "+N more". */
function nameList(names) {
  const shown = names.slice(0, 4).map((x) => whoLabel(x));
  const more = names.length - shown.length;
  if (more > 0) return shown.join(', ') + ` +${more} more`;
  return shown.length > 1 ? shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1] : shown.join('');
}

function myName(state) {
  let who = (state.pick.form && state.pick.form.who) || '';
  if (!who) { try { who = localStorage.getItem('hp_who') || ''; } catch (e) { who = ''; } }
  return who ? ident.canonical(who) : '';
}

/** One card that answers: what week is it, am I in, what happens next. Open, locked and settled each get their own copy. */
function ThisWeekCard({ store, week, pending, s, payers, need, hold }) {
  const { state } = store;
  const clock = state.nfl && state.nfl.active === week.week ? state.nfl : null;
  const pickOpen = pending && state.pick.week === week.week;
  const rows = pickOpen ? state.pick.rows || [] : [];
  const pickedSet = new Set(rows.map((r) => ident.canonical(r.who)));
  const missing = pickOpen
    ? ((state.pick.ticket && state.pick.ticket.missing) || (state.config.roster || []).filter((n) => !pickedSet.has(ident.canonical(n)))).map((n) => ident.canonical(n))
    : [];
  const me = myName(state);
  const mine = me ? rows.find((r) => ident.canonical(r.who) === me) : null;
  const stake = week.stake || 10;
  const payLine = payers.length > 1
    ? `${payers.map((x) => whoLabel(x)).join(' and ')} split the ${fmtMoney(stake)}`
    : payers.length ? `${whoLabel(payers[0])} pays the ${fmtMoney(stake)}` : `${fmtMoney(stake)} stake · payer not set yet`;

  let phase; let pill; let sub; let head; let line; let cta;
  if (s && (s.state === 'busted' || s.state === 'cashed')) {
    phase = 'settled';
    pill = s.state === 'cashed' ? 'Cashed' : 'Busted';
    sub = s.state === 'cashed' ? `${s.won} of ${s.total} hit` : `${s.won} of ${s.total} hit · killed by ${s.killers.map((k) => whoLabel(k)).join(', ')}`;
    head = s.state === 'cashed' ? 'IT CASHED.' : 'BUSTED.';
    line = clock ? `${payLine} · next week opens when the last game is final` : payLine;
    cta = { href: '#legs', text: 'See the legs' };
  } else if (!pending && hold && !(s && s.live) && !(clock && clock.snapshot && !clock.snapshot.allFinal)) {
    phase = 'settled';
    pill = 'Not recorded';
    sub = 'No result was entered for this ticket';
    head = 'RESULT NOT RECORDED.';
    line = `${payLine} · ${(week.legs || []).length} legs`;
    cta = { href: '#legs', text: 'See the legs' };
  } else if (!pending) {
    phase = 'locked';
    pill = s && s.live ? 'Live' : 'Locked';
    sub = s && !hold ? `${s.won} of ${s.total} hit · ${s.live} live · ${s.pending} to play` : hold ? 'Games still to play · results not graded yet' : 'Loading scores';
    head = s && s.lost ? 'STILL SWEATING.' : 'TICKET IS IN.';
    line = `${payLine} · ${(week.legs || []).length} legs`;
    cta = { href: '#legs', text: 'Watch the legs' };
  } else {
    phase = 'open';
    pill = 'Picks open';
    sub = clock && clock.firstKickLabel ? `Locks at first kick · ${clock.firstKickLabel}` : 'Locks at kickoff';
    const inCount = Math.max(0, need - missing.length);
    if (me && mine) head = 'YOU’RE IN.';
    else if (me) head = 'YOU’RE NOT IN YET.';
    else head = `${inCount} OF ${need} PICKS IN.`;
    line = [payLine, missing.length ? `Still need ${nameList(missing)}` : 'Every pick is in'].join(' · ');
    cta = { href: '/pick', text: mine ? 'Change my pick' : 'Make my pick' };
  }

  return (
    <section className={'card thisweek thisweek--' + phase} aria-label="This week">
      <div className="thisweek__top">
        <span className="label">{clock ? `This week’s parlay · Week ${week.week}` : `Week ${week.week} parlay`}</span>
        <span className={'thisweek__pill thisweek__pill--' + phase}>{pill}</span>
      </div>
      <span className="small muted">{sub}</span>
      <h2 className="thisweek__head">{head}</h2>
      {mine ? <span className="small">{`Your pick: ${(mine.leg && mine.leg.label) || 'saved'}`}</span> : null}
      <span className="small">{line}</span>
      <div><Link className="btn btn--primary" href={cta.href}>{cta.text}</Link></div>
    </section>
  );
}

const TICKET_TEXT = {
  proposed: 'Proposed — not placed at a sportsbook',
  placed: 'Placed at a sportsbook',
  settled: 'Placed and settled',
};

/** The three separate facts about a week. None implies another. */
function StateChips({ week, savedRows, need, config }) {
  const st = weekStates(week, savedRows);
  const proof = 'Proof of placement: ' + rule(config, 'placementProof').text.charAt(0).toLowerCase() + rule(config, 'placementProof').text.slice(1);
  const t = st.ticket;
  const placed = t.state !== 'proposed';
  return (
    <section className="chips" aria-label="Week status">
      <div className="statechip">
        <span className="label">Picks saved</span>
        <span className="statechip__v">{`${st.picksSaved} / ${need}`}</span>
        <span className="small muted">A saved pick is not a bet.</span>
      </div>
      <div className={'statechip' + (st.contributionsRecorded.count ? '' : ' statechip--no')}>
        <span className="label">Contributions recorded <InfoTip k="contributions" label="contributions recorded" /></span>
        <span className="statechip__v">{st.contributionsRecorded.count ? fmtMoney(st.contributionsRecorded.amount) : 'None recorded'}</span>
        <span className="small muted">{`Stake listed ${fmtMoney(week.stake || 10)} · due by kickoff`}</span>
        <PaymentChips payments={(week.contributions || []).filter((c) => c.who)} />
      </div>
      <div className={'statechip' + (placed ? '' : ' statechip--no')}>
        <span className="label">Ticket <InfoTip k="ticketState" label="ticket state" /></span>
        <span className="statechip__v">{TICKET_TEXT[t.state] || t.state}</span>
        <span className="small muted">{t.evidence}{placed ? '' : ' ' + proof}</span>
      </div>
    </section>
  );
}

const TYPE_LABEL = { ml: 'Moneyline', spread: 'Spread', total: 'Total', player: 'Player prop', tbd: 'Not posted' };

function LegRow({ g, week, dead }) {
  const leg = g.leg;
  const typeLabel = TYPE_LABEL[leg.type] || leg.type;
  const game = (leg.game || []).filter(Boolean).join(' at ');
  const inGroup = leg.group && week.groups && week.groups[leg.group];
  const showCur = g.current != null && (g.state === 'live' || g.state === 'won' || g.state === 'lost');
  return (
    <li className={'leg' + (dead && g.state !== 'won' && g.state !== 'lost' && g.state !== 'push' ? ' leg--dead' : '')}>
      <span className="leg__who">{whoLabel(leg.who)}</span>
      <div>
        <div className="leg__pick">{leg.label || ''}</div>
        <div className="leg__market">{game ? `${typeLabel} · ${game}` : typeLabel}</div>
      </div>
      <div className="leg__game">
        <span>{g.detail || ''}</span>
        {showCur ? <span className="cur">{String(g.current)}</span> : null}
      </div>
      <div className="leg__right">
        <span className="leg__odds num">{inGroup ? 'SGP' : fmtOdds(leg.odds)}</span>
        <StatusBadge state={g.state} />
      </div>
    </li>
  );
}

function WeekTabs({ store }) {
  const { state } = store;
  return (
    <div className="tabs" role="tablist" aria-label="Weeks">
      {store.weekTabNumbers().map((n) => (
        <button key={n} className="tab" role="tab" type="button" aria-selected={n === state.selectedWeek ? 'true' : 'false'} onClick={() => store.selectWeek(n)}>{'Wk ' + n}</button>
      ))}
    </div>
  );
}

export default function WeekView() {
  const store = useLeague();
  const { state } = store;
  if (!state.ready) return <Page title="Parlay" />;
  const n = state.selectedWeek || (state.nfl && state.nfl.active);
  const week = (n && store.weekRecord(n)) || (state.weeks.length ? state.weeks[state.weeks.length - 1] : null);
  if (!week) {
    return (
      <Page title="No tickets yet" sub="The commissioner adds the first week from the Commissioner tab.">
        <div className="card"><div className="empty">No weeks yet. Add the current NFL week from the Commissioner tab.</div></div>
      </Page>
    );
  }
  const gr = state.graded[week.week];
  const legs = week.legs || [];
  const pending = !!week.pendingTicket || !legs.length;
  const participants = legs.length || (state.config.roster || []).length || 11;
  const split = rule(state.config, 'payoutSplit');
  const money = weekMoney(week);
  const ticketState = weekStates(week).ticket.state;
  const savedRows = state.pick.week === week.week ? state.pick.rows : null;
  const payer = store.weekPayer(week);
  const payers = store.weekPayers(week);
  const kick = store.weekKickNote(week.week);
  const s = gr ? gr.summary : null;
  const hold = week.results === 'unknown' || week.results === 'pending';

  let statusEl;
  if (pending && !s) statusEl = <span className="status status--pending">Waiting on the ticket</span>;
  else if (!s) statusEl = <span className="status status--pending">Loading scores</span>;
  else if (s.state === 'busted') statusEl = <span className="status status--lost">{`Busted · killed by ${s.killers.map((k) => whoLabel(k)).join(', ')}`}</span>;
  else if (s.state === 'cashed') statusEl = <span className="status status--won">{money.recorded.payouts ? `Cashed · ${fmtMoney(money.recorded.payouts)} paid` : `Cashed · slip said ${fmtMoney(week.toPay)} (hypothetical until a payout is recorded)`}</span>;
  else if (hold) statusEl = <span className="status status--unknown">{`Unknown · ${s.pending} of ${s.total} not graded`}</span>;
  else statusEl = <span className={'status status--' + (s.live ? 'live' : 'pending')}>{`${s.state === 'live' ? 'Live' : 'Open'} · ${s.won} of ${s.total} hit`}</span>;
  const gradeNote = gr && gr.fetchedAt ? 'Updated ' + new Date(gr.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : hold ? 'Results not recorded' : gr && gr.fromLock ? 'Recorded result' : '';

  // legs, with same-game parlays grouped under a header row
  const dead = s && s.state === 'busted';
  const graded = gr ? gr.graded : legs.map((leg) => ({ leg, state: 'pending', detail: 'Loading…' }));
  const groups = week.groups || {};
  const done = new Set();
  const rows = [];
  for (const g of graded) {
    const gid = g.leg.group;
    if (gid && groups[gid] && !done.has(gid)) {
      done.add(gid);
      const members = graded.filter((x) => x.leg.group === gid);
      const gs = summarizeParlay(members);
      rows.push(
        <li key={'g-' + gid} className="leg leg--group">
          <span className="label">{groups[gid].label || 'Same-game parlay'}</span>
          <span className="muted" style={{ fontSize: 13 }}>Same-game parlay, priced as one leg</span>
          <span className="muted" style={{ fontSize: 13 }}>{(members[0].leg.game || []).join(' at ')}</span>
          <span className="num leg__odds" style={{ textAlign: 'right' }}>{fmtOdds(groups[gid].odds)}</span>
          <span style={{ textAlign: 'right' }}><StatusBadge state={gs.state === 'busted' ? 'lost' : gs.state === 'cashed' ? 'won' : gs.live ? 'live' : 'pending'} /></span>
        </li>);
      members.forEach((m, i) => rows.push(<LegRow key={'g-' + gid + '-' + (m.leg.id || i)} g={m} week={week} dead={dead} />));
    } else if (!gid || !groups[gid]) {
      rows.push(<LegRow key={g.leg.id || 'leg-' + rows.length} g={g} week={week} dead={dead} />);
    }
  }

  return (
    <Page title={`Week ${week.week} parlay`} sub={pending ? 'Picks are open' : `${participants}-way split`}>
      <WeekTabs store={store} />
      {kick ? <p className="rules rules--warn">{kick}</p> : null}
      {state.dataConflicts && state.dataConflicts.length
        ? <p className="rules">{'Supabase has a different ticket for week ' + state.dataConflicts.map((c) => c.week).join(', ') + '. This board is showing data/bets.json.'}</p>
        : null}

      <ThisWeekCard store={store} week={week} pending={pending} s={s} payers={payers} need={participants} hold={hold} />

      {pending ? null : <>
      <StateChips week={week} savedRows={savedRows} need={participants} config={state.config} />

      <section className="card banner">
        <div>
          <span className="label">Payer</span>
          <span className="big">{payers.length > 1 ? `${payers.map((x) => whoLabel(x)).join(' and ')} pay ${fmtMoney(payerShare(week.stake || 10, payers.length))} each` : payer ? `${whoLabel(payer)} pays ${fmtMoney(week.stake || 10)}` : `Stake ${fmtMoney(week.stake || 10)} · payer not recorded`}</span>
          <span className="small">{store.weekPayerNote(week)}</span>
        </div>
        <div>
          <span className="label">Ticket</span>
          <span className="big">{pending ? 'Not placed yet' : ticketState === 'proposed' ? `${legs.length} legs · not placed` : `${legs.length} legs · placed by ${week.placedBy ? whoLabel(week.placedBy) : '—'}`}</span>
          <span className="small">{(state.config.abstain || []).length ? `${state.config.abstain.map((x) => sitHandle(x)).join(', ')} sits` : ''}</span>
        </div>
        <div>
          <span className="label">Parlay status</span>
          <div>{statusEl}</div>
          <span className="small">{gradeNote || (pending ? 'After the previous week’s last game is final' : '')}</span>
        </div>
      </section>

      <section className="stats" aria-label="Week stats">
        <div className="card stat"><span className="label">Parlay odds</span><span className="stat__value">{pending ? '—' : fmtOdds(week.odds)}</span><span className="stat__delta">{`${fmtMoney(week.stake || 10)} stake`}</span></div>
        <div className="card stat"><span className="label">Hypothetical payout <InfoTip k="hypothetical" label="hypothetical payout" /></span><span className="stat__value">{pending ? '—' : fmtMoney(week.toPay)}</span><span className="stat__delta">{pending || week.toPay === '' || week.toPay == null ? '' : split.decided ? `If every leg hits · ${split.value === 'in-person' ? 'split in person' : 'split ' + split.value}` : 'If every leg hits · split not decided'}</span></div>
        <div className="card stat"><span className="label">Legs settled</span><span className="stat__value">{s ? `${s.won + s.lost + s.pushes} / ${s.total}` : '–'}</span><span className="stat__delta">{s ? `${s.live} live · ${s.pending} to play` : (pending ? 'Ticket not in yet' : '')}</span></div>
        <div className="card stat"><span className="label">Season parlays</span><span className="stat__value">{seasonRecord(state.weeks, state.graded)}</span><span className="stat__delta">cashed – busted</span></div>
      </section>
      </>}

      {pending ? (
        <p className="muted small">{`${store.weekPayerNote(week)} · Season parlays ${seasonRecord(state.weeks, state.graded)} (cashed – busted)`}</p>
      ) : (
        <>
        <RecapCard week={week} state={state} />
        <section className="card" id="legs">
          <div className="card__head"><h2>Legs</h2><span className="sub">{gr && gr.error ? 'Live scores unavailable; showing what we have.' : 'Scores refresh every 45 seconds during games.'}</span></div>
          <ol className="legs">{rows}</ol>
          <div className="notice"><span>{week.note || ''}</span><span>{week.book ? `Book: ${week.book}` : ''}</span></div>
        </section>
        </>
      )}
    </Page>
  );
}
