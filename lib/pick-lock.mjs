/** League rule (editsAndLocks): a pick can be changed until its game kicks off, then it is locked.
 *  Checks use the ESPN scoreboard. If ESPN cannot be reached the check is skipped (the league is a
 *  trusted friend group) and the response says the lock could not be checked. */
import { findEvent, gameState } from './grade.mjs';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export async function loadScoreboard(season, week, fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  try {
    const r = await f(`${SCOREBOARD}?dates=${season}&seasontype=2&week=${week}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/** @returns {'pre'|'in'|'post'|'not-found'|'unknown'} */
export function gameStatus(scoreboard, game) {
  if (!scoreboard) return 'unknown';
  const m = findEvent(scoreboard, game);
  if (!m) return 'not-found';
  return gameState(m.comp, m.ev).state;
}

/** Can this manager save `leg`, given their currently saved pick (if any)?
 *  @returns {{ok: boolean, reason?: string, checked: boolean}} */
export function checkPickLock(scoreboard, leg, saved) {
  if (!scoreboard) return { ok: true, checked: false };
  if (saved && saved.leg) {
    const s = gameStatus(scoreboard, saved.leg.game);
    if (s === 'in' || s === 'post') return { ok: false, checked: true, reason: `Locked: the saved pick (${saved.leg.label || 'saved pick'}) is in a game that already kicked off` };
  }
  const n = gameStatus(scoreboard, leg && leg.game);
  if (n === 'in' || n === 'post') return { ok: false, checked: true, reason: `Locked: ${(leg.game || []).join(' at ')} already kicked off` };
  return { ok: true, checked: true };
}
