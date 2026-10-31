/** Compare the weekly record (data/bets.json) with the read-only history (parlay-history.json) and
 *  list every place they disagree. This only reports. It never copies a grade, payer or stake from one
 *  source into the other, and it does not decide which one is right — the commissioner does.
 *  Inputs are not mutated. */
import { canonicalWho } from './ticket.mjs';
import { legStatus } from './model.mjs';
import { normalizeAbbr } from './import/nfl-teams.mjs';

/** Severity: `money` (stake, payer), `result` (grades), `pick` (a different selection), `wording`
 *  (same selection, different label text). */
export const SEVERITY_ORDER = ['money', 'result', 'pick', 'wording'];

/** True when both legs carry the same structured selection (type, team, side, line, player). */
function samePick(a, b) {
  if (!a.type || !b.type || a.type === 'tbd' || a.type !== b.type) return false;
  const eq = (x, y) => (x == null || x === '' || y == null || y === '') ? true : String(x).toLowerCase() === String(y).toLowerCase();
  const last = (n) => String(n || '').trim().split(/\s+/).pop();
  const lineEq = (a.line == null || a.line === '' || b.line == null || b.line === '') ? true : Number(a.line) === Number(b.line);
  return eq(normalizeAbbr(a.team) || a.team, normalizeAbbr(b.team) || b.team) && eq(a.side, b.side) && lineEq && eq(last(a.player), last(b.player));
}

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US');

function recordOf(week) {
  const r = { win: 0, loss: 0, unknown: 0, open: 0 };
  for (const l of week.legs || []) {
    const s = legStatus(l, week);
    if (s === 'won') r.win++;
    else if (s === 'lost') r.loss++;
    else if (s === 'unknown') r.unknown++;
    else r.open++;
  }
  return r;
}

const recText = (r) => `${r.win}–${r.loss}` + (r.unknown ? ` · ${r.unknown} unknown` : '') + (r.open ? ` · ${r.open} open` : '') + (r.pending ? ` · ${r.pending} pending` : '');

/**
 * @param {{weeks: Array}} weekly normalized data/bets.json
 * @param {{parlays: Array}} history parsed parlay-history.json
 * @returns {{items: Array<{kind: string, week: number|null, message: string, weekly?: any, history?: any}>, totals: object}}
 */
export function reconcile(weekly, history) {
  const items = [];
  const weeks = (weekly && weekly.weeks) || [];
  const parlays = (history && history.parlays) || [];
  const wByNum = new Map(weeks.map((w) => [Number(w.week), w]));
  const hByNum = new Map(parlays.map((p) => [Number(p.week), p]));

  for (const p of parlays) {
    if (!wByNum.has(Number(p.week))) {
      items.push({ kind: 'week-missing-weekly', severity: 'money', week: p.week, message: `Week ${p.week} is in the history (${money(p.stake)} stake, ${recText(p.record || {})}) but not in data/bets.json.`, history: { stake: p.stake, record: p.record } });
    }
  }
  for (const w of weeks) {
    if (!hByNum.has(Number(w.week))) {
      items.push({ kind: 'week-missing-history', severity: 'money', week: w.week, message: `Week ${w.week} is in data/bets.json but not in the history.`, weekly: { stake: w.stake } });
    }
  }

  for (const w of weeks) {
    const p = hByNum.get(Number(w.week));
    if (!p) continue;
    const n = w.week;
    if (Number(w.stake || 0) !== Number(p.stake || 0)) {
      items.push({ kind: 'stake', severity: 'money', week: n, message: `Week ${n} stake: ${money(w.stake)} in data/bets.json vs ${money(p.stake)} in the history.`, weekly: w.stake, history: p.stake });
    }
    const wr = recordOf(w);
    const hr = p.record || {};
    if (wr.win !== (hr.win || 0) || wr.loss !== (hr.loss || 0)) {
      items.push({ kind: 'result', severity: 'result', week: n, message: `Week ${n} result: ${recText(wr)} in data/bets.json vs ${recText(hr)} in the history. The weekly record is what grades the week; the history grade is not copied.`, weekly: wr, history: hr });
    }
    // A recorded payer may differ from the history's: not every manager lives where betting is legal, so
    // who fronts the stake is not a data conflict. The site names the ESPN last-place manager (not Heller).
    const hLegs = new Map((p.legs || []).map((l) => [canonicalWho(l.who), l]));
    for (const l of w.legs || []) {
      const who = canonicalWho(l.who);
      const h = hLegs.get(who);
      if (!h) { items.push({ kind: 'leg-missing-history', severity: 'pick', week: n, message: `Week ${n}: ${who}'s pick "${l.label}" is not in the history.`, weekly: l.label }); continue; }
      const wl = String(l.label || '').trim().toLowerCase();
      const hl = String(h.label || '').trim().toLowerCase();
      if (l.type === 'tbd' || wl !== hl) {
        const wording = l.type !== 'tbd' && samePick(l, h);
        items.push({ kind: wording ? 'leg-wording' : 'leg-pick', severity: wording ? 'wording' : 'pick', week: n, message: `Week ${n}: ${who} is "${l.label}"${l.type === 'tbd' ? ' (pick not recorded)' : ''} in data/bets.json vs "${h.label}" in the history.`, weekly: l.label, history: h.label });
      }
      hLegs.delete(who);
    }
    for (const [who, h] of hLegs) {
      items.push({ kind: 'leg-missing-weekly', severity: 'pick', week: n, message: `Week ${n}: ${who}'s pick "${h.label}" is in the history but not in data/bets.json.`, history: h.label });
    }
  }

  const weeklyStake = weeks.reduce((a, w) => a + Number(w.stake || 0), 0);
  const historyStake = parlays.filter((p) => p.result !== 'pending').reduce((a, p) => a + Number(p.stake || 0), 0);
  const historyAll = parlays.reduce((a, p) => a + Number(p.stake || 0), 0);
  const totals = {
    weekly: { weeks: weeks.map((w) => w.week), stake: weeklyStake },
    history: { weeks: parlays.map((p) => p.week), gradedStake: historyStake, allStake: historyAll },
  };
  if (weeklyStake !== historyStake) {
    items.unshift({
      kind: 'stake-total',
      severity: 'money',
      week: null,
      message: `Stakes: Standings sums ${money(weeklyStake)} from data/bets.json (Weeks ${totals.weekly.weeks.join(', ')}, including open weeks). Bets sums ${money(historyStake)} from parlay-history.json (graded tickets only: Weeks ${parlays.filter((p) => p.result !== 'pending').map((p) => p.week).join(', ')}). Neither total has been reconciled.`,
      weekly: weeklyStake,
      history: historyStake,
    });
  }
  items.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return { items, totals };
}
