import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEME_CHOICES, THEME_COLORS, THEME_SCRIPT, applyTheme, normalizeChoice, resolveTheme } from '../lib/theme.mjs';
import { scoreNotice, scoreProblem } from '../lib/load-status.mjs';

function fakeDoc({ metas = 1 } = {}) {
  const els = Array.from({ length: metas }, () => {
    const a = { content: '#000000', media: '(prefers-color-scheme: dark)' };
    return { attrs: a, setAttribute: (k, v) => { a[k] = v; }, removeAttribute: (k) => { delete a[k]; } };
  });
  const head = { children: [], appendChild(m) { this.children.push(m); } };
  const doc = {
    documentElement: { dataset: {}, style: {} },
    head,
    querySelectorAll: () => els,
    createElement: () => { const a = {}; return { attrs: a, setAttribute: (k, v) => { a[k] = v; } }; },
  };
  return { doc, els, head };
}
const win = (light) => ({ matchMedia: () => ({ matches: light }) });

test('theme: System, Light and Dark are offered, System first', () => {
  assert.deepEqual(THEME_CHOICES.map((t) => t.value), ['system', 'light', 'dark']);
});

test('theme: nothing saved stays dark, as before; junk is treated as dark', () => {
  assert.equal(normalizeChoice(null), 'dark');
  assert.equal(normalizeChoice('purple'), 'dark');
  assert.equal(resolveTheme(undefined, true), 'dark');
});

test('theme: System follows the phone', () => {
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
  assert.equal(resolveTheme('light', false), 'light');
});

test('theme: the browser bar matches the page in light mode, not always dark', () => {
  const { doc, els } = fakeDoc({ metas: 2 });
  assert.equal(applyTheme(doc, win(false), 'light'), 'light');
  assert.equal(doc.documentElement.dataset.theme, 'light');
  assert.equal(doc.documentElement.dataset.themeChoice, 'light');
  for (const m of els) { assert.equal(m.attrs.content, THEME_COLORS.light); assert.equal(m.attrs.media, undefined); }
  applyTheme(doc, win(true), 'dark');
  for (const m of els) assert.equal(m.attrs.content, THEME_COLORS.dark);
  applyTheme(doc, win(true), 'system');
  assert.equal(doc.documentElement.dataset.theme, 'light');
  assert.equal(els[0].attrs.content, THEME_COLORS.light);
});

test('theme: adds a browser-bar color when the page has none yet', () => {
  const { doc, head } = fakeDoc({ metas: 0 });
  applyTheme(doc, win(false), 'light');
  assert.equal(head.children.length, 1);
  assert.equal(head.children[0].attrs.content, THEME_COLORS.light);
});

test('theme: the bar colors are the page backgrounds in globals.css', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, new RegExp(':root\\{\\s*--surface-0:' + THEME_COLORS.dark));
  assert.match(css, new RegExp(':root\\[data-theme="light"\\]\\{\\s*--surface-0:' + THEME_COLORS.light));
});

test('theme: the pre-paint script is self-contained and runs', () => {
  const store = { hp_theme: 'system' };
  const { doc, els } = fakeDoc();
  const run = new Function('document', 'window', 'localStorage', THEME_SCRIPT);
  run(doc, win(true), { getItem: (k) => store[k] || null });
  assert.equal(doc.documentElement.dataset.theme, 'light');
  assert.equal(els[0].attrs.content, THEME_COLORS.light);
  run(doc, win(true), { getItem: () => { throw new Error('blocked'); } });
  assert.equal(doc.documentElement.dataset.theme, 'dark');
});

test('loading: a scoreboard failure on this week gets a plain banner; a locked week never does', () => {
  const graded = { 8: { error: new Error('502'), fromLock: false }, 7: { fromLock: true, error: new Error('x') }, 9: {} };
  assert.deepEqual(scoreProblem(graded), [8]);
  const n = scoreNotice(graded, { week: 8, scope: 'week' });
  assert.equal(n.title, 'Live scores didn\u2019t load');
  assert.match(n.body, /Week 8/);
  assert.match(n.body, /Picks are not affected/);
  assert.equal(scoreNotice(graded, { week: 9, scope: 'week' }), null);
  assert.equal(scoreNotice(graded, { week: 7, scope: 'week' }), null);
});

test('loading: the season banner names each week whose scores failed', () => {
  const graded = { 4: { error: true }, 6: { error: true }, 5: {} };
  assert.match(scoreNotice(graded, { weeks: [4, 5, 6] }).body, /Weeks 4, 6/);
  assert.match(scoreNotice({ 4: { error: true } }, { weeks: [4] }).body, /Week 4,|Week 4 /);
  assert.equal(scoreNotice({ 5: {} }, { weeks: [5] }), null);
});

test('loading: every parlay page shows its title and a placeholder layout before data loads', () => {
  const src = (f) => readFileSync(new URL('../components/' + f, import.meta.url), 'utf8');
  assert.match(src('WeekView.js'), /<Page title="This week’s parlay" skeleton="week" \/>/);
  assert.match(src('PickView.js'), /<Page title="This week’s picks" skeleton="pick" \/>/);
  for (const f of ['WeekView.js', 'PickView.js', 'StandingsView.js', 'ChatView.js', 'BetsView.js']) {
    // JSX attribute strings do not decode \u escapes, so they would show on screen literally.
    assert.doesNotMatch(src(f), /="[^"]*\\u[0-9a-fA-F]{4}/, f);
  }
  assert.match(src('PickView.js'), /skeleton="pick"/);
  assert.match(src('StandingsView.js'), /skeleton="standings"/);
  assert.match(src('ChatView.js'), /skeleton="chat"/);
  assert.match(src('BetsView.js'), /PageSkeleton kind="bets"/);
  const top = src('Topbar.js');
  assert.match(top, /\{title \|\| 'Our Holm League'\}<\/h1>/, 'the title shows before the store is ready');
  assert.match(top, /<PageSkeleton kind=\{skeleton\}/);
  assert.doesNotMatch(top, /: 'Loading…'\)/);
});
