'use client';
/** Hit rate over time: bars = that week's hit rate, line = running hit rate. Decided picks only.
 *  Weeks with fewer than 5 decided picks are drawn hollow; weeks with none are marked "no decided". */
export default function HitRateChart({ points, title = 'Hit rate over time' }) {
  const W = 640, H = 260, L = 48, R = 12, T = 16, B = 46;
  const pw = W - L - R, ph = H - T - B;
  const n = points.length || 1;
  const slot = pw / n;
  const y = (rate) => T + ph - rate * ph;
  const line = points.map((p, i) => (p.running.rate == null ? null : [L + slot * i + slot / 2, y(p.running.rate)])).filter(Boolean);
  const desc = points.map((p) => `Week ${p.week}: ${p.week_.n ? Math.round(p.week_.rate * 100) + '% of ' + p.week_.n : 'no decided picks'}`).join('; ');
  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${desc}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text className="chart__tick" x={L - 6} y={y(t) + 4} textAnchor="end">{Math.round(t * 100) + '%'}</text>
          </g>))}
        {points.map((p, i) => {
          const x = L + slot * i + slot * 0.2, w = slot * 0.6;
          const m = p.week_;
          return (
            <g key={p.week}>
              {m.n ? <rect className={'chart__bar' + (m.smallSample ? ' chart__bar--hollow' : '')} x={x} width={w} y={y(m.rate)} height={Math.max(1, T + ph - y(m.rate))} /> : null}
              <text className="chart__tick" x={x + w / 2} y={H - B + 16} textAnchor="middle">{'Wk ' + p.week}</text>
              <text className="chart__note" x={x + w / 2} y={H - B + 34} textAnchor="middle">{m.n ? `${m.won}–${m.lost}` : 'no decided'}</text>
            </g>);
        })}
        {line.length > 1 ? <polyline className="chart__line" points={line.map((pt) => pt.join(',')).join(' ')} /> : null}
        {line.map((pt, i) => <circle key={i} className="chart__dot" cx={pt[0]} cy={pt[1]} r="3.5" />)}
      </svg>
      <p className="chart__legend"><span className="key key--bar" /> week’s hit rate <span className="key key--hollow" /> under 5 decided picks <span className="key key--line" /> running hit rate</p>
    </figure>
  );
}
