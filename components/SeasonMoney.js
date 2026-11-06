'use client';
import { iouLedger } from '../lib/iou.mjs';
import { weekMoney } from '../lib/model.mjs';
import { fmtMoney } from '../lib/format.mjs';
import { whoLabel } from '../lib/ident.mjs';

/** Season money: stakes against recorded payments and payouts, per manager. "Not entered" means no
 *  payment is on file, not that someone is unpaid. No payment dates are shown. */
export default function SeasonMoney({ store }) {
  const { state } = store;
  const weeks = (state.weeks || []).filter((w) => (w.legs || []).length);
  const tickets = weeks.map((w) => ({ week: w.week, stake: w.stake || 10, payers: store.weekPayers(w) }));
  const payments = [];
  for (const w of weeks) {
    const fromWeek = (w.contributions || []).map((c) => Object.assign({ week: w.week }, c));
    const rows = fromWeek.length ? fromWeek : (state.payments || []).filter((p) => p.week === w.week);
    payments.push(...rows);
  }
  const led = iouLedger(tickets, payments);
  const payouts = weeks.reduce((a, w) => a + (weekMoney(w).recorded.payouts || 0), 0);
  const staked = tickets.reduce((a, t) => a + Number(t.stake || 0), 0);
  if (!led.people.length) return null;
  return (
    <section className="card">
      <div className="card__head"><h2>Season money</h2><span className="sub">{`${weeks.length} tickets · ${fmtMoney(staked)} staked · ${payouts ? fmtMoney(payouts) + ' paid out' : 'no payouts yet'}`}</span></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th scope="col">Manager</th><th scope="col" className="num">Stakes</th><th scope="col" className="num">Paid</th><th scope="col" className="num">Got covered</th><th scope="col" className="num">Covered</th><th scope="col" className="num">Not on file</th></tr></thead>
          <tbody>
            {led.people.slice().sort((a, b) => b.owed - a.owed || a.who.localeCompare(b.who)).map((p) => (
              <tr key={p.who}>
                <td><strong>{whoLabel(p.who)}</strong></td>
                <td className="num">{fmtMoney(p.owed)}</td>
                <td className="num">{fmtMoney(p.paid)}</td>
                <td className="num">{p.coveredByOthers ? fmtMoney(p.coveredByOthers) : '—'}</td>
                <td className="num">{p.coveredForOthers ? fmtMoney(p.coveredForOthers) : '—'}</td>
                <td className="num muted">{p.open ? fmtMoney(p.open) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card__body muted small">{`Recorded ${fmtMoney(led.totals.recorded)} of ${fmtMoney(led.totals.owed)} in stakes. "Got covered" means someone else paid that share. "Not on file" only means no payment is entered here.`}</p>
    </section>
  );
}
