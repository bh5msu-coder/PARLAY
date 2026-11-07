/** What to tell people when live scores don't load. Pure, so it is tested directly.
 *  `graded` is the store's week -> gradeWeek result; a result with `error` means ESPN's scoreboard failed. */

export function scoreProblem(graded, weekNums) {
  const g = graded || {};
  const nums = (weekNums || Object.keys(g).map(Number)).filter((n) => g[n] && g[n].error && !g[n].fromLock);
  return nums.sort((a, b) => a - b);
}

/** The banner text for one page. `scope` is 'week' (one ticket) or 'season' (everything graded). */
export function scoreNotice(graded, { week, weeks, scope } = {}) {
  if (scope === 'week') {
    if (!scoreProblem(graded, [week]).length) return null;
    return {
      title: 'Live scores didn\u2019t load',
      body: `ESPN didn\u2019t answer, so Week ${week}\u2019s legs show as entered and none are graded yet. Picks are not affected. The site tries again on its own every few minutes.`,
    };
  }
  const bad = scoreProblem(graded, weeks);
  if (!bad.length) return null;
  return {
    title: 'Some scores didn\u2019t load',
    body: `ESPN didn\u2019t answer for Week${bad.length === 1 ? '' : 's'} ${bad.join(', ')}, so totals here may be missing those results. Nothing recorded was changed.`,
  };
}
