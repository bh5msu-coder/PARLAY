'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLeague, useReady } from './LeagueProvider';
import { Page } from './Topbar';
import { PageSkeleton } from './Skeletons';
import Achievements from './Achievements';
import { SeasonElo } from './LeagueView';
import { History } from './BetsView';
import { ParlayExtras } from './StandingsView';
import { ident } from '../lib/ident.mjs';
import { cachedHistory, historyLegs, loadHistory } from '../lib/history.mjs';
import { weeklyLegs } from '../lib/stats.mjs';

const SEGS = [
  { id: 'awards', label: 'Awards' },
  { id: 'elo', label: 'Elo' },
  { id: 'history', label: 'History' },
  { id: 'fun', label: 'Fun' },
];

/** Elo, badges, the parlay tape, and the fun tables. One segment at a time so the phone stays simple. */
export default function StatsView() {
  const store = useLeague();
  const ready = useReady();
  const { state } = store;
  const [seg, setSeg] = useState('awards');
  const [history, setHistory] = useState(cachedHistory());
  const [loaded, setLoaded] = useState(!!cachedHistory());
  useEffect(() => {
    const h = (window.location.hash || '').slice(1);
    if (SEGS.some((s) => s.id === h)) setSeg(h);
  }, []);
  useEffect(() => {
    let live = true;
    loadHistory().then((d) => { if (live) { setHistory(d); setLoaded(true); } });
    return () => { live = false; };
  }, []);
  const you = ready ? (state.config.you || '') : '';
  const selected = state.selectedOwner || you || (ident.people[0] && ident.people[0].name) || '';
  const select = (n) => { state.selectedOwner = n; store.emit(); };
  const choose = (id) => {
    setSeg(id);
    try { window.history.replaceState(null, '', id === 'awards' ? '/stats' : '/stats#' + id); } catch (e) { /* ignore */ }
  };

  return (
    <Page title="Stats" sub="Awards, Elo, and the tape" early skeleton="stats">
      <div className="tabs" role="tablist" aria-label="Stats">
        {SEGS.map((s) => (
          <button key={s.id} type="button" className="tab" role="tab" aria-selected={seg === s.id} onClick={() => choose(s.id)}>{s.label}</button>
        ))}
      </div>

      {seg === 'awards' ? (
        ready ? (
          <Achievements groups={[
            ...(history ? [{ title: 'Season so far', source: 'parlay-history.json', legs: historyLegs(history) }] : []),
            { title: 'Weekly record', source: 'league database', legs: weeklyLegs(state.weeks, state.graded) },
          ]} />
        ) : <PageSkeleton kind="stats" label="Loading awards" />
      ) : null}

      {seg === 'elo' ? <SeasonElo selected={selected} onSelect={select} /> : null}

      {seg === 'history' ? (
        !loaded ? <PageSkeleton kind="bets" label="Loading parlay history" />
          : !history ? <div className="card"><div className="empty">Parlay history did not load.</div></div>
            : <History data={history} selectedOwner={you || state.selectedOwner} weeks={ready ? state.weeks : []} payments={ready ? state.payments : []} store={store} />
      ) : null}

      {seg === 'fun' ? (
        ready ? (
          <>
            <ParlayExtras weeks={state.weeks} graded={state.graded} />
            <div className="inline">
              <Link className="btn btn--secondary" href="/standings">Standings</Link>
              <Link className="btn btn--secondary" href="/bets">Money</Link>
              <Link className="btn btn--secondary" href="/league">League history</Link>
            </div>
          </>
        ) : <PageSkeleton kind="stats" label="Loading fun stats" />
      ) : null}
    </Page>
  );
}
