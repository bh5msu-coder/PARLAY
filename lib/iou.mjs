/** IOU ledger: each week's stake against the payments recorded for it. Pure — safe on server and client.
 *  A stake with no recorded payment is open, not unpaid: the money may have moved without being entered. */
import { ident } from './ident.mjs';
import { payerShare } from './league-store.mjs';

const cents = (n) => Math.round(Number(n) * 100);
const dollars = (c) => c / 100;

/** "Joseph McKeon + Kyle Heller" or "A and B" -> canonical names. */
export function splitPayers(text) {
  return String(text || '')
    .split(/\s*(?:\+|&|,|\band\b)\s*/i)
    .map((s) => ident.canonical(s.trim()))
    .filter(Boolean);
}

/** One week: the stake split across its payers, then the week's payments applied. A payer's own money goes to their
 *  own share first; anyone else's money (and a payer's extra) covers the open shares in payer order. What is left is
 *  extra. `payments` are { id, who, amount } for this week, oldest first. */
export function settleWeek(week, stake, payers, payments) {
  const names = (payers || []).filter(Boolean);
  const shareC = cents(payerShare(stake, names.length));
  const shares = names.map((who) => ({ who, share: shareC, paid: 0, covered: [] }));
  const pool = [];
  for (const p of payments || []) {
    let left = cents(p.amount);
    const own = shares.find((s) => s.who === p.who);
    if (own) {
      const take = Math.min(left, own.share - own.paid);
      own.paid += take;
      left -= take;
    }
    if (left > 0) pool.push({ who: p.who, left });
  }
  for (const s of shares) {
    for (const p of pool) {
      const open = s.share - s.paid - s.covered.reduce((a, c) => a + c.amount, 0);
      if (open <= 0) break;
      if (p.left <= 0 || p.who === s.who) continue;
      const take = Math.min(open, p.left);
      const prior = s.covered.find((c) => c.who === p.who);
      if (prior) prior.amount += take; else s.covered.push({ who: p.who, amount: take });
      p.left -= take;
    }
  }
  const extra = pool.filter((p) => p.left > 0).map((p) => ({ who: p.who, amount: dollars(p.left) }));
  return {
    week,
    stake: Number(stake) || 0,
    shares: shares.map((s) => {
      const coveredC = s.covered.reduce((a, c) => a + c.amount, 0);
      return { who: s.who, share: dollars(s.share), paid: dollars(s.paid), covered: s.covered.map((c) => ({ who: c.who, amount: dollars(c.amount) })), open: dollars(s.share - s.paid - coveredC) };
    }),
    extra,
  };
}

/** tickets: [{ week, stake, payers: [names] }]; payments: normalized payments (lib/payments.mjs).
 *  Returns { weeks, people, totals }. people: owed (their shares), paid (toward their own), coveredByOthers,
 *  coveredForOthers, open; sorted most open first. */
export function iouLedger(tickets, payments) {
  const byWeek = {};
  for (const p of payments || []) (byWeek[p.week] || (byWeek[p.week] = [])).push(p);
  const weeks = (tickets || [])
    .filter((t) => t && Number(t.week) > 0 && Number(t.stake) > 0 && t.payers && t.payers.length)
    .sort((a, b) => a.week - b.week)
    .map((t) => settleWeek(t.week, t.stake, t.payers, byWeek[t.week] || []));
  const ppl = {};
  const row = (who) => ppl[who] || (ppl[who] = { who, owed: 0, paid: 0, coveredByOthers: 0, coveredForOthers: 0, open: 0 });
  for (const w of weeks) {
    for (const s of w.shares) {
      const r = row(s.who);
      r.owed += cents(s.share);
      r.paid += cents(s.paid);
      r.open += cents(s.open);
      for (const c of s.covered) { r.coveredByOthers += cents(c.amount); row(c.who).coveredForOthers += cents(c.amount); }
    }
  }
  const people = Object.values(ppl)
    .map((r) => ({ who: r.who, owed: dollars(r.owed), paid: dollars(r.paid), coveredByOthers: dollars(r.coveredByOthers), coveredForOthers: dollars(r.coveredForOthers), open: dollars(r.open) }))
    .sort((a, b) => b.open - a.open || b.owed - a.owed || a.who.localeCompare(b.who));
  const sum = (k) => dollars(people.reduce((a, r) => a + cents(r[k]), 0));
  const recorded = dollars((payments || []).filter((p) => weeks.some((w) => w.week === p.week)).reduce((a, p) => a + cents(p.amount), 0));
  return { weeks, people, totals: { owed: sum('owed'), recorded, open: sum('open') } };
}
