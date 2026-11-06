/** Facts sent to Claude for the weekly recap. Pure, and only recorded/graded data: the week's legs
 *  with results, the template recap, and each manager's season hit rate. No payment details. */
import { weeklyLegs, weeklyTickets } from './stats.mjs';
import { buildRecap } from './recap.mjs';

export function recapFacts(weeks, graded, weekNo, nickOf = (n) => n) {
  const week = (weeks || []).find((w) => w.week === weekNo);
  if (!week) return null;
  const t = weeklyTickets([week], graded)[0];
  const legs = weeklyLegs([week], graded);
  const template = buildRecap(Object.assign({}, t, { legs }), 'recorded results');
  const season = {};
  for (const l of weeklyLegs((weeks || []).filter((w) => w.week <= weekNo), graded)) {
    const s = season[l.who] || (season[l.who] = { who: l.who, nick: nickOf(l.who), legs: 0, hit: 0, lost: 0 });
    if (l.status === 'won') { s.hit++; s.legs++; } else if (l.status === 'lost') { s.lost++; s.legs++; }
  }
  return {
    league: 'Our Holm League',
    week: weekNo,
    result: t.result,
    settled: template.settled,
    stake: t.stake,
    hypotheticalToPay: t.hypotheticalToPay || null,
    payoutRecorded: t.payoutRecorded || null,
    legs: legs.map((l) => ({ who: l.who, nick: nickOf(l.who), pick: l.label, type: l.type, result: l.status })),
    templateRecap: template.text,
    season: Object.values(season).sort((a, b) => b.hit / (b.legs || 1) - a.hit / (a.legs || 1)),
  };
}
