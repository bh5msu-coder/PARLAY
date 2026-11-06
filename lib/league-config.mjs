/** League settings (Supabase week-0 row) are saved as one JSON blob. Saving from a page that loaded
 *  earlier used to write back a stale copy and wipe changes made since (that is how commissioner
 *  nicknames got lost). Every save now re-reads the row and changes only its own keys. Pure. */

export const NICK_MAX = 24;

/** Settings card: replace the fields it edits; keep everything else (nicknames, future keys) from
 *  the fresh row. `you` lives on each phone and is never written. */
export function mergeSettings(fresh, edited) {
  const out = Object.assign({}, fresh || {});
  for (const k of ['leagueName', 'chat', 'roster', 'abstain']) if (edited && edited[k] !== undefined) out[k] = edited[k];
  delete out.you;
  delete out.abstainText;
  return out;
}

/** Nickname edits: { 'Full Name': 'Nick' } where '' clears that manager's nickname. Only the names
 *  in `edits` change; every other saved nickname stays exactly as it was. */
export function mergeNicknames(fresh, edits) {
  const out = Object.assign({}, fresh || {});
  const nicks = Object.assign({}, out.nicknames || {});
  for (const [name, raw] of Object.entries(edits || {})) {
    const n = String(raw == null ? '' : raw).trim().slice(0, NICK_MAX);
    if (n) nicks[name] = n; else delete nicks[name];
  }
  out.nicknames = nicks;
  delete out.you;
  delete out.abstainText;
  return out;
}

/** Only the rows the commissioner actually changed, compared with what is saved. */
export function changedNicknames(saved, draft) {
  const s = saved || {};
  const out = {};
  for (const [name, v] of Object.entries(draft || {})) {
    const a = String(s[name] || '').trim();
    const b = String(v || '').trim().slice(0, NICK_MAX);
    if (a !== b) out[name] = b;
  }
  return out;
}
