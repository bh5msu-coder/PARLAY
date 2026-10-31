/** Standings, betting styles and parlay extras for the weekly tape (data/bets.json + live grades).
 *  Extracted from the legacy app.js; functions take (weeks, graded, config) instead of global state.
 *  Hit rate counts decided legs only: hit / (hit + miss). Open, unknown and push legs never count. */
import { applyLegToRow, summarizeParlay, tallyState } from './weeks.mjs';
import { houseHandle, ident } from './ident.mjs';

export function seasonRecord(weeks, graded) {
  let c = 0, b = 0;
  for (const w of weeks) {
    const g = graded[w.week];
    if (!g) continue;
    if (g.summary.state === 'cashed') c++;
    if (g.summary.state === 'busted') b++;
  }
  return `${c} – ${b}`;
}

function emptyBettingStyle() {
  return { n: 0, ml: 0, spread: 0, total: 0, player: 0, sgp: 0, fav: 0, dog: 0, paidWeeks: 0, busts: 0, hit: 0, miss: 0 };
}

export function computeBettingStyles(weeks, graded) {
  const byWho = new Map();
  const row = (who) => {
    const c = ident.canonical(who);
    if (!c) return null;
    if (!byWho.has(c)) byWho.set(c, emptyBettingStyle());
    return byWho.get(c);
  };
  for (const w of weeks) {
    const groups = w.groups || {};
    const payer = row(w.payer);
    if (payer) payer.paidWeeks++;
    const g = graded[w.week];
    if (g) {
      for (const k of g.summary.killers || []) {
        const killer = row(k);
        if (killer) killer.busts++;
      }
      for (const r of g.graded) {
        const s = row(r.leg.who);
        if (!s) continue;
        const bucket = tallyState(r.state);
        if (bucket === 'hit') s.hit++;
        else if (bucket === 'miss') s.miss++;
      }
    }
    const pricedSgp = new Set();
    for (const leg of w.legs || []) {
      const s = row(leg.who);
      if (!s) continue;
      s.n++;
      const gid = leg.group;
      if (gid && groups[gid]) {
        s.sgp++;
        const key = ident.canonical(leg.who) + '\0' + gid;
        if (pricedSgp.has(key)) continue;
        pricedSgp.add(key);
        const o = Number(groups[gid].odds);
        if (!isNaN(o) && o !== 0) (o < 0 ? s.fav++ : s.dog++);
      } else {
        if (Object.prototype.hasOwnProperty.call(s, leg.type)) s[leg.type]++;
        const o = Number(leg.odds);
        if (!isNaN(o) && o !== 0) (o < 0 ? s.fav++ : s.dog++);
      }
    }
  }
  return byWho;
}

export function pickEpithet(person, s, weekCount) {
  if (person && person.abstain) return null;
  if (!s || s.n < 1) return null;
  weekCount = weekCount || 1;
  if (s.paidWeeks >= 2 && s.paidWeeks >= weekCount / 2) return 'tab';
  if (s.busts >= 2) return 'killer';
  if (s.sgp / s.n >= 0.5) return 'sgp';
  if (s.player / s.n >= 0.5) return 'props';
  const priced = s.fav + s.dog;
  if (priced && s.dog / priced >= 0.6) return 'dogs';
  if (priced && s.fav / priced >= 0.6) return 'chalk';
  let best = null, bestN = 0;
  for (const t of ['ml', 'spread', 'total']) {
    if (s[t] > bestN) { best = t; bestN = s[t]; }
  }
  const standalone = Math.max(s.n - s.sgp, 0);
  if (best && standalone && bestN >= standalone * 0.5) return best;
  const settled = s.hit + s.miss;
  if (settled >= 4) {
    const rate = s.hit / settled;
    if (rate >= 0.75) return 'locks';
    if (rate <= 0.25) return 'bricks';
  }
  return 'mixer';
}

export function styleNick(name, styles, weekCount) {
  const p = ident.person(name);
  const key = pickEpithet(p, styles && styles.get(ident.canonical(name)), weekCount);
  return houseHandle(name, key);
}

export function computeStandings(weeks, graded, config) {
  const names = new Set(ident.parlayRoster());
  for (const n of (config && config.roster) || []) {
    const c = ident.canonical(n);
    if (ident.person(c) && ident.person(c).parlay) names.add(c);
  }
  for (const w of weeks) for (const l of w.legs || []) if (l.who) {
    const c = ident.canonical(l.who);
    const p = ident.person(c);
    if (p ? p.parlay : false) names.add(c);
  }
  for (const a of ident.abstainNames()) names.delete(a);
  const rows = {};
  for (const n of names) {
    if (!n) continue;
    rows[n] = { who: n, legs: 0, hit: 0, miss: 0, push: 0, busts: 0, paid: 0, share: 0, streak: [], open: 0 };
  }
  for (const w of weeks) {
    const g = graded[w.week];
    const payer = ident.canonical(w.payer);
    if (payer && rows[payer]) rows[payer].paid += Number(w.stake || 10);
    if (!g) continue;
    const participants = (w.legs || []).length || 1;
    for (const r of g.graded) {
      const who = ident.canonical(r.leg.who);
      const row = rows[who]; if (!row) continue;
      applyLegToRow(row, r.state);
      if (g.summary.state === 'cashed' && w.toPay) row.share += w.toPay / participants;
    }
    for (const k of g.summary.killers) {
      const who = ident.canonical(k);
      if (rows[who]) rows[who].busts++;
    }
  }
  const list = Object.values(rows);
  list.sort((a, b) => {
    const ra = a.hit + a.miss ? a.hit / (a.hit + a.miss) : -1, rb = b.hit + b.miss ? b.hit / (b.hit + b.miss) : -1;
    return rb - ra || a.busts - b.busts || b.hit - a.hit || a.who.localeCompare(b.who);
  });
  return list;
}

/** Display ranks with ties: managers level on hit rate, busts and hits share a rank ("T-1"), so five
 *  managers at 1-for-1 are not shown as 1 to 5. Rows must already be in standings order. */
export function rankLabels(rows) {
  const key = (r) => { const n = r.hit + r.miss; return (n ? r.hit / n : -1).toFixed(6) + '|' + r.busts + '|' + r.hit; };
  const first = {}, count = {};
  rows.forEach((r, i) => { const k = key(r); if (first[k] == null) first[k] = i + 1; count[k] = (count[k] || 0) + 1; });
  return rows.map((r) => { const k = key(r); return count[k] > 1 ? 'T-' + first[k] : String(first[k]); });
}

export function streakText(arr) {
  if (!arr.length) return '–';
  const last = arr[arr.length - 1]; let n = 0;
  for (let i = arr.length - 1; i >= 0 && arr[i] === last; i--) n++;
  return last + n;
}

export function tallyRate(hit, miss) {
  const n = hit + miss;
  return { hit, miss, n, rate: n ? hit / n : null };
}

export const TYPE_LABELS = { ml: 'Moneyline', spread: 'Spread', total: 'Total', player: 'Player prop', sgp: 'Same-game parlay' };

/** By-bet-type, favorites-vs-dogs and ticket-killer tallies over decided legs. */
export function parlayExtras(weeks, graded) {
  const types = { ml: [0, 0], spread: [0, 0], total: [0, 0], player: [0, 0], sgp: [0, 0] };
  const fav = [0, 0], dog = [0, 0];
  const killers = {};
  for (const w of weeks) {
    const g = graded[w.week];
    if (!g) continue;
    const groups = w.groups || {};
    const seenG = new Set();
    for (const r of g.graded) {
      const st = r.state;
      if (st !== 'won' && st !== 'lost') continue;
      const i = st === 'won' ? 0 : 1;
      const gid = r.leg.group;
      if (gid && groups[gid]) {
        if (!seenG.has(gid)) {
          seenG.add(gid);
          const members = g.graded.filter((x) => x.leg.group === gid);
          const gs = summarizeParlay(members);
          if (gs.state === 'cashed') types.sgp[0]++;
          else if (gs.state === 'busted') types.sgp[1]++;
          const o = Number(groups[gid].odds);
          if (!isNaN(o) && o !== 0) {
            if (gs.state === 'cashed') (o < 0 ? fav : dog)[0]++;
            else if (gs.state === 'busted') (o < 0 ? fav : dog)[1]++;
          }
        }
      } else {
        const t = r.leg.type;
        if (types[t]) types[t][i]++;
        const o = Number(r.leg.odds);
        if (!isNaN(o) && o !== 0) (o < 0 ? fav : dog)[i]++;
      }
    }
    for (const k of g.summary.killers || []) {
      const who = ident.canonical(k);
      if (who) killers[who] = (killers[who] || 0) + 1;
    }
  }
  const killList = Object.entries(killers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { types, fav, dog, killList };
}
