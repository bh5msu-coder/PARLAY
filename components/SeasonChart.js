'use client';
import { useEffect, useRef, useState } from 'react';
import { ident } from '../lib/ident.mjs';
import { fmtElo } from '../lib/format.mjs';
import { finishLabel, seasonTableRows } from '../lib/season-table.mjs';

/** Season chart as SVG, so it renders on the server and stays sharp at any width.
 *  Two views: finishing place by season (1 at the top) and season Elo on an auto-fit scale.
 *  One manager is in focus; pick another from the Manager menu or tap a faint line. "View data" shows the
 *  focused manager's numbers as a table, which reads better than the lines on a phone. */
export default function SeasonChart({ elo, selected, onSelect }) {
  const [mode, setMode] = useState('finish');
  const [showData, setShowData] = useState(false);
  const [w, setW] = useState(720);
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { const cw = Math.round(e.contentRect.width); if (cw > 0) setW(cw); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const years = elo.years;
  const people = elo.now.map((r) => {
    const p = ident.person(r.name) || ident.people.find((x) => x.name === r.name) || {};
    const hist = (p.career && p.career.history) || [];
    const byYear = Object.fromEntries(hist.map((s) => [s.season, s]));
    return {
      id: r.id, name: r.name, nick: r.nick,
      finish: years.map((y) => (byYear[y] ? byYear[y].rank : null)),
      champ: years.map((y) => !!(byYear[y] && byYear[y].champion)),
      elo: elo.series[r.id],
    };
  });
  const values = (p) => (mode === 'finish' ? p.finish : p.elo);
  const all = people.flatMap((p) => values(p).filter((v) => v != null));
  if (!all.length) return null;

  const narrow = w < 560;
  const H = narrow ? 260 : 340;
  const pad = { l: narrow ? 30 : 44, r: narrow ? 44 : 64, t: 14, b: 26 };
  let lo, hi, ticks;
  if (mode === 'finish') {
    lo = 1; hi = Math.max(...all); ticks = [1, 4, 8, hi].filter((v, i, a) => v <= hi && a.indexOf(v) === i);
  } else {
    const step = 10;
    lo = Math.floor((Math.min(...all) - 4) / step) * step;
    hi = Math.ceil((Math.max(...all) + 4) / step) * step;
    ticks = []; for (let t = lo; t <= hi; t += step) ticks.push(t);
  }
  const iw = w - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (years.length === 1 ? iw / 2 : (i / (years.length - 1)) * iw);
  // Finish: 1 at the top. Elo: higher at the top.
  const y = (v) => (mode === 'finish' ? pad.t + ((v - lo) / Math.max(1, hi - lo)) * ih : pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * ih);
  const path = (vals) => {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
      pen = true;
    });
    return d.trim();
  };
  const focus = people.find((p) => p.name === selected) || people[0];
  const others = people.filter((p) => p !== focus);
  const fv = values(focus);
  const lastIdx = fv.reduce((a, v, i) => (v != null ? i : a), -1);
  const yearStep = narrow ? 3 : 1;
  const fmt = (v) => (mode === 'finish' ? String(v) : fmtElo(v));
  const best = fv.filter((v) => v != null);
  const summary = mode === 'finish'
    ? `${focus.nick}: best finish ${Math.min(...best)}, worst ${Math.max(...best)}, over ${best.length} seasons.`
    : `${focus.nick}: Elo ${fmtElo(best[best.length - 1])} now, peak ${fmtElo(Math.max(...best))}.`;

  return (
    <div className="schart" ref={box}>
      <div className="schart__bar">
        <div className="seg" role="group" aria-label="Chart view">
          <button type="button" className="seg__btn" aria-pressed={mode === 'finish'} onClick={() => setMode('finish')}>Finish</button>
          <button type="button" className="seg__btn" aria-pressed={mode === 'elo'} onClick={() => setMode('elo')}>Elo</button>
        </div>
        <label className="schart__pick">
          <span className="schart__picklab">Manager</span>
          <select value={focus.name} onChange={(e) => onSelect(e.target.value)} aria-label="Manager shown on the chart">
            {people.map((p) => <option key={p.id} value={p.name}>{p.nick}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn--secondary btn--sm schart__databtn" aria-expanded={showData} aria-controls="schart-data" onClick={() => setShowData((v) => !v)}>
          {showData ? 'Hide data' : 'View data'}
        </button>
        <span className="muted schart__sum">{summary}</span>
      </div>
      <svg className="schart__svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img"
        aria-label={(mode === 'finish' ? 'Finishing place by season, 2010 to 2025. ' : 'Season Elo by year, 2010 to 2025. ') + summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="schart__grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
            <text className="schart__tick" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{mode === 'finish' ? (t === 1 ? '1st' : String(t)) : String(t)}</text>
          </g>))}
        {years.map((yr, i) => (i % yearStep === 0 || i === years.length - 1 ? (
          <text key={yr} className="schart__tick" x={x(i)} y={H - 6} textAnchor="middle">{narrow ? "'" + String(yr).slice(2) : String(yr)}</text>) : null))}
        {others.map((p) => (
          <g key={p.id} className="schart__other" onClick={() => onSelect(p.name)}>
            <path d={path(values(p))} className="schart__line" />
            <path d={path(values(p))} className="schart__hit"><title>{p.nick}</title></path>
          </g>))}
        <path d={path(fv)} className="schart__line schart__line--on" />
        {fv.map((v, i) => (v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r={mode === 'finish' && focus.champ[i] ? 6 : 3.5}
            className={'schart__dot' + (mode === 'finish' && focus.champ[i] ? ' schart__dot--champ' : '')}>
            <title>{`${years[i]}: ${mode === 'finish' ? (focus.champ[i] ? 'Champion' : 'Finished ' + v) : 'Elo ' + fmtElo(v)}`}</title>
          </circle>)))}
        {lastIdx >= 0 ? (
          <text className="schart__end" x={x(lastIdx) + 10} y={y(fv[lastIdx]) + 5}>{(narrow ? '' : focus.nick + ' ') + fmt(fv[lastIdx])}</text>) : null}
      </svg>
      {showData ? (
        <div className="tablewrap schart__data" id="schart-data">
          <table>
            <caption className="sr-only">{`${focus.nick}, season by season`}</caption>
            <thead><tr><th>Season</th><th className="r">Finish</th><th className="r">Elo</th></tr></thead>
            <tbody>{seasonTableRows(years, focus).map((r) => (
              <tr key={r.year} className={r.champ ? 'me' : ''}><td className="num">{String(r.year)}</td><td className="r">{finishLabel(r)}</td><td className="r num">{r.elo == null ? '–' : fmtElo(r.elo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
      {mode === 'finish' ? <p className="muted schart__key"><span className="schart__swatch" /> Gold dot = title season. Pick a manager above or tap any faint line to switch.</p> : <p className="muted schart__key">Scale fits the data: the whole league sits within about 40 points of 1500.</p>}
    </div>
  );
}
