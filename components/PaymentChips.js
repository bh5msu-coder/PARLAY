'use client';
import { fmtMoney } from '../lib/format.mjs';
import { whoLabel } from '../lib/ident.mjs';

/** One chip per recorded payment: who paid and how much. No day and no note: the records keep those
 *  (the Week 4 note carries a date the league asked to keep off the site). */
export default function PaymentChips({ payments }) {
  if (!payments || !payments.length) return null;
  return (
    <span className="paychips">
      {payments.map((p, i) => (
        <span key={p.id || i} className="pill pill--paid">
          {`${whoLabel(p.who)} · ${fmtMoney(p.amount)} paid`}
        </span>
      ))}
    </span>
  );
}
