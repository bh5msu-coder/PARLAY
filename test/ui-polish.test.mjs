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
