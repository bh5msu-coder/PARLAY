'use client';
import { STATUS_LABEL } from '../lib/format.mjs';

export function StatusBadge({ state }) {
  return <span className={'status status--' + (state === 'unknown' ? 'unknown' : state)}>{STATUS_LABEL[state] || state}</span>;
}

export function KpiCard({ label, value, note }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className="stat__value stat__value--name">{value}</span>
      <span className="stat__delta">{note || ''}</span>
    </div>
  );
}

export function Stat({ label, value, delta, valueClass, valueStyle }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className={'stat__value' + (valueClass ? ' ' + valueClass : '')} style={valueStyle}>{value}</span>
      <span className="stat__delta">{delta || ''}</span>
    </div>
  );
}

export function CardHead({ title, sub, h = 'h2', children }) {
  const H = h;
  return (
    <div className="card__head">
      <H className={h === 'h3' ? 'h3' : undefined}>{title}</H>
      {sub ? <span className="sub">{sub}</span> : null}
      {children}
    </div>
  );
}
