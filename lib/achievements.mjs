/** League achievements: badges computed only from recorded picks and tickets. No badge relies on a
 *  rule the league has not stated, and none counts open or unknown legs as wins or losses.
 *  Each badge names its source and the fields it reads, and carries `n` (decided picks behind it). */
import { selectionStats, SMALL_N } from './stats.mjs';

/** Badge definitions: id, name, what it means, and which recorded fields it uses. */
export const BADGES = [
  { id: 'hot-hand', name: 'Hot hand', what: 'Longest run of consecutive winning picks (3 or more).', fields: ['legs[].result', 'week order'] },
  { id: 'lock', name: 'Lock', what: 'Best hit rate among managers with at least 5 decided picks.', fields: ['legs[].result'] },
  { id: 'never-missed', name: 'Clean sheet', what: 'Every decided pick won (at least 2 decided).', fields: ['legs[].result'] },
  { id: 'ticket-killer', name: 'Ticket killer', what: 'Most losing picks on tickets that busted.', fields: ['legs[].result', 'ticket result'] },
  { id: 'night-owl', name: 'Night owl', what: 'Most winning picks in night games (7 PM ET or later), at least 2.', fields: ['legs[].result', 'legs[].kickoff'] },
  { id: 'specialist', name: 'Specialist', what: 'Best hit rate on one bet type, with at least 3 decided picks of that type.', fields: ['legs[].result', 'legs[].type'] },
  { id: 'ever-present', name: 'Ever-present', what: 'Has a pick on every ticket in this record.', fields: ['legs[].who', 'week'] },
  { id: 'cold-streak', name: 'Cold streak', what: 'Longest run of consecutive losing picks (3 or more).', fields: ['legs[].result', 'week order'] },
];

const TYPE = { ml: 'moneyline', spread: 'spread', total: 'game total', player: 'player prop', sgp: 'same-game parlay' };

function best(rows, score, min) {
  let top = null;
  const winners = [];
  for (const r of rows) {
    const v = score(r);
    if (v == null || v < (min ?? -Infinity)) continue;
    if (top == null || v > top) { top = v; winners.length = 0; winners.push(r); } else if (v === top) winners.push(r);
  }
  return { top, winners };
}

/**
 * @param {Array} legs stats rows (lib/stats.mjs weeklyLegs or lib/history.mjs historyLegs)
 * @param {string} source 'data/bets.json' or 'parlay-history.json'
 * @returns {Array<{id, name, what, who: string[], detail: string, n: number, smallSample: boolean, source: string, fields: string[]}>}
 */
export function computeAchievements(legs, source) {
  const rows = selectionStats(legs);
  const def = Object.fromEntries(BADGES.map((b) => [b.id, b]));
  const out = [];
  const award = (id, winners, detail, n) => {
    if (!winners.length) return;
    out.push(Object.assign({}, def[id], { who: winners.map((w) => w.who), detail, n, smallSample: n < SMALL_N, source }));
  };

  const hot = best(rows, (r) => r.streak.best, 3);
  award('hot-hand', hot.winners, `${hot.top} straight winning picks`, hot.top || 0);

  const eligible = rows.filter((r) => r.hit.n >= SMALL_N);
  const lock = best(eligible, (r) => r.hit.rate);
  if (lock.winners.length) award('lock', lock.winners, lock.winners.map((w) => `${w.hit.won}–${w.hit.lost} (${Math.round(w.hit.rate * 100)}%)`).join(', '), Math.min(...lock.winners.map((w) => w.hit.n)));

  const clean = rows.filter((r) => r.hit.n >= 2 && r.hit.lost === 0);
  award('never-missed', clean, clean.map((r) => `${r.hit.won}–0`).join(', '), clean.length ? Math.min(...clean.map((r) => r.hit.n)) : 0);

  const killer = best(rows, (r) => r.busts, 1);
  award('ticket-killer', killer.winners, `${killer.top} losing pick${killer.top === 1 ? '' : 's'} on busted tickets`, killer.top || 0);

  const owl = best(rows, (r) => r.primetime.prime.won, 2);
  award('night-owl', owl.winners, owl.winners.map((w) => `${w.primetime.prime.won} of ${w.primetime.prime.n} night picks hit`).join(', '), owl.winners.length ? Math.min(...owl.winners.map((w) => w.primetime.prime.n)) : 0);

  let spec = null;
  for (const r of rows) for (const [t, m] of Object.entries(r.byType)) {
    if (m.n < 3 || m.rate == null) continue;
    if (!spec || m.rate > spec.m.rate || (m.rate === spec.m.rate && m.n > spec.m.n)) spec = { r, t, m };
  }
  if (spec) award('specialist', [spec.r], `${TYPE[spec.t] || spec.t}: ${spec.m.won}–${spec.m.lost}`, spec.m.n);

  const weeks = new Set(legs.map((l) => l.week));
  if (weeks.size >= 2) {
    const present = rows.filter((r) => new Set(legs.filter((l) => l.who === r.who || (l.who && r.who && l.who.toLowerCase() === r.who.toLowerCase())).map((l) => l.week)).size === weeks.size);
    award('ever-present', present, `on all ${weeks.size} tickets`, weeks.size);
  }

  const cold = best(rows, (r) => r.streak.cold, 3);
  award('cold-streak', cold.winners, `${cold.top} straight losing picks`, cold.top || 0);
  return out;
}
