import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { computeAchievements, BADGES } from '../lib/achievements.mjs';
import { buildRecap } from '../lib/recap.mjs';
import { smackFeed } from '../lib/smack.mjs';
import { historyLegs, historyTickets } from '../lib/history.mjs';

const history = JSON.parse(fs.readFileSync(new URL('../parlay-history.json', import.meta.url), 'utf8'));
const legs = historyLegs(history);
const tickets = historyTickets(history);
const L = (week, who, status, type = 'ml', kickoff = '2026-10-11T17:00:00Z') => ({ week, who, status, type, label: who + ' pick', kickoff, ticketResult: 'busted' });

test('recap is only written for settled tickets', () => {
  const open = buildRecap({ week: 9, result: 'open', legs: [L(9, 'Brad Holm', 'open')] }, 'test');
  assert.equal(open.settled, false);
  assert.match(open.text, /isn't settled — 1 pick still to play/);
  const unknown = buildRecap({ week: 6, result: 'unknown', legs: [L(6, 'Brad Holm', 'unknown')] }, 'test');
  assert.equal(unknown.settled, false);
  assert.match(unknown.text, /results are not recorded/);
});

test('recap never reports unknown legs as wins or losses', () => {
  const r = buildRecap({ week: 4, result: 'busted', stake: 20, legs: [L(4, 'Brad Holm', 'lost'), L(4, 'Joe Mckeon', 'won'), L(4, 'Kyle McFadden', 'unknown')] }, 'test');
  assert.equal(r.settled, true);
  assert.match(r.text, /busted, 1–1\./);
  assert.match(r.text, /1 pick with no recorded result: One-Eyed Bandit — left out of the count/);
  assert.doesNotMatch(r.text.split('Came through:')[1].split('.')[0], /Kyle/);
});

test('recap labels payouts hypothetical unless recorded, and flags unplaced tickets', () => {
  const cashed = buildRecap({ week: 9, result: 'cashed', hypotheticalToPay: 2294.04, ticketState: 'proposed', legs: [L(9, 'Brad Holm', 'won')] }, 'test');
  assert.match(cashed.text, /Slip said \$2,294 — hypothetical until a payout is recorded/);
  assert.match(cashed.text, /nothing recorded shows this ticket was placed/);
  const paid = buildRecap({ week: 9, result: 'cashed', hypotheticalToPay: 2294.04, payoutRecorded: 2294.04, ticketState: 'settled', legs: [L(9, 'Brad Holm', 'won')] }, 'test');
  assert.match(paid.text, /Payout recorded: \$2,294/);
  const busted = buildRecap(Object.assign({}, tickets.find((t) => t.week === 2), { legs: legs.filter((l) => l.week === 2) }), 'parlay-history.json');
  assert.match(busted.text, /would have paid \$4,349 \(hypothetical\)/);
});

test('achievements use decided picks only and name their source', () => {
  const synthetic = [
    L(1, 'Brad Holm', 'won'), L(2, 'Brad Holm', 'won'), L(3, 'Brad Holm', 'won'),
    L(1, 'Ryan Hoffman', 'open'), L(2, 'Ryan Hoffman', 'unknown'), L(3, 'Ryan Hoffman', 'unknown'),
  ];
  const badges = computeAchievements(synthetic, 'test');
  const ids = badges.map((b) => b.id);
  assert.ok(ids.includes('hot-hand'));
  for (const b of badges) {
    assert.equal(b.source, 'test');
    assert.ok(!b.who.includes('Ryan Hoffman') || b.id === 'ever-present', `${b.id} must not credit open/unknown picks`);
    assert.ok(b.fields.length);
  }
  assert.equal(badges.find((b) => b.id === 'hot-hand').smallSample, true);
});

test('history achievements match the recorded tape', () => {
  const byId = Object.fromEntries(computeAchievements(legs, 'parlay-history.json').map((b) => [b.id, b]));
  assert.deepEqual(byId.lock.who, ['John Sachs']);
  assert.equal(byId.lock.smallSample, false);
  assert.deepEqual(byId['hot-hand'].who.sort(), ['Joe Mckeon', 'Ryan Hoffman']);
  assert.equal(BADGES.length, 8);
});

test('smack feed items come from settled results and carry a source', () => {
  const items = smackFeed({ legs, tickets, source: 'parlay-history.json' });
  assert.ok(items.length > 5);
  assert.ok(items.every((i) => i.source === 'parlay-history.json' && i.text));
  assert.ok(!items.some((i) => i.week === 8), 'pending Week 8 has no recap or bust item');
});

test('generated text never assumes anyone\'s pronouns', () => {
  const texts = [
    ...smackFeed({ legs, tickets, source: 'h' }).map((i) => i.text),
    ...tickets.map((t) => buildRecap(Object.assign({}, t, { legs: legs.filter((l) => l.week === t.week) }), 'h').text),
    ...computeAchievements(legs, 'h').map((b) => b.detail + ' ' + b.what),
  ];
  for (const t of texts) assert.doesNotMatch(t, /\b(he|him|his|she|her|hers)\b/i, t);
});

test('Week 3 is listed as never placed and stays out of every stat', () => {
  const w3 = (history.unplaced || []).find((p) => p.week === 3);
  assert.ok(w3, 'Week 3 is in unplaced');
  assert.equal(w3.legs.length, 12);
  assert.ok(w3.legs.every((l) => l.result === undefined), 'no Week 3 leg is graded');
  assert.ok(!history.parlays.some((p) => p.week === 3), 'Week 3 is not a parlay');
  assert.ok(!historyLegs(history).some((l) => l.week === 3));
  assert.ok(!historyTickets(history).some((t) => t.week === 3));
});

test('Weeks 2 and 4 are their own graded weeks, and Week 4 keeps its recorded split', async () => {
  const { readFileSync } = await import('node:fs');
  const { gradeStoredWeek, summarizeParlay } = await import('../lib/weeks.mjs');
  const { reconcile } = await import('../lib/reconcile.mjs');
  const bets = JSON.parse(readFileSync(new URL('../data/bets.json', import.meta.url)));
  const w2 = bets.weeks.find((w) => w.week === 2);
  const w4 = bets.weeks.find((w) => w.week === 4);
  const s2 = summarizeParlay(gradeStoredWeek(w2).graded);
  const s4 = summarizeParlay(gradeStoredWeek(w4).graded);
  assert.deepEqual([s2.state, s2.won, s2.lost], ['busted', 4, 8]);
  assert.deepEqual([s4.state, s4.won, s4.lost, s4.pending], ['busted', 8, 3, 1]);
  assert.deepEqual(w4.payers, ['Joe Mckeon', 'Kyle Heller']);
  assert.equal(w4.stake, 20);
  const disc = reconcile({ weeks: bets.weeks }, history).items.filter((i) => i.week === 2 || i.week === 4);
  assert.deepEqual(disc.filter((i) => i.severity === 'money' || i.severity === 'result'), []);
});
