'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLeague, useReady } from './LeagueProvider';
import { ident } from '../lib/ident.mjs';
import { placedTicketPicks } from '../lib/pick-form.mjs';

/** One tap to the bet from any page: shown while the week is open and this phone's manager has no pick in.
 *  League already carries the same button in its hero, so the bar stays off there. */
export default function PickCue() {
  const store = useLeague();
  const ready = useReady();
  const pathname = usePathname() || '';
  if (!ready || pathname === '/' || pathname.startsWith('/pick') || pathname.startsWith('/league') || pathname.startsWith('/commissioner')) return null;
  const { state } = store;
  const week = state.pick.week;
  const you = ident.canonical(state.config.you || '');
  if (!week || !you || !ident.parlayRoster().includes(you)) return null;
  if (state.pick.setupError || placedTicketPicks(store.weekRecord(week)).length) return null;
  const mine = (state.pick.rows || []).some((p) => ident.canonical(p.who) === you);
  if (mine || !(state.pick.games || []).some((g) => g.pre)) return null;
  return (
    <aside className="pickcue" aria-label="Your pick">
      <span className="pickcue__text"><strong>{`Week ${week}`}</strong>{' · your pick isn’t in'}</span>
      <Link className="btn btn--cta" href="/pick">Make my pick</Link>
    </aside>
  );
}
