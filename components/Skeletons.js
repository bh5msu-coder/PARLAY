'use client';
import { useLeague } from './LeagueProvider';

/** Placeholder layouts shown while the league data loads, so each page keeps its shape. */

function Bar({ v }) { return <div className={'skel__bar' + (v ? ' skel__bar--' + v : '')} />; }

function CardSkel({ head = true, rows = 3, tall }) {
  return (
    <section className="card skel" aria-hidden="true">
      {head ? <Bar v="short" /> : null}
      {tall ? <Bar v="tall" /> : null}
      {Array.from({ length: rows }, (_, i) => <Bar key={i} />)}
    </section>
  );
}

function ListSkel({ rows = 6 }) {
  return (
    <section className="card skel skel--list" aria-hidden="true">
      <Bar v="short" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel__row"><div className="skel__col"><Bar v="short" /><Bar /></div><Bar v="chip" /></div>
      ))}
    </section>
  );
}

const LAYOUTS = {
  week: () => (<><div className="skel__tabs" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <Bar key={i} v="pill" />)}</div><CardSkel tall rows={2} /><ListSkel rows={6} /></>),
  pick: () => (<><CardSkel tall rows={1} /><CardSkel rows={4} /></>),
  standings: () => (<><div className="stats" aria-hidden="true">{[0, 1, 2, 3].map((i) => <CardSkel key={i} rows={1} tall />)}</div><ListSkel rows={8} /></>),
  chat: () => (<><CardSkel rows={1} /><ListSkel rows={5} /></>),
  bets: () => (<><div className="stats" aria-hidden="true">{[0, 1, 2].map((i) => <CardSkel key={i} rows={1} tall />)}</div><CardSkel rows={4} /></>),
  stats: () => (<><div className="skel__tabs" aria-hidden="true">{[0, 1, 2, 3].map((i) => <Bar key={i} v="pill" />)}</div><CardSkel rows={4} /></>),
  more: () => (<><CardSkel rows={2} /><CardSkel rows={3} /></>),
  generic: () => (<><CardSkel tall rows={2} /><CardSkel rows={3} /></>),
};

/** While loading: the page's placeholder layout. If the league data failed to load, say so plainly. */
export function PageSkeleton({ kind = 'generic', label }) {
  const { state } = useLeague();
  if (state.bootError) {
    return (
      <section className="card loadnote loadnote--bad" role="alert">
        <h2 className="loadnote__title">The league didn&rsquo;t load</h2>
        <p className="loadnote__body">{`The site couldn\u2019t reach its data (${state.bootError}). Nothing was changed. Check your connection, then reload.`}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Reload</button>
      </section>
    );
  }
  const L = LAYOUTS[kind] || LAYOUTS.generic;
  return <div className="skel-page" aria-busy="true" aria-label={label || 'Loading'}><L /></div>;
}

/** A score-failure banner; renders nothing when scores are fine. */
export function ScoreNotice({ notice, onRetry }) {
  if (!notice) return null;
  return (
    <section className="card loadnote loadnote--warn" role="status">
      <h2 className="loadnote__title">{notice.title}</h2>
      <p className="loadnote__body">{notice.body}</p>
      {onRetry ? <button type="button" className="btn btn--secondary" onClick={onRetry}>Try again now</button> : null}
    </section>
  );
}
