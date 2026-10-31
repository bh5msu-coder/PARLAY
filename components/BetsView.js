'use client';
import { useEffect, useState } from 'react';
import { useLeague } from './LeagueProvider';
import { Page } from './Topbar';
import { KpiCard } from './ui';
import { fmtElo } from '../lib/format.mjs';
import { ident, RIVALRIES, whoLabel } from '../lib/ident.mjs';
import { calcSeasonElo } from '../lib/elo.mjs';
import { calcParlayStats, hitPct, SMALL_N } from '../lib/history-stats.mjs';

import InfoTip, { SmallSample } from './InfoTip';
import { paymentsByWeek, paymentTotal } from '../lib/payments.mjs';
import { iouLedger, splitPayers } from '../lib/iou.mjs';
import { fmtMoney } from '../lib/format.mjs';
import { DiscrepancyCard, SelectionCharts, TicketSection } from './Dashboard';
import { cachedHistory, historyLegs, historyTickets, loadHistory } from '../lib/history.mjs';
import { reconcile } from '../lib/reconcile.mjs';

// parlay-history.json is static and read-only: lib/history.mjs loads it with one GET and deep-freezes it.
// This page never writes anything — no Supabase call, no POST, no change to data/bets.json.

const SampleTag = ({ n }) => <SmallSample n={n} threshold={SMALL_N} />;
const TYPE_LAB = { ml: 'Moneyline', spread: 'Spread', total: 'Game total', player: 'Player prop' };

/** Each week's stake split across its payers, set against the payments recorded for it. A share with no recorded
 *  payment is open: the money may have moved in the chat without being entered. */
function ledgerTickets(data, weeks, store) {
  const out = {};
  for (const p of (data && data.parlays) || []) {
    if (p.stake && p.payer) out[p.week] = { week: p.week, stake: p.stake, payers: splitPayers(p.payer) };
  }
  for (const w of weeks || []) {
    const payers = w.stake ? store.weekPayers(w) : [];
    if (payers.length) out[w.week] = { week: w.week, stake: w.stake, payers };
  }
  return Object.values(out);
}

function shareChip(s) {
  const bits = [];
  if (s.paid) bits.push(<span key="p" className="pill pill--paid">{`${whoLabel(s.who)} · ${fmtMoney(s.paid)} paid`}</span>);
  for (const c of s.covered) bits.push(<span key={'c' + c.who} className="pill pill--paid">{`${whoLabel(c.who)} covered ${whoLabel(s.who)} · ${fmtMoney(c.amount)}`}</span>);
  if (s.open) bits.push(<span key="o" className="pill pill--open">{`${whoLabel(s.who)} · ${fmtMoney(s.open)} not recorded`}</span>);
  return bits;
}

function IouCard({ ledger, byWeek }) {
  const { weeks, people, totals } = ledger;
  return (
    <section className="card" id="iou">
      <div className="card__head"><h2>IOU ledger</h2><span className="sub">{weeks.length ? `${fmtMoney(totals.owed)} in stakes · ${fmtMoney(totals.recorded)} recorded paid · ${fmtMoney(totals.open)} not recorded` : 'no stakes yet'}</span></div>
      <div className="card__body">
        {people.length ? (
          <div className="tablewrap"><table className="iou-table">
            <thead><tr><th>Manager</th><th className="r">Owed</th><th className="r">Paid</th><th className="r" title="Paid by someone else">Covered</th><th className="r hide-m">Covered for others</th><th className="r">Open</th></tr></thead>
            <tbody>{people.map((r) => (
              <tr key={r.who}>
                <td>{whoLabel(r.who)}</td>
                <td className="r num">{fmtMoney(r.owed)}</td>
                <td className="r num">{r.paid ? fmtMoney(r.paid) : '–'}</td>
                <td className="r num">{r.coveredByOthers ? fmtMoney(r.coveredByOthers) : '–'}</td>
                <td className="r num hide-m">{r.coveredForOthers ? fmtMoney(r.coveredForOthers) : '–'}</td>
                <td className={'r num' + (r.open ? ' iou--open' : '')}>{r.open ? fmtMoney(r.open) : '–'}</td>
              </tr>))}</tbody>
          </table></div>
        ) : null}
        {weeks.map((w) => (
          <div key={w.week} className="payrow" title={(byWeek[w.week] || []).map((p) => p.note).filter(Boolean).join(' ')}>
            <span className="label">{`Week ${w.week} · ${fmtMoney(w.stake)}`}</span>
            <span className="paychips">{w.shares.flatMap(shareChip)}{w.extra.map((x) => <span key={'x' + x.who} className="pill pill--paid">{`${whoLabel(x.who)} · ${fmtMoney(x.amount)} extra`}</span>)}</span>
          </div>
        ))}
        <p className="muted small">Only payments entered in the league database count as paid. Open means no payment is on file yet, not that it was never paid. Covered means someone else paid that share. Ties for last split the stake ($5 each on $10).</p>
      </div>
    </section>
  );
}

function History({ data, selectedOwner, weeks, payments, store }) {
  const S = calcParlayStats(data, whoLabel);
  const wins = S.decided.filter((l) => l.result === 'win').length;
  const closest = S.graded.slice().sort((a, b) => a.record.loss - b.record.loss)[0];
  const stake = S.graded.reduce((s, p) => s + (p.stake || 0), 0);
  const gradedWeeks = new Set(S.graded.map((p) => p.week));
  const paidGraded = paymentTotal((payments || []).filter((p) => gradedWeeks.has(p.week)));
  const elig = S.rows.filter((r) => r.n >= 4);
  const lock = elig[0];
  const cursed = elig.slice().sort((a, b) => (a.w / a.n) - (b.w / b.n) || b.l - a.l)[0];
  const reliable = S.rows.slice().sort((a, b) => b.bestStreak - a.bestStreak || (b.w / (b.n || 1)) - (a.w / (a.n || 1)))[0];
  const henry = S.legs.filter((l) => /Derrick Henry/.test(l.label));
  const near = S.legs.filter((l) => l.missBy);
  const recOf = (id) => { const p = ident.people.find((x) => x.id === id); const r = p && S.rows.find((x) => ident.person(x.name) === p); return { nick: p ? whoLabel(p.name) : id, r }; };
  const elo = calcSeasonElo(ident.people);
  const eloRank = {}; elo.now.forEach((r, i) => { eloRank[r.name] = i + 1; });
  const dec110 = 1 + 100 / 110;

  return (
    <>
      <section className="stats stats--lore">
        <KpiCard label="Tickets graded" value={String(S.graded.length)} note={`2026 · ${S.graded.filter((p) => p.result === 'win').length} cashed`} />
        <KpiCard label="Leg hit rate" value={hitPct(wins, S.decided.length)} note={`${wins}–${S.decided.length - wins} on decided legs`} />
        <KpiCard label="Closest call" value={closest ? closest.label : '–'} note={closest ? `${closest.record.loss} legs from cashing` : ''} />
        <KpiCard label="Stakes listed" value={fmtMoney(stake)} note={`Graded tickets · ${paidGraded ? fmtMoney(paidGraded) + ' of it recorded paid' : 'no payments recorded yet'} · $0 recorded back`} />
      </section>

      <IouCard ledger={iouLedger(ledgerTickets(data, weeks, store), payments)} byWeek={paymentsByWeek(payments)} />
      <DiscrepancyCard result={reconcile({ weeks }, data)} />
      <TicketSection tickets={historyTickets(data)} sourceNote="parlay-history.json (read-only)" />
      <SelectionCharts legs={historyLegs(data)} sourceNote="parlay-history.json (read-only) · decided picks only" />

      <section className="card">
        <div className="card__head"><h2>Awards</h2><span className="sub">{`${S.graded.length} graded tickets · everything here is a small sample`}</span></div>
        <div className="card__body stats">
          <KpiCard label="Lock of the Year" value={lock ? lock.nick : '–'} note={lock ? `${lock.w}–${lock.l} (${hitPct(lock.w, lock.n)})` : 'min 4 legs'} />
          <KpiCard label="Cursed Leg" value={cursed ? cursed.nick : '–'} note={cursed ? `${cursed.w}–${cursed.l} (${hitPct(cursed.w, cursed.n)})` : ''} />
          <KpiCard label="Mr. Reliable" value={reliable ? reliable.nick : '–'} note={reliable ? `${reliable.bestStreak} straight hits` : ''} />
          <KpiCard label="Henry truthers" value={String(henry.length) + ' picks'} note={`${henry.filter((l) => l.result === 'win').length} hit · ${[...new Set(henry.map((l) => whoLabel(l.who)))].join(', ')}`} />
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Leg hit rate <InfoTip k="hitRate" label="hit rate" /></h2><span className="sub">Graded legs only · unknown in ( )</span></div>
        <div className="card__body">
          <div className="tablewrap"><table>
            <thead><tr><th>#</th><th>Picker</th><th className="r">W–L</th><th className="r">Hit</th><th className="r">Now</th><th className="r hide-m">Hot</th><th className="r hide-m">Cold</th><th className="r hide-m">Busted</th><th className="r hide-m">Primetime</th></tr></thead>
            <tbody>{S.rows.map((r, i) => (
              <tr key={r.name} className={r.name === selectedOwner ? 'me' : ''}>
                <td className="rank">{String(i + 1)}</td>
                <td>{r.nick}{' '}<SampleTag n={r.n} /></td>
                <td className="r num">{`${r.w}–${r.l}` + (r.u ? ` (${r.u}?)` : '')}</td>
                <td className="r num">{hitPct(r.w, r.n)}</td>
                <td className="r num">{r.streak}</td>
                <td className="r num hide-m">{String(r.bestStreak)}</td>
                <td className="r num hide-m">{String(r.coldStreak)}</td>
                <td className="r num hide-m">{String(r.busts)}</td>
                <td className="r num hide-m">{r.pn ? `${r.pw}/${r.pn}` : '–'}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="muted">Busted = legs that lost on a ticket that lost. Every graded ticket lost, so each loss counts. Primetime = night kickoffs (TNF/SNF/MNF). Under 5 legs is flagged as a small sample.</p>
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Who busted it</h2><span className="sub">Losing legs per ticket</span></div>
        <div className="card__body">{data.parlays.map((p) => (
          <div key={p.label} className="field">
            <b>{`${p.label} · ${p.legs.length} legs · `}</b>
            {p.result === 'pending' ? <span className="pill">pending</span> : `${p.record.win}–${p.record.loss}` + (p.record.unknown ? ` · ${p.record.unknown} unknown` : '')}
            {p.toPay ? <span className="muted">{` · hypothetical payout ${fmtMoney(p.toPay)} (not paid)`}</span> : null}
            <div className="pills">{p.legs.filter((l) => l.result === 'loss').map((l, i) => <span key={i} className="chip">{`${whoLabel(l.who)}: ${l.label}`}</span>)}</div>
          </div>))}</div>
      </section>

      {(data.unplaced || []).map((p) => (
        <section key={p.label} className="card" id={`unplaced-${p.week}`}>
          <div className="card__head"><h2>{`${p.label}: never placed`}</h2><span className="pill pill--open">Not placed</span></div>
          <div className="card__body">
            <p>{p.notes}</p>
            <div className="tablewrap"><table>
              <thead><tr><th>Manager</th><th>Pick</th></tr></thead>
              <tbody>{p.legs.map((l) => (
                <tr key={l.who}><td>{whoLabel(l.who)}</td><td>{l.label}{l.note ? <span className="muted">{' · ' + l.note}</span> : null}</td></tr>))}</tbody>
            </table></div>
            <p className="muted">{'Not graded and not counted in any stat, stake or IOU. Source: ' + p.source}</p>
          </div>
        </section>))}

      <section className="card">
        <div className="card__head"><h2>Near misses</h2><span className="sub">Lost by a hair</span></div>
        <div className="card__body"><div className="tablewrap"><table>
          <thead><tr><th>Wk</th><th>Picker</th><th>Leg</th><th>Actual</th><th>Missed by</th></tr></thead>
          <tbody>{near.map((l, i) => <tr key={i}><td>{String(l.week)}</td><td>{whoLabel(l.who)}</td><td>{l.label}</td><td>{l.actual || ''}</td><td>{l.missBy}</td></tr>)}</tbody>
        </table></div></div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Bet-type performance</h2><span className="sub">All pickers</span></div>
        <div className="card__body stats">{Object.keys(S.types).map((k) => (
          <KpiCard key={k} label={TYPE_LAB[k] || k} value={hitPct(S.types[k].w, S.types[k].n)} note={`${S.types[k].w}–${S.types[k].n - S.types[k].w}` + (S.types[k].n < SMALL_N ? ' · small sample' : '')} />))}</div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Favorite teams &amp; players</h2><span className="sub">Picked 2+ times</span></div>
        <div className="card__body"><div className="tablewrap"><table>
          <thead><tr><th>Team / player</th><th className="r">Picks</th><th className="r">Hit</th><th>By</th></tr></thead>
          <tbody>{S.favs.map((t) => <tr key={t.key}><td>{t.key}</td><td className="r num">{String(t.n)}</td><td className="r num">{`${t.w}/${t.n}`}</td><td>{Object.keys(t.by).join(', ')}</td></tr>)}</tbody>
        </table></div></div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Rivalry head-to-head: parlay edition</h2><span className="sub">League-lore rivalries, scored by leg hit rate</span></div>
        <div className="card__body">
          {RIVALRIES.map((rv) => {
            const a = recOf(rv.a), b = recOf(rv.b);
            if (rv.a === rv.b) return <div key={rv.title} className="field"><b>{rv.title + ' · '}</b>{`${a.nick} vs himself: ${a.r ? a.r.w + '–' + a.r.l : 'no legs'} on parlay legs`}</div>;
            const fa = a.r ? `${a.r.w}–${a.r.l}` : 'no legs', fb = b.r ? `${b.r.w}–${b.r.l}` : 'no legs';
            const ra = a.r && a.r.n ? a.r.w / a.r.n : null, rb = b.r && b.r.n ? b.r.w / b.r.n : null;
            const edge = ra == null || rb == null ? 'No contest: one side has no graded legs' : ra === rb ? 'Dead even' : `Edge: ${ra > rb ? a.nick : b.nick}`;
            return <div key={rv.title} className="field"><b>{rv.title + ' · '}</b>{`${a.nick} ${fa} vs ${b.nick} ${fb} · ${edge}`}</div>;
          })}
          <p className="muted">No weekly fantasy matchup records exist in league-lore.json, so this compares parlay legs only. Small sample.</p>
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Elo vs betting accuracy</h2><span className="sub">Good at fantasy ≠ good at picking</span></div>
        <div className="card__body"><div className="tablewrap"><table>
          <thead><tr><th>Manager</th><th className="r">Season Elo</th><th className="r">Elo rank</th><th className="r">Pick rank</th><th className="r">Hit</th></tr></thead>
          <tbody>{S.rows.map((r, i) => {
            const p = ident.person(r.name); const er = p ? eloRank[p.name] : null; const e = p && elo.now.find((x) => x.name === p.name);
            return <tr key={r.name}><td>{r.nick}</td><td className="r num">{e ? fmtElo(e.rating) : 'no seasons'}</td><td className="r num">{er ? '#' + er : '–'}</td><td className="r num">{'#' + (i + 1)}</td><td className="r num">{hitPct(r.w, r.n)}</td></tr>;
          })}</tbody>
        </table></div></div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Hypothetical payouts</h2><span className="sub">What one cash would have meant</span></div>
        <div className="card__body">
          <p>{data.parlays.filter((p) => p.toPay).map((p) => `${p.label}: hypothetical ${fmtMoney(p.toPay)} on $${p.stake}. `).join('')}</p>
          <p>{`A straight 11-leg ticket at -110 every leg pays about $${Math.round(10 * Math.pow(dec110, 11)).toLocaleString()} on $10. 12 legs pays about $${Math.round(10 * Math.pow(dec110, 12)).toLocaleString()}. Those are assumed prices, not slip odds.`}</p>
          <p className="muted">{'Sources: ' + Object.values(data.sources).join(' · ')}</p>
          <p className="muted">{'Excluded: ' + data.excluded.map((x) => `${x.what} (${x.why})`).join('; ')}</p>
        </div>
      </section>
    </>
  );
}

export default function BetsView() {
  const store = useLeague();
  const { state } = store;
  const [data, setData] = useState(cachedHistory());
  const [loaded, setLoaded] = useState(!!cachedHistory());
  useEffect(() => {
    let live = true;
    loadHistory().then((d) => { if (live) { setData(d); setLoaded(true); } });
    return () => { live = false; };
  }, []);
  return (
    <Page title="Parlay history" sub="Weekly $10 group parlay · 11–12 leg tickets only">
      {!loaded ? null : !data
        ? <div className="card"><div className="empty">Parlay history did not load.</div></div>
        : <History data={data} selectedOwner={state.selectedOwner} weeks={state.weeks} payments={state.payments} store={store} />}
    </Page>
  );
}
