/** Sportsbook lines for the Pick page, read from the ESPN scoreboard's odds block (DraftKings on
 *  ESPN). Pure: the Pick page taps a line and gets back the same form fields a typed pick fills. */

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/^[ou]/i, ''));
  return Number.isFinite(n) ? n : null;
}

function price(v) {
  if (v == null || v === '' || /^even$/i.test(String(v))) return v && /^even$/i.test(String(v)) ? 100 : null;
  const n = Number(String(v).replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

/** close if it is there, else open. */
function pick(side) {
  if (!side) return {};
  return side.close || side.open || {};
}

/** @returns {null | { book, spread: {away,home}, total: {over,under}, ml: {away,home} }}
 *  Each market side is { line, odds } with numbers or null. Null when ESPN has no odds yet. */
export function gameLines(comp) {
  const o = comp && comp.odds && comp.odds[0];
  if (!o) return null;
  const book = (o.provider && (o.provider.displayName || o.provider.name)) || '';
  const ps = o.pointSpread || {};
  const tot = o.total || {};
  const ml = o.moneyline || {};
  let homeLine = num(pick(ps.home).line);
  let awayLine = num(pick(ps.away).line);
  if (homeLine == null && typeof o.spread === 'number') homeLine = o.spread;
  if (awayLine == null && homeLine != null) awayLine = -homeLine;
  const totalLine = num(pick(tot.over).line) != null ? num(pick(tot.over).line) : num(o.overUnder);
  const out = {
    book,
    spread: {
      away: { line: awayLine, odds: price(pick(ps.away).odds) },
      home: { line: homeLine, odds: price(pick(ps.home).odds) },
    },
    total: {
      over: { line: totalLine, odds: price(pick(tot.over).odds) },
      under: { line: num(pick(tot.under).line) != null ? num(pick(tot.under).line) : totalLine, odds: price(pick(tot.under).odds) },
    },
    ml: {
      away: { line: null, odds: price(pick(ml.away).odds) },
      home: { line: null, odds: price(pick(ml.home).odds) },
    },
  };
  const any = out.spread.home.line != null || out.total.over.line != null || out.ml.home.odds != null;
  return any ? out : null;
}

export function fmtLine(n) {
  if (n == null) return '';
  return (n > 0 ? '+' : '') + (Number.isInteger(n) ? String(n) : n.toFixed(1));
}

export function fmtPrice(n) {
  if (n == null) return '';
  return n > 0 ? '+' + n : String(n);
}

/** One tappable market → the pick form fields (blankPickForm shape). `market` is
 *  'spread-away' | 'spread-home' | 'total-over' | 'total-under' | 'ml-away' | 'ml-home'. */
export function tapToForm(game, market, who) {
  const L = game && game.lines;
  if (!L) return null;
  const [kind, side] = market.split('-');
  const base = { who: who || '', gameAway: game.away, gameHome: game.home, player: '', stat: 'anyTD', side: 'over', line: '', team: '', odds: '', label: '' };
  if (kind === 'spread') {
    const s = L.spread[side];
    if (!s || s.line == null) return null;
    const team = side === 'away' ? game.away : game.home;
    return Object.assign(base, { type: 'spread', team, line: String(s.line), odds: s.odds == null ? '' : String(s.odds), label: `${team} ${fmtLine(s.line)}` });
  }
  if (kind === 'total') {
    const s = L.total[side];
    if (!s || s.line == null) return null;
    return Object.assign(base, { type: 'total', side, line: String(s.line), odds: s.odds == null ? '' : String(s.odds), label: `${game.away}/${game.home} ${side === 'under' ? 'Under' : 'Over'} ${s.line}` });
  }
  if (kind === 'ml') {
    const s = L.ml[side];
    if (!s || s.odds == null) return null;
    const team = side === 'away' ? game.away : game.home;
    return Object.assign(base, { type: 'ml', team, odds: String(s.odds), label: `${team} ML` });
  }
  return null;
}

/** Which market key a saved leg matches on this game, so the board can mark it (yours or taken). */
export function legMarket(leg, game) {
  if (!leg || !game) return '';
  const g = (leg.game || []).map((x) => String(x || '').toUpperCase());
  if (g[0] !== game.away || g[1] !== game.home) return '';
  const team = String(leg.team || '').toUpperCase();
  if (leg.type === 'spread') return team === game.away ? 'spread-away' : team === game.home ? 'spread-home' : '';
  if (leg.type === 'ml') return team === game.away ? 'ml-away' : team === game.home ? 'ml-home' : '';
  if (leg.type === 'first') return team === game.away ? 'first-away' : team === game.home ? 'first-home' : '';
  if (leg.type === 'total') return String(leg.side).toLowerCase() === 'under' ? 'total-under' : 'total-over';
  return '';
}
