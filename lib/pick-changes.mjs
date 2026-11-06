/** Pick changes: turn holm_parlay_pick_history rows (one per save) into a per-manager story.
 *  Pure. Rows: { who, leg, source, saved_at, op } newest last. */

function key(leg) {
  if (!leg) return '';
  return [leg.type, leg.label, leg.line, leg.odds, leg.player, leg.side].map((x) => String(x == null ? '' : x)).join('|');
}

export function pickChanges(rows) {
  const by = new Map();
  const sorted = (rows || []).slice().sort((a, b) => String(a.saved_at).localeCompare(String(b.saved_at)));
  for (const r of sorted) {
    if (!by.has(r.who)) by.set(r.who, []);
    const list = by.get(r.who);
    const prev = list[list.length - 1];
    if (r.op === 'delete') { list.push({ kind: 'cleared', at: r.saved_at, label: prev ? prev.label : '', source: r.source }); continue; }
    const label = (r.leg && r.leg.label) || '';
    if (prev && prev.kind !== 'cleared' && prev.k === key(r.leg)) continue;
    list.push({ kind: prev && prev.kind !== 'cleared' ? 'changed' : 'saved', at: r.saved_at, label, from: prev && prev.kind !== 'cleared' ? prev.label : '', source: r.source || '', k: key(r.leg) });
  }
  const out = [];
  for (const [who, events] of by) {
    out.push({ who, events: events.map(({ k, ...e }) => e), changes: events.filter((e) => e.kind === 'changed').length });
  }
  out.sort((a, b) => b.changes - a.changes || String(b.events[b.events.length - 1].at).localeCompare(String(a.events[a.events.length - 1].at)));
  return out;
}

/** Fallback before the history table exists: one 'saved' event per current pick. */
export function changesFromCurrent(picks) {
  return (picks || []).map((p) => ({ who: p.who, changes: 0, events: [{ kind: 'saved', at: p.updated_at || (p.leg && p.leg.source && p.leg.source.savedAt) || '', label: (p.leg && p.leg.label) || '', source: p.source || '' }] }))
    .sort((a, b) => String(b.events[0].at).localeCompare(String(a.events[0].at)));
}
