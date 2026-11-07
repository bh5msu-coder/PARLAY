/** The auto-commit: when 11 valid picks are in, /api/pick writes the week's ticket from them. Pure, so the
 *  tests import it directly.
 *
 *  Rules:
 *    - A placed, settled or locked week is never rebuilt. Its legs are what the book took.
 *    - A leg whose pick has not been saved since the ticket was last written, or was saved again unchanged,
 *      keeps the stored leg, so the commissioner's fixes to it (line, label, odds) and its override stay.
 *    - A leg whose pick changed is rebuilt from the pick, and any override on it is dropped: an override
 *      set for the old pick says nothing about the new one.
 *    - A same-game parlay keeps its stored odds and label while it holds the same managers.
 *    - Payments the page merged into contributions for display are never written back. */
import { withoutMergedPayments } from './payments.mjs';
import { canonicalWho } from './ticket.mjs';
import { legSignature } from './weeks.mjs';

export const PROPOSED = { state: 'proposed', evidence: 'Auto-built from 11 saved picks. Not placed at a sportsbook yet.' };

/** True when the stored week must not be rebuilt from picks. */
export function frozenWeek(data) {
  if (!data) return false;
  if (data.locked) return true;
  const s = data.ticket && data.ticket.state;
  return s === 'placed' || s === 'settled';
}

const memberKey = (legs, gid) => legs.filter((l) => l.group === gid).map((l) => canonicalWho(l.who)).sort().join('|');

/**
 * @param {object|null} prev        stored week data (holm_parlay_weeks.data), or null for a new week
 * @param {string|null} prevSavedAt when that row was last written (holm_parlay_weeks.updated_at)
 * @param {{legs: object[], groups: object}} ticket assembleTicket() result for the saved picks
 * @param {Array<{who: string, source?: string, updated_at?: string}>} picks saved picks (holm_parlay_picks rows)
 * @returns {object|null} the week data to write, or null when the week is frozen
 */
export function commitPayload(prev, prevSavedAt, ticket, picks) {
  const before = prev || {};
  if (frozenWeek(before)) return null;
  const writtenAt = Date.parse(prevSavedAt || '');
  const savedAt = new Map((picks || []).map((p) => [canonicalWho(p.who), Date.parse(p.updated_at || '')]));
  const storedByWho = new Map((before.legs || []).map((l) => [canonicalWho(l.who), l]));

  const keptIds = new Set();
  const legs = ticket.legs.map((leg) => {
    const stored = storedByWho.get(leg.who);
    const at = savedAt.get(leg.who);
    const notResaved = !Number.isNaN(writtenAt) && !Number.isNaN(at) && at < writtenAt;
    const unchanged = stored && (notResaved || legSignature(stored) === legSignature(leg));
    if (!unchanged) return leg;
    const kept = Object.assign({}, stored, { who: leg.who });
    keptIds.add(kept.id);
    if (leg.group) kept.group = leg.group; else delete kept.group;
    return kept;
  });

  // Only a kept leg keeps its override. A rebuilt leg can get the same id back (w9-brad), but it is a
  // different pick, so an override set for the old one must not grade it.
  const overrides = {};
  for (const [id, v] of Object.entries(before.overrides || {})) if (keptIds.has(id)) overrides[id] = v;

  const storedGroups = Object.entries(before.groups || {}).map(([gid, g]) => ({ g, members: memberKey(before.legs || [], gid) }));
  const groups = {};
  for (const [gid, g] of Object.entries(ticket.groups || {})) {
    const members = memberKey(legs, gid);
    const match = storedGroups.find((x) => x.members === members);
    groups[gid] = match ? Object.assign({}, g, { label: match.g.label || g.label, odds: match.g.odds != null ? match.g.odds : g.odds }) : g;
  }

  const payload = Object.assign({}, before, {
    stake: before.stake || 10,
    book: before.book || 'DraftKings (MI)',
    ticket: before.ticket && before.ticket.state && before.ticket.state !== 'proposed' ? before.ticket : PROPOSED,
    note: before.note || 'Auto-built from 11 unique manager picks. Same-game bets grouped as SGPs so one Michigan book ticket can take the whole parlay.',
    legs,
    groups,
    overrides,
    submissions: Object.fromEntries((picks || []).map((p) => [canonicalWho(p.who), { source: p.source, at: p.updated_at }])),
  });
  if (Array.isArray(before.contributions)) payload.contributions = withoutMergedPayments(before.contributions);
  delete payload.week;
  delete payload.source;
  return payload;
}
