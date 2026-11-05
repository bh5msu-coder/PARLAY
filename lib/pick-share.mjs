/** Sharing a saved pick to the group chat, and keeping an unsaved pick on the phone until it saves.
 *  Pure (storage is passed in), so it is tested. Nothing here sends anything: the user taps the link. */
import { waBlock } from './pick-form.mjs';
import { SITE_URL } from './nudge.mjs';

/** The chat message for a pick that is already saved on the board. It is a HOLM PICK block, so if
 *  someone later pastes the chat into the importer it is recognised as a duplicate, not a new pick. */
export function savedPickText(week, row, opts = {}) {
  if (!row || !row.leg) return '';
  const url = (opts.url || SITE_URL) + '/pick';
  return waBlock(week, row.who, row.leg) + `\n\nSaved on the Holm board: ${url}`;
}

/** wa.me opens WhatsApp's own chat picker; the user chooses the chat and presses send. */
export function waShareHref(text) {
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}

/** "Saved Tue 2:33 PM" in the viewer's time zone, or '' if there is no time. */
export function savedAtLabel(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: opts.timeZone });
  return 'Saved ' + fmt.format(d).replace(',', '');
}

export const PENDING_KEY = 'hp_pending_pick';

/** Keep a pick that has not reached the server yet. One per device: the newest wins. */
export function keepPending(storage, pick) {
  try { storage.setItem(PENDING_KEY, JSON.stringify(Object.assign({}, pick, { keptAt: new Date().toISOString() }))); return true; } catch (e) { return false; }
}

/** The kept pick for this week, or null. Picks kept for another week are dropped. */
export function readPending(storage, week) {
  let p = null;
  try { p = JSON.parse(storage.getItem(PENDING_KEY) || 'null'); } catch (e) { p = null; }
  if (!p || !p.who || !p.leg) return null;
  if (week && Number(p.week) !== Number(week)) { clearPending(storage); return null; }
  return p;
}

export function clearPending(storage) {
  try { storage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
}

/** Should a failed save be kept for retry? Network errors and server trouble yes; a rule
 *  rejection (bad pick, locked game, duplicate) no, because retrying would fail the same way. */
export function shouldKeep(status) {
  return !status || status >= 500 || status === 408 || status === 429;
}
