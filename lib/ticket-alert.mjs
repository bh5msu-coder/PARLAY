/** "Ticket's full" push to Brad. When the save that completes the ticket lands, the pick API sends
 *  one notification through ntfy (free phone app). Tapping it opens WhatsApp with the whole ticket
 *  written out; Brad picks the group chat and presses send. Nothing posts to the group by itself.
 *  The builders here are pure and tested; sendTicketAlert is the only part that touches the network. */
import { slipText } from './ticket.mjs';
import { waShareHref } from './pick-share.mjs';
import { SITE_URL } from './nudge.mjs';

/** Alert only on the save that takes the ticket from incomplete to complete, so edits after it is
 *  full (or a second import of the same chat) don't ping again. */
export function shouldAlert(before, after) {
  return !!(after && after.complete) && !(before && before.complete);
}

/** The WhatsApp message: the full slip plus a link back to the board. */
export function ticketMessage(ticket, week, opts = {}) {
  return slipText(ticket, week) + `\n\nFull ticket on the Holm board: ${(opts.url || SITE_URL)}/pick`;
}

/** ntfy JSON publish body. Tap = open WhatsApp with the ticket; buttons for WhatsApp and the board. */
export function alertPayload(topic, ticket, week, opts = {}) {
  const url = opts.url || SITE_URL;
  const wa = waShareHref(ticketMessage(ticket, week, { url }));
  const legs = (ticket.legs || []).length;
  return {
    topic,
    title: `Week ${week} ticket is full`,
    message: `All ${legs} picks are in. Tap to send the ticket to the group in WhatsApp.`,
    tags: ['football'],
    priority: 4,
    click: wa,
    actions: [
      { action: 'view', label: 'Send to WhatsApp', url: wa, clear: true },
      { action: 'view', label: 'Open the board', url: `${url}/pick` },
    ],
  };
}

/** Sends the push. Never throws and gives up after 4 seconds, so a slow or down ntfy can't block or
 *  fail a pick save. Returns { sent, status?, error?, skipped? }. */
export async function sendTicketAlert(ticket, week, env = process.env, fetchImpl = fetch) {
  const topic = env.NTFY_TOPIC;
  if (!topic) return { sent: false, skipped: 'NTFY_TOPIC not set' };
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetchImpl(server, { method: 'POST', headers, body: JSON.stringify(alertPayload(topic, ticket, week)), signal: ctl.signal });
    return { sent: r.ok, status: r.status };
  } catch (e) {
    return { sent: false, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}
