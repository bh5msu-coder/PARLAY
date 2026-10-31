'use client';
import { useId } from 'react';

/** Stake vs return per ticket on a log scale. Solid bars are recorded money (stake listed,
 *  contributions recorded, payouts recorded). The hatched bar is the hypothetical payout — what the
 *  slip would have paid — and is labeled as such. Money that was never recorded is listed as text,
 *  not drawn as a zero bar. */
const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

const SERIES = [
  { key: 'stake', label: 'stake listed', cls: 'chart__bar--stake', get: (t) => t.stake },
  { key: 'contrib', label: 'paid in', cls: 'chart__bar--contrib', get: (t) => t.contributions },
  { key: 'payout', label: 'payout', cls: 'chart__bar--payout', get: (t) => t.payoutRecorded },
  { key: 'hypo', label: 'hypothetical', cls: '', get: (t) => t.hypotheticalToPay },
];

export default function StakeReturnChart({ tickets, title = 'Stake vs return' }) {
  const hatchId = 'hatch' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const max = Math.max(10, ...tickets.flatMap((t) => SERIES.map((s) => Number(s.get(t)) || 0)));
  let top = 10;
  while (top < max) top *= 10;
  const decades = [];
  for (let d = 1; d <= top; d *= 10) decades.push(d);
  const W = 640, L = 56, R = 150, barH = 12, gap = 4, T = 8, noteH = 16, groupGap = 14;
  const pw = W - L - R;
  const x = (v) => L + (Math.log10(Math.max(1, v)) / Math.log10(top)) * pw;
  let y = T;
  const groups = tickets.map((t) => {
    const bars = SERIES.filter((s) => Number(s.get(t)) > 0);
    const missing = SERIES.filter((s) => !(Number(s.get(t)) > 0) && s.key !== 'hypo')
      .map((s) => `${s.label}: ${s.get(t) == null && s.key === 'contrib' ? 'not tracked' : 'none recorded'}`);
    const g = { t, bars, missing, y };
    y += bars.length * (barH + gap) + (missing.length ? noteH : 0) + groupGap;
    return g;
  });
  const H = y + 22;
  return (
    <figure className="chart chart--wide">
      <figcaption className="chart__title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title + '. ' + tickets.map((t) => `${t.label}: stake ${fmt(t.stake)}, paid in ${t.contributions == null ? 'not tracked' : fmt(t.contributions || 0)}, payout ${t.payoutRecorded == null ? 'none recorded' : fmt(t.payoutRecorded)}, hypothetical ${t.hypotheticalToPay == null ? 'none' : fmt(t.hypotheticalToPay)}`).join('; ')}>
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="chart__hatch" />
          </pattern>
        </defs>
        {decades.map((d) => (
          <g key={d}>
            <line className="chart__grid" x1={x(d)} x2={x(d)} y1={T} y2={H - 22} />
            <text className="chart__tick" x={x(d)} y={H - 6} textAnchor="middle">{fmt(d)}</text>
          </g>))}
        {groups.map(({ t, bars, missing, y: gy }) => (
          <g key={t.week}>
            <text className="chart__label" x={L - 8} y={gy + barH} textAnchor="end">{'Wk ' + t.week}</text>
            {bars.map((s, j) => {
              const v = Number(s.get(t));
              const yy = gy + j * (barH + gap);
              const hypo = s.key === 'hypo';
              return (
                <g key={s.key}>
                  <rect className={hypo ? 'chart__hypo' : 'chart__bar ' + s.cls} x={L} y={yy} width={Math.max(2, x(v) - L)} height={barH} style={hypo ? { fill: `url(#${hatchId})` } : undefined} />
                  <text className={'chart__value' + (hypo ? ' chart__value--hypo' : '')} x={x(v) + 6} y={yy + barH - 2}>{(hypo ? 'hypothetical ' : s.label + ' ') + fmt(v)}</text>
                </g>);
            })}
            {missing.length ? <text className="chart__note" x={L} y={gy + bars.length * (barH + gap) + 11}>{missing.join(' · ')}</text> : null}
          </g>))}
      </svg>
      <p className="chart__legend">
        <span className="key key--stake" /> stake listed <span className="key key--contrib" /> paid in (recorded) <span className="key key--payout" /> payout (recorded) <span className="key key--hypo" /> hypothetical payout — no book paid it · log scale
      </p>
    </figure>
  );
}
