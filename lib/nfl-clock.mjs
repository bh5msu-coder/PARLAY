/** NFL week clock: the board rolls as soon as the prior week's last game is final.
 *  Extracted from the legacy app.js; takes the ESPN client as an argument. */
import { formatKickET, weekdayET } from './format.mjs';

export function boardSnapshot(board, weekNum) {
  const events = ((board && board.events) || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const snaps = events.map((ev) => {
    const st = (ev.status || {}).type || {};
    const state = st.state || 'pre';
    return { date: ev.date, state, completed: !!st.completed || state === 'post', name: ev.shortName || ev.name || '' };
  });
  const first = snaps[0] || null;
  const last = snaps[snaps.length - 1] || null;
  const firstAbbr = first && first.name ? first.name.replace(/\s+/g, ' ') : '';
  return {
    week: weekNum,
    count: events.length,
    allFinal: events.length > 0 && snaps.every((s) => s.completed),
    anyLive: snaps.some((s) => s.state === 'in'),
    anyStarted: snaps.some((s) => s.state === 'in' || s.completed),
    firstKick: first ? first.date : null,
    lastKick: last ? last.date : null,
    firstGame: firstAbbr,
    wednesdayOpen: weekdayET(first && first.date) === 'Wed',
    firstKickLabel: formatKickET(first && first.date),
  };
}

export function resolveNflWeek(espnWeek, prevS, currS) {
  let n = Math.max(1, Math.min(18, Number(espnWeek) || 1));
  if (currS && currS.allFinal) n = n >= 18 ? 18 : n + 1;
  else if (prevS && prevS.count && !prevS.allFinal) n = Math.max(1, n - 1);
  return n;
}

export async function loadNflClock(espn, force) {
  const nowBoard = await espn.scoreboard('now', force);
  const seasonType = Number((nowBoard.season || {}).type) || 2;
  let espnWeek = Number((nowBoard.week || {}).number) || 1;
  if (seasonType !== 2) espnWeek = 1;
  espnWeek = Math.max(1, Math.min(18, espnWeek));
  const prevN = espnWeek > 1 ? espnWeek - 1 : null;
  const nextN = espnWeek < 18 ? espnWeek + 1 : null;
  const curr = await espn.scoreboard(espnWeek, force);
  const prev = prevN ? await espn.scoreboard(prevN, force) : null;
  const currS = boardSnapshot(curr, espnWeek);
  const prevS = prev ? boardSnapshot(prev, prevN) : { week: prevN, count: 0, allFinal: true };
  const active = resolveNflWeek(espnWeek, prevS, currS);
  let activeS = active === espnWeek ? currS : active === prevN ? prevS : null;
  if (!activeS && nextN && active === nextN) {
    try { activeS = boardSnapshot(await espn.scoreboard(nextN, force), nextN); } catch (e) { activeS = { week: nextN, count: 0, wednesdayOpen: false }; }
  }
  if (!activeS) activeS = { week: active, count: 0, wednesdayOpen: false, firstKickLabel: '', firstGame: '' };
  return {
    active,
    espnWeek,
    payerWeek: Math.max(1, active - 1),
    prevFinal: !prevN || !!prevS.allFinal,
    wednesday: !!activeS.wednesdayOpen,
    firstKick: activeS.firstKick || null,
    firstKickLabel: activeS.firstKickLabel || '',
    firstGame: activeS.firstGame || '',
    snapshot: activeS,
  };
}
