'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ROUTES, routeFor, useLeague } from './LeagueProvider';
import { SEASON } from '../lib/clients.mjs';

function LockupMark() {
  return (
    <svg className="lockup__mark" viewBox="0 0 64 64" width="36" height="36" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="lockup-slip"><rect x="3" y="12" width="58" height="40" rx="4" /></clipPath>
        <clipPath id="lockup-ball"><ellipse cx="38" cy="32" rx="18" ry="11" /></clipPath>
      </defs>
      <rect className="mark__ticket" x="3" y="12" width="58" height="40" rx="4" />
      <g clipPath="url(#lockup-slip)">
        <rect className="mark__stub" x="3" y="12" width="8" height="40" />
        {[18, 25, 32, 39, 46].map((cy) => <circle key={cy} className="mark__perf" cx="15.5" cy={cy} r="1.6" />)}
      </g>
      <ellipse className="mark__ball" cx="38" cy="32" rx="18" ry="11" />
      <g clipPath="url(#lockup-ball)">
        <path className="mark__lace" d="M24 32h28" />
        <path className="mark__lace" d="M31 26.5v11M35.5 25.5v13M40 25v14M44.5 25.5v13M49 26.5v11" />
      </g>
      <circle className="mark__chip" cx="51" cy="44" r="7" />
      <circle className="mark__chip-ring" cx="51" cy="44" r="4" />
      <circle className="mark__chip-pip" cx="51" cy="44" r="1.2" />
    </svg>
  );
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
