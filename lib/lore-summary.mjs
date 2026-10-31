/** League page headline figures worked out from league-lore.json (2010–2025 tape). Nothing invented:
 *  every figure is read from `careers` or a current manager's season `history`. */

const MIN_SEASONS = 5;

function winPct(c) {
  const g = (c.wins || 0) + (c.losses || 0);
  return g ? c.wins / g : null;
}

/** Back-to-back champions, newest first: [{ owner, years: [y1, y2] }]. */
export function backToBack(champions) {
  const byYear = (champions || []).slice().sort((a, b) => a.year - b.year);
  const out = [];
  for (let i = 1; i < byYear.length; i++) {
    if (byYear[i].owner === byYear[i - 1].owner && byYear[i].year === byYear[i - 1].year + 1) {
      out.push({ owner: byYear[i].owner, years: [byYear[i - 1].year, byYear[i].year] });
    }
  }
  return out.reverse();
}

/** Extra headline figures for the League page strip. Each is null when the lore cannot answer it. */
export function loreHeadlines(lore) {
  const careers = (lore && lore.careers) || [];
  const current = careers.filter((c) => c.current && c.seasons);
  const veterans = current.filter((c) => c.seasons >= MIN_SEASONS);
  const best = (list, score) => list.reduce((top, c) => {
    const s = score(c);
    return s != null && (top == null || s > top.s) ? { c, s } : top;
  }, null);

  const avg = best(veterans, (c) => (c.avgFinish == null ? null : -c.avgFinish));
  const pf = best(careers, (c) => c.pf || null);
  const pct = best(veterans, winPct);
  const iron = current.filter((c) => c.seasons === Math.max(...current.map((x) => x.seasons)));

  let season = null;
  for (const p of (lore && lore.people) || []) {
    for (const s of (p.career && p.career.history) || []) {
      if (!season || s.pf > season.pf) season = { owner: p.name, ...s };
    }
  }
  const b2b = backToBack(lore && lore.champions);
  const departedTitles = careers.filter((c) => !c.current).reduce((n, c) => n + (c.titleCount || 0), 0);

  return {
    bestAvgFinish: avg ? { owner: avg.c.owner, avgFinish: avg.c.avgFinish, seasons: avg.c.seasons } : null,
    careerPf: pf ? { owner: pf.c.owner, pf: pf.c.pf, seasons: pf.c.seasons } : null,
    bestWinPct: pct ? { owner: pct.c.owner, pct: pct.s, wins: pct.c.wins, losses: pct.c.losses } : null,
    bestSeason: season ? { owner: season.owner, season: season.season, pf: season.pf, rank: season.rank, team: season.team } : null,
    ironMen: iron.length ? { owners: iron.map((c) => c.owner), seasons: iron[0].seasons } : null,
    backToBack: b2b,
    departedTitles,
    minSeasons: MIN_SEASONS,
  };
}

/** Every manager who ever played, titles first, then average finish. */
export function allTimeCareers(lore) {
  return ((lore && lore.careers) || [])
    .filter((c) => c.seasons)
    .slice()
    .sort((a, b) => (b.titleCount || 0) - (a.titleCount || 0)
      || (a.avgFinish == null ? 99 : a.avgFinish) - (b.avgFinish == null ? 99 : b.avgFinish)
      || a.owner.localeCompare(b.owner))
    .map((c) => ({ ...c, winPct: winPct(c) }));
}

/** Seasons furthest from their year's average PF, by z-score (league-lore.json outliers). */
export function pfOutliers(lore) {
  return ((lore && lore.outliers) || []).slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}
