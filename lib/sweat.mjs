/** Sweat mode: one chip per leg for the pinned game-day bar. Pure over grade output
 *  ({ leg, state, detail, current }), the same shape the leg tracker reads. */
import { trackerRows } from './leg-tracker.mjs';

const TONE = { won: 'win', lost: 'loss', live: 'live', push: 'push' };

export function sweatChips(graded, nick = (s) => s) {
  return trackerRows(graded).map((r) => ({
    who: nick(r.who),
    label: r.label,
    tone: TONE[r.state] || 'pending',
    trend: r.trend,
    detail: r.detail,
  }));
}

/** Show the bar once games are under way and the ticket is still alive with legs left to play. */
export function sweatOn(graded) {
  const list = graded || [];
  if (!list.length) return false;
  const started = list.some((g) => ['live', 'won', 'lost', 'push'].includes(g.state));
  const open = list.some((g) => g.state === 'live' || !g.state || g.state === 'pending' || g.state === 'unknown');
  return started && open;
}
