/** Sportsbook slip import: read slip data (JSON or pasted text) and match each slip leg to a saved pick.
 *  A slip leg that matches no pick, or matches two picks equally well, is reported — never guessed.
 *  A fully matched slip is evidence the ticket was placed; it does not grade anything. */
import { canonicalWho } from '../ticket.mjs';
import { mentionsTeam, normalizeAbbr } from './nfl-teams.mjs';

const MONEY = /\$\s*([\d,]+(?:\.\d{1,2})?)/;
const ODDS = /(?:^|\s)([+\-\u2212]\d{3,6})(?=\s|$)/;
const BOOKS = /\b(DraftKings|FanDuel|BetMGM|Caesars|ESPN ?BET)\b/i;

function money(s) { const m = String(s).match(MONEY); return m ? Number(m[1].replace(/,/g, '')) : null; }
function odds(s) { const m = String(s).match(ODDS); return m ? Number(m[1].replace('\u2212', '-')) : null; }

/** @returns {{legs: Array<{text: string, odds: number|null, lineNo: number}>, stake: number|null, toPay: number|null, odds: number|null, book: string, errors: Array}} */
export function parseSlip(input) {
  const out = { legs: [], stake: null, toPay: null, odds: null, book: '', errors: [] };
  if (input == null || (typeof input === 'string' && !input.trim())) {
    out.errors.push({ line: 0, reason: 'Nothing to import: the slip is empty' });
    return out;
  }
  let data = input;
  if (typeof input === 'string' && /^\s*[[{]/.test(input)) {
    try { data = JSON.parse(input); } catch (e) { out.errors.push({ line: 0, reason: 'Slip looks like JSON but does not parse: ' + e.message }); return out; }
  }
  if (typeof data === 'object') {
    const legs = Array.isArray(data) ? data : data.legs;
    if (!Array.isArray(legs)) { out.errors.push({ line: 0, reason: 'Slip JSON needs a "legs" array' }); return out; }
    legs.forEach((l, i) => {
      const text = typeof l === 'string' ? l : (l && (l.label || l.text || l.selection)) || '';
      if (!text) out.errors.push({ line: i + 1, reason: 'Slip leg has no label' });
      else out.legs.push({ text: String(text), odds: l && l.odds != null && !isNaN(Number(l.odds)) ? Number(l.odds) : odds(text), lineNo: i + 1 });
    });
    if (!Array.isArray(data)) {
      out.stake = data.stake != null ? Number(data.stake) : null;
      out.toPay = data.toPay != null ? Number(data.toPay) : null;
      out.odds = data.odds != null ? Number(data.odds) : null;
      out.book = data.book || '';
    }
    return out;
  }
  String(input).replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const book = line.match(BOOKS);
    if (book && !out.book) out.book = book[1];
    if (/\b(wager|stake|risk|bet amount)\b/i.test(line) && money(line) != null) { out.stake = money(line); return; }
    if (/\b(to pay|to win|payout|potential)\b/i.test(line) && money(line) != null) { out.toPay = money(line); return; }
    if (/\b(\d+\s*(?:leg|pick)|parlay|sgp\+?)\b/i.test(line) && odds(line) != null && !out.odds) { out.odds = odds(line); return; }
    if (book && line.length < 30) return;
    out.legs.push({ text: line, odds: odds(line), lineNo: i + 1 });
  });
  if (!out.legs.length) out.errors.push({ line: 0, reason: 'No legs found on the slip' });
  return out;
}

const num = (s) => { const m = String(s).replace('\u2212', '-').match(/[+-]?\d+(?:\.\d+)?/g); return m ? m.map(Number) : []; };

function score(slipText, pick) {
  const leg = pick.leg || {};
  const t = slipText.toLowerCase();
  let s = 0;
  const reasons = [];
  const game = (leg.game || []).map(normalizeAbbr);
  if ((leg.type === 'ml' || leg.type === 'spread') && leg.team) {
    if (mentionsTeam(slipText, normalizeAbbr(leg.team), game)) { s += 3; reasons.push('team'); } else return { s: 0 };
  }
  if (leg.type === 'total') {
    const named = game.filter((g) => mentionsTeam(slipText, g, game)).length;
    if (named) { s += 2; reasons.push('game'); }
    const side = String(leg.side || '').toLowerCase();
    if (side && new RegExp('\\b' + side + '\\b').test(t)) { s += 1; reasons.push('side'); } else return { s: 0 };
  }
  if (leg.type === 'player' && leg.player) {
    const last = String(leg.player).trim().split(/\s+/).pop().toLowerCase();
    if (last.length > 1 && t.includes(last)) { s += 3; reasons.push('player'); } else return { s: 0 };
  }
  if (leg.line !== '' && leg.line != null && !isNaN(Number(leg.line))) {
    const nums = num(slipText).map(Math.abs);
    if (nums.includes(Math.abs(Number(leg.line)))) { s += 2; reasons.push('line'); } else if (leg.type !== 'ml') return { s: 0 };
  }
  if (leg.type === 'ml' && /\b(ml|moneyline|to win)\b/i.test(slipText)) { s += 1; reasons.push('moneyline'); }
  return { s, reasons };
}

/**
 * Match slip legs to saved picks (one pick per slip leg, one slip leg per pick).
 * @param {ReturnType<typeof parseSlip>} slip
 * @param {Array<{who: string, leg: object}>} picks
 */
export function matchSlip(slip, picks) {
  const pairs = [];
  slip.legs.forEach((sl, si) => (picks || []).forEach((p, pi) => {
    const r = score(sl.text, p);
    if (r.s >= 3) pairs.push({ si, pi, s: r.s, reasons: r.reasons });
  }));
  const bySlip = new Map();
  for (const pr of pairs) { if (!bySlip.has(pr.si)) bySlip.set(pr.si, []); bySlip.get(pr.si).push(pr); }
  const matched = [];
  const unmatchedSlip = [];
  const usedPick = new Set();
  const order = slip.legs.map((_, i) => i).sort((a, b) => Math.max(0, ...(bySlip.get(b) || []).map((x) => x.s)) - Math.max(0, ...(bySlip.get(a) || []).map((x) => x.s)));
  for (const si of order) {
    const options = (bySlip.get(si) || []).filter((x) => !usedPick.has(x.pi)).sort((a, b) => b.s - a.s);
    const sl = slip.legs[si];
    if (!options.length) { unmatchedSlip.push({ slipLeg: sl, reason: 'No saved pick matches this slip leg' }); continue; }
    if (options[1] && options[1].s === options[0].s) {
      unmatchedSlip.push({ slipLeg: sl, reason: 'Matches more than one pick: ' + options.filter((o) => o.s === options[0].s).map((o) => canonicalWho(picks[o.pi].who)).join(', ') });
      continue;
    }
    usedPick.add(options[0].pi);
    matched.push({ slipLeg: sl, pick: picks[options[0].pi], why: options[0].reasons });
  }
  const unmatchedPicks = (picks || []).filter((_, i) => !usedPick.has(i)).map((p) => ({ pick: p, reason: 'Not found on the slip' }));
  matched.sort((a, b) => a.slipLeg.lineNo - b.slipLeg.lineNo);
  const complete = matched.length > 0 && !unmatchedSlip.length && !unmatchedPicks.length && !slip.errors.length;
  return {
    matched, unmatchedSlip, unmatchedPicks, complete,
    ticket: { stake: slip.stake, toPay: slip.toPay, odds: slip.odds, book: slip.book },
  };
}

/** Ticket fields a fully matched slip supports. Returns null unless every leg matched. */
export function slipEvidence(result, importedAt) {
  if (!result.complete) return null;
  const t = result.ticket;
  return {
    state: 'placed',
    evidence: `Sportsbook slip imported ${String(importedAt || '').slice(0, 10)}: ${result.matched.length} legs matched${t.book ? ' · ' + t.book : ''}.`,
    book: t.book || undefined,
    odds: t.odds != null ? t.odds : undefined,
    toPay: t.toPay != null ? t.toPay : undefined,
    stake: t.stake != null ? t.stake : undefined,
  };
}
