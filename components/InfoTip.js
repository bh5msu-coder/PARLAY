'use client';
import { useId } from 'react';
import { METRIC_HELP } from '../lib/stats.mjs';

/** A small "?" that shows a plain-language explanation on hover, focus or tap. */
export default function InfoTip({ k, text, label }) {
  const id = useId();
  const body = text || METRIC_HELP[k] || '';
  if (!body) return null;
  return (
    <span className="infotip">
      <button type="button" className="infotip__btn" aria-label={'What is ' + (label || k || 'this') + '?'} aria-describedby={id}>?</button>
      <span role="tooltip" id={id} className="infotip__body">{body}</span>
    </span>
  );
}

/** Flag for metrics built on fewer than 5 decided picks. */
export function SmallSample({ n, threshold = 5 }) {
  if (n >= threshold) return null;
  return <span className="pill pill--sample" title={METRIC_HELP.smallSample}>{n === 0 ? 'no decided picks' : `small sample · ${n}`}</span>;
}
