/** Kickoff check for a pick save. The league bets together, not against each other: what matters is
 *  getting the ticket to the book before the games start, not when a pick reached the sheet. So a pick
 *  saved after its game kicked off is never refused; the save goes through with a warning that the book
 *  may not take that leg pre-game. "Kicked off" means ESPN shows the game live or final, or its
 *  scheduled kickoff time has passed (ESPN's live flag lags kickoff by a few minutes).
 *  If ESPN cannot be reached the check is skipped and the response says so.
 *  A placed or locked week is still frozen; that check lives in lib/commit.mjs. */
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

/** Has this game kicked off: live or final on ESPN, or past its scheduled kickoff time? */
export function kickedOff(scoreboard, game, now = Date.now()) {
  if (!scoreboard) return false;
  const m = findEvent(scoreboard, game);
  if (!m) return false;
  const st = gameState(m.comp, m.ev).state;
  if (st === 'in' || st === 'post') return true;
  const at = Date.parse((m.ev && m.ev.date) || '');
  return Number.isFinite(at) && now >= at;
}

/** Check a pick save against kickoff. Never refuses (ok is always true); `warning` is set when the new
 *  pick's game, or the game of the pick it replaces, has kicked off.
 *  @returns {{ok: true, checked: boolean, late: boolean, warning?: string}} */
export function checkPickLock(scoreboard, leg, saved, now = Date.now()) {
  if (!scoreboard) return { ok: true, checked: false, late: false };
  const newLate = kickedOff(scoreboard, leg && leg.game, now);
  const oldLate = !!(saved && saved.leg) && kickedOff(scoreboard, saved.leg.game, now);
  if (!newLate && !oldLate) return { ok: true, checked: true, late: false };
  const warning = newLate
    ? `${(leg.game || []).join(' at ')} already kicked off. Saved, but the book may not take this leg pre-game. Tell the group before the ticket goes in.`
    : `Your earlier pick (${saved.leg.label || 'saved pick'}) was in a game that already kicked off. Saved; make sure the ticket at the book matches.`;
  return { ok: true, checked: true, late: true, warning };
}
