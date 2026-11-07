/** A week in the database: one holm_tickets row plus its holm_legs rows (migration 007). These mappers
 *  turn the week object the pages use into rows and back, so the pages can read the database without
 *  changing shape. Pure; test/week-rows.test.mjs checks every week in data/bets.json survives the trip.
 *
 *  Anything a week or leg carries that has no column of its own is kept in `extra`, so nothing is lost
 *  and a new key never needs a migration first. */

/** Week keys with their own column (or computed at read time, like `source`). */
const WEEK_COLS = {
  ticket: true, stake: true, odds: true, toPay: true, book: true, placedBy: true,
  payer: true, payers: true, payerNote: true, results: true, dates: true, note: true,
  groups: true, overrides: true, locked: true, submissions: true,
  week: true, legs: true, source: true,
};
const LEG_COLS = {
  id: true, who: true, label: true, type: true, game: true, team: true, side: true, line: true,
  player: true, stat: true, odds: true, group: true, result: true, confidence: true, source: true,
  detail: true, gameDate: true, period: true, note: true,
};

const blank = (v) => v === undefined || v === null || v === '';
const num = (v) => (blank(v) || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v) => (blank(v) ? null : String(v));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/** Leg result as written ('win', 'loss', 'unknown', …) -> holm_legs.status. */
const TO_STATUS = { win: 'won', won: 'won', w: 'won', loss: 'lost', lost: 'lost', l: 'lost', push: 'push', void: 'void', unknown: 'unknown', pending: 'unknown' };
const FROM_STATUS = { won: 'win', lost: 'loss', push: 'push', void: 'void', unknown: 'unknown' };

function extraOf(o, known) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) if (!known[k] && v !== undefined) out[k] = v;
  return out;
}

/** @returns {{ticket: object, legs: object[]}} rows for holm_tickets and holm_legs */
export function weekToRows(season, week) {
  const w = week || {};
  const n = Number(w.week);
  const t = obj(w.ticket);
  const ticket = {
    season, week: n,
    state: t && t.state ? t.state : null,
    evidence: t && t.evidence ? String(t.evidence) : '',
    stake: num(w.stake),
    odds: num(w.odds),
    to_pay: num(w.toPay),
    book: str(w.book),
    placed_by: str(w.placedBy),
    payer: str(w.payer),
    payers: Array.isArray(w.payers) ? w.payers.map(String) : null,
    payer_note: str(w.payerNote),
    results: str(w.results),
    dates: str(w.dates),
    note: str(w.note),
    groups: obj(w.groups),
    overrides: obj(w.overrides),
    locked: obj(w.locked),
    submissions: obj(w.submissions),
    extra: extraOf(w, WEEK_COLS),
  };
  const legs = (w.legs || []).map((l, i) => ({
    season, week: n,
    leg_id: String(l.id || `w${n}-leg${i + 1}`),
    pos: i,
    who: String(l.who || ''),
    label: String(l.label || ''),
    type: String(l.type || 'tbd'),
    game: Array.isArray(l.game) ? l.game.map(String) : [],
    team: str(l.team),
    side: str(l.side),
    line: num(l.line),
    player: str(l.player),
    stat: str(l.stat),
    odds: num(l.odds),
    sgp_group: str(l.group),
    status: TO_STATUS[String(l.result || '').toLowerCase()] || 'open',
    confidence: str(l.confidence),
    source: obj(l.source) || {},
    detail: str(l.detail),
    game_date: str(l.gameDate),
    period: str(l.period),
    note: str(l.note),
    extra: extraOf(l, LEG_COLS),
  }));
  return { ticket, legs };
}

/** holm_tickets row + its holm_legs rows -> the week object the pages use (source 'db'). */
export function rowsToWeek(ticket, legs) {
  const t = ticket || {};
  const w = Object.assign({}, t.extra || {}, { week: Number(t.week) });
  if (t.state) w.ticket = { state: t.state, evidence: t.evidence || '' };
  const set = (k, v) => { if (!blank(v)) w[k] = v; };
  set('stake', num(t.stake));
  set('odds', num(t.odds));
  set('toPay', num(t.to_pay));
  set('book', t.book);
  set('placedBy', t.placed_by);
  set('payer', t.payer);
  if (Array.isArray(t.payers)) w.payers = t.payers.slice();
  set('payerNote', t.payer_note);
  set('results', t.results);
  set('dates', t.dates);
  set('note', t.note);
  for (const k of ['groups', 'overrides', 'locked', 'submissions']) if (t[k]) w[k] = t[k];
  w.legs = (legs || []).slice().sort((a, b) => (a.pos || 0) - (b.pos || 0)).map((r) => {
    const l = Object.assign({}, r.extra || {}, { id: r.leg_id, who: r.who, label: r.label, type: r.type, game: (r.game || []).slice() });
    const put = (k, v) => { if (!blank(v)) l[k] = v; };
    put('team', r.team);
    put('side', r.side);
    put('line', num(r.line));
    put('player', r.player);
    put('stat', r.stat);
    put('odds', num(r.odds));
    put('group', r.sgp_group);
    put('result', FROM_STATUS[r.status]);
    put('confidence', r.confidence);
    if (r.source && Object.keys(r.source).length) l.source = r.source;
    put('detail', r.detail);
    put('gameDate', r.game_date);
    put('period', r.period);
    put('note', r.note);
    return l;
  });
  w.source = 'db';
  return w;
}

/** The comparable form of a week: what the pages read, with '' / null / absent treated alike and the
 *  page-only `source` tag dropped. Used by the round-trip test and the shadow comparison. */
export function comparableWeek(week) {
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        const c = clean(v[k]);
        if (!blank(c) && !(typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)) out[k] = c;
      }
      return out;
    }
    if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
    return v;
  };
  const w = Object.assign({}, week);
  delete w.source;
  return clean(w);
}
