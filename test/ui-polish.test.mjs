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
