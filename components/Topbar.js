'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HOME_PATH, ROUTES, routeFor, useLeague } from './LeagueProvider';
import { GearIcon, ParlayMenu } from './NavMenus';
import { ident } from '../lib/ident.mjs';

/** The league emblem: the Our Holm League shield from the Canva logo set. */
function LockupMark() {
  return <img className="lockup__mark" src="/emblem-128.png" srcSet="/emblem-128.png 1x, /emblem-256.png 2x" width="64" height="64" alt="" aria-hidden="true" />;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z" />
    </svg>
  );
}

/** Theme switch as an icon: a sun while dark (tap for light), a moon while light (tap for dark). */
function ThemeButton() {
  const [theme, setTheme] = useState('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme || 'dark'); }, []);
  const toggle = () => {
    const t = theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('hp_theme', t); } catch (e) { /* ignore */ }
    document.documentElement.dataset.theme = t;
    setTheme(t);
  };
  const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  return <button className="iconbtn" type="button" aria-label={label} title={label} onClick={toggle}>{theme === 'light' ? <MoonIcon /> : <SunIcon />}</button>;
}

/** Who is using this phone. Remembered in this browser only; highlights your leg and rows across the site. */
function YouPicker() {
  const store = useLeague();
  const you = store.state.config.you || '';
  const nick = you ? ident.nick(you) || you : '';
  return (
    <label className="youpick" title={nick ? `You: ${nick}` : 'Who are you?'}>
      <span className="youpick__badge" aria-hidden="true">{nick ? nick.charAt(0).toUpperCase() : '?'}</span>
      <span className="youpick__label">You</span>
      <select aria-label="Who are you" value={you} onChange={(e) => store.setYou(e.target.value)}>
        <option value="">Pick yourself</option>
        {ident.people.map((p) => <option key={p.id} value={p.name}>{p.nick || p.name}</option>)}
      </select>
    </label>
  );
}

/** Page header, Classic Banner (Canva option A): shield and the league wordmark, the nav (League, Chat,
 *  Parlay menu, Commissioner, theme), then the page title over a gold rule with its subtitle. */
export default function Topbar({ title, sub }) {
  const { state } = useLeague();
  const current = routeFor(usePathname() || HOME_PATH);
  const clock = state.nfl;
  const clockBit = clock
    ? `NFL Week ${clock.active}${clock.firstKick && Date.parse(clock.firstKick) <= Date.now() ? '' : clock.wednesday ? ' · Wednesday kickoff' : clock.firstKickLabel ? ' · ' + clock.firstKickLabel : ''}`
    : '';
  const subText = state.bootError || (state.ready ? [sub || '', clockBit].filter(Boolean).join(' · ') : 'Loading…');
  const lore = ident.lore;
  const est = lore && lore.champions && lore.champions.length ? lore.champions[0].year : null;
  const eyebrow = [est ? 'Est. ' + est : '', lore ? `${lore.seasonCount} seasons` : ''].filter(Boolean).join(' · ');
  const top = (route) => ROUTES.find((r) => r.route === route);
  return (
    <header className="topbar">
      <div className="masthead">
        <Link className="lockup" href={HOME_PATH} aria-label="Our Holm League home">
          <LockupMark />
          <span className="lockup__type">
            {eyebrow ? <span className="lockup__eyebrow">{eyebrow}</span> : null}
            <span className="lockup__name">{state.config.leagueName || 'Our Holm League'}</span>
          </span>
        </Link>
        <div className="tools">
          <nav className="desknav" aria-label="Sections">
            {['league', 'chat'].map((k) => {
              const r = top(k);
              return <Link key={r.path} className="navlink" href={r.path} aria-current={r.route === current ? 'page' : undefined}>{r.label}</Link>;
            })}
            <ParlayMenu current={current} className="more--down navlink" />
            <Link className="navlink navlink--icon" href={top('admin').path} aria-label="Commissioner" aria-current={current === 'admin' ? 'page' : undefined}><GearIcon /><span>Commissioner</span></Link>
          </nav>
          {state.config.chat ? <a className="navlink navlink--wa" href={state.config.chat} target="_blank" rel="noopener">WhatsApp</a> : null}
          {state.ready ? <YouPicker /> : null}
          <ThemeButton />
        </div>
      </div>
      {/* On League the wordmark already says it, so the page title is kept for screen readers only. */}
      <div className={'titles' + (current === 'league' ? ' titles--home' : '')}>
        <h1 className={current === 'league' ? 'sr-only' : undefined}>{state.ready ? title : 'Our Holm League'}</h1>
        <span className="sub">{subText}</span>
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
