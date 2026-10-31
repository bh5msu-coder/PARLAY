'use client';
import InfoTip, { SmallSample } from './InfoTip';
import { StatusBadge } from './ui';
import HitRateChart from './charts/HitRateChart';
import BetTypeChart from './charts/BetTypeChart';
import StakeReturnChart from './charts/StakeReturnChart';
import { whoLabel } from '../lib/ident.mjs';
import { fmtMoney } from '../lib/format.mjs';
import { hitRateOverTime, selectionStats, ticketTotals, typePerformance, TYPE_NAMES } from '../lib/stats.mjs';
import { SEVERITY_ORDER } from '../lib/reconcile.mjs';

const pct = (m) => (m && m.n ? Math.round(m.rate * 100) + '%' : '–');
const RESULT_BADGE = { busted: 'lost', cashed: 'won', open: 'pending', unknown: 'unknown' };
const STATE_TEXT = { proposed: 'Proposed', placed: 'Placed', settled: 'Settled', unknown: 'Not shown' };

/** Selection level: charts plus a manager × bet-type matrix. */
export function SelectionCharts({ legs, sourceNote }) {
  const overTime = hitRateOverTime(legs);
  const types = typePerformance(legs);
  const rows = selectionStats(legs);
  const typeKeys = types.map((t) => t.type);
  return (
    <section className="card">
      <div className="card__head"><h2>Selections <InfoTip k="hitRate" label="hit rate" /></h2><span className="sub">{sourceNote}</span></div>
      <div className="card__body">
        <div className="two two--charts">
          <HitRateChart points={overTime} />
          <BetTypeChart rows={types} />
        </div>
        <div className="card__head card__head--flush"><h3 className="h3">By manager and bet type <InfoTip k="byType" label="bet-type breakdown" /></h3></div>
        <div className="tablewrap"><table>
          <thead><tr>
            <th>Manager</th>
            <th className="r">W–L <InfoTip k="record" label="record" /></th>
            <th className="r">Hit %</th>
            <th className="r hide-m">Streak <InfoTip k="streak" label="streak" /></th>
            {typeKeys.map((t) => <th key={t} className="r hide-m">{TYPE_NAMES[t] || t}</th>)}
            <th className="r hide-m">Night / day <InfoTip k="primetime" label="primetime split" /></th>
            <th className="r">Busts <InfoTip k="busts" label="bust attribution" /></th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.who}>
              <td>{whoLabel(r.who)} <SmallSample n={r.hit.n} /></td>
              <td className="r num">{`${r.hit.won}–${r.hit.lost}` + (r.hit.open + r.hit.unknown ? ` (${r.hit.open + r.hit.unknown})` : '')}</td>
              <td className="r num">{pct(r.hit)}</td>
              <td className="r num hide-m">{`${r.streak.current} · best ${r.streak.best}`}</td>
              {typeKeys.map((t) => {
                const m = r.byType[t];
                return <td key={t} className="r num hide-m">{m && m.n ? `${pct(m)} (${m.n})` : '–'}</td>;
              })}
              <td className="r num hide-m">{`${r.primetime.prime.n ? pct(r.primetime.prime) + ' (' + r.primetime.prime.n + ')' : '–'} / ${r.primetime.day.n ? pct(r.primetime.day) + ' (' + r.primetime.day.n + ')' : '–'}`}</td>
              <td className="r num">{String(r.busts)}</td>
            </tr>))}</tbody>
        </table></div>
        <p className="muted">Rates use decided picks only; the bracket after W–L counts picks still open or with no known result. Numbers in brackets in the type and night/day columns are decided picks. Under 5 decided picks is flagged as a small sample.</p>
      </div>
    </section>
  );
}

/** Ticket level: one row per week, with recorded money kept apart from hypothetical money. */
export function TicketSection({ tickets, sourceNote, showPayer = true, killers }) {
  const t = ticketTotals(tickets);
  return (
    <section className="card">
      <div className="card__head"><h2>Tickets <InfoTip k="ticketResult" label="ticket result" /></h2><span className="sub">{sourceNote}</span></div>
      <div className="card__body">
        <div className="tablewrap"><table>
          <thead><tr>
            <th>Week</th>
            <th>Result</th>
            <th className="hide-m">Ticket <InfoTip k="ticketState" label="ticket state" /></th>
            {showPayer ? <th className="hide-m">Payer</th> : null}
            <th className="r">Stake <InfoTip k="stake" label="stake listed" /></th>
            <th className="r hide-m">Paid in <InfoTip k="contributions" label="contributions recorded" /></th>
            <th className="r">Payout <InfoTip k="payout" label="payout recorded" /></th>
            <th className="r hide-m">Hypothetical <InfoTip k="hypothetical" label="hypothetical payout" /></th>
            {killers ? <th className="hide-m">Killed by</th> : null}
          </tr></thead>
          <tbody>{tickets.map((x) => (
            <tr key={x.week}>
              <td className="num">{x.label}</td>
              <td><StatusBadge state={RESULT_BADGE[x.result] || 'unknown'} />{x.record ? <span className="muted">{` ${x.record.win}–${x.record.loss}`}</span> : null}</td>
              <td className="hide-m" title={x.evidence}>{STATE_TEXT[x.ticketState] || x.ticketState}</td>
              {showPayer ? <td className="hide-m">{x.payer ? whoLabel(x.payer) : '–'}</td> : null}
              <td className="r num">{fmtMoney(x.stake)}</td>
              <td className="r num hide-m">{x.contributions == null ? 'not tracked' : x.contributions ? fmtMoney(x.contributions) : 'none recorded'}</td>
              <td className="r num">{x.payoutRecorded == null ? 'none recorded' : fmtMoney(x.payoutRecorded)}</td>
              <td className="r num hide-m">{x.hypotheticalToPay == null ? '–' : <span className="hypo">{fmtMoney(x.hypotheticalToPay)} <small>hypothetical</small></span>}</td>
              {killers ? <td className="hide-m">{(killers[x.week] || []).map((k) => whoLabel(k)).join(', ') || '–'}</td> : null}
            </tr>))}</tbody>
          <tfoot><tr>
            <td>Total</td>
            <td>{`${t.cashed} cashed · ${t.busted} busted` + (t.open ? ` · ${t.open} open` : '') + (t.unknown ? ` · ${t.unknown} unknown` : '')}</td>
            <td className="hide-m" />
            {showPayer ? <td className="hide-m" /> : null}
            <td className="r num">{fmtMoney(t.stakeListed)}</td>
            <td className="r num hide-m">{fmtMoney(t.contributions)}</td>
            <td className="r num">{fmtMoney(t.payouts)}</td>
            <td className="r num hide-m"><span className="hypo">{fmtMoney(t.hypothetical)} <small>hypothetical</small></span></td>
            {killers ? <td className="hide-m" /> : null}
          </tr></tfoot>
        </table></div>
        <StakeReturnChart tickets={tickets} />
        <p className="muted">Stake is what the week lists; it is not proof anyone paid. Paid in and payout count only money someone recorded. Hypothetical is what the slip would have paid if every pick won — no book paid it.</p>
      </div>
    </section>
  );
}

/** Where data/bets.json and parlay-history.json disagree. Reported, never auto-fixed. */
export function DiscrepancyCard({ result }) {
  if (!result || !result.items.length) return null;
  const main = result.items.filter((i) => i.severity !== 'wording');
  const wording = result.items.filter((i) => i.severity === 'wording');
  const label = { money: 'Money', result: 'Result', pick: 'Pick' };
  return (
    <section className="card card--warn">
      <div className="card__head"><h2>Data discrepancies</h2><span className="sub">data/bets.json vs parlay-history.json · not reconciled</span></div>
      <div className="card__body">
        <p className="muted">These records disagree. Nothing has been changed to make them match; the commissioner decides which is right. Weekly grading uses data/bets.json only.</p>
        <ul className="discrepancies">
          {main.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)).map((i, k) => (
            <li key={k}><span className={'pill pill--' + i.severity}>{label[i.severity] || i.severity}</span> {i.message}</li>))}
        </ul>
        {wording.length ? (
          <details>
            <summary>{`${wording.length} more differ only in wording (same pick, different label)`}</summary>
            <ul className="discrepancies">{wording.map((i, k) => <li key={k}>{i.message}</li>)}</ul>
          </details>) : null}
      </div>
    </section>
  );
}
