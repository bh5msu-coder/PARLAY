'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HOME_PATH, ROUTES, routeFor, useHydrated, useLeague } from './LeagueProvider';
import { GearIcon, ParlayMenu } from './NavMenus';
import { PageSkeleton } from './Skeletons';
import { ident } from '../lib/ident.mjs';
import { THEME_CHOICES, THEME_KEY, applyTheme, normalizeChoice } from '../lib/theme.mjs';

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

function AutoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8a8.2 8.2 0 0 1 0 16.4z" fill="currentColor" />
    </svg>
  );
}

/** Theme menu: System (follow the phone), Light or Dark. The icon shows the current choice. */
function ThemeMenu() {
  const ref = useRef(null);
  const [choice, setChoice] = useState('dark');
  useEffect(() => {
    const c = normalizeChoice(document.documentElement.dataset.themeChoice);
    setChoice(c);
    // Re-apply after hydration: Next.js can re-insert the media-query theme-color tags,
    // which would bring back the dark browser bar on a dark-mode phone set to Light.
    applyTheme(document, window, c);
  }, []);
  // While on System, follow the phone when it switches between light and dark.
  useEffect(() => {
    if (choice !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme(document, window, 'system');
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else if (mq.removeListener) mq.removeListener(on); };
  }, [choice]);
  const pick = (c) => {
    try { localStorage.setItem(THEME_KEY, c); } catch (e) { /* ignore */ }
    applyTheme(document, window, c);
    setChoice(c);
    if (ref.current) ref.current.open = false;
  };
  const label = 'Theme: ' + (THEME_CHOICES.find((t) => t.value === choice) || THEME_CHOICES[2]).label;
  return (
    <details ref={ref} className="more more--theme">
      <summary className="iconbtn" aria-label={label} title={label}>{choice === 'system' ? <AutoIcon /> : choice === 'light' ? <SunIcon /> : <MoonIcon />}</summary>
      <div className="more__list" role="menu" aria-label="Theme">
        {THEME_CHOICES.map((t) => (
          <button key={t.value} type="button" role="menuitemradio" aria-checked={choice === t.value} onClick={() => pick(t.value)}>
            {t.value === 'system' ? <AutoIcon /> : t.value === 'light' ? <SunIcon /> : <MoonIcon />}<span>{t.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
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
  const hydrated = useHydrated();
  const ready = hydrated && state.ready;
  const current = routeFor(usePathname() || HOME_PATH);
  const clock = state.nfl;
  const clockBit = clock
    ? `NFL Week ${clock.active}${clock.firstKick && Date.parse(clock.firstKick) <= Date.now() ? '' : clock.wednesday ? ' · Wednesday kickoff' : clock.firstKickLabel ? ' · ' + clock.firstKickLabel : ''}`
    : '';
  const subText = (hydrated && state.bootError) ? 'The league data didn\u2019t load' : (ready ? [sub || '', clockBit].filter(Boolean).join(' · ') : 'Loading the league\u2026');
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
            <span className="lockup__name">{(hydrated && state.config.leagueName) || 'Our Holm League'}</span>
          </span>
        </Link>
        <div className="tools">
          <nav className="desknav" aria-label="Sections">
            {['league', 'chat'].map((k) => {
              const r = top(k);
              return <Link key={r.path} className="navlink" href={r.path} aria-current={r.route === current ? 'page' : undefined}>{r.label}</Link>;
            })}
            <ParlayMenu current={current} className="more--down navlink" />
            <Link className="btn btn--cta navpick" href="/pick" aria-current={current === 'pick' ? 'page' : undefined}>Pick</Link>
            <Link className="navlink navlink--icon" href={top('admin').path} aria-label="Commissioner" aria-current={current === 'admin' ? 'page' : undefined}><GearIcon /><span>Commissioner</span></Link>
          </nav>
          {hydrated && state.config.chat ? <a className="navlink navlink--wa" href={state.config.chat} target="_blank" rel="noopener">WhatsApp</a> : null}
          {ready ? <YouPicker /> : null}
          <ThemeMenu />
        </div>
      </div>
      {/* On League the wordmark already says it, so the page title is kept for screen readers only. */}
      <div className={'titles' + (current === 'league' ? ' titles--home' : '')}>
        <h1 className={current === 'league' ? 'sr-only' : undefined}>{title || 'Our Holm League'}</h1>
        <span className="sub" aria-live="polite">{subText}</span>
      </div>
    </header>
  );
}

/** Wraps a page: renders the Topbar and, once data is loaded, the page body. */
/** `early`: the page can paint before the store boots (League renders its lore from the server).
 *  `skeleton`: which placeholder layout to show until then (see Skeletons.js). */
export function Page({ title, sub, children, early, skeleton }) {
  const { state } = useLeague();
  const hydrated = useHydrated();
  return (
    <>
      <Topbar title={title} sub={sub} />
      <main id="view">{(hydrated && state.ready) || early ? children : <PageSkeleton kind={skeleton} label={'Loading ' + (title || 'the page')} />}</main>
    </>
  );
}
