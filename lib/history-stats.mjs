/** Stats for the Bets tab, computed from parlay-history.json only. Read-only: nothing here writes
 *  anywhere. Hit rate uses decided legs (win/loss); unknown legs are counted separately. */

export const SMALL_N = 5;

/** Night kickoff (TNF/SNF/MNF): 7 PM ET or later, approximated as 23:00–06:00 UTC. */
export const isPrime = (iso) => { const hr = new Date(iso).getUTCHours(); return hr >= 23 || hr < 6; };
export const hitPct = (w, n) => n ? Math.round((w / n) * 100) + '%' : '–';

/** @param {object} data parsed parlay-history.json
 *  @param {(name: string) => string} whoLabel display handle for a manager */
export function calcParlayStats(data, whoLabel) {
  const graded = data.parlays.filter((p) => p.result !== 'pending');
  const legs = [];
  graded.forEach((p) => p.legs.forEach((l) => legs.push(Object.assign({ week: p.week, wlabel: p.label }, l))));
  const decided = legs.filter((l) => l.result === 'win' || l.result === 'loss');
  const people = {};
  const P = (name) => people[name] || (people[name] = { name, nick: whoLabel(name), w: 0, l: 0, u: 0, seq: [], pw: 0, pn: 0, types: {}, busts: 0, picks: [] });
  legs.forEach((l) => {
    const r = P(l.who);
    r.picks.push(l);
    if (l.result === 'unknown') { r.u++; return; }
    const win = l.result === 'win';
    if (win) r.w++; else { r.l++; r.busts++; }
    r.seq.push(win);
    if (isPrime(l.kickoff)) { r.pn++; if (win) r.pw++; }
    const t = r.types[l.type] || (r.types[l.type] = { w: 0, n: 0 });
    t.n++; if (win) t.w++;
  });
  Object.values(people).forEach((r) => {
    r.n = r.w + r.l;
    let best = 0, cur = 0, worst = 0, curL = 0;
    r.seq.forEach((x) => { if (x) { cur++; curL = 0; } else { curL++; cur = 0; } best = Math.max(best, cur); worst = Math.max(worst, curL); });
    r.bestStreak = best; r.coldStreak = worst;
    const last = r.seq[r.seq.length - 1];
    let k = 0; for (let i = r.seq.length - 1; i >= 0 && r.seq[i] === last; i--) k++;
    r.streak = r.seq.length ? (last ? 'W' : 'L') + k : '–';
  });
  const rows = Object.values(people).sort((a, b) => (b.w / (b.n || 1)) - (a.w / (a.n || 1)) || b.n - a.n);
  const types = {};
  decided.forEach((l) => { const t = types[l.type] || (types[l.type] = { w: 0, n: 0 }); t.n++; if (l.result === 'win') t.w++; });
  const teams = {};
  legs.forEach((l) => { const key = l.player || l.team; if (!key) return; const t = teams[key] || (teams[key] = { key, n: 0, w: 0, by: {} }); t.n++; if (l.result === 'win') t.w++; t.by[whoLabel(l.who)] = 1; });
  const favs = Object.values(teams).filter((t) => t.n >= 2).sort((a, b) => b.n - a.n || b.w - a.w);
  return { graded, legs, decided, rows, types, favs, people };
}
