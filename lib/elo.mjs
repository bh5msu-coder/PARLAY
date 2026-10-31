/** Season Elo from league-lore final places only. It never reads weekly legs or parlay results.
 *  Start 1500, K = 8, and each pairwise update is divided by n − 1 so field size does not inflate
 *  swings. No offseason regression. Extracted from the legacy app.js (behavior unchanged). */
import { atYear, seasonRows } from './ident.mjs';

export function gapLabels(played) {
  const out = [];
  for (let i = 1; i < played.length; i++) {
    const a = played[i - 1] + 1, b = played[i] - 1;
    if (b >= a) out.push(a === b ? String(a) : a + '–' + b);
  }
  return out;
}

/** @param {Array} lorePeople people from league-lore.json (each with career.history) */
export function calcSeasonElo(lorePeople) {
  const K = 8, START = 1500;
  const people = lorePeople.filter((p) => seasonRows(p).length);
  const years = [];
  for (let y = 2010; y <= 2025; y++) years.push(y);
  const R = {};
  const series = {};
  const peak = {};
  const low = {};
  people.forEach((p) => { series[p.id] = years.map(() => null); });
  years.forEach((y, yi) => {
    const field = people.filter((p) => atYear(p, y));
    field.forEach((p) => { if (R[p.id] == null) R[p.id] = START; });
    const d = {};
    field.forEach((p) => { d[p.id] = 0; });
    for (let i = 0; i < field.length; i++) {
      for (let j = i + 1; j < field.length; j++) {
        const a = field[i], b = field[j];
        const ra = atYear(a, y).rank, rb = atYear(b, y).rank;
        const s = ra < rb ? 1 : ra > rb ? 0 : 0.5;
        const e = 1 / (1 + Math.pow(10, (R[b.id] - R[a.id]) / 400));
        const adj = K * (s - e) / (field.length - 1);
        d[a.id] += adj;
        d[b.id] -= adj;
      }
    }
    field.forEach((p) => {
      R[p.id] += d[p.id];
      const v = R[p.id];
      series[p.id][yi] = v;
      peak[p.id] = peak[p.id] == null ? v : Math.max(peak[p.id], v);
      low[p.id] = low[p.id] == null ? v : Math.min(low[p.id], v);
    });
  });
  const now = people.map((p) => ({
    id: p.id,
    nick: p.nick || p.name,
    name: p.name,
    rating: R[p.id],
    seasons: seasonRows(p).length,
    gaps: gapLabels(years.filter((y) => atYear(p, y))),
    peak: peak[p.id],
    low: low[p.id],
  })).sort((a, b) => b.rating - a.rating || a.nick.localeCompare(b.nick));
  return { years, series, now };
}
