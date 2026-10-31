'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ROUTES, routeFor, useLeague } from './LeagueProvider';
import { SEASON } from '../lib/clients.mjs';

/** The league emblem (Our Holm League shield). Drawn from public/emblem.png, made from the Canva design. */
function LockupMark() {
  return <img className="lockup__mark" src="/emblem.png" width="40" height="40" alt="" aria-hidden="true" />;
}

function ThemeButton() {
  const [theme, setTheme] = useState('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme || 'dark'); }, []);
  const toggle = () => {
    const t = theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('hp_theme', t); } catch (e) { /* ignore */ }
    document.documentElement.dataset.theme = t;
    setTheme(t);
  };
  return <button className="btn btn--ghost btn--sm" type="button" aria-label="Toggle light and dark" onClick={toggle}>{theme === 'light' ? 'Dark' : 'Light'}</button>;
}

/** Page header: lockup, title, subtitle (with the NFL clock) and section nav. */
export default function Topbar({ title, sub }) {
  const { state } = useLeague();
  const current = routeFor(usePathname() || '/week');
  const clock = state.nfl;
  const clockBit = clock
    ? `NFL Week ${clock.active}${clock.wednesday ? ' · Wednesday kickoff' : clock.firstKickLabel ? ' · ' + clock.firstKickLabel : ''}`
    : '';
  const subText = state.bootError || (state.ready ? [sub || '', clockBit].filter(Boolean).join(' · ') : 'Loading…');
  return (
    <header className="topbar">
      <div className="topline">
        <Link className="lockup" href="/week" aria-label="Holm Parlay home">
          <LockupMark />
          <span className="lockup__type">
            <span className="lockup__name">Holm Parlay</span>
            <span className="eyebrow">{`${state.config.leagueName} · ${SEASON}${clock ? ' · Wk ' + clock.active : ''}`}</span>
          </span>
        </Link>
        <div className="titles">
          <h1>{state.ready ? title : 'Parlay'}</h1>
          <span className="sub">{subText}</span>
        </div>
        <div className="tools">
          <nav className="desknav" aria-label="Sections">
            {ROUTES.map((r) => (
              <Link key={r.path} className="btn btn--ghost btn--sm" href={r.path} aria-current={r.route === current ? 'page' : undefined}>{r.label}</Link>
            ))}
          </nav>
          {state.config.chat ? <a className="btn btn--ghost btn--sm" href={state.config.chat} target="_blank" rel="noopener">WhatsApp</a> : null}
          <ThemeButton />
        </div>
      </div>
    </header>
  );
}

/** Wraps a page: renders the Topbar and, once data is loaded, the page body. */
export function Page({ title, sub, children }) {
  const { state } = useLeague();
  return (
    <>
      <Topbar title={title} sub={sub} />
      <main id="view">{state.ready ? children : null}</main>
    </>
  );
}
