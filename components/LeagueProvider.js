'use client';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { createLeagueStore } from '../lib/league-store.mjs';

const Ctx = createContext(null);
let singleton = null;

/** Path → legacy route name. The store's refresh logic keys off these names. */
export const ROUTES = [
  { path: '/week', route: 'week', label: 'This Week', short: 'Week', primary: true },
  { path: '/pick', route: 'pick', label: 'Pick', primary: true },
  { path: '/standings', route: 'standings', label: 'Standings', primary: true },
  { path: '/bets', route: 'history', label: 'Money', primary: true },
  { path: '/league', route: 'league', label: 'League' },
  { path: '/chat', route: 'chat', label: 'Chat' },
  { path: '/commissioner', route: 'admin', label: 'Commissioner', short: 'Admin' },
];

export function routeFor(pathname) {
  const hit = ROUTES.find((r) => pathname === r.path || pathname.startsWith(r.path + '/'));
  return hit ? hit.route : 'week';
}

export function LeagueProvider({ children }) {
  if (!singleton) singleton = createLeagueStore();
  const store = singleton;
  const pathname = usePathname() || '/week';
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
