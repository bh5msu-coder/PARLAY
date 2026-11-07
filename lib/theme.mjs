/** Theme choice: 'dark', 'light' or 'system' (follow the phone). Saved in this browser as hp_theme.
 *  The page's data-theme is always the resolved 'dark' or 'light'; the browser bar color follows it. */

export const THEME_KEY = 'hp_theme';
export const THEME_CHOICES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
// The page background (--surface-0) in each theme, so the phone's browser bar blends in.
export const THEME_COLORS = { dark: '#070d14', light: '#f2f1ef' };

/** A saved value, or 'dark' when nothing valid is saved (the site's long-standing default). */
export function normalizeChoice(v) {
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
}

export function resolveTheme(choice, prefersLight) {
  const c = normalizeChoice(choice);
  if (c === 'system') return prefersLight ? 'light' : 'dark';
  return c;
}

/** Runs before first paint (inlined in app/layout.js) and again whenever the choice or the phone's
 *  setting changes. Kept dependency-free so it can be stringified into the inline script. */
export function applyTheme(doc, win, choice) {
  const c = choice === 'light' || choice === 'dark' || choice === 'system' ? choice : 'dark';
  let light = false;
  try { light = !!(win.matchMedia && win.matchMedia('(prefers-color-scheme: light)').matches); } catch (e) { light = false; }
  const t = c === 'system' ? (light ? 'light' : 'dark') : c;
  doc.documentElement.dataset.theme = t;
  doc.documentElement.dataset.themeChoice = c;
  doc.documentElement.style.colorScheme = t;
  const color = t === 'light' ? '#f2f1ef' : '#070d14';
  const metas = doc.querySelectorAll('meta[name="theme-color"]');
  if (metas.length) { for (const m of metas) { m.setAttribute('content', color); m.removeAttribute('media'); } }
  else if (doc.head) { const m = doc.createElement('meta'); m.setAttribute('name', 'theme-color'); m.setAttribute('content', color); doc.head.appendChild(m); }
  return t;
}

/** The inline pre-paint script: read the saved choice and apply it. */
export const THEME_SCRIPT = `(function(){var applyTheme=${applyTheme.toString()};var c='dark';try{c=localStorage.getItem('${THEME_KEY}')||'dark'}catch(e){}try{applyTheme(document,window,c)}catch(e){document.documentElement.dataset.theme='dark'}})();`;
