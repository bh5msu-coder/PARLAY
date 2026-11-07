/** The season chart's numbers as table rows, for "View data" (phones, screen readers, anyone who wants
 *  the exact values). Seasons a manager did not play are left out rather than shown as blanks. */
export function seasonTableRows(years, focus) {
  if (!focus || !Array.isArray(years)) return [];
  const rows = [];
  years.forEach((year, i) => {
    const finish = focus.finish ? focus.finish[i] : null;
    const elo = focus.elo ? focus.elo[i] : null;
    if (finish == null && elo == null) return;
    rows.push({ year, finish, champ: !!(focus.champ && focus.champ[i]), elo });
  });
  return rows;
}

export function finishLabel(row) {
  if (!row || row.finish == null) return 'no finish';
  if (row.champ) return 'Champion';
  const n = row.finish;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  return n + s;
}
