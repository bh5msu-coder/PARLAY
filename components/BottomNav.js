'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HOME_PATH, ROUTES, routeFor, tabFor } from './LeagueProvider';

function TabIcon({ route }) {
  const common = { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (route === 'week') {
    return <svg {...common}><path d="M5 7.5h14M5 12h14M5 16.5h9" /><circle cx="17.5" cy="16.5" r="2.2" /></svg>;
  }
  if (route === 'standings') {
    return <svg {...common}><path d="M5 19V10M12 19V5M19 19v-7" /></svg>;
  }
  if (route === 'stats') {
    return <svg {...common}><path d="M8 15.5 11 8l2.2 4.2L16 9.5 18 14" /><path d="M5 19h14" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M6 19.5c.8-2.8 3-4.2 6-4.2s5.2 1.4 6 4.2" /></svg>;
}

/** Phone tab bar: This Week, Standings, Stats, More. Less-used pages live under More. */
export default function BottomNav() {
  const current = tabFor(routeFor(usePathname() || HOME_PATH));
  const tabs = ROUTES.filter((r) => r.group === 'tab');
  return (
    <nav className="bottomnav" aria-label="Sections">
      {tabs.map((r) => (
        <Link key={r.path} href={r.path} aria-label={r.label} aria-current={r.route === current ? 'page' : undefined}>
          <TabIcon route={r.route} />
          <span>{r.short}</span>
        </Link>
      ))}
    </nav>
  );
}
