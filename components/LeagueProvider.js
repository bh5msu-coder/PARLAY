'use client';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { createLeagueStore } from '../lib/league-store.mjs';
import { ident } from '../lib/ident.mjs';

const Ctx = createContext(null);
let singleton = null;

/** Path → legacy route name. The store's refresh logic keys off these names. */
/** League first: League and Chat sit in the top nav, the four parlay pages share one Parlay menu,
 *  and Commissioner is the gear. `group` decides where each route is shown. */
export const ROUTES = [
  { path: '/league', route: 'league', label: 'League', group: 'top' },
  { path: '/chat', route: 'chat', label: 'Chat', group: 'top' },
  { path: '/week', route: 'week', label: 'This Week', group: 'parlay' },
  { path: '/pick', route: 'pick', label: 'Pick', group: 'parlay' },
  { path: '/standings', route: 'standings', label: 'Standings', group: 'parlay' },
  { path: '/bets', route: 'history', label: 'Money', group: 'parlay' },
  { path: '/commissioner', route: 'admin', label: 'Commissioner', group: 'admin' },
];

export const HOME_PATH = '/league';

export function routeFor(pathname) {
  const hit = ROUTES.find((r) => pathname === r.path || pathname.startsWith(r.path + '/'));
  return hit ? hit.route : 'league';
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
