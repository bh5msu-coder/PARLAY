/** Smack-talk feed for the Chat tab. Every item is built from a recorded result (a busted or cashed
 *  ticket, a decided-pick streak, a rivalry's decided picks) and says where it came from. Nothing is
 *  posted anywhere: items become drafts or WhatsApp share links, like the rest of Chat. */
import { RIVALRIES, ident, whoLabel } from './ident.mjs';
import { selectionStats } from './stats.mjs';
import { buildRecap } from './recap.mjs';

/**
 * @param {{legs: Array, tickets: Array, source: string}} record one source (history or weekly)
 * @returns {Array<{id: string, kind: string, text: string, source: string, week?: number}>}
 */
export function smackFeed(record) {
  const { legs = [], tickets = [], source } = record || {};
  const items = [];
  for (const t of tickets.slice().sort((a, b) => b.week - a.week)) {
    const r = buildRecap(Object.assign({}, t, { legs: legs.filter((l) => l.week === t.week) }), source);
    if (!r.settled) continue;
    const lost = legs.filter((l) => l.week === t.week && l.status === 'lost');
    if (t.result === 'busted' && lost.length === 1) items.push({ id: `solo-${t.week}`, kind: 'bust', week: t.week, source, text: `${t.label || 'Week ' + t.week}: ${whoLabel(lost[0].who)} single-handedly busted it with ${lost[0].label}. Everyone else did their job.` });
    else items.push({ id: `recap-${t.week}`, kind: 'recap', week: t.week, source, text: r.text });
  }
  const rows = selectionStats(legs);
  for (const r of rows) {
    if (r.streak.current.startsWith('L') && Number(r.streak.current.slice(1)) >= 3) items.push({ id: `cold-${r.who}`, kind: 'streak', source, text: `${whoLabel(r.who)} has lost ${r.streak.current.slice(1)} straight picks. Maybe sit one out.` });
    if (r.streak.current.startsWith('W') && Number(r.streak.current.slice(1)) >= 3) items.push({ id: `hot-${r.who}`, kind: 'streak', source, text: `${whoLabel(r.who)} has hit ${r.streak.current.slice(1)} straight. Ride the streak or fade it.` });
  }
  const byPerson = (id) => {
    const p = ident.people.find((x) => x.id === id);
    return p ? rows.find((r) => ident.canonical(r.who) === p.name) : null;
  };
  for (const rv of RIVALRIES) {
    if (rv.a === rv.b) continue;
    const a = byPerson(rv.a), b = byPerson(rv.b);
    if (!a || !b || !a.hit.n || !b.hit.n || a.hit.rate === b.hit.rate) continue;
    const [hi, lo] = a.hit.rate > b.hit.rate ? [a, b] : [b, a];
    items.push({ id: `rival-${rv.a}-${rv.b}`, kind: 'rivalry', source, text: `${rv.title}, parlay edition: ${whoLabel(hi.who)} ${hi.hit.won}–${hi.hit.lost} on picks, ${whoLabel(lo.who)} ${lo.hit.won}–${lo.hit.lost}.` + (hi.hit.n < 5 || lo.hit.n < 5 ? ' Small sample, big talk.' : '') });
  }
  return items;
}
