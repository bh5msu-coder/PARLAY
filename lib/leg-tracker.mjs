/** Live leg tracker for the League hero. Pure, so it is tested. Takes grade output
 *  ({ leg, state, detail, current }) and returns rows ordered by what matters right now. */

const ORDER = { live: 0, lost: 1, pending: 2, unknown: 3, won: 4, push: 5  };
const GOOD = new Set(['leading', 'covering']);
const BAD = new Set(['trailing', 'not covering']);

/** 'up' | 'down' | '' — how a live leg is doing. Totals and props have no direction until they settle. */
export function legTrend(g) {
  if (!g || g.state !== 'live') return '';
  const c = String(g.current || '');
  if (GOOD.has(c)) return 'up';
  if (BAD.has(c)) return 'down';
  return '';
}

export function trackerRows(graded, you) {
  return (graded || [])
    .map((g, i) => ({
      i,
      who: g.leg && g.leg.who,
      label: (g.leg && g.leg.label) || '',
      state: g.state || 'pending',
      detail: g.detail || '',
      current: g.current || '',
      trend: legTrend(g),
      mine: !!you && g.leg && g.leg.who === you,
    }))
    .sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) || a.i - b.i);
}

export function trackerCounts(rows) {
  const c = { live: 0, won: 0, lost: 0, push: 0, open: 0, up: 0, down: 0 };
  rows.forEach((r) => {
    if (r.state === 'live') c.live++;
    else if (r.state === 'won') c.won++;
    else if (r.state === 'lost') c.lost++;
    else if (r.state === 'push') c.push++;
    else c.open++;
    if (r.trend === 'up') c.up++;
    if (r.trend === 'down') c.down++;
  });
  return c;
}
