/** One-tap player props and first-score bets for the Pick page. Pure, so the tests import it directly.
 *  The player list comes from ESPN's team roster (through /api/espn?path=roster); ESPN's free feed has
 *  no prop prices, so the price is left blank for the manager to add if they want it on the slip. */

export const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const POS_ALIAS = { FB: 'RB', HB: 'RB' };

/** ESPN team roster → [{ name, pos }] for offensive skill players, in QB, RB, WR, TE order.
 *  Accepts the grouped shape ({ athletes: [{ items: [...] }] }) and a flat list of athletes. */
export function slimRoster(data) {
  const groups = (data && data.athletes) || [];
  const flat = [];
  for (const g of groups) {
    if (g && Array.isArray(g.items)) flat.push(...g.items);
    else if (g) flat.push(g);
  }
  const seen = new Set();
  const out = [];
  for (const a of flat) {
    if (!a) continue;
    const name = String(a.displayName || a.fullName || '').trim();
    const raw = String((a.position && (a.position.abbreviation || a.position.name)) || '').toUpperCase();
    const pos = POS_ALIAS[raw] || raw;
    if (!name || !SKILL_POSITIONS.includes(pos) || seen.has(name)) continue;
    const status = String((a.status && (a.status.type || a.status.name)) || '').toLowerCase();
    if (status && status !== 'active') continue;
    seen.add(name);
    out.push({ name, pos });
  }
  return out.sort((x, y) => SKILL_POSITIONS.indexOf(x.pos) - SKILL_POSITIONS.indexOf(y.pos) || x.name.localeCompare(y.name));
}

/** Filter a roster by position ('' for all) and typed text. */
export function filterPlayers(players, pos, query) {
  const q = String(query || '').trim().toLowerCase();
  return (players || []).filter((p) => (!pos || p.pos === pos) && (!q || p.name.toLowerCase().includes(q)));
}

export const PROP_KINDS = { anyTD: 'Anytime TD', firstTD: 'First TD' };

/** A tapped player → the pick form fields (blankPickForm shape). kind: 'anyTD' | 'firstTD'. */
export function propToForm(game, player, kind, who) {
  if (!game || !player || !PROP_KINDS[kind]) return null;
  return {
    who: who || '', type: 'player', gameAway: game.away, gameHome: game.home, team: '', side: 'over', line: '0.5',
    player, stat: kind, odds: '', label: `${player} ${PROP_KINDS[kind]}`,
  };
}

/** "Which team scores first" → the pick form fields. side: 'away' | 'home'. */
export function firstScoreToForm(game, side, who) {
  if (!game || (side !== 'away' && side !== 'home')) return null;
  const team = side === 'away' ? game.away : game.home;
  return {
    who: who || '', type: 'first', gameAway: game.away, gameHome: game.home, team, side: 'over', line: '',
    player: '', stat: 'anyTD', odds: '', label: `${team} scores first`,
  };
}

/** A key for the pick the form holds right now, so the board can light the matching button. */
export function formPropKey(form) {
  if (!form || !form.gameAway) return '';
  const g = `${form.gameAway}|${form.gameHome}|`;
  if (form.type === 'first' && form.team) return g + 'first-' + String(form.team).toUpperCase();
  if (form.type === 'player' && form.player && PROP_KINDS[form.stat]) return g + form.stat + '-' + String(form.player).toLowerCase();
  return '';
}

/** The same key for a saved leg (yours or someone else's). */
export function legPropKey(leg) {
  if (!leg || !leg.game) return '';
  return formPropKey({ gameAway: String(leg.game[0] || '').toUpperCase(), gameHome: String(leg.game[1] || '').toUpperCase(), type: leg.type, team: leg.team, player: leg.player, stat: leg.stat });
}
