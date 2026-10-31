'use client';
import { fmtMoney } from '../lib/format.mjs';
import { whoLabel } from '../lib/ident.mjs';
import { paidOn } from '../lib/payments.mjs';

/** One chip per recorded payment: who paid, how much, and the day. The note is the tooltip. */
export default function PaymentChips({ payments }) {
  if (!payments || !payments.length) return null;
  return (
    <span className="paychips">
      {payments.map((p, i) => (
        <span key={p.id || i} className="pill pill--paid" title={p.note || ''}>
          {`${whoLabel(p.who)} · ${fmtMoney(p.amount)} paid${p.at && paidOn(p.at) ? ' · ' + paidOn(p.at) : ''}`}
        </span>
      ))}
    </span>
  );
}
