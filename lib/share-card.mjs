/** Text for the WhatsApp / iMessage link preview of a week. Reads recorded data only (no live scores):
 *  a week is busted or cashed here only when its leg results are written down. */
import { canonicalWho } from './ticket.mjs';

export function weekCardFacts(week, nickOf = (n) => n) {
  if (!week) return null;
  const legs = (week.legs || []).filter((l) => l && l.type !== 'tbd');
  const res = (l) => String(l.result || '').toLowerCase();
  const lost = legs.filter((l) => ['loss', 'lost', 'l'].includes(res(l)));
  const won = legs.filter((l) => ['win', 'won', 'w'].includes(res(l)));
  let status = 'IN PLAY';
  let line = `${legs.length} legs`;
  if (!legs.length) { status = 'PICKS OPEN'; line = 'One bet each'; }
  else if (lost.length) { status = 'BUSTED'; line = `${won.length} of ${legs.length} hit · killed by ${lost.map((l) => nickOf(canonicalWho(l.who) || l.who)).join(', ')}`; }
  else if (won.length === legs.length) { status = 'CASHED'; line = `${legs.length} of ${legs.length} hit`; }
  const odds = Number(week.odds);
  const oddsText = Number.isFinite(odds) && odds ? (odds > 0 ? '+' : '') + odds.toLocaleString('en-US') : '';
  const pay = Number(week.toPay);
  const payText = Number.isFinite(pay) && pay ? '$' + Math.round(pay).toLocaleString('en-US') : '';
  return { week: week.week, status, line, odds: oddsText, pays: payText };
}
