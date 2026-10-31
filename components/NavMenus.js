'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { ROUTES } from './LeagueProvider';

/** The four parlay pages behind one "Parlay" menu. Lit when any of them is open; closes after a pick. */
export function ParlayMenu({ current, className = '' }) {
  const ref = useRef(null);
  const close = () => { if (ref.current) ref.current.open = false; };
  const items = ROUTES.filter((r) => r.group === 'parlay');
  const active = items.some((r) => r.route === current);
  return (
    <details ref={ref} className={'more ' + className}>
      <summary aria-current={active ? 'page' : undefined}>Parlay<Chevron /></summary>
      <div className="more__list" role="menu">
        {items.map((r) => (
          <Link key={r.path} href={r.path} role="menuitem" onClick={close} aria-current={r.route === current ? 'page' : undefined}>{r.label}</Link>
        ))}
      </div>
    </details>
  );
}

function Chevron() {
  return <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
