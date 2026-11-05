/** "Who hasn't picked" nudge for the group chat. Pure, so it is tested. */

export const SITE_URL = 'https://holm-parlay.vercel.app';

/** Roster names with no saved pick this week. */
export function missingPickers(roster, submissions) {
  const inSet = new Set((submissions || []).map((s) => s.who));
  return (roster || []).filter((n) => !inSet.has(n));
}

/** The message text. `nick` turns a canonical name into what the chat calls them. */
export function nudgeText(week, missing, nick, opts = {}) {
  const url = (opts.url || SITE_URL) + '/pick';
  const n = missing.length;
  if (!n) return `Week ${week} parlay: all picks are in. Ticket is ready at ${url}`;
  const names = missing.map((m) => '@' + nick(m));
  const lead = n === 1 ? `Week ${week} parlay is waiting on one pick: ${names[0]}.` : `Week ${week} parlay still needs ${n} picks: ${names.join(', ')}.`;
  const lock = opts.kick ? ` Picks lock at kickoff (${opts.kick}).` : ' Picks lock at kickoff.';
  return `${lead}${lock} Tap a line here: ${url}`;
}

/** WhatsApp share link (opens the chat picker on phones, WhatsApp Web on desktop). */
export function nudgeHref(text) {
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}
