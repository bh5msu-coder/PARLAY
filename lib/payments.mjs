/** Recorded payments: money a manager actually put in for a week (holm_payments). Read-only here. */
import { ident } from './ident.mjs';

/** Rows from Supabase to payments with canonical names, in the order they were entered. Bad rows are dropped. A payment whose
 *  source says date_known is false was entered without the day it was paid, so it carries no date. */
export function normalizePayments(rows) {
  return (rows || [])
    .filter((r) => r && Number(r.week) > 0 && Number(r.amount) > 0 && r.who)
    .map((r) => ({ id: r.id, week: Number(r.week), who: ident.canonical(r.who), amount: Number(r.amount), at: r.source && r.source.date_known === false ? '' : (r.recorded_at || ''), note: r.note || '' }))
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}

/** week number -> that week's payments. */
export function paymentsByWeek(payments) {
  const out = {};
  for (const p of payments || []) (out[p.week] || (out[p.week] = [])).push(p);
  return out;
}

export const paymentTotal = (list) => (list || []).reduce((a, p) => a + p.amount, 0);

/** Date a payment was made, for display: "Oct 3". Uses the desk's zone (Eastern) so a noon payment is not shifted. */
export function paidOn(at) {
  const d = new Date(at);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
