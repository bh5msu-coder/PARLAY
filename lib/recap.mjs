/** Weekly recap text, generated only from settled results. A week whose ticket is still open, or
 *  whose results are not recorded, gets a short "not settled" note instead of a recap. Unknown legs
 *  are named as unknown; they are never reported as wins or losses. Payout amounts are labeled
 *  hypothetical unless a payout was recorded. */
import { whoLabel } from './ident.mjs';

const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

/**
 * @param {{week: number, label?: string, result: 'busted'|'cashed'|'open'|'unknown', stake?: number,
 *   hypotheticalToPay?: number|null, payoutRecorded?: number|null, ticketState?: string,
 *   legs: Array<{who: string, label: string, status: string}>}} t
 * @param {string} source where the record came from
 * @returns {{settled: boolean, title: string, text: string, lines: string[], source: string}}
 */
export function buildRecap(t, source) {
  const name = t.label || `Week ${t.week}`;
  const legs = t.legs || [];
  const won = legs.filter((l) => l.status === 'won');
  const lost = legs.filter((l) => l.status === 'lost');
  const unknown = legs.filter((l) => l.status === 'unknown');
  const open = legs.filter((l) => l.status === 'open');
  if (t.result !== 'busted' && t.result !== 'cashed') {
    const why = t.result === 'open' ? `${open.length} pick${open.length === 1 ? '' : 's'} still to play` : 'results are not recorded yet';
    return { settled: false, title: `${name}: not settled`, text: `${name} isn't settled — ${why}. No recap until it is.`, lines: [], source };
  }
  const lines = [];
  if (t.result === 'busted') {
    lines.push(`${name} busted, ${won.length}–${lost.length}.`);
    lines.push(`Killed by ${list(lost.map((l) => `${whoLabel(l.who)} (${l.label})`))}.`);
  } else {
    lines.push(`${name} CASHED, ${won.length}–0.`);
  }
  if (won.length) lines.push(`Came through: ${list(won.map((l) => whoLabel(l.who)))}.`);
  if (unknown.length) lines.push(`${unknown.length} pick${unknown.length === 1 ? '' : 's'} with no recorded result: ${list(unknown.map((l) => whoLabel(l.who)))} — left out of the count.`);
  if (t.stake) lines.push(`Stake listed ${money(t.stake)}.`);
  if (t.result === 'cashed') {
    lines.push(t.payoutRecorded ? `Payout recorded: ${money(t.payoutRecorded)}.` : t.hypotheticalToPay ? `Slip said ${money(t.hypotheticalToPay)} — hypothetical until a payout is recorded.` : 'No payout recorded yet.');
  } else if (t.hypotheticalToPay) {
    lines.push(`It would have paid ${money(t.hypotheticalToPay)} (hypothetical).`);
  }
  if (t.ticketState && t.ticketState !== 'placed' && t.ticketState !== 'settled') lines.push('Note: nothing recorded shows this ticket was placed at a sportsbook.');
  return { settled: true, title: `${name} recap`, text: lines.join(' '), lines, source };
}
