/** Weekly tickets live in /data/bets.json. This module turns that file into grades.
 *  A week with results "unknown" or "pending" never becomes a win or a loss.
 *  Season Elo does not read this module. */

import { canonicalWho } from './ticket.mjs';

const TERMINAL = {
  win: 'won',
  won: 'won',
  w: 'won',
  loss: 'lost',
  lost: 'lost',
  l: 'lost',
  push: 'push',
  void: 'void',
};

export function terminalState(result) {
  if (result == null || result === '') return null;
  return TERMINAL[String(result).toLowerCase()] || null;
}

export function isOpenState(state) {
  return state !== 'won' && state !== 'lost' && state !== 'push' && state !== 'void';
}

/** Hit rate uses only won and lost. Pending, unknown, and live stay open. */
export function tallyState(state) {
  if (state === 'won') return 'hit';
  if (state === 'lost') return 'miss';
  if (state === 'push' || state === 'void') return 'push';
  return 'open';
}

export function applyLegToRow(row, state) {
  row.legs++;
  const bucket = tallyState(state);
  if (bucket === 'hit') { row.hit++; row.streak.push('W'); }
  else if (bucket === 'miss') { row.miss++; row.streak.push('L'); }
  else if (bucket === 'push') row.push++;
  else row.open++;
}

function weekOnHold(week) {
  const r = String(week && week.results || '').toLowerCase();
  return r === 'unknown' || r === 'pending';
}

function openLeg(leg, week) {
  const tbd = leg.type === 'tbd' || /^tbd$/i.test(String(leg.label || '').trim());
  const hold = weekOnHold(week) || String(leg.result || '').toLowerCase() === 'unknown' || String(leg.result || '').toLowerCase() === 'pending';
  const partial = leg.period && leg.period !== 'game' && leg.period !== 'full';
  let detail = 'Result unknown';
  if (tbd) detail = 'Pick not in yet';
  else if (leg.note) detail = leg.note;
  else if (partial) detail = 'Result unknown';
  else if (!hold && needsNumber(leg) && !hasLine(leg)) detail = 'Line not posted';
  return {
    leg,
    state: 'unknown',
    detail,
    current: null,
    final: false,
    gameDate: leg.gameDate || null,
  };
}

function needsNumber(leg) {
  return leg.type === 'spread' || leg.type === 'total' || leg.type === 'player';
}

function hasLine(leg) {
  return leg.line != null && leg.line !== '' && !Number.isNaN(Number(leg.line));
}

function recordedLeg(leg) {
  const state = terminalState(leg.result);
  const word = state === 'won' ? 'win' : state === 'lost' ? 'loss' : state;
  return {
    leg,
    state,
    detail: leg.detail || ('Recorded ' + word),
    current: leg.current || null,
    final: true,
    gameDate: leg.gameDate || null,
  };
}

/** Fully stored weeks skip ESPN. Null means the caller may grade live games. */
export function gradeStoredWeek(week) {
  const legs = (week && week.legs) || [];
  if (weekOnHold(week)) {
    return { graded: legs.map((leg) => openLeg(leg, week)) };
  }
  if (week && week.locked && week.locked.results) {
    const graded = legs.map((leg) => {
      const r = week.locked.results[leg.id] || {};
      const state = terminalState(r.state) || (isOpenState(r.state) ? 'unknown' : null);
      if (!state || isOpenState(state)) return openLeg(Object.assign({}, leg, { result: 'unknown', note: r.detail }), week);
      return {
        leg,
        state,
        detail: r.detail || 'Locked',
        current: r.current || null,
        final: true,
        gameDate: r.gameDate || leg.gameDate || null,
      };
    });
    return { graded };
  }
  const graded = [];
  for (const leg of legs) {
    const state = terminalState(leg.result);
    if (state) graded.push(recordedLeg(leg));
    else if (leg.type === 'tbd' || leg.result === 'unknown' || leg.result === 'pending' || (leg.period && leg.period !== 'game' && leg.period !== 'full') || (needsNumber(leg) && !hasLine(leg))) {
      graded.push(openLeg(leg, week));
    } else return null;
  }
  return { graded };
}

export function summarizeParlay(graded) {
  const list = graded || [];
  const lost = list.filter((g) => g.state === 'lost');
  const won = list.filter((g) => g.state === 'won');
  const pushes = list.filter((g) => g.state === 'push' || g.state === 'void');
  const live = list.filter((g) => g.state === 'live');
  const pending = list.filter((g) => g.state === 'pending' || g.state === 'unknown');
  let state = 'open';
  if (lost.length) state = 'busted';
  else if (won.length + pushes.length === list.length && list.length) state = 'cashed';
  else if (live.length) state = 'live';
  let killers = [];
  if (lost.length) {
    const withTime = lost.map((g) => ({ g, t: g.gameDate ? new Date(g.gameDate).getTime() : 0 }));
    const min = Math.min(...withTime.map((x) => x.t));
    killers = withTime.filter((x) => x.t === min).map((x) => x.g.leg.who);
  }
  return {
    state,
    won: won.length,
    lost: lost.length,
    pushes: pushes.length,
    live: live.length,
    pending: pending.length,
    killers,
    total: list.length,
  };
}

export function legSignature(leg) {
  return [
    canonicalWho(leg.who) || '',
    leg.label || '',
    leg.type || '',
    leg.team || '',
    leg.player || '',
    leg.line == null ? '' : String(leg.line),
    (leg.game || []).join('@'),
  ].join('|');
}

export function diffWeek(fileWeek, remoteData) {
  const a = ((fileWeek && fileWeek.legs) || []).map(legSignature).sort();
  const b = ((remoteData && remoteData.legs) || []).map(legSignature).sort();
  if (a.join('\n') === b.join('\n')) return null;
  return { week: fileWeek.week, fileLegs: a, remoteLegs: b };
}

export function normalizeFile(file) {
  const weeks = ((file && file.weeks) || []).map((w) => Object.assign({}, w, { source: w.source || 'file', week: Number(w.week) }));
  weeks.sort((a, b) => a.week - b.week);
  return { config: (file && file.config) || {}, weeks };
}
