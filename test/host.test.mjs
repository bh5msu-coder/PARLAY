import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import lore from '../league-lore.json' with { type: 'json' };
import { ident } from '../lib/ident.mjs';
import {
  HOST_NAME, echoBet, fantasyRecap, findGame, findGameByTeam, hostBriefing, hostIntro, hostReply, matchupFor, oweStatus,
  routeIntent, shouldAutoOpen, markSeen, thursdayDeadline, youStats, parlayLastWeek,
} from '../lib/host.mjs';

ident.load(lore);

const rows = [
  { id: 3, who: 'DJ Dangerous', team: 'Dangers', points: 71.2 },
  { id: 1, who: 'Brad Holm', team: 'Holm Boys', points: 102.4 },
  { id: 2, who: 'Joseph McKeon', team: 'Joes', points: 131.9 },
];
const lastPlace = { week: 9, who: 'DJ Dangerous', points: 71.2, team: 'Dangers', rows, tied: ['DJ Dangerous'], skippedHeller: false, unauthorized: false };
const clock = { active: 10, payerWeek: 9, firstKick: '2026-11-13T01:15:00Z', firstKickLabel: 'Thu, Nov 12, 8:15 PM ET' };
const tuesday = new Date('2026-11-10T18:00:00Z');

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('host: the name is the one the league asked for', () => {
  assert.equal(HOST_NAME, 'Sarge');
});

test('host: last week recap ranks the manager from ESPN points and names the low man', () => {
  const r = fantasyRecap(lastPlace, 'Brad Holm', 9);
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.you.points, r.you.rank, r.of], [102.4, 2, 3]);
  assert.equal(r.top.who, 'Joseph McKeon');
  assert.equal(r.last.who, 'DJ Dangerous');
  assert.equal(r.average, 101.8);
});

test('host: a private ESPN league is reported as offline, never as a score', () => {
  const r = fantasyRecap({ week: 9, unauthorized: true, rows: [] }, 'Brad Holm', 9);
  assert.equal(r.status, 'offline');
  const b = hostBriefing({ you: 'Brad Holm', clock, lastPlace: { week: 9, unauthorized: true, rows: [] }, now: tuesday });
  assert.match(hostReply('last week recap', b).lines[0], /offline/);
});

test('host: scores for another week are not used for this recap', () => {
  assert.equal(fantasyRecap(Object.assign({}, lastPlace, { week: 8 }), 'Brad Holm', 9).status, 'missing');
});

test('host: owing follows the payer rule, splits a tie, and never says paid', () => {
  assert.equal(oweStatus({ you: 'DJ Dangerous', payers: ['DJ Dangerous'], stake: 10, week: 10 }).status, 'owe');
  assert.equal(oweStatus({ you: 'DJ Dangerous', payers: ['DJ Dangerous'], stake: 10, week: 10 }).amount, 10);
  const split = oweStatus({ you: 'Brad Holm', payers: ['Brad Holm', 'DJ Dangerous'], stake: 10, week: 10 });
  assert.equal(split.amount, 5);
  assert.equal(split.split, true);
  assert.equal(oweStatus({ you: 'Brad Holm', payers: ['DJ Dangerous'], stake: 10, week: 10 }).status, 'clear');
  assert.equal(oweStatus({ you: 'Brad Holm', payers: [], stake: 10, week: 10 }).status, 'unknown');
  const b = hostBriefing({ you: 'DJ Dangerous', clock, lastPlace, payers: ['DJ Dangerous'], currentWeek: { week: 10, stake: 10, contributions: [] }, now: tuesday });
  const text = hostReply('do I owe', b).lines.join(' ');
  assert.match(text, /You owe \$10 for the Week 10 ticket/);
  assert.doesNotMatch(text, /\bpaid\b/i);
});

test('host: a recorded contribution is reported as recorded, not as settled', () => {
  const o = oweStatus({ you: 'DJ Dangerous', payers: ['DJ Dangerous'], stake: 10, week: 10, contributions: [{ who: 'DJ Dangerous', amount: 10 }] });
  assert.equal(o.recorded, 10);
  const b = hostBriefing({ you: 'DJ Dangerous', clock, lastPlace, payers: ['DJ Dangerous'], currentWeek: { week: 10, stake: 10, contributions: [{ who: 'DJ Dangerous', amount: 10 }] }, now: tuesday });
  assert.match(hostReply('do I owe', b).lines[1], /recorded from you/);
});

test('host: Thursday push counts down before kickoff and passes once the week is under way', () => {
  const tue = thursdayDeadline(tuesday, clock);
  assert.deepEqual([tue.passed, tue.daysLeft, tue.label], [false, 2, 'Thu, Nov 12']);
  assert.equal(thursdayDeadline(new Date('2026-11-12T15:00:00Z'), clock).today, true);
  const sun = thursdayDeadline(new Date('2026-11-15T18:00:00Z'), clock);
  assert.equal(sun.passed, true);
  // Monday night, after the board rolls to a week whose first game is Thursday: next Thursday, not "passed".
  const mon = thursdayDeadline(new Date('2026-11-17T05:00:00Z'), { firstKick: '2026-11-20T01:15:00Z' });
  assert.deepEqual([mon.passed, mon.label], [false, 'Thu, Nov 19']);
});

test('host: the reminder offers to take the bet when no pick is saved, and confirms one that is', () => {
  const none = hostBriefing({ you: 'Brad Holm', clock, lastPlace, now: tuesday, pickRows: [] });
  const lines = hostReply('when is my pick due', none).lines;
  assert.match(lines[0], /by Thursday, Nov 12/);
  assert.match(lines[1], /read it back, and one tap on Save/);
  const saved = hostBriefing({ you: 'Brad Holm', clock, lastPlace, now: tuesday, pickRows: [{ who: 'Brad Holm', leg: { label: 'Bills -3.5', game: ['BUF', 'MIA'] } }] });
  assert.match(hostReply('when is my pick due', saved).lines[0], /You're in for Week 10: Bills -3.5 \(BUF at MIA\)/);
});

test('host: streaks and win rates come from decided picks only, with the small-sample flag', () => {
  const legs = [
    { week: 1, who: 'Brad Holm', status: 'won', type: 'ml' },
    { week: 2, who: 'Brad Holm', status: 'lost', type: 'ml' },
    { week: 3, who: 'Brad Holm', status: 'won', type: 'ml' },
    { week: 4, who: 'Brad Holm', status: 'won', type: 'ml' },
    { week: 5, who: 'Brad Holm', status: 'unknown', type: 'ml' },
  ];
  const s = youStats(legs, 'Brad Holm', { wins: 136, losses: 130, seasons: 16, titles: [2023] });
  assert.deepEqual([s.parlay.won, s.parlay.lost, s.parlay.undecided, s.parlay.streak, s.parlay.smallSample], [3, 1, 1, 'W2', true]);
  assert.equal(Math.round(s.fantasy.rate * 1000), 511);
  const b = hostBriefing({ you: 'Brad Holm', clock, legs, career: { wins: 136, losses: 130, seasons: 16, titles: [2023] }, now: tuesday });
  const text = hostReply('my streak', b).lines.join(' ');
  assert.match(text, /3-1 on decided legs, 75% hit rate \(small sample\), 1 still open or unknown/);
  assert.match(text, /Fantasy career: 136-130, 51% wins over 16 seasons, 1 title/);
});

test('host: matchups are used when the feed has them, and the gap is stated when it does not', () => {
  const mus = [{ homeId: 1, awayId: 2, homePoints: 102.4, awayPoints: 131.9 }];
  const m = matchupFor(mus, rows, 1);
  assert.deepEqual([m.opponent, m.result], ['Joseph McKeon', 'L']);
  assert.equal(matchupFor([{ homeId: 1, awayId: null }], rows, 1).bye, true);
  assert.equal(matchupFor(undefined, rows, 1), null);
  const without = hostBriefing({ you: 'Brad Holm', clock, lastPlace, now: tuesday });
  assert.match(hostReply('who do I play', without).lines[0], /can't see this week's fantasy matchups/);
  const withFeed = hostBriefing({ you: 'Brad Holm', clock, lastPlace, now: tuesday, currentMatchups: [{ homeId: 3, awayId: 1 }] });
  assert.match(hostReply('who do I play', withFeed).lines[0], /you play DJ Dangerous/);
});

test('host: last week parlay names the killer and the manager\'s own leg', () => {
  const week = { week: 9, legs: [{ who: 'Brad Holm', label: 'Bills ML' }] };
  const graded = { summary: { state: 'busted', killers: ['DJ Dangerous'], won: 10, total: 11 }, graded: [{ leg: week.legs[0], state: 'won' }] };
  const p = parlayLastWeek(week, graded, 'Brad Holm');
  assert.deepEqual([p.state, p.leg.state], ['busted', 'won']);
  const b = hostBriefing({ you: 'Brad Holm', clock, lastPlace, priorWeek: week, priorGraded: graded, now: tuesday });
  const text = hostReply('recap', b).lines.join(' ');
  assert.match(text, /Week 9 parlay busted, killed by DJ Dangerous/);
  assert.match(text, /Your leg, Bills ML: hit/);
});

test('host: intent routing keeps "place my bet" away from the echo and ignores fake games', () => {
  assert.equal(routeIntent('can you place my bet'), 'place');
  assert.equal(routeIntent('BUF at MIA Bills -3.5'), 'echo');
  assert.equal(routeIntent('what is the meaning of life'), 'unknown');
  assert.equal(findGame('what is this'), null);
  assert.equal(routeIntent('do I owe'), 'owe');
  assert.equal(routeIntent('who do i play'), 'matchup');
  assert.equal(routeIntent('my win %'), 'stats');
  assert.match(hostReply('place my bet', hostBriefing({ you: 'Brad Holm', clock, now: tuesday })).lines[0], /can't place a wager/);
});

test('host: a typed bet is read back as a HOLM PICK block and a leg, and nothing is saved by the read-back', () => {
  const roster = ident.parlayRoster();
  const spread = echoBet('BUF at MIA Bills -3.5 -110', { week: 10, who: 'Brad Holm', roster });
  assert.equal(spread.ok, true);
  assert.deepEqual([spread.leg.type, spread.leg.team, spread.leg.line, spread.leg.odds], ['spread', 'BUF', -3.5, -110]);
  assert.equal(spread.text, 'HOLM PICK W10\nWho: Brad Holm\nGame: BUF at MIA\nType: spread\nPick: Bills -3.5\nOdds: -110');
  const total = echoBet('KC @ DEN over 44.5', { week: 10, who: 'Brad Holm', roster });
  assert.deepEqual([total.leg.type, total.leg.side, total.leg.line], ['total', 'over', 44.5]);
  const prop = echoBet('DET at GB Goff over 275.5 passing yards', { week: 10, who: 'Brad Holm', roster });
  assert.deepEqual([prop.leg.type, prop.leg.player, prop.leg.stat], ['player', 'Goff', 'passYds']);
  const ml = echoBet('my bet is NYJ at NE Jets ML +150', { week: 10, who: 'Brad Holm', roster });
  assert.deepEqual([ml.leg.type, ml.leg.team, ml.leg.odds], ['ml', 'NYJ', 150]);
  assert.equal(echoBet('Bills -3', { week: 10, who: 'Brad Holm' }).ok, false);
  const r = hostReply('BUF at MIA Bills -3.5', hostBriefing({ you: 'Brad Holm', clock, now: tuesday }), { roster });
  assert.match(r.lines[0], /Nothing is saved yet/);
  assert.match(r.bet, /^HOLM PICK W10/);
  assert.equal(r.ok, true);
  assert.deepEqual([r.leg.type, r.leg.team, r.leg.line], ['spread', 'BUF', -3.5]);
});

test('host: a bet that only names a team finds this week\'s game, and never guesses between two', () => {
  const roster = ident.parlayRoster();
  const games = [{ away: 'BUF', home: 'MIA' }, { away: 'KC', home: 'LV' }];
  assert.deepEqual(findGameByTeam('Bills -3.5', games), ['BUF', 'MIA']);
  assert.equal(findGameByTeam('Bills and Chiefs', games), null);
  assert.equal(findGameByTeam('Packers ML', games), null);
  assert.equal(routeIntent('Bills -3.5', games), 'echo');
  assert.equal(routeIntent('Bills -3.5'), 'unknown');
  assert.equal(routeIntent('do I owe', games), 'owe');
  const b = hostBriefing({ you: 'Brad Holm', clock, now: tuesday });
  const r = hostReply('Chiefs ML -150', b, { roster, games });
  assert.equal(r.ok, true);
  assert.deepEqual([r.leg.type, r.leg.team, r.leg.game, r.leg.odds], ['ml', 'KC', ['KC', 'LV'], -150]);
});

test('host: touchdown props and scores-first bets read back as saveable legs; a bet missing a piece is not', () => {
  const roster = ident.parlayRoster();
  const b = hostBriefing({ you: 'Brad Holm', clock, now: tuesday });
  const any = hostReply('KC at LV Travis Kelce anytime TD', b, { roster });
  assert.equal(any.ok, true);
  assert.deepEqual([any.leg.type, any.leg.stat, any.leg.player], ['player', 'anyTD', 'Travis Kelce']);
  const first = hostReply('KC at LV Travis Kelce first TD', b, { roster });
  assert.deepEqual([first.ok, first.leg.stat, first.leg.player], [true, 'firstTD', 'Travis Kelce']);
  const team = hostReply('KC at LV Chiefs scores first', b, { roster });
  assert.deepEqual([team.ok, team.leg.type, team.leg.team], [true, 'first', 'KC']);
  const bad = hostReply('KC at LV over', b, { roster });
  assert.equal(bad.ok, false);
  assert.match(bad.lines[0], /can't save it yet/);
});

test('host: the intro greets by nickname and leads with the week, or asks who you are', () => {
  const b = hostBriefing({ you: 'Brad Holm', nick: 'Brad', hour: 19, clock, lastPlace, payers: ['DJ Dangerous'], currentWeek: { week: 10, stake: 10 }, now: tuesday });
  const intro = hostIntro(b);
  assert.equal(intro[0], "Evening, Brad. I'm Sarge, your sports book host.");
  assert.match(intro[1], /you put up 102.4, 2nd of 3/);
  assert.match(intro.join(' '), /You're clear for Week 10/);
  assert.match(intro[intro.length - 1], /by Thursday/);
  const anon = hostIntro(hostBriefing({ hour: 9, clock, now: tuesday }));
  assert.equal(anon.length, 1);
  assert.match(anon[0], /Tell me who you are/);
});

test('host: it introduces itself once per device per NFL week', () => {
  const s = memStore();
  assert.equal(shouldAutoOpen(s, 10), true);
  markSeen(s, 10);
  assert.equal(shouldAutoOpen(s, 10), false);
  assert.equal(shouldAutoOpen(s, 11), true);
  assert.equal(shouldAutoOpen(s, null), false);
});

test('host: no pick writes, no model calls and no secrets in the Host code', () => {
  for (const f of ['lib/host.mjs', 'components/BookingHost.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(/, f + ' must not make network calls');
    assert.doesNotMatch(src, /\/api\/pick|PICK_API|anthropic|sb_publishable|ESPN_S2|ESPN_SWID/i, f);
  }
});

test('host: Heller\'s payment date never appears in what the Host says', () => {
  const b = hostBriefing({ you: 'Kyle Heller', clock, lastPlace, payers: ['DJ Dangerous'], currentWeek: { week: 10, stake: 10 }, now: tuesday });
  for (const t of ['recap', 'do I owe', 'my streak', 'who do I play', 'pick due', 'help']) {
    assert.doesNotMatch(hostReply(t, b).lines.join(' '), /Oct 3|10\/3/);
  }
});
