'use client';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { createLeagueStore } from '../lib/league-store.mjs';

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

export function LeagueProvider({ children }) {
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
