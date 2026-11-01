'use client';
import Fold from './Fold';
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
import { heroFacts } from '../lib/hero.mjs';
import { deriveTicket } from '../lib/model.mjs';
import { allTimeCareers, loreHeadlines, pfOutliers } from '../lib/lore-summary.mjs';

function fmtPct(p) { return p == null ? '–' : (p * 100).toFixed(1) + '%'; }

/** The top of the League page: this week's parlay, where it stands, who still owes, and the way in. */
function LeagueHero({ store }) {
  const { state } = store;
  const n = state.nfl && state.nfl.active;
  const week = (n && store.weekRecord(n)) || (state.weeks.length ? state.weeks[state.weeks.length - 1] : null);
  if (!week) return null;
  const g = state.graded[week.week];
  const f = heroFacts(g && g.summary, deriveTicket(week), whoLabel);
  const payers = store.weekPayers(week);
  const { shares } = settleWeek(week.week, week.stake || 10, payers, week.contributions || state.payments.filter((p) => p.week === week.week));
  return (
    <section className={'card hero hero--' + f.tone}>
      <div className="hero__main">
        <span className="label">{`Week ${week.week} parlay`}</span>
        <span className="hero__state">{f.label}</span>
        <span className="hero__line">{f.line}</span>
        {f.segments.length ? (
          <div className="hero__bar" role="img" aria-label={f.line}>{f.segments.map(([k, c]) => (
            <span key={k} className={'hero__seg hero__seg--' + k} style={{ flexGrow: c }} />))}</div>) : null}
      </div>
      <div className="hero__side">
        {shares.length ? <span className="paychips">{shares.map((p) => <span key={p.who} className={'pill ' + (p.open ? 'pill--open' : 'pill--paid')}>{`${whoLabel(p.who)} · ${p.open ? fmtMoney(p.open) + ' open' : 'funded'}`}</span>)}</span> : null}
        <div className="hero__ctas">
          {f.wantsPicks ? <Link className="btn btn--primary" href="/pick">Make your pick</Link> : null}
          <Link className={'btn ' + (f.wantsPicks ? 'btn--secondary' : 'btn--primary')} href="/week">Open this week</Link>
        </div>
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

function RivalriesCard() {
  return (
    <section className="card rivalries">
      <div className="card__head"><h2>Rivalries</h2><span className="sub">Public 2010–2025 tape · overlap ranks, not weekly H2H</span></div>
      <Fold className="rivalries__list">{RIVALRIES.map((r) => (
        <article key={r.title} className="rivalry">
          <div className="rivalry__pair">{r.pair}</div>
          <div className="rivalry__title">{r.title}</div>
          <p className="rivalry__why">{r.why}</p>
          <p className="rivalry__stat">{r.stat}</p>
          <div className="inline"><Link className="btn btn--ghost btn--sm" href={'/chat?a=' + r.a + '&b=' + r.b}>Needle them in Chat</Link></div>
        </article>))}</Fold>
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
        <div className="card__head"><h2>2025 PF</h2><span className="sub">Fantasy points for</span></div>
        <div className="card__body"><Meters rows={pfRows} max={maxPf} fmt={(r) => r.pf.toFixed(1)} /></div>
      </section>
      <section className="card">
        <div className="card__head"><h2>Titles, current 12</h2><span className="sub">Championships 2010–2025</span></div>
        <div className="card__body"><Meters rows={titleRows} max={maxT} fmt={(r) => String(r.n)} /></div>
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
    <section className="card">
      <div className="card__head"><h2>Season Elo</h2><span className="sub">From final place · start 1500</span></div>
      <div className="card__body elo-body">
        <div className="elo-body__chart">
        <div className="elo-now">{elo.now.map((r, i) => (
          <button key={r.id} className={'elo-now__item' + (r.name === selected ? ' on' : '')} type="button" onClick={() => onSelect(r.name)}>{(i + 1) + '. ' + r.nick + ' '}<b>{fmtElo(r.rating)}</b></button>))}</div>
        <canvas ref={canvasRef} className="elo-chart" role="img" aria-label="Season Elo by year, 2010 to 2025. Lower on the table is a worse rating." />
        </div>
        <div className="tablewrap hide-m"><table>
          <thead><tr><th>#</th><th>Manager</th><th className="r">Elo</th><th className="r hide-m">Seasons</th><th className="r hide-m">Peak</th><th className="r hide-m">Low</th></tr></thead>
          <tbody>{elo.now.map((r, i) => (
            <tr key={r.id} className={r.name === selected ? 'me' : ''} onClick={() => onSelect(r.name)}>
              <td className="rank">{String(i + 1)}</td><td>{r.nick}</td><td className="r num">{fmtElo(r.rating)}</td>
              <td className="r num hide-m">{String(r.seasons) + (r.gaps.length ? ' · gap ' + r.gaps.join(', ') : '')}</td>
              <td className="r num hide-m">{fmtElo(r.peak)}</td><td className="r num hide-m">{fmtElo(r.low)}</td>
            </tr>))}</tbody>
        </table></div>
        {noSeason.length ? <p className="muted elo-body__note">{noSeason.map((p) => (p.nick || p.name)).join(', ') + ': no season finishes yet, so no Elo.'}</p> : null}
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
    <details className="card kpi-ideas">
      <summary className="card__head"><h2>Propose a KPI</h2><span className="sub">Saved on this device</span></summary>
      <div className="card__body form">
        <div className="field"><label htmlFor="kpi-name">Name</label><input id="kpi-name" type="text" placeholder="Title rate, playoff conversion…" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="kpi-def">Definition</label><textarea id="kpi-def" placeholder="What you would count, over which seasons" value={def} onChange={(e) => setDef(e.target.value)} /></div>
        <button className="btn btn--secondary" type="button" onClick={save}>Save idea</button>
        {ideas.length ? (
          <div className="tablewrap"><table>
            <thead><tr><th>Idea</th><th>Definition</th></tr></thead>
            <tbody>{ideas.map((x, i) => <tr key={i}><td>{x.name}</td><td>{x.def}</td></tr>)}</tbody>
          </table></div>
        ) : null}
      </div>
    </details>
  );
}

/** Every owner since 2010. The current managers show first; former owners wait behind a button. */
function AllManagers({ lore, departedTitles, you }) {
  const [allRows, setAllRows] = useState(false);
  const all = allTimeCareers(lore);
  const former = all.filter((c) => !c.current).length;
  const shown = allRows ? all : all.filter((c) => c.current);
  return (
    <section className="card">
      <div className="card__head"><h2>Every manager, all time</h2><span className="sub">{`${all.length} owners since 2010 · ${departedTitles} titles went to owners who left`}</span></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Manager</th><th className="r hide-m">Years</th><th className="r">Titles</th><th className="r">W–L</th><th className="r hide-m">Win %</th><th className="r">Avg</th><th className="r hide-m">Best · worst</th><th className="r hide-m">Last</th></tr></thead>
        <tbody>{shown.map((c) => (
          <tr key={c.owner} className={c.owner === you ? 'me' : ''}>
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
      {former ? <div className="card__body"><button className="btn btn--ghost btn--sm" type="button" onClick={() => setAllRows(!allRows)}>{allRows ? 'Current managers only' : `Show all ${all.length}, with ${former} former`}</button></div> : null}
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
  const sub = lore ? `${lore.span} · ${lore.seasonCount} seasons` : 'Career records and championships';
  if (!state.ready) return <Page title={title} />;
  if (!lore) return <Page title={title} sub={sub}><div className="card"><div className="empty">League history did not load. Refresh and try again.</div></div></Page>;
  const k = lore.kpis || {};
  const h = loreHeadlines(lore);
  const selected = state.selectedOwner || state.config.you || ident.people[0].name;
  const select = (n) => { state.selectedOwner = n; store.emit(); };
  const table = ident.people.slice().sort((a, b) => (a.career && a.career.avgFinish || 99) - (b.career && b.career.avgFinish || 99) || a.name.localeCompare(b.name));
  const valueRows = (list, cls) => (list || []).slice(0, 6).map((v, i) => (
    <tr key={i}><td className="num">{String(v.season)}</td><td>{whoLabel(v.owner)}</td><td>{v.player}</td><td className="r num">{'$' + v.price}</td><td className={'r num ' + cls}>{String(v.ppd)}</td></tr>));

  return (
    <Page title={title} sub={sub}>
      <LeagueHero store={store} />

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

      <section className="card">
        <div className="card__head"><h2>Championship lineage</h2><span className="sub">Who actually finished the job</span></div>
        <div className="ribbonwrap"><div className="ribbon">{(lore.champions || []).map((c) => (
          <div key={c.year} className="champ"><div className="champ__y">{String(c.year)}</div><div className="champ__n">{whoLabel(c.owner)}</div></div>))}</div></div>
      </section>

      <section className="card half">
        <div className="card__head"><h2>The table</h2><span className="sub">Tap a name</span></div>
        <Fold max={380}><div className="tablewrap"><table>
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
        </table></div></Fold>
      </section>

      <section className="card half">
        <div className="card__head"><h2>Owner card</h2></div>
        <div className="card__body">
          <div className="picker">{ident.people.map((p) => (
            <button key={p.id} className={'chip' + (p.name === selected ? ' on' : '')} type="button" onClick={() => select(p.name)}>{p.nick || p.name.split(' ')[0]}</button>))}</div>
          <OwnerCard name={selected} />
        </div>
      </section>

      <SeasonElo selected={selected} onSelect={select} />

      <Achievements groups={[
        ...(history ? [{ title: 'Season so far', source: 'parlay-history.json', legs: historyLegs(history) }] : []),
        { title: 'Weekly record', source: 'data/bets.json', legs: weeklyLegs(state.weeks, state.graded) },
      ]} />

      <RivalriesCard />
      <LeagueTape />
      <AllManagers lore={lore} departedTitles={h.departedTitles} you={state.config.you} />

      <section className="card">
        <div className="card__head"><h2>Seasons that broke the scale</h2><span className="sub">PF vs that year’s average</span></div>
        <Fold><div className="tablewrap"><table>
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
        </table></div></Fold>
      </section>

      <div className="two">
        <section className="card">
          <div className="card__head"><h2>Best money ever spent</h2><span className="sub">$20+ auction · pts per $</span></div>
          <Fold max={260}><div className="tablewrap"><table><thead><tr><th>Yr</th><th>Owner</th><th>Player</th><th className="r">$</th><th className="r">Pts/$</th></tr></thead><tbody>{valueRows(lore.bestValues, 'pos')}</tbody></table></div></Fold>
        </section>
        <section className="card">
          <div className="card__head"><h2>Money on fire</h2><span className="sub">$20+ auction · pts per $</span></div>
          <Fold max={260}><div className="tablewrap"><table><thead><tr><th>Yr</th><th>Owner</th><th>Player</th><th className="r">$</th><th className="r">Pts/$</th></tr></thead><tbody>{valueRows(lore.worstValues, 'neg')}</tbody></table></div></Fold>
        </section>
      </div>

      <KpiIdeas />
    </Page>
  );
}
