/** Week and pick-form helpers shared by the Week, Pick and Commissioner pages.
 *  Extracted from the legacy app.js (behavior unchanged). */

export const STAT_OPTS = [['passYds', 'Passing yards'], ['recYds', 'Receiving yards'], ['rushYds', 'Rushing yards'], ['passTD', 'Passing TD'], ['passINT', 'Interceptions thrown'], ['receptions', 'Receptions'], ['anyTD', 'Anytime TD (rush or rec)']];

export function blankPickForm(who) {
  return { who: who || '', type: 'ml', gameAway: '', gameHome: '', team: '', side: 'over', line: '', player: '', stat: 'anyTD', odds: '', label: '' };
}

export function blankLeg() { return { id: 'l' + Math.random().toString(36).slice(2, 8), who: '', label: '', type: 'ml', team: '', game: ['', ''], side: 'over', line: '', player: '', stat: 'passYds', odds: '', group: '' }; }

export function newWeek(n) { return { week: n, payer: '', placedBy: '', stake: 10, odds: '', toPay: '', book: '', note: '', legs: [], groups: {}, overrides: {} }; }

export function placeholderWeek(n) {
  return {
    week: n, payer: '', placedBy: '', stake: 10, odds: '', toPay: '', book: '',
    note: '', legs: [], groups: {}, overrides: {}, pendingTicket: true,
  };
}

export function nextUnusedWeek(weeks, nfl) {
  const used = weeks.map((w) => Number(w.week)).filter((n) => n > 0);
  const nflWeek = nfl && Number(nfl.active);
  if (nflWeek && !used.includes(nflWeek)) return nflWeek;
  return used.length ? Math.max(...used) + 1 : 1;
}

export function openPickWeek(weeks, nfl) {
  if (nfl && nfl.active) return nfl.active;
  if (!weeks.length) return 1;
  const last = Math.max(...weeks.map((w) => w.week));
  const w = weeks.find((x) => x.week === last);
  if (!w) return last;
  // A live week is still being played, so its picks stay the open week until it is final.
  const hold = w.results === 'unknown' || w.results === 'pending' || w.results === 'live';
  const openLeg = (w.legs || []).some((l) => l.type === 'tbd' || l.result === 'unknown' || l.result === 'pending');
  if (w.locked) return last + 1;
  if ((w.legs || []).length >= 11 && !hold && !openLeg) return last + 1;
  return last;
}

export function formToLeg(f) {
  const game = [String(f.gameAway || '').toUpperCase(), String(f.gameHome || '').toUpperCase()];
  const type = f.type;
  let label = f.label;
  if (!label) {
    if (type === 'ml') label = `${f.team} ML`;
    else if (type === 'spread') label = `${f.team} ${Number(f.line) > 0 ? '+' : ''}${f.line}`;
    else if (type === 'total') label = `${f.side === 'under' ? 'Under' : 'Over'} ${f.line}`;
    else label = `${f.player} ${f.side === 'under' ? 'under' : 'over'} ${f.line}`;
  }
  return {
    type, label, game,
    team: (type === 'ml' || type === 'spread') ? String(f.team || '').toUpperCase() : '',
    side: f.side || 'over',
    line: f.line === '' ? '' : Number(f.line),
    player: type === 'player' ? f.player : '',
    stat: type === 'player' ? f.stat : 'anyTD',
    odds: f.odds === '' ? '' : Number(f.odds),
  };
}

export function waBlock(week, who, leg) {
  return [
    `HOLM PICK W${week}`,
    `Who: ${who}`,
    `Game: ${(leg.game || []).join(' at ')}`,
    `Type: ${leg.type}`,
    `Pick: ${leg.label}`,
    leg.odds ? `Odds: ${leg.odds}` : '',
  ].filter(Boolean).join('\n');
}

export const DEFAULT_CHAT_URL = 'https://chat.whatsapp.com/FtnPcXlpljH29Opvjr5Tl9?mode=gi_t';
