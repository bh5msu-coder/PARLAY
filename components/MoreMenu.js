'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { ROUTES } from './LeagueProvider';

/** The secondary pages (League, Chat, Commissioner) behind one "More" button. Closes after a pick. */
export default function MoreMenu({ current, className = '' }) {
  const ref = useRef(null);
  const close = () => { if (ref.current) ref.current.open = false; };
  const rest = ROUTES.filter((r) => !r.primary);
  const active = rest.some((r) => r.route === current);
  return (
    <details ref={ref} className={'more ' + className}>
      <summary aria-current={active ? 'page' : undefined}>More</summary>
      <div className="more__list" role="menu">
        {rest.map((r) => (
          <Link key={r.path} href={r.path} role="menuitem" onClick={close} aria-current={r.route === current ? 'page' : undefined}>{r.label}</Link>
        ))}
      </div>
    </details>
  );
}
