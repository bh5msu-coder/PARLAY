'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export const LEAGUE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'managers', label: 'Managers' },
  { id: 'history', label: 'History' },
  { id: 'parlay', label: 'Parlay' },
];

/** Active tab, kept in the URL hash (#history) so a tab can be linked and survives refresh.
 *  The server always renders Overview; the hash is read after mount. */
export function useTab() {
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    const read = () => {
      const h = (window.location.hash || '').slice(1);
      if (LEAGUE_TABS.some((t) => t.id === h)) setTab(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = useCallback((id) => {
    setTab(id);
    try { window.history.replaceState(null, '', id === 'overview' ? window.location.pathname : '#' + id); } catch (e) { /* ignore */ }
  }, []);
  return [tab, go];
}

/** WAI-ARIA tablist: arrow keys move between tabs, Home/End jump to the ends. */
export default function LeagueTabs({ tab, onChange }) {
  const refs = useRef({});
  const onKey = (e) => {
    const i = LEAGUE_TABS.findIndex((t) => t.id === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % LEAGUE_TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + LEAGUE_TABS.length) % LEAGUE_TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = LEAGUE_TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    const id = LEAGUE_TABS[n].id;
    onChange(id);
    if (refs.current[id]) refs.current[id].focus();
  };
  return (
    <div className="ltabs">
      <div className="tabs ltabs__list" role="tablist" aria-label="League sections" onKeyDown={onKey}>
        {LEAGUE_TABS.map((t) => (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" className="tab"
            id={'ltab-' + t.id} aria-controls={'lpanel-' + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => {
              onChange(t.id);
              const top = document.querySelector('.ltabs');
              if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
            }}>{t.label}</button>))}
      </div>
    </div>
  );
}
