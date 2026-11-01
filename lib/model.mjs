/** League data model (schemaVersion 2). Pure helpers shared by the pages, API routes and scripts.
 *
 *  Three things are deliberately kept apart, in data and in the UI:
 *    1. pick saved            — a manager's selection is stored (Supabase holm_parlay_picks or week.submissions)
 *    2. contribution recorded — money a manager put in is written down (week.contributions)
 *    3. ticket placed         — a sportsbook accepted the wager (week.ticket.state is placed or settled,
 *                               with week.ticket.evidence saying how we know)
 *  None of them implies another. A complete set of saved picks is a *proposed* ticket, not a placed one.
 *
 *  Sources of truth:
 *    - data/bets.json is the only record that adds or grades a week.
 *    - parlay-history.json is a read-only history for the Bets tab. Nothing here copies its grades into
 *      weekly data or sends it anywhere.
 *
 *  @typedef {{id: string, name: string, nick?: string, aliases?: string[], parlay?: boolean, abstain?: boolean}} Player
 *  @typedef {'open'|'won'|'lost'|'unknown'|'void'|'push'} LegStatus
 *  @typedef {'espn-final'|'espn-consensus-line'|'inferred-margin'} Confidence
 *  @typedef {{kind: 'bets.json'|'whatsapp'|'web'|'slip'|'commissioner', ref?: string, author?: string, messageAt?: string, lineNo?: number, rawHash?: string}} RecordSource
 *  @typedef {{id?: string, who: string, label: string, type: string, game: string[], result?: string, confidence?: Confidence|null, source?: RecordSource}} Leg
 *  @typedef {'proposed'|'placed'|'settled'} TicketState
 *  @typedef {{state: TicketState, evidence: string, book?: string, odds?: number|string, toPay?: number|string, placedBy?: string}} Ticket
 *  @typedef {{who: string, amount: number, recordedAt: string, source: RecordSource, note?: string}} Payment
 *  @typedef {{amount: number, recordedAt: string, source: RecordSource, note?: string}} Payout
 */
import { terminalState } from './weeks.mjs';

export const SCHEMA_VERSION = 2;

/** `push` is kept because the grader and commissioner overrides already support it. How a push or
 *  void changes the payout is an open rule question (see lib/rules.mjs). */
export const LEG_STATUSES = ['open', 'won', 'lost', 'unknown', 'void', 'push'];
export const TICKET_STATES = ['proposed', 'placed', 'settled'];
export const CONFIDENCE = ['espn-final', 'espn-consensus-line', 'inferred-margin'];
export const SOURCE_KINDS = ['bets.json', 'whatsapp', 'web', 'slip', 'commissioner'];

const DECIDED = new Set(['won', 'lost', 'push', 'void']);

/** Status of a stored leg. Recorded results win; `unknown` stays unknown; anything else is open.
 *  @returns {LegStatus} */
export function legStatus(leg, week) {
  const recorded = terminalState(leg && leg.result);
  if (recorded) return recorded;
  if (!leg || leg.type === 'tbd') return 'unknown';
  if (leg.result === 'unknown') return 'unknown';
  if (week && (week.results === 'unknown' || week.results === 'pending')) return 'unknown';
  return 'open';
}

/** Map a grader state (won/lost/push/void/live/pending/unknown) to a model status. */
export function statusFromGrade(state) {
  if (DECIDED.has(state)) return state;
  if (state === 'unknown') return 'unknown';
  return 'open';
}

export function isDecided(status) {
  return status === 'won' || status === 'lost';
}

/** Hit rate over decided legs only: wins / (wins + losses). Open, unknown, push and void legs are
 *  reported separately and never counted. */
export function hitRate(statuses) {
  let won = 0, lost = 0, open = 0, unknown = 0, other = 0;
  for (const s of statuses) {
    if (s === 'won') won++;
    else if (s === 'lost') lost++;
    else if (s === 'open') open++;
    else if (s === 'unknown') unknown++;
    else other++;
  }
  const n = won + lost;
  return { won, lost, open, unknown, other, n, rate: n ? won / n : null };
}

/** Ticket state from explicit evidence only. Never infer "placed" from a complete set of picks.
 *  @returns {Ticket} */
export function deriveTicket(week) {
  if (week && week.ticket && TICKET_STATES.includes(week.ticket.state)) return week.ticket;
  const legs = (week && week.legs) || [];
  const statuses = legs.map((l) => legStatus(l, week));
  const allDecided = legs.length > 0 && statuses.every((s) => DECIDED.has(s));
  // Graded legs do not prove a book took the wager; placement needs its own evidence.
  const hasOdds = week && week.odds !== '' && week.odds != null;
  const hasToPay = week && week.toPay !== '' && week.toPay != null;
  if (hasOdds && hasToPay) {
    const evidence = 'Slip odds and to-pay amount are recorded.';
    return allDecided ? { state: 'settled', evidence: evidence + ' Every leg has a recorded result.' } : { state: 'placed', evidence };
  }
  if (allDecided) {
    return { state: 'proposed', evidence: 'Every leg has a recorded result, but nothing recorded shows the ticket was placed (no slip odds or to-pay amount).' };
  }
  return { state: 'proposed', evidence: legs.length ? 'Picks are listed, but no slip, odds or payout is recorded.' : 'No picks recorded.' };
}

export function isPlaced(ticket) {
  return !!ticket && (ticket.state === 'placed' || ticket.state === 'settled');
}

/** The three separate facts about a week. `picksSaved` counts saved selections (submissions or legs),
 *  `contributionsRecorded` sums recorded payments, and `ticket` says whether a book took the wager. */
export function weekStates(week, savedPicks) {
  const legs = (week && week.legs) || [];
  const ticket = deriveTicket(week);
  // A placed ticket's legs are the picks: site submissions for that week no longer count.
  const saved = isPlaced(ticket) ? legs.filter((l) => l.type !== 'tbd').length
    : Array.isArray(savedPicks) ? savedPicks.length
    : week && week.submissions ? Object.keys(week.submissions).length
      : legs.filter((l) => l.type !== 'tbd').length;
  const contributions = (week && week.contributions) || [];
  const recorded = contributions.reduce((a, c) => a + (Number(c.amount) || 0), 0);
  return {
    picksSaved: saved,
    contributionsRecorded: { count: contributions.length, amount: recorded },
    ticket,
  };
}

/** Money for a week. `recorded` comes from written-down payments and payouts only. `hypothetical`
 *  is what the slip says it would pay; it is never counted as money won. */
export function weekMoney(week) {
  const stake = Number(week && week.stake) || 0;
  const contributions = ((week && week.contributions) || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
  const payouts = ((week && week.payouts) || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const toPay = week && week.toPay !== '' && week.toPay != null ? Number(week.toPay) : null;
  return {
    stake,
    recorded: { contributions, payouts },
    hypothetical: { toPay: toPay != null && !isNaN(toPay) ? toPay : null },
  };
}

/** Normalize a v1 or v2 week to the v2 shape without changing any recorded result. */
export function toV2Week(week) {
  const w = Object.assign({}, week);
  if (!w.ticket || !TICKET_STATES.includes(w.ticket.state)) w.ticket = deriveTicket(week);
  if (!Array.isArray(w.contributions)) w.contributions = [];
  if (!Array.isArray(w.payouts)) w.payouts = [];
  return w;
}

/** Players from league lore (or the fallback roster), as model records. */
export function playersFrom(people) {
  return (people || []).map((p) => ({ id: p.id, name: p.name, nick: p.nick || '', aliases: p.aliases || [], parlay: !!p.parlay, abstain: !!p.abstain }));
}
