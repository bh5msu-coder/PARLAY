'use client';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { createLeagueStore } from '../lib/league-store.mjs';
import { ident } from '../lib/ident.mjs';

const Ctx = createContext(null);
let singleton = null;

/** Path → route name. The store's refresh logic keys off these names.
 *  The phone shows the four `tab` routes. Everything else stays reachable from More. */
export const ROUTES = [
  { path: '/week', route: 'week', label: 'This Week', short: 'Week', group: 'tab' },
  { path: '/standings', route: 'standings', label: 'Standings', short: 'Standings', group: 'tab' },
  { path: '/stats', route: 'stats', label: 'Stats', short: 'Stats', group: 'tab' },
  { path: '/more', route: 'more', label: 'More', short: 'More', group: 'tab' },
  { path: '/pick', route: 'pick', label: 'Pick', group: 'more' },
  { path: '/league', route: 'league', label: 'League', group: 'more' },
  { path: '/bets', route: 'history', label: 'Money', group: 'more' },
  { path: '/chat', route: 'chat', label: 'Chat', group: 'more' },
  { path: '/commissioner', route: 'admin', label: 'Commissioner', group: 'more' },
];

export const HOME_PATH = '/week';

export function routeFor(pathname) {
  const hit = ROUTES.find((r) => pathname === r.path || pathname.startsWith(r.path + '/'));
  return hit ? hit.route : 'week';
}

/** Which bottom-tab is lit. League, chat, money, the full pick form, and commissioner sit under More. */
export function tabFor(route) {
  if (route === 'week' || route === 'standings' || route === 'stats') return route;
  return 'more';
}

/** `lore` comes from the root layout (server), so every page renders with the same league
 *  history on the server and on the client, and boot skips fetching it. */
export function LeagueProvider({ children, lore }) {
  if (lore && !ident.lore) ident.load(lore);
  if (!singleton) singleton = createLeagueStore();
  const store = singleton;
  const pathname = usePathname() || HOME_PATH;
  store.state.route = routeFor(pathname);

  useEffect(() => {
    store.boot();
    const onVis = () => { if (!document.hidden && store.state.ready) store.refreshScores(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Returns the league store and re-renders the caller whenever the store emits. */
export function useLeague() {
  const store = useContext(Ctx);
  useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  return store;
}

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after. Lets pages gate store-driven content
 *  (which the server never has) without hydration mismatches, even if boot finishes first. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** The store is booted and this tree has hydrated. */
export function useReady() {
  const hydrated = useHydrated();
  const store = useLeague();
  return hydrated && store.state.ready;
}
