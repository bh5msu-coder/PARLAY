'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES, routeFor } from './LeagueProvider';
import MoreMenu from './MoreMenu';

export default function BottomNav() {
  const current = routeFor(usePathname() || '/week');
  return (
    <nav className="bottomnav" aria-label="Sections">
      {ROUTES.filter((r) => r.primary).map((r) => (
        <Link key={r.path} href={r.path} aria-current={r.route === current ? 'page' : undefined}>{r.short || r.label}</Link>
      ))}
      <MoreMenu current={current} className="more--up" />
    </nav>
  );
}
