'use client';
import { useLeague } from './LeagueProvider';
import { Page } from './Topbar';
import { StatusBadge } from './ui';
import { fmtMoney, fmtOdds, pct } from '../lib/format.mjs';
import { sitHandle, whoLabel } from '../lib/ident.mjs';
import { computeBettingStyles, computeStandings, leagueLegTally, rankLabels, parlayExtras, streakText, styleNick, tallyRate, TYPE_LABELS } from '../lib/standings.mjs';
import { useEffect, useState } from 'react';
import InfoTip, { SmallSample } from './InfoTip';
import { DiscrepancyCard, SelectionCharts, TicketSection } from './Dashboard';
import { weeklyLegs, weeklyTickets, ticketTotals } from '../lib/stats.mjs';
import { cachedHistory, loadHistory } from '../lib/history.mjs';
import { reconcile } from '../lib/reconcile.mjs';

function ParlayExtras({ weeks, graded }) {
  const { types, fav, dog, killList } = parlayExtras(weeks, graded);
  const sideRow = (label, pair) => {
    const t = tallyRate(pair[0], pair[1]);
    return <tr key={label}><td>{label}</td><td className="r num">{String(t.n)}</td><td className="r num">{t.rate == null ? '–' : Math.round(t.rate * 100) + '%'}</td></tr>;
  };
  return (
    <div className="two">
      <section className="card">
        <div className="card__head"><h2>By bet type</h2></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Market</th><th className="r">Settled</th><th className="r">Hit</th><th className="r">Miss</th><th className="r">Hit %</th></tr></thead>
          <tbody>{Object.keys(types).map((k) => {
            const t = tallyRate(types[k][0], types[k][1]);
            return (
              <tr key={k}>
                <td>{TYPE_LABELS[k]}</td>
                <td className="r num">{String(t.n)}</td>
                <td className="r num pos">{String(t.hit)}</td>
                <td className="r num neg">{String(t.miss)}</td>
                <td className="r num">{t.rate == null ? '–' : Math.round(t.rate * 100) + '%'}</td>
              </tr>);
          })}</tbody>
        </table></div>
      </section>
      <section className="card">
        <div className="card__head"><h2>Style &amp; damage</h2></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Favorites vs dogs</th><th className="r">N</th><th className="r">Hit %</th></tr></thead>
          <tbody>{sideRow('Favorites (minus odds)', fav)}{sideRow('Dogs / plus-odds SGPs', dog)}</tbody>
        </table></div>
        <div className="card__head"><h3 className="h3">Ticket killers</h3></div>
        {killList.length ? (
          <div className="tablewrap"><table>
            <thead><tr><th>Manager</th><th className="r">Busts</th></tr></thead>
            <tbody>{killList.map(([who, n]) => <tr key={who}><td>{whoLabel(who)}</td><td className="r num neg">{String(n)}</td></tr>)}</tbody>
          </table></div>
        ) : <div className="empty">No killers yet. Give it a week.</div>}
      </section>
    </div>
  );
}

export default function StandingsView() {
  const store = useLeague();
  const { state } = store;
  const [history, setHistory] = useState(cachedHistory());
  useEffect(() => { let live = true; loadHistory().then((h) => { if (live) setHistory(h); }); return () => { live = false; }; }, []);
  if (!state.ready) return <Page title="Standings" />;
  const { weeks, graded, config } = state;
  const rows = computeStandings(weeks, graded, config);
  const ranks = rankLabels(rows);
  const disc = history ? reconcile({ weeks }, history) : null;
  const issues = disc ? disc.items.filter((i) => i.severity !== 'wording').length : 0;
  const settled = weeks.filter((w) => graded[w.week] && ['cashed', 'busted'].includes(graded[w.week].summary.state));
  const tickets = weeklyTickets(weeks, graded);
  const totals = ticketTotals(tickets);
  const killersByWeek = Object.fromEntries(weeks.map((w) => [w.week, (graded[w.week] && graded[w.week].summary.killers) || []]));
  const current = weeks.length ? weeks[weeks.length - 1] : null;
  const owing = current ? store.weekPayers(current) : [];
  const { legs: totLegs, hit: totHit } = leagueLegTally(weeks, graded);
  const payers = {};
  for (const w of weeks) if (w.payer) payers[w.payer] = (payers[w.payer] || 0) + 1;
  const topPayer = Object.entries(payers).sort((a, b) => b[1] - a[1])[0];
  const styles = computeBettingStyles(weeks, graded);

  return (
    <Page title="Standings" sub="Ranked by leg hit rate, then fewest busts.">
      <section className="stats">
        <div className="card stat"><span className="label">Winnings</span><span className="stat__value">{fmtMoney(totals.payouts)}</span><span className="stat__delta">{`${totals.cashed} cashed · ${settled.length} of ${weeks.length} parlays settled`}</span></div>
        <div className="card stat"><span className="label">Owes this week</span><span className="stat__value" style={{ font: '600 26px/40px var(--font-display)', letterSpacing: 0 }}>{owing.length ? owing.map((p) => whoLabel(p)).join(' + ') : '–'}</span><span className="stat__delta">{current ? `Week ${current.week} · ${fmtMoney(current.stake || 10)} · settled on the side` : ''}</span></div>
        <div className="card stat"><span className="label">League leg hit rate <InfoTip k="hitRate" label="hit rate" /></span><span className="stat__value">{pct(totHit, totLegs)}</span><span className="stat__delta">{`${totHit} of ${totLegs} settled legs`} <SmallSample n={totLegs} /></span></div>
        <div className="card stat"><span className="label">Most frequent payer</span><span className="stat__value" style={{ font: '600 26px/40px var(--font-display)', letterSpacing: 0 }}>{topPayer ? whoLabel(topPayer[0]) : '–'}</span><span className="stat__delta">{topPayer ? `Paid ${topPayer[1]} of ${weeks.length}` : ''}</span></div>
      </section>

      {issues ? <p className="small muted"><a href="#data-checks">{`${issues} data difference${issues === 1 ? '' : 's'} between the weekly file and the history`}</a> · listed at the bottom</p> : null}

      <section className="card">
        <div className="card__head"><h2>Managers</h2><span className="sub">Auction House handles. Last names stay off this board. Open legs stay out of the hit rate.</span></div>
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Manager</th><th className="r hide-m">Legs</th><th className="r">Hit</th><th className="r">Miss</th><th className="r">Hit %</th><th className="r">Busts</th><th className="r hide-m">Streak</th><th className="r hide-m">Paid</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const rate = r.hit + r.miss ? r.hit / (r.hit + r.miss) : null;
              const me = r.who === config.you;
              const lastW = r.streak.length && r.streak[r.streak.length - 1] === 'W';
              return (
                <tr key={r.who} className={me ? 'me' : ''}>
                  <td className="rank">{ranks[i]}</td>
                  <td style={{ fontWeight: 600 }}>{styleNick(r.who, styles, weeks.length)}{me ? <span className="muted" style={{ fontWeight: 400 }}> (you)</span> : null}</td>
                  <td className="r num hide-m">{String(r.legs)}</td>
                  <td className="r num">{String(r.hit)}</td>
                  <td className="r num">{String(r.miss)}</td>
                  <td className={'r num ' + (rate == null ? '' : rate >= 0.6 ? 'pos' : rate < 0.4 ? 'neg' : '')}>{rate == null ? '–' : Math.round(rate * 100) + '%'} <SmallSample n={r.hit + r.miss} /></td>
                  <td className="r num">{String(r.busts)}</td>
                  <td className={'r num hide-m ' + (lastW ? 'pos' : r.streak.length ? 'neg' : '')}>{streakText(r.streak)}</td>
                  <td className="r num hide-m">{fmtMoney(r.paid)}</td>
                </tr>);
            })}
            {(config.abstain || []).map((a) => (
              <tr key={'sit-' + a}>
                <td className="rank">–</td><td>{sitHandle(a)}<span className="muted"> (sits the ticket)</span></td>
                <td className="r num hide-m">0</td><td className="r num">–</td><td className="r num">–</td><td className="r num">–</td><td className="r num">–</td>
                <td className="r num hide-m">–</td><td className="r num hide-m">$0.00</td>
              </tr>))}
          </tbody>
        </table></div>
      </section>

      <TicketSection tickets={tickets} sourceNote="data/bets.json + live grades" killers={killersByWeek} />
      <SelectionCharts legs={weeklyLegs(weeks, graded)} sourceNote="data/bets.json + live grades · decided picks only" />

      <ParlayExtras weeks={weeks} graded={graded} />

      <div id="data-checks"><DiscrepancyCard result={disc} /></div>
    </Page>
  );
}
