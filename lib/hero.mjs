/** The League page's top card: what this week's parlay is doing, in one look. Pure, so it is tested. */
import { isPlaced } from './model.mjs';

const STATE_LABEL = { cashed: 'Cashed', busted: 'Busted', live: 'Live', open: 'To play' };
const STATE_TONE = { cashed: 'win', busted: 'loss', live: 'live', open: 'open' };

/** @param {object|null} summary summarizeParlay output, or null before grading
 *  @param {object|null} ticket deriveTicket output
 *  @param {(who: string) => string} label name to show for a leg's owner */
export function heroFacts(summary, ticket, label) {
  const s = summary || null;
  const state = s ? s.state : 'open';
  const killers = s && s.killers ? s.killers : [];
  const line = s && s.total
    ? `${s.won} of ${s.total} hit` + (killers.length ? ` · killed by ${killers.map(label).join(', ')}` : s.pending ? ` · ${s.pending} to play` : '')
    : 'Picks are coming in';
  const segments = s && s.total
    ? [['win', s.won], ['push', s.pushes], ['live', s.live], ['pending', s.pending], ['loss', s.lost]].filter(([, n]) => n > 0)
    : [];
  // Picks are still wanted only while nothing is decided and no book has the ticket.
  const decided = s ? s.won + s.lost + s.pushes + s.live : 0;
  const wantsPicks = !isPlaced(ticket) && state === 'open' && decided === 0;
  return { state, label: STATE_LABEL[state] || state, tone: STATE_TONE[state] || 'open', line, segments, total: s ? s.total : 0, wantsPicks };
}
