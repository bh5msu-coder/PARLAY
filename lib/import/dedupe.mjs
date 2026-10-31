/** De-duplicate imported picks against each other and against picks already saved.
 *
 *  Key: (season, week, manager). Within that key:
 *    - same message (rawHash) seen twice        → duplicate, dropped
 *    - same market (lib/ticket.mjs marketKey)   → duplicate, dropped (nothing to change)
 *    - different market                         → conflict, handled by the `importConflict` policy:
 *        'flag'       (default) save nothing for that manager and report the conflict
 *        'keep-saved' keep the saved pick; report the incoming one as a conflict
 *        'latest'     take the newest message (by messageAt) and overwrite
 *  The policy is a league rule placeholder (lib/rules.mjs) because the site has not been told one. */
import { canonicalWho, marketKey } from '../ticket.mjs';
import { IMPORT_CONFLICT_POLICIES } from '../rules.mjs';

const keyOf = (p) => [p.season, p.week, canonicalWho(p.who)].join('|');
const atOf = (p) => (p.source && p.source.messageAt) || '';

/**
 * @param {Array} incoming parsed picks ({season, week, who, leg, source})
 * @param {Array} saved    picks already stored ({season?, week?, who, leg, source?, updated_at?})
 * @param {{policy?: string, season?: number, week?: number}} [opts]
 * @returns {{accepted: Array, duplicates: Array, conflicts: Array}}
 */
export function dedupePicks(incoming, saved, opts) {
  opts = opts || {};
  const policy = IMPORT_CONFLICT_POLICIES.includes(opts.policy) ? opts.policy : 'flag';
  const duplicates = [];
  const conflicts = [];

  // 1. collapse repeats inside the batch
  const seenHash = new Set();
  const byKey = new Map();
  for (const p of incoming || []) {
    const h = p.source && p.source.rawHash;
    if (h && seenHash.has(h)) { duplicates.push({ pick: p, reason: 'Same message appears twice in the paste' }); continue; }
    if (h) seenHash.add(h);
    const k = keyOf(p);
    if (!byKey.has(k)) byKey.set(k, []);
    const list = byKey.get(k);
    if (list.some((q) => marketKey(q.leg) === marketKey(p.leg))) { duplicates.push({ pick: p, reason: 'Same pick posted again' }); continue; }
    list.push(p);
  }

  // 2. one candidate per manager
  const candidates = [];
  for (const list of byKey.values()) {
    if (list.length === 1) { candidates.push(list[0]); continue; }
    if (policy === 'latest') {
      const sorted = list.slice().sort((a, b) => atOf(a).localeCompare(atOf(b)));
      const newest = sorted[sorted.length - 1];
      for (const p of sorted.slice(0, -1)) conflicts.push({ pick: p, other: newest, reason: 'Replaced by a newer message (policy: latest)', resolved: true });
      candidates.push(newest);
    } else {
      for (const p of list) conflicts.push({ pick: p, others: list.filter((q) => q !== p), reason: `${canonicalWho(p.who)} posted ${list.length} different picks in this paste; nothing saved for them until the commissioner picks one` });
    }
  }

  // 3. against saved picks
  const savedByKey = new Map();
  for (const s of saved || []) {
    const k = [s.season || opts.season, s.week || opts.week, canonicalWho(s.who)].join('|');
    savedByKey.set(k, s);
  }
  const accepted = [];
  for (const p of candidates) {
    const s = savedByKey.get(keyOf(p));
    if (!s) { accepted.push(p); continue; }
    if (marketKey(s.leg || {}) === marketKey(p.leg)) { duplicates.push({ pick: p, reason: 'Already saved' }); continue; }
    if (policy === 'latest') { accepted.push(Object.assign({}, p, { replaces: s })); continue; }
    conflicts.push({
      pick: p,
      saved: s,
      reason: policy === 'keep-saved'
        ? `${canonicalWho(p.who)} already has a saved pick (${(s.leg && s.leg.label) || 'saved'}); kept it (policy: keep-saved)`
        : `${canonicalWho(p.who)} already has a different saved pick (${(s.leg && s.leg.label) || 'saved'}); not overwritten`,
    });
  }
  return { accepted, duplicates, conflicts };
}
