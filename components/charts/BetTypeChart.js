'use client';
/** Hit rate by bet type, decided picks only. Small samples are drawn hollow and labeled. */
export default function BetTypeChart({ rows, title = 'Hit rate by bet type' }) {
  const W = 640, rowH = 34, L = 140, R = 150, T = 8;
  const H = T + rows.length * rowH + 8;
  const pw = W - L - R;
  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title + '. ' + rows.map((r) => `${r.name}: ${r.n ? Math.round(r.rate * 100) + '% of ' + r.n : 'no decided picks'}`).join('; ')}>
        {[0, 0.5, 1].map((t) => <line key={t} className="chart__grid" x1={L + t * pw} x2={L + t * pw} y1={T} y2={H - 8} />)}
        {rows.map((r, i) => {
          const yy = T + i * rowH;
          return (
            <g key={r.type}>
              <text className="chart__label" x={L - 8} y={yy + rowH / 2 + 4} textAnchor="end">{r.name}</text>
              <rect className="chart__track" x={L} y={yy + 8} width={pw} height={rowH - 16} />
              {r.n ? <rect className={'chart__bar' + (r.smallSample ? ' chart__bar--hollow' : '')} x={L} y={yy + 8} width={Math.max(2, r.rate * pw)} height={rowH - 16} /> : null}
              <text className="chart__value" x={L + pw + 8} y={yy + rowH / 2 + 4}>{r.n ? `${Math.round(r.rate * 100)}% · ${r.won}–${r.lost}${r.smallSample ? ' (n<5)' : ''}` : 'no decided'}</text>
            </g>);
        })}
      </svg>
    </figure>
  );
}
