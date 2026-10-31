'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HOME_PATH, ROUTES, routeFor } from './LeagueProvider';
import { GearIcon, ParlayMenu } from './NavMenus';

/** Phone tab bar: League, Parlay (menu opens upward), Chat, Commissioner gear. */
export default function BottomNav() {
  const current = routeFor(usePathname() || HOME_PATH);
  const link = (route, body, label) => {
    const r = ROUTES.find((x) => x.route === route);
    return <Link href={r.path} aria-label={label} aria-current={r.route === current ? 'page' : undefined}>{body}</Link>;
  };
  return (
    <nav className="bottomnav" aria-label="Sections">
      {link('league', 'League')}
      <ParlayMenu current={current} className="more--up" />
      {link('chat', 'Chat')}
      {link('admin', <GearIcon />, 'Commissioner')}
    </nav>
  );
}
