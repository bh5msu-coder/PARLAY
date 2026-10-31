/** Read-only access to parlay-history.json for the Bets tab.
 *  - Loaded with a single GET. There is no write path: nothing here can send history data to
 *    Supabase or into data/bets.json.
 *  - The parsed object is deep-frozen, so stats code cannot change it by accident. */

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

let cache = null;

/** @param {typeof fetch} [fetchImpl] */
export async function loadHistory(fetchImpl) {
  if (cache) return cache;
  const f = fetchImpl || ((...a) => fetch(...a));
  try {
    const r = await f('/parlay-history.json', { method: 'GET' });
    cache = r.ok ? deepFreeze(await r.json()) : null;
  } catch (e) {
    cache = null;
  }
  return cache;
}

export function cachedHistory() { return cache; }
export function resetHistoryCache() { cache = null; }

/** History legs → stats rows. win/loss/unknown/pending map to won/lost/unknown/open. */
const STATUS = { win: 'won', loss: 'lost', unknown: 'unknown', pending: 'open' };

export function historyLegs(history) {
  const out = [];
  for (const p of (history && history.parlays) || []) {
    for (const l of p.legs || []) {
      out.push({
        week: p.week, who: l.who, type: l.type, label: l.label, kickoff: l.kickoff || null,
        status: STATUS[l.result] || 'unknown', confidence: l.confidence || null,
        ticketResult: p.result === 'loss' ? 'busted' : p.result === 'win' ? 'cashed' : p.result === 'pending' ? 'open' : 'unknown',
      });
    }
  }
  return out;
}

/** Placement evidence from the history's own source notes: a slip photo or share link, or slip odds
 *  plus a to-pay amount. Anything else stays 'unknown' — chat-reported grades are not proof of a wager. */
function historyPlacement(p) {
  const src = String(p.source || '') + ' ' + String(p.notes || '');
  if (/\bslip\b|share link/i.test(src)) return { state: p.result === 'pending' ? 'placed' : 'settled', evidence: 'History cites a slip: ' + p.source };
  if (p.odds != null && p.toPay != null) return { state: p.result === 'pending' ? 'placed' : 'settled', evidence: 'History records slip odds and to-pay.' };
  return { state: 'unknown', evidence: 'History does not cite a slip for this ticket (' + (p.source || 'no source') + ').' };
}

export function historyTickets(history) {
  return ((history && history.parlays) || []).map((p) => ({
    week: p.week,
    label: p.label,
    result: p.result === 'loss' ? 'busted' : p.result === 'win' ? 'cashed' : p.result === 'pending' ? 'open' : 'unknown',
    stake: Number(p.stake) || 0,
    contributions: null, // the history does not record who actually paid in
    payer: p.payer || '',
    ticketState: historyPlacement(p).state,
    evidence: historyPlacement(p).evidence,
    hypotheticalToPay: p.toPay != null ? Number(p.toPay) : null,
    payoutRecorded: p.result === 'loss' ? 0 : null,
    record: p.record || null,
  }));
}
