'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLeague } from './LeagueProvider';
import { Page } from './Topbar';
import { KpiCard } from './ui';
import { fmtElo, fmtFinish, fmtMoney } from '../lib/format.mjs';
import { settleWeek } from '../lib/iou.mjs';
import { ident, RIVALRIES, seasonRows, whoLabel } from '../lib/ident.mjs';
import { calcSeasonElo } from '../lib/elo.mjs';
import { drawSeasonElo } from '../lib/tape.mjs';
import { KPI_LS, lsGet, lsSet, toast } from '../lib/clients.mjs';
import Achievements from './Achievements';
import { cachedHistory, historyLegs, loadHistory } from '../lib/history.mjs';
import { weeklyLegs } from '../lib/stats.mjs';
import { allRules } from '../lib/rules.mjs';
import { allTimeCareers, loreHeadlines, pfOutliers } from '../lib/lore-summary.mjs';

function fmtPct(p) { return p == null ? '–' : (p * 100).toFixed(1) + '%'; }

const PARLAY_STATE = { cashed: 'Cashed', busted: 'Busted', live: 'Live', open: 'To play' };

/** The weekly parlay as one card on the League page: where the ticket stands and who owes, with a way in. */
function ParlayGlance({ store }) {
  const { state } = store;
  const n = state.nfl && state.nfl.active;
  const week = (n && store.weekRecord(n)) || (state.weeks.length ? state.weeks[state.weeks.length - 1] : null);
  if (!week) return null;
  const g = state.graded[week.week];
  const s = g && g.summary;
  const payers = store.weekPayers(week);
  const { shares } = settleWeek(week.week, week.stake || 10, payers, week.contributions || state.payments.filter((p) => p.week === week.week));
  const killers = s && s.killers ? s.killers : [];
  const line = s
    ? `${s.won} of ${s.total} hit` + (killers.length ? ` · killed by ${killers.map((k) => whoLabel(k)).join(', ')}` : s.pending ? ` · ${s.pending} to play` : '')
    : 'Picks are in';
  return (
    <section className="card parlay-glance">
      <div className="glance__main">
        <span className="label">{`Week ${week.week} parlay`}</span>
        <span className="glance__state">{s ? PARLAY_STATE[s.state] || s.state : 'To play'}</span>
        <span className="small muted">{line}</span>
      </div>
      <div className="glance__side">
        <span className="paychips">{shares.map((p) => <span key={p.who} className={'pill ' + (p.open ? 'pill--open' : 'pill--paid')}>{`${whoLabel(p.who)} · ${p.open ? fmtMoney(p.open) + ' open' : 'funded'}`}</span>)}</span>
        <Link className="btn btn--secondary btn--sm" href="/week">Open this week</Link>
      </div>
    </section>
  );
}

function finClass(s) {
  return s.champion ? 'fin fin--gold' : s.rank <= 4 ? 'fin fin--good' : s.rank >= 11 ? 'fin fin--bad' : 'fin';
}

function OwnerCard({ name }) {
  const p = ident.person(name) || ident.people.find((x) => x.name === name);
  if (!p) return <p className="muted">No card</p>;
  const c = p.career || {};
  const titles = (c.titles || []).length ? (c.titles || []).join(', ') : 'no titles';
  const bits = [];
  if (p.abstain) bits.push('H-Bomb sat the ticket so Sundays can be football. Three rings still buy a seat.');
  if (p.firstYear) bits.push('New seat this year (took over for Zintak). No Holm League tape yet — he is writing it on the ticket.');
  if (!p.abstain && !p.firstYear && c.seasons) bits.push(`${c.seasons} seasons · ${c.wins}–${c.losses} · ${c.titles && c.titles.length ? c.titles.length + ' title' + (c.titles.length === 1 ? '' : 's') : 'still hunting a ring'}.`);
  return (
    <div className="ocard">
      <div className="ohead"><h3 className="ohead__n">{whoLabel(p.name)}</h3><span className="pill">{titles}</span></div>
      {bits.length ? <p className="oread">{bits.join(' ')}</p> : null}
      {c.seasons ? (
        <div className="stats" style={{ margin: '12px 0' }}>
          <div className="stat"><span className="label">Avg finish</span><span className="stat__value">{fmtFinish(c.avgFinish)}</span></div>
          <div className="stat"><span className="label">Last place</span><span className="stat__value">{String(c.lastPlaceCount || 0)}</span></div>
          <div className="stat"><span className="label">Career PF</span><span className="stat__value">{c.pf ? Math.round(c.pf).toLocaleString('en-US') : '–'}</span></div>
        </div>) : null}
      {(c.history || []).length ? (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Finishes</div>
          <div className="finrow">{c.history.map((s) => <div key={s.season} className={finClass(s)}><div className="fin__y">{String(s.season)}</div><div className="fin__r">{String(s.rank)}</div></div>)}</div>
        </div>) : <p className="muted">No prior seasons on file.</p>}
    </div>
  );
}

const RULE_NAMES = {
  payoutSplit: 'Winnings', lastPlaceTie: 'Tie for last', splitStake: 'Split stake', rollover: 'Unplaced week',
  pickDeadline: 'Deadline', editsAndLocks: 'Edits', pushHandling: 'Pushes', voidHandling: 'Voids & postponements',
  missingPicks: 'Missing picks', eligibility: 'Opting out', disputes: 'Disputes', placementProof: 'Who places it',
  books: 'Books', contributionTiming: 'Paying in', importConflict: 'Conflicting picks',
};

function RulesCard({ config }) {
  return (
    <section className="card half">
      <div className="card__head"><h2>House rules</h2><span className="sub">As decided by the league · the commissioner can change any of these</span></div>
      <div className="tablewrap"><table>
        <tbody>{allRules(config).map((r) => (
          <tr key={r.key}><td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{RULE_NAMES[r.key] || r.key}</td><td className="wraptext">{r.text}</td></tr>))}</tbody>
      </table></div>
    </section>
  );
}

function RivalriesCard() {
  return (
    <section className="card half">
      <div className="card__head"><h2>Rivalries</h2><span className="sub">Public 2010–2025 tape · overlap ranks, not weekly H2H</span></div>
      {RIVALRIES.map((r) => (
        <article key={r.title} className="rivalry">
          <div className="rivalry__pair">{r.pair}</div>
          <div className="rivalry__title">{r.title}</div>
          <p className="rivalry__why">{r.why}</p>
          <p className="rivalry__stat">{r.stat}</p>
          <div className="inline"><Link className="btn btn--ghost btn--sm" href={'/chat?a=' + r.a + '&b=' + r.b}>Needle them in Chat</Link></div>
        </article>))}
    </section>
  );
}

function Meters({ rows, max, fmt }) {
  return rows.map((r) => (
    <div key={r.nick} className="meter">
      <div className="meter__lab">{r.nick}</div>
      <div className="meter__track"><div className="meter__fill" style={{ width: Math.max(4, Math.round((r.n != null ? r.n : r.pf) / max * 100)) + '%' }} /></div>
      <div className="meter__val">{fmt(r)}</div>
    </div>));
}

function LeagueTape() {
  const current = ident.people.filter((p) => p.career && p.career.seasons);
  const pfRows = current
    .map((p) => {
      const row = (p.career.history || []).find((s) => s.season === 2025);
      return row ? { nick: p.nick || p.name, pf: row.pf, rank: row.rank } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.pf - a.pf);
  const maxPf = pfRows.length ? pfRows[0].pf : 1;
  const titleRows = current
    .map((p) => ({ nick: p.nick || p.name, n: (p.career.titles || []).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const maxT = titleRows.length ? titleRows[0].n : 1;
  return (
    <div className="two">
      <section className="card">
        <div className="card__head"><h2>2025 PF</h2><span className="sub">Fantasy points for · DJ has no 2025 season</span></div>
        <div className="card__body"><Meters rows={pfRows} max={maxPf} fmt={(r) => r.pf.toFixed(1)} /><p className="muted">Source: ESPN 182263 via league-lore.json. Jarn led PF; Hoss won the title.</p></div>
      </section>
      <section className="card">
        <div className="card__head"><h2>Titles, current 12</h2><span className="sub">Championships 2010–2025</span></div>
        <div className="card__body"><Meters rows={titleRows} max={maxT} fmt={(r) => String(r.n)} /><p className="muted">Heller 3, then Jarn / Hoss / Chas with 2, Brad 1. Six more titles belong to departed owners.</p></div>
      </section>
    </div>
  );
}

function SeasonElo({ selected, onSelect }) {
  const canvasRef = useRef(null);
  const elo = calcSeasonElo(ident.people);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !elo.now.length) return;
    drawSeasonElo(c, elo, selected);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (c.isConnected) drawSeasonElo(c, elo, selected); });
  });
  if (!elo.now.length) return <section className="card"><div className="empty">No seasons on file to rate.</div></section>;
  const noSeason = ident.people.filter((p) => !seasonRows(p).length);
  return (
    <section className="card half">
      <div className="card__head"><h2>Season Elo</h2><span className="sub">Final place among current managers · start 1500</span></div>
      <div className="card__body">
        <div className="elo-now">{elo.now.map((r, i) => (
          <button key={r.id} className={'elo-now__item' + (r.name === selected ? ' on' : '')} type="button" onClick={() => onSelect(r.name)}>{(i + 1) + '. ' + r.nick + ' '}<b>{fmtElo(r.rating)}</b></button>))}</div>
        <canvas ref={canvasRef} className="elo-chart" role="img" aria-label="Season Elo by year, 2010 to 2025. Lower on the table is a worse rating." />
        <p className="muted">Season Elo from final place among current managers who played that year. Start 1500, K = 8 split across the field (each pairwise update ÷ n−1), no offseason regression. Gaps = seasons sat out between a manager’s first and last year. Not weekly head-to-head. Source: league-lore.json, ESPN 182263, 2010–2025.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Manager</th><th className="r">Elo</th><th className="r hide-m">Seasons</th><th className="r hide-m">Peak</th><th className="r hide-m">Low</th></tr></thead>
          <tbody>{elo.now.map((r, i) => (
            <tr key={r.id} className={r.name === selected ? 'me' : ''} onClick={() => onSelect(r.name)}>
              <td className="rank">{String(i + 1)}</td><td>{r.nick}</td><td className="r num">{fmtElo(r.rating)}</td>
              <td className="r num hide-m">{String(r.seasons) + (r.gaps.length ? ' · gap ' + r.gaps.join(', ') : '')}</td>
              <td className="r num hide-m">{fmtElo(r.peak)}</td><td className="r num hide-m">{fmtElo(r.low)}</td>
            </tr>))}</tbody>
        </table></div>
        {noSeason.length ? <p className="muted">{noSeason.map((p) => (p.nick || p.name)).join(', ') + ': no season finishes yet, so no Elo.'}</p> : null}
      </div>
    </section>
  );
}

function KpiIdeas() {
  const [ideas, setIdeas] = useState([]);
  const [name, setName] = useState('');
  const [def, setDef] = useState('');
  useEffect(() => { setIdeas(lsGet(KPI_LS, [])); }, []);
  const save = () => {
    const n = name.trim();
    const d = def.trim();
    if (!n || !d) { toast('Need a name and a definition'); return; }
    const next = lsGet(KPI_LS, []).concat([{ name: n, def: d, at: Date.now() }]);
    lsSet(KPI_LS, next);
    toast('KPI idea saved on this device');
    setIdeas(next); setName(''); setDef('');
  };
  return (
    <section className="card half">
      <div className="card__head"><h2>Propose a KPI</h2><span className="sub">Saved on this phone · localStorage</span></div>
      <div className="card__body form">
        <p className="muted">Name it and write the formula. Values stay blank until someone can actually count them from public lore. No 2026 auction intel.</p>
        <div className="field"><label htmlFor="kpi-name">Name</label><input id="kpi-name" type="text" placeholder="Title rate, playoff conversion…" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="kpi-def">Definition</label><textarea id="kpi-def" placeholder="Formula: what you would count, over which seasons, who is eligible. We will not invent a leaderboard." value={def} onChange={(e) => setDef(e.target.value)} /></div>
        <button className="btn btn--secondary" type="button" onClick={save}>Save idea</button>
        {ideas.length ? (
          <div className="tablewrap"><table>
            <thead><tr><th>Idea</th><th>Definition (no fake result)</th></tr></thead>
            <tbody>{ideas.map((x, i) => <tr key={i}><td>{x.name}</td><td>{x.def}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted">Park a definition here. Known tape (titles, avg finish, last place, PF) is already on this tab — this box is for metrics we have not computed.</p>}
      </div>
    </section>
  );
}

export default function LeagueView() {
  const store = useLeague();
  const { state } = store;
  const [history, setHistory] = useState(cachedHistory());
  useEffect(() => { let live = true; loadHistory().then((h) => { if (live) setHistory(h); }); return () => { live = false; }; }, []);
  const lore = ident.lore;
  const title = 'League';
  const sub = lore ? `${lore.span} · ${lore.seasonCount} seasons of Holm League history` : 'Career records and championships';
  if (!state.ready) return <Page title={title} />;
  if (!lore) return <Page title={title} sub={sub}><div className="card"><div className="empty">League history did not load. Refresh and try again.</div></div></Page>;
  const k = lore.kpis || {};
  const h = loreHeadlines(lore);
  const selected = state.selectedOwner || ident.people[0].name;
  const select = (n) => { state.selectedOwner = n; store.emit(); };
  const table = ident.people.slice().sort((a, b) => (a.career && a.career.avgFinish || 99) - (b.career && b.career.avgFinish || 99) || a.name.localeCompare(b.name));
  const valueRows = (list, cls) => (list || []).slice(0, 6).map((v, i) => (
    <tr key={i}><td className="num">{String(v.season)}</td><td>{whoLabel(v.owner)}</td><td>{v.player}</td><td className="r num">{'$' + v.price}</td><td className={'r num ' + cls}>{String(v.ppd)}</td></tr>));

  return (
    <Page title={title} sub={sub}>
      <h2 className="stats__group">Champions and skill</h2>
      <section className="stats stats--feature">
        <KpiCard size="feature" champ label="Reigning champ" value={k.reigningChamp ? whoLabel(k.reigningChamp.owner) : '–'} note={k.reigningChamp ? String(k.reigningChamp.year) : ''} />
        <KpiCard size="feature" champ label="Most titles" value={k.mostTitles ? whoLabel(k.mostTitles.owner) : '–'} note={k.mostTitles ? `${k.mostTitles.count} championships` : ''} />
        <KpiCard size="feature" champ label="Back to back" value={h.backToBack.length ? `${h.backToBack.length} repeat${h.backToBack.length === 1 ? '' : 's'}` : 'Nobody'} note={h.backToBack.length ? h.backToBack.map((x) => `${whoLabel(x.owner)} ${x.years[0]}–${String(x.years[1]).slice(2)}`).join(' · ') : 'No repeat champion yet'} />
        <KpiCard size="feature" label="Best win rate" value={h.bestWinPct ? whoLabel(h.bestWinPct.owner) : '–'} note={h.bestWinPct ? `${fmtPct(h.bestWinPct.pct)} · ${h.bestWinPct.wins}–${h.bestWinPct.losses} (${h.minSeasons}+ seasons)` : ''} />
        <KpiCard size="feature" label="Best avg finish" value={h.bestAvgFinish ? whoLabel(h.bestAvgFinish.owner) : '–'} note={h.bestAvgFinish ? `${fmtFinish(h.bestAvgFinish.avgFinish)} over ${h.bestAvgFinish.seasons} seasons` : ''} />
        <KpiCard size="feature" label="Career PF leader" value={h.careerPf ? whoLabel(h.careerPf.owner) : '–'} note={h.careerPf ? `${Math.round(h.careerPf.pf).toLocaleString('en-US')} pts in ${h.careerPf.seasons} seasons` : ''} />
      </section>
      <h2 className="stats__group">Bragging rights</h2>
      <section className="stats stats--mini">
        <KpiCard size="mini" label="Best season PF" value={h.bestSeason ? whoLabel(h.bestSeason.owner) : '–'} note={h.bestSeason ? `${h.bestSeason.pf} pts in ${h.bestSeason.season} · ${h.bestSeason.rank === 1 ? 'won the title' : 'finished ' + h.bestSeason.rank}` : ''} />
        <KpiCard size="mini" label="2025 PF monster" value={k.pfMonster2025 ? whoLabel(k.pfMonster2025.owner) : '–'} note={k.pfMonster2025 ? `${k.pfMonster2025.pf} pts` : ''} />
        <KpiCard size="mini" label="Longest drought" value={k.longestDrought ? whoLabel(k.longestDrought.owner) : '–'} note={k.longestDrought ? `${k.longestDrought.seasons} seasons, 0 rings` : ''} />
        <KpiCard size="mini" label="Most last places" value={k.mostLastPlaces ? whoLabel(k.mostLastPlaces.owner) : '–'} note={k.mostLastPlaces ? `${k.mostLastPlaces.count} toilet bowls` : ''} />
      </section>

      <ParlayGlance store={store} />

      <section className="card">
        <div className="card__head"><h2>Championship lineage</h2><span className="sub">Who actually finished the job</span></div>
        <div className="ribbonwrap"><div className="ribbon">{(lore.champions || []).map((c) => (
          <div key={c.year} className="champ"><div className="champ__y">{String(c.year)}</div><div className="champ__n">{whoLabel(c.owner)}</div></div>))}</div></div>
      </section>

      <Achievements groups={[
        ...(history ? [{ title: 'Season so far', source: 'parlay-history.json', legs: historyLegs(history) }] : []),
        { title: 'Weekly record', source: 'data/bets.json', legs: weeklyLegs(state.weeks, state.graded) },
      ]} />

      <RulesCard config={state.config} />
      <RivalriesCard />
      <LeagueTape />
      <SeasonElo selected={selected} onSelect={select} />
      <KpiIdeas />

      <section className="card half">
        <div className="card__head"><h2>The table</h2><span className="sub">Current 12 · avg finish is all-time. Tap a name.</span></div>
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Manager</th><th className="r hide-m">Yrs</th><th className="r">Titles</th><th className="r">Avg finish</th><th className="r hide-m">Last place</th><th className="r hide-m">W–L</th></tr></thead>
          <tbody>{table.map((p, i) => {
            const c = p.career || {};
            const badges = [];
            if (p.abstain) badges.push(<span key="sit" className="pill">H-Bomb sits</span>);
            if (p.firstYear) badges.push(<span key="first" className="pill">First year</span>);
            return (
              <tr key={p.id} className={p.name === state.config.you ? 'me' : ''} onClick={() => select(p.name)}>
                <td className="rank">{String(i + 1)}</td>
                <td><div className="who-cell"><span style={{ fontWeight: 600 }}>{whoLabel(p.name)}</span>{badges.length ? <span className="pills">{badges}</span> : null}</div></td>
                <td className="r num hide-m">{String(c.seasons || 0)}</td>
                <td className="r num">{String(c.titles ? c.titles.length : 0)}</td>
                <td className="r num">{fmtFinish(c.avgFinish)}</td>
                <td className="r num hide-m">{String(c.lastPlaceCount || 0)}</td>
                <td className="r num hide-m">{`${c.wins || 0}–${c.losses || 0}`}</td>
              </tr>);
          })}</tbody>
        </table></div>
      </section>

      <section className="card half">
        <div className="card__head"><h2>Owner card</h2></div>
        <div className="card__body">
          <div className="picker">{ident.people.map((p) => (
            <button key={p.id} className={'chip' + (p.name === selected ? ' on' : '')} type="button" onClick={() => select(p.name)}>{p.nick || p.name.split(' ')[0]}</button>))}</div>
          <OwnerCard name={selected} />
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Every manager, all time</h2><span className="sub">{`All ${allTimeCareers(lore).length} owners since 2010 · ${h.departedTitles} titles went to owners who left`}</span></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Manager</th><th className="r hide-m">Years</th><th className="r">Titles</th><th className="r">W–L</th><th className="r hide-m">Win %</th><th className="r">Avg</th><th className="r hide-m">Best · worst</th><th className="r hide-m">Last</th></tr></thead>
          <tbody>{allTimeCareers(lore).map((c) => (
            <tr key={c.owner} className={c.owner === state.config.you ? 'me' : ''}>
              <td><div className="who-cell"><span style={{ fontWeight: 600 }}>{c.current ? whoLabel(c.owner) : c.owner}</span>{c.current ? null : <span className="pills"><span className="pill">Former</span></span>}</div></td>
              <td className="r num hide-m">{c.first === c.last ? String(c.first) : `${c.first}–${c.last}`}</td>
              <td className="r num" style={{ whiteSpace: 'nowrap' }}>{String(c.titleCount || 0)}{c.titleCount ? <span className="muted hide-m">{` (${c.titles.join(', ')})`}</span> : null}</td>
              <td className="r num" style={{ whiteSpace: 'nowrap' }}>{`${c.wins}–${c.losses}`}</td>
              <td className="r num hide-m">{fmtPct(c.winPct)}</td>
              <td className="r num">{fmtFinish(c.avgFinish)}</td>
              <td className="r num hide-m">{`${c.bestFinish} · ${c.worstFinish}`}</td>
              <td className="r num hide-m">{String(c.lastPlaceCount || 0)}</td>
            </tr>))}</tbody>
        </table></div>
        <p className="notice">{`Years is first to last season played; ${allTimeCareers(lore).filter((c) => c.seasons < (c.last - c.first + 1)).length} owners sat seasons out in between. DJ has no season on file yet. Source: league-lore.json, ESPN 182263.`}</p>
      </section>

      <section className="card">
        <div className="card__head"><h2>Seasons that broke the scale</h2><span className="sub">PF furthest from that year’s average · z-score</span></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Yr</th><th>Manager</th><th className="hide-m">Team</th><th className="r">PF</th><th className="r">z</th><th className="r">Finish</th></tr></thead>
          <tbody>{pfOutliers(lore).map((o) => (
            <tr key={o.season + o.owner}>
              <td className="num">{String(o.season)}</td>
              <td>{ident.person(o.owner) ? whoLabel(o.owner) : o.owner}</td>
              <td className="hide-m">{o.team}</td>
              <td className="r num">{String(o.pf)}</td>
              <td className={'r num ' + (o.z > 0 ? 'pos' : 'neg')}>{(o.z > 0 ? '+' : '') + o.z.toFixed(2)}</td>
              <td className="r num">{o.champ ? 'Champ' : String(o.rank)}</td>
            </tr>))}</tbody>
        </table></div>
        <p className="notice">{'+2 means about two standard deviations above the year’s average PF. A high score did not always win: Jarn’s 2025 1,830 finished 2nd, and Heller’s 2016 1,123 still finished 2nd.'}</p>
      </section>

      {k.mostLastPlaces ? <p className="rules">{`Toilet-bowl energy: ${k.mostLastPlaces.owner} has finished last ${k.mostLastPlaces.count} times (${(k.mostLastPlaces.years || []).join(', ')}). Weekly 2026 payer is still last place the week before — entered on the ticket.`}</p> : null}


      <div className="two">
        <section className="card">
          <div className="card__head"><h2>Best money ever spent</h2><span className="sub">$20+ auction · pts per $</span></div>
          <div className="tablewrap"><table><thead><tr><th>Yr</th><th>Owner</th><th>Player</th><th className="r">$</th><th className="r">Pts/$</th></tr></thead><tbody>{valueRows(lore.bestValues, 'pos')}</tbody></table></div>
        </section>
        <section className="card">
          <div className="card__head"><h2>Money on fire</h2><span className="sub">$20+ auction · pts per $</span></div>
          <div className="tablewrap"><table><thead><tr><th>Yr</th><th>Owner</th><th>Player</th><th className="r">$</th><th className="r">Pts/$</th></tr></thead><tbody>{valueRows(lore.worstValues, 'neg')}</tbody></table></div>
        </section>
      </div>
    </Page>
  );
}
