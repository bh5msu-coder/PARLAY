/** Dashboard statistics at two levels. Pure; works on either source, but callers keep the sources
 *  separate (weekly = data/bets.json + live grades, history = parlay-history.json).
 *
 *  Selection level (one manager's pick): hit rate, streaks, bet type, primetime, bust attribution.
 *  Ticket level (the week's parlay): result, stake, contributions recorded, cashed vs busted.
 *
 *  Every rate counts decided legs only — wins / (wins + losses). Open and unknown legs are counted
 *  separately and never enter a rate. Each metric carries `n` and `smallSample` (n < SMALL_N). */
import { hitRate, statusFromGrade, legStatus, deriveTicket, weekMoney } from './model.mjs';
import { isPrime, SMALL_N } from './history-stats.mjs';
import { canonicalWho } from './ticket.mjs';

export { SMALL_N };

export const METRIC_HELP = {
  hitRate: 'Share of decided picks that won: wins ÷ (wins + losses). Open and unknown picks are left out.',
  record: 'Wins–losses on decided picks. The number in brackets is picks still open or with no known result.',
  streak: 'Current run of wins (W) or losses (L) on decided picks, in week order. Best = longest winning run.',
  byType: 'Hit rate split by market: moneyline, spread, game total, player prop.',
  primetime: 'Hit rate on night kickoffs (7 PM ET or later: Thursday, Sunday and Monday night) vs. day games.',
  busts: 'Losing picks on tickets that lost. One losing pick is enough to bust a parlay, so every loser counts.',
  smallSample: 'Fewer than 5 decided picks. Treat this number as noise, not skill.',
  ticketResult: 'Busted = at least one pick lost. Cashed = every pick won. Open = games left. Unknown = results not recorded.',
  stake: 'The stake listed for the week. Listing a stake is not proof anyone paid it.',
  contributions: 'Money someone actually recorded as paid in for that week.',
  hypothetical: 'What the slip says it would pay if every pick won. Hypothetical: no book paid this.',
  payout: 'Money a sportsbook actually paid out, as recorded. Nothing has been recorded yet.',
  ticketState: 'Proposed = picks only. Placed = a book took the bet (with evidence). Settled = placed and every pick decided.',
};

/** Weekly legs (data/bets.json) with the best status we have: the live/locked grade if present. */
export function weeklyLegs(weeks, graded) {
  const out = [];
  for (const w of weeks || []) {
    const g = graded && graded[w.week];
    const summary = g && g.summary;
    const ticketResult = summary ? (summary.state === 'busted' ? 'busted' : summary.state === 'cashed' ? 'cashed' : (w.results === 'unknown' || w.results === 'pending') ? 'unknown' : 'open') : 'unknown';
    (w.legs || []).forEach((leg, i) => {
      const gr = g && g.graded && (g.graded.find((x) => x.leg === leg) || g.graded[i]);
      out.push({
        week: w.week, who: leg.who, type: leg.group && w.groups && w.groups[leg.group] ? 'sgp' : leg.type, label: leg.label,
        kickoff: (gr && gr.gameDate) || leg.gameDate || null,
        status: gr ? statusFromGrade(gr.state) : legStatus(leg, w),
        confidence: leg.confidence || null,
        ticketResult,
      });
    });
  }
  return out;
}

export function metric(statuses) {
  const r = hitRate(statuses);
  return Object.assign(r, { smallSample: r.n < SMALL_N });
}

function streaks(statuses) {
  const seq = statuses.filter((s) => s === 'won' || s === 'lost');
  let best = 0, cold = 0, cur = 0, curL = 0;
  for (const s of seq) {
    if (s === 'won') { cur++; curL = 0; } else { curL++; cur = 0; }
    best = Math.max(best, cur); cold = Math.max(cold, curL);
  }
  if (!seq.length) return { current: '–', best: 0, cold: 0 };
  const last = seq[seq.length - 1];
  let k = 0; for (let i = seq.length - 1; i >= 0 && seq[i] === last; i--) k++;
  return { current: (last === 'won' ? 'W' : 'L') + k, best, cold };
}

/** One row per manager. */
export function selectionStats(legs) {
  const byWho = new Map();
  const sorted = (legs || []).slice().sort((a, b) => a.week - b.week || String(a.kickoff || '').localeCompare(String(b.kickoff || '')));
  for (const l of sorted) {
    const who = canonicalWho(l.who) || l.who;
    if (!who) continue;
    if (!byWho.has(who)) byWho.set(who, []);
    byWho.get(who).push(l);
  }
  const rows = [];
  for (const [who, list] of byWho) {
    const st = list.map((l) => l.status);
    const byType = {};
    for (const l of list) (byType[l.type] = byType[l.type] || []).push(l.status);
    const prime = list.filter((l) => l.kickoff && isPrime(l.kickoff)).map((l) => l.status);
    const day = list.filter((l) => l.kickoff && !isPrime(l.kickoff)).map((l) => l.status);
    rows.push({
      who,
      picks: list.length,
      hit: metric(st),
      streak: streaks(st),
      byType: Object.fromEntries(Object.entries(byType).map(([t, s]) => [t, metric(s)])),
      primetime: { prime: metric(prime), day: metric(day), noKickoff: list.filter((l) => !l.kickoff).length },
      busts: list.filter((l) => l.status === 'lost' && l.ticketResult === 'busted').length,
    });
  }
  rows.sort((a, b) => (b.hit.rate == null ? -1 : b.hit.rate) - (a.hit.rate == null ? -1 : a.hit.rate) || b.hit.n - a.hit.n || a.who.localeCompare(b.who));
  return rows;
}

/** League hit rate per week, plus the running (cumulative) rate. */
export function hitRateOverTime(legs) {
  const weeks = Array.from(new Set((legs || []).map((l) => l.week))).sort((a, b) => a - b);
  const all = [];
  return weeks.map((w) => {
    const st = legs.filter((l) => l.week === w).map((l) => l.status);
    all.push(...st);
    return { week: w, week_: metric(st), running: metric(all) };
  });
}

export const TYPE_NAMES = { ml: 'Moneyline', spread: 'Spread', total: 'Game total', player: 'Player prop', sgp: 'Same-game parlay', tbd: 'Not posted' };

export function typePerformance(legs) {
  const by = {};
  for (const l of legs || []) (by[l.type] = by[l.type] || []).push(l.status);
  return Object.entries(by).map(([type, st]) => ({ type, name: TYPE_NAMES[type] || type, ...metric(st) }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** Ticket rows for the weekly source. Money is split into recorded vs hypothetical. */
export function weeklyTickets(weeks, graded) {
  return (weeks || []).map((w) => {
    const g = graded && graded[w.week];
    const s = g && g.summary;
    const ticket = deriveTicket(w);
    const money = weekMoney(w);
    const result = s ? (s.state === 'busted' ? 'busted' : s.state === 'cashed' ? 'cashed' : (w.results === 'unknown' || w.results === 'pending') ? 'unknown' : 'open') : 'unknown';
    return {
      week: w.week,
      label: 'Week ' + w.week,
      result,
      stake: money.stake,
      contributions: money.recorded.contributions,
      payer: w.payer || '',
      ticketState: ticket.state,
      evidence: ticket.evidence,
      hypotheticalToPay: money.hypothetical.toPay,
      payoutRecorded: (w.payouts || []).length ? money.recorded.payouts : null,
      record: s ? { win: s.won, loss: s.lost, open: s.pending + s.live } : null,
    };
  });
}

export function ticketTotals(tickets) {
  const t = { tickets: tickets.length, cashed: 0, busted: 0, open: 0, unknown: 0, stakeListed: 0, contributions: 0, payouts: 0, hypothetical: 0 };
  for (const x of tickets) {
    t[x.result] = (t[x.result] || 0) + 1;
    t.stakeListed += x.stake || 0;
    t.contributions += x.contributions || 0;
    t.payouts += x.payoutRecorded || 0;
    t.hypothetical += x.hypotheticalToPay || 0;
  }
  return t;
}
