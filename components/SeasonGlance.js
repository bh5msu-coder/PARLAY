'use client';
import { seasonGlance, SMALL_N } from '../lib/history-stats.mjs';
import { fmtMoney } from '../lib/format.mjs';

// Season at a glance: stacked hit / miss / unknown / pending bars per week and per manager.
// Reads parlay-history.json only (via the parsed `data` prop). Read-only.

const SEG = [['win', 'Hit'], ['loss', 'Miss'], ['unknown', 'Unknown'], ['pending', 'Pending']];

function Bar({ c }) {
  const total = SEG.reduce((s, [k]) => s + (c[k] || 0), 0);
  return (
    <span className="glance__track">
      {total ? SEG.map(([k]) => (c[k] ? <span key={k} className={'glance__seg glance__seg--' + k} style={{ width: (c[k] / total) * 100 + '%' }} /> : null)) : null}
    </span>
  );
}

const rec = (c) => (c.pending && !c.win && !c.loss ? `${c.pending} pending` : `${c.win}–${c.loss}` + (c.unknown ? ` (${c.unknown}?)` : ''));
const aria = (c) => SEG.filter(([k]) => c[k]).map(([k, l]) => `${c[k]} ${l.toLowerCase()}`).join(', ') || 'no legs';

export default function SeasonGlance({ data, rows, selectedOwner }) {
  const g = seasonGlance(data);
  const { settled, cashed, staked } = g.tickets;
  return (
    <section className="card" id="season-glance">
      <div className="card__head">
        <h2>Season at a glance</h2>
        <span className="sub">{`Tickets ${cashed}–${settled - cashed} · ${fmtMoney(staked)} staked on settled tickets · parlay-history.json`}</span>
      </div>
      <div className="card__body glance">
        <div>
          <h3 className="h3">Ticket by week</h3>
          {g.weeks.map((w) => (
            <div key={w.week} className="glance__row" aria-label={`${w.label}: ${w.notPlaced ? 'never placed' : aria(w)}`}>
              <span className="glance__name">
                {`Wk ${w.week}`}
                <span className="muted">{w.notPlaced ? ' · not placed' : ` · ${fmtMoney(w.stake)}` + (w.toPay ? ` → ${fmtMoney(w.toPay)}` : '')}</span>
              </span>
              {w.notPlaced ? <span className="glance__track glance__track--empty" /> : <Bar c={w} />}
              <span className="glance__val num">{w.notPlaced ? '–' : rec(w)}</span>
            </div>
          ))}
        </div>
        <div>
          <h3 className="h3">Manager leg records</h3>
          {rows.map((r) => {
            const c = { win: r.w, loss: r.l, unknown: r.u, pending: 0 };
            return (
              <div key={r.name} className={'glance__row' + (r.name === selectedOwner ? ' me' : '')} aria-label={`${r.nick}: ${aria(c)}`}>
                <span className="glance__name">{r.nick}{r.n < SMALL_N ? <span className="muted">{' · n<5'}</span> : null}</span>
                <Bar c={c} />
                <span className="glance__val num">{rec(c)}</span>
              </div>
            );
          })}
        </div>
        <div className="glance__legend">
          {SEG.map(([k, l]) => <span key={k}><i className={'glance__seg glance__seg--' + k} />{l}</span>)}
        </div>
      </div>
    </section>
  );
}
