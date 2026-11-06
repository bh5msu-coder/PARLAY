/** Line alerts: compare a saved leg against the current ESPN (DraftKings) line for its game.
 *  Pure. Player props are not on the scoreboard, so they come back 'unchecked', never 'same'. */

function n(v) {
  if (v == null || v === '') return null;
  const x = Number(String(v).replace('+', ''));
  return Number.isFinite(x) ? x : null;
}

function sideOf(leg, game) {
  const team = String(leg.team || '').toUpperCase();
  if (team === game.away) return 'away';
  if (team === game.home) return 'home';
  return '';
}

export function findGame(games, leg) {
  const g = (leg && leg.game) || [];
  return (games || []).find((x) => x && x.away === String(g[0] || '').toUpperCase() && x.home === String(g[1] || '').toUpperCase()) || null;
}

const fmtL = (v) => (v == null ? '' : (v > 0 ? '+' : '') + v);
const fmtP = (v) => (v == null ? '' : (v > 0 ? '+' : '') + v);

/** @returns {{ status: 'same'|'moved'|'unchecked', savedLine, nowLine, savedOdds, nowOdds, text, book }} */
export function lineMove(leg, games) {
  const out = { status: 'unchecked', savedLine: null, nowLine: null, savedOdds: null, nowOdds: null, text: '', book: '' };
  if (!leg || !['ml', 'spread', 'total'].includes(leg.type)) { out.text = leg && leg.type === 'player' ? 'Props are not on the scoreboard feed' : ''; return out; }
  const game = findGame(games, leg);
  if (!game || !game.lines) return out;
  out.book = game.lines.book || '';
  let cur = null;
  if (leg.type === 'ml') { const s = sideOf(leg, game); if (s) cur = game.lines.ml[s]; }
  else if (leg.type === 'spread') { const s = sideOf(leg, game); if (s) cur = game.lines.spread[s]; }
  else cur = game.lines.total[leg.side === 'under' ? 'under' : 'over'];
  if (!cur) return out;
  out.savedLine = leg.type === 'ml' ? null : n(leg.line);
  out.nowLine = leg.type === 'ml' ? null : n(cur.line);
  out.savedOdds = n(leg.odds);
  out.nowOdds = n(cur.odds);
  const lineMoved = leg.type !== 'ml' && out.savedLine != null && out.nowLine != null && out.savedLine !== out.nowLine;
  const oddsMoved = out.savedOdds != null && out.nowOdds != null && Math.abs(out.savedOdds - out.nowOdds) >= 10;
  if (out.nowLine == null && out.nowOdds == null) return out;
  out.status = lineMoved || oddsMoved ? 'moved' : 'same';
  const fl = leg.type === 'total' ? (v) => String(v) : fmtL;
  if (lineMoved) {
    out.text = `Line moved: saved ${fl(out.savedLine)}, now ${fl(out.nowLine)}${out.nowOdds != null ? ' (' + fmtP(out.nowOdds) + ')' : ''}`;
  } else if (oddsMoved) {
    out.text = `Price moved: saved ${fmtP(out.savedOdds)}, now ${fmtP(out.nowOdds)}`;
  } else {
    out.text = 'Line unchanged';
  }
  return out;
}

/** Every pending pick that has moved, for the Week page banner. */
export function movedPicks(rows, games) {
  const out = [];
  for (const r of rows || []) {
    const m = lineMove(r.leg, games);
    if (m.status === 'moved') out.push({ who: r.who, label: (r.leg && r.leg.label) || '', move: m });
  }
  return out;
}
