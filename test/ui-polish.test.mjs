import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('wrap: no names, picks, lines or leg details are cut off with an ellipsis', () => {
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);
  const rule = css.match(/([^{}]+)\{[^}]*-webkit-line-clamp:2[^}]*\}/);
  assert.ok(rule, 'a two-line wrap rule exists');
  for (const sel of ['.track__who', '.track__pick', '.track__detail', '.sweatchip b', '.sweatchip span', '.pickbar__text strong', '.line__odds', '.glance__name', '.stat__value--name']) {
    assert.ok(rule[1].includes(sel), sel + ' wraps to two lines');
  }
  assert.match(rule[0], /white-space:normal/);
});

import { finishLabel, seasonTableRows } from '../lib/season-table.mjs';

test('chart: View data lists each season played with finish and Elo, skipping seasons not played', () => {
  const years = [2021, 2022, 2023, 2024];
  const focus = { finish: [3, null, 1, 12], champ: [false, false, true, false], elo: [1510.2, null, 1522.4, 1499.9] };
  const rows = seasonTableRows(years, focus);
  assert.deepEqual(rows.map((r) => r.year), [2021, 2023, 2024]);
  assert.deepEqual(rows.map(finishLabel), ['3rd', 'Champion', '12th']);
  assert.equal(rows[1].elo, 1522.4);
  assert.deepEqual(seasonTableRows(years, null), []);
  assert.deepEqual([1, 2, 11, 12, 13, 21, 22].map((finish) => finishLabel({ finish })), ['1st', '2nd', '11th', '12th', '13th', '21st', '22nd']);
});

test('chart: a Manager menu and a View data toggle sit on the season chart', () => {
  const src = readFileSync(new URL('../components/SeasonChart.js', import.meta.url), 'utf8');
  assert.match(src, /<select value=\{focus\.name\} onChange=\{\(e\) => onSelect\(e\.target\.value\)\}/);
  assert.match(src, /aria-expanded=\{showData\}/);
  assert.match(src, /'View data'/);
});

test('size: no text is set below 13px, except the season chart axis ticks (12px SVG)', () => {
  const tooSmall = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decls = m[2];
    for (const d of decls.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?([\d.]+)px/g)) {
      const px = Number(d[1]);
      if (px < 13 && !m[1].includes('.schart__tick')) tooSmall.push(m[1].trim() + ' ' + px + 'px');
    }
  }
  assert.deepEqual(tooSmall, []);
  assert.match(css, /\.schart__tick\{[^}]*\b12px/);
});

test('size: buttons, tabs, chips, menus and fields are at least 44px tall', () => {
  const block = css.match(/([^{}]+)\{min-height:44px\}/g) || [];
  const listed = block.join(',');
  for (const sel of ['.tab', '.chip', '.seg__btn', '.btn', '.elo-now__item', '.navlink', '.more__list a', '.bottomnav a', 'details.manual>summary', 'select']) {
    assert.ok(listed.includes(sel), sel + ' has a 44px minimum height');
  }
  for (const m of css.matchAll(/min-height:(\d+)px/g)) {
    const at = css.lastIndexOf('}', m.index);
    const sel = css.slice(at + 1, css.indexOf('{', at + 1)).trim();
    if (Number(m[1]) < 44 && !/\.pills \.chip|skel|\.loadnote|card|lpanel|chart/.test(sel)) assert.fail(sel + ' min-height ' + m[1] + 'px');
  }
  assert.match(css, /\.infotip__btn::after\{[^}]*inset:-13px/, 'the 18px info button has a 44px tap area');
});
