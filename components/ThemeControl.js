'use client';
import { useEffect, useState } from 'react';
import { THEME_CHOICES, THEME_KEY, applyTheme, normalizeChoice } from '../lib/theme.mjs';

/** The saved theme, kept in step across the header menu and the More page. */
export function useThemeChoice() {
  const [choice, setChoice] = useState('dark');
  useEffect(() => {
    const c = normalizeChoice(document.documentElement.dataset.themeChoice);
    setChoice(c);
    applyTheme(document, window, c);
    const on = () => setChoice(normalizeChoice(document.documentElement.dataset.themeChoice));
    window.addEventListener('hp-theme', on);
    return () => window.removeEventListener('hp-theme', on);
  }, []);
  useEffect(() => {
    if (choice !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme(document, window, 'system');
    if (mq.addEventListener) mq.addEventListener('change', on);
    else if (mq.addListener) mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else if (mq.removeListener) mq.removeListener(on);
    };
  }, [choice]);
  const pick = (c) => {
    try { localStorage.setItem(THEME_KEY, c); } catch (e) { /* private mode */ }
    applyTheme(document, window, c);
    setChoice(c);
    try { window.dispatchEvent(new Event('hp-theme')); } catch (e) { /* ignore */ }
  };
  return [choice, pick];
}

export function ThemeButtons() {
  const [choice, pick] = useThemeChoice();
  return (
    <div className="tabs" role="group" aria-label="Theme">
      {THEME_CHOICES.map((t) => (
        <button key={t.value} type="button" className="tab" aria-pressed={choice === t.value} onClick={() => pick(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}
