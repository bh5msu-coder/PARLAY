import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { allTimeCareers, backToBack, loreHeadlines, pfOutliers } from '../lib/lore-summary.mjs';

const lore = JSON.parse(fs.readFileSync(new URL('../league-lore.json', import.meta.url)));

test('League headlines come straight from the lore file', () => {
  const h = loreHeadlines(lore);
  assert.equal(h.bestAvgFinish.owner, 'Kyle Heller');
  assert.equal(h.careerPf.owner, 'Chas Rossman');
  assert.equal(h.bestWinPct.owner, 'Ryan Hoffman');
  assert.deepEqual([h.bestSeason.owner, h.bestSeason.season], ['Kyle Heller', 2021]);
  assert.deepEqual(h.backToBack.map((x) => x.owner), ['Ryan Hoffman', 'Kyle Heller']);
  assert.equal(h.departedTitles, 6);
});

test('Back to back needs the same owner in consecutive years', () => {
  assert.deepEqual(backToBack([{ year: 2010, owner: 'A' }, { year: 2012, owner: 'A' }]), []);
});

test('All-time careers list every owner who played, titles first', () => {
  const rows = allTimeCareers(lore);
  assert.equal(rows.length, lore.careers.filter((c) => c.seasons).length);
  assert.equal(rows[0].owner, 'Kyle Heller');
  assert.ok(rows.every((r, i) => i === 0 || (rows[i - 1].titleCount || 0) >= (r.titleCount || 0)));
});

test('Outliers sort by the size of the z-score', () => {
  const o = pfOutliers(lore);
  assert.equal(o.length, lore.outliers.length);
  assert.ok(o.every((r, i) => i === 0 || Math.abs(o[i - 1].z) >= Math.abs(r.z)));
});
