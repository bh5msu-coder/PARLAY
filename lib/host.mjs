/** Sarge, the site's sports book host and co-pilot. Pure, so the tests import it directly.
 *
 *  Everything the Host says comes from data the pages already load (the league store) and the logic in
 *  lib/*.mjs: grades, ESPN fantasy points, payers, streaks and the pick form. No model call is needed for
 *  any of it. The Host never saves, submits or changes a pick, and never places a wager: "type it back"
 *  only writes the bet out so the manager can enter it on the Pick tab themselves. */
import { selectionStats } from './stats.mjs';
import { payerShare } from './iou.mjs';
import { parseOdds, parseType, blockToLeg, validatePick } from './ticket.mjs';
import { normalizeAbbr, teamInLabel } from './import/nfl-teams.mjs';
import { waBlock } from './pick-form.mjs';
import { fmtMoney } from './format.mjs';

export const HOST_NAME = 'Sarge';
export const HOST_ROLE = 'sports book host';
export const HOST_SEEN_KEY = 'hp_host_seen';
const SMALL_N = 5;

const round1 = (n) => (n == null || isNaN(n) ? null : Math.round(Number(n) * 10) / 10);
const pts = (n) => (n == null ? '–' : Number(n).toFixed(1));
const pctText = (rate) => (rate == null ? '–' : Math.round(rate * 100) + '%');
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** Date parts in US Eastern, where the NFL week and the Thursday push live. dow: 0 = Sunday. */
export function etParts(now) {
  const d = now instanceof Date ? now : new Date(now);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), dow };
}

/** The league's "picks in by Thursday" push (rules.pickDeadline: no hard deadline; games lock at kickoff).
 *  Before the open week's first kickoff, the target is the next Thursday (today if it is Thursday). Once the
 *  week has kicked off and Thursday is behind us, it has passed and only the kickoff locks remain. */
export function thursdayDeadline(now, clock) {
  const t = now instanceof Date ? now : new Date(now);
  const p = etParts(t);
  const started = !!(clock && clock.firstKick && Date.parse(clock.firstKick) <= t.getTime());
  const days = (4 - p.dow + 7) % 7;
  if (started && days !== 0) return { passed: true, today: false, daysLeft: null, label: '' };
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d + days, 12));
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(date);
  return { passed: false, today: days === 0, daysLeft: days, label };
}

/** Last week's fantasy scoreboard for one manager, from the store's lastPlace (ESPN, via /api/espn?path=ffl).
 *  status: ok | offline (private league, no cookies) | missing (not loaded for that week) | empty | unknown-you. */
export function fantasyRecap(lastPlace, you, week) {
  if (!lastPlace || (week && lastPlace.week !== week)) return { status: 'missing', week };
  if (lastPlace.unauthorized) return { status: 'offline', week: lastPlace.week };
  const rows = (lastPlace.rows || []).filter((r) => r && r.points != null && !isNaN(r.points));
  if (!rows.length) return { status: 'empty', week: lastPlace.week };
  const desc = rows.slice().sort((a, b) => b.points - a.points);
  const avg = round1(desc.reduce((s, r) => s + Number(r.points), 0) / desc.length);
  const top = desc[0];
  const base = {
    week: lastPlace.week,
    of: desc.length,
    average: avg,
    top: { who: top.who, points: round1(top.points) },
    last: { who: lastPlace.who || '', points: round1(lastPlace.points), tied: (lastPlace.tied || []).slice(), skippedHeller: !!lastPlace.skippedHeller },
  };
  const mine = you ? desc.find((r) => r.who === you) : null;
  if (!mine) return Object.assign({ status: you ? 'not-in-league' : 'unknown-you' }, base);
  const rank = desc.filter((r) => r.points > mine.points).length + 1;
  return Object.assign({ status: 'ok', you: { points: round1(mine.points), rank, team: mine.team || '', id: mine.id } }, base);
}

/** A head-to-head result once the ESPN proxy returns matchups ([{ homeId, awayId, homePoints, awayPoints }]).
 *  The current /api/espn response has no matchups, so this returns null until that is added. */
export function matchupFor(matchups, rows, teamId) {
  if (!Array.isArray(matchups) || teamId == null) return null;
  const m = matchups.find((x) => x && (x.homeId === teamId || x.awayId === teamId));
  if (!m) return null;
  const home = m.homeId === teamId;
  const oppId = home ? m.awayId : m.homeId;
  if (oppId == null) return { bye: true };
  const opp = (rows || []).find((r) => r.id === oppId) || {};
  const mine = home ? m.homePoints : m.awayPoints;
  const theirs = home ? m.awayPoints : m.homePoints;
  const decided = mine != null && theirs != null && !isNaN(mine) && !isNaN(theirs);
  return {
    opponent: opp.who || opp.owner || opp.team || '',
    opponentTeam: opp.team || '',
    yourPoints: mine == null ? null : round1(mine),
    theirPoints: theirs == null ? null : round1(theirs),
    result: decided && m.final !== false ? (mine > theirs ? 'W' : mine < theirs ? 'L' : 'T') : null,
  };
}

/** Does this manager owe the open week's stake? `payers` is the store's weekPayers(week): the recorded split,
 *  else ESPN's last place in the prior fantasy week. Owing is what the rule says, not whether money moved:
 *  a recorded contribution is reported as recorded, never as "paid in full". */
export function oweStatus({ you, payers, stake, week, contributions }) {
  const list = (payers || []).filter(Boolean);
  if (!you) return { status: 'unknown-you' };
  if (!list.length) return { status: 'unknown', week };
  const amount = payerShare(Number(stake) || 10, list.length);
  if (!list.includes(you)) return { status: 'clear', week, payers: list, amount };
  const recorded = (contributions || []).filter((c) => c && c.who === you).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  return { status: 'owe', week, amount, split: list.length > 1, payers: list, recorded };
}

/** Last week's parlay from one manager's seat: the ticket's state and their own leg. */
export function parlayLastWeek(week, graded, you) {
  if (!week) return { status: 'none' };
  const s = graded && graded.summary;
  const state = s ? s.state : (week.results === 'unknown' ? 'unknown' : 'open');
  const legs = (graded && graded.graded) || [];
  const mineG = you ? legs.find((r) => r.leg && r.leg.who === you) : null;
  const mineL = !mineG && you ? (week.legs || []).find((l) => l.who === you) : null;
  const leg = mineG ? { label: mineG.leg.label, state: mineG.state } : mineL ? { label: mineL.label, state: mineL.result || 'unknown' } : null;
  return { status: 'ok', week: week.week, state, killers: (s && s.killers) || [], leg, won: s ? s.won : null, total: s ? s.total : (week.legs || []).length };
}

/** Pick-level record (weekly record + live grades) and fantasy career win share for one manager. */
export function youStats(legs, you, career) {
  const row = you ? selectionStats(legs || []).find((r) => r.who === you) : null;
  const parlay = row ? {
    won: row.hit.won, lost: row.hit.lost, n: row.hit.n, rate: row.hit.rate, smallSample: row.hit.n < SMALL_N,
    undecided: row.hit.open + row.hit.unknown, streak: row.streak.current, best: row.streak.best,
  } : null;
  const w = career && Number(career.wins), l = career && Number(career.losses);
  const fantasy = career && (w + l) > 0 ? {
    wins: w, losses: l, rate: w / (w + l), seasons: career.seasons || null, titles: (career.titles || []).length,
  } : null;
  return { parlay, fantasy };
}

/** This week's pick for one manager, from the Pick tab's saved rows. */
export function yourPick(rows, you) {
  const r = you ? (rows || []).find((x) => x && x.who === you && x.leg) : null;
  return r ? { label: r.leg.label, game: (r.leg.game || []).join(' at ') } : null;
}

/** Everything the Host knows, computed once from the store. Small enough to pass around (or, later, to a model). */
export function hostBriefing(input) {
  const i = input || {};
  const you = i.you || '';
  const clock = i.clock || null;
  const active = i.pickWeek || (clock && clock.active) || null;
  const prior = clock && clock.payerWeek ? clock.payerWeek : (active ? Math.max(1, active - 1) : null);
  const fantasy = fantasyRecap(i.lastPlace, you, prior);
  const priorMatch = fantasy.you ? matchupFor(i.priorMatchups, i.lastPlace && i.lastPlace.rows, fantasy.you.id) : null;
  const myTeamId = fantasy.you ? fantasy.you.id : (i.lastPlace && (i.lastPlace.rows || []).find((r) => r.who === you) || {}).id;
  const nextMatch = matchupFor(i.currentMatchups, (i.currentRows || (i.lastPlace && i.lastPlace.rows)), myTeamId);
  const week = i.currentWeek || null;
  return {
    you,
    nick: i.nick || you,
    hour: i.hour == null ? 12 : i.hour,
    active,
    prior,
    fantasy,
    priorMatch,
    nextMatch,
    owe: oweStatus({ you, payers: i.payers, stake: week && week.stake, week: active, contributions: week && week.contributions }),
    payerNote: i.payerNote || '',
    parlay: parlayLastWeek(i.priorWeek, i.priorGraded, you),
    stats: youStats(i.legs, you, i.career),
    pick: yourPick(i.pickRows, you),
    deadline: thursdayDeadline(i.now || new Date(), clock),
    firstKickLabel: (clock && clock.firstKickLabel) || '',
  };
}

function greeting(hour) {
  if (hour < 5) return 'Late night at the window';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

/** Lines for each topic. Every number is from the briefing; anything missing is said plainly. */
export const TOPICS = {
  recap(b) {
    const f = b.fantasy;
    const out = [];
    if (f.status === 'offline') out.push(`Week ${f.week} fantasy scores are offline: the ESPN league is private and the site's ESPN connection isn't set up. The commissioner has to reconnect it.`);
    else if (f.status === 'missing' || f.status === 'empty') out.push(`Week ${f.week || b.prior || '?'} fantasy scores haven't loaded yet.`);
    else {
      if (f.you) out.push(`Week ${f.week}: you put up ${pts(f.you.points)}, ${ordinal(f.you.rank)} of ${f.of} (league average ${pts(f.average)}).`);
      else out.push(`Week ${f.week}: top score ${pts(f.top.points)} by ${f.top.who}, league average ${pts(f.average)}.`);
      if (f.top && f.you && f.top.who !== b.you) out.push(`High roller: ${f.top.who} with ${pts(f.top.points)}.`);
      if (f.last.who) out.push(f.last.tied.length > 1 ? `Tied for last at ${pts(f.last.points)}: ${f.last.tied.join(' and ')}.` : `Low man: ${f.last.who} at ${pts(f.last.points)}${f.last.skippedHeller ? ' (Heller was lower but sits out the bet)' : ''}.`);
    }
    if (b.priorMatch && b.priorMatch.result) {
      const m = b.priorMatch;
      out.push(`${m.result === 'W' ? 'You won' : m.result === 'L' ? 'You lost' : 'You tied'} your matchup ${pts(m.yourPoints)} to ${pts(m.theirPoints)} against ${m.opponent || 'your opponent'}.`);
    }
    const p = b.parlay;
    if (p.status === 'ok') {
      const st = p.state === 'cashed' ? 'cashed' : p.state === 'busted' ? 'busted' : p.state === 'live' ? 'is still live' : 'has no final result recorded yet';
      let line = `Week ${p.week} parlay ${st}`;
      if (p.state === 'busted' && p.killers.length) line += `, killed by ${p.killers.join(', ')}`;
      out.push(line + '.');
      if (p.leg) out.push(`Your leg, ${p.leg.label}: ${legWord(p.leg.state)}.`);
    }
    return out;
  },
  owe(b) {
    const o = b.owe;
    if (o.status === 'unknown-you') return ['Tell me who you are first and I can check the stake.'];
    if (o.status === 'unknown') return [`I can't name a Week ${o.week || b.active || ''} payer yet. It goes to last place in the prior fantasy week, and those scores aren't in.`];
    if (o.status === 'clear') return [`You're clear for Week ${o.week}. ${o.payers.join(' and ')} ${o.payers.length > 1 ? 'split' : 'covers'} the ${fmtMoney(o.amount * o.payers.length)} stake${b.payerNote ? ` (${b.payerNote})` : ''}.`];
    const lines = [`You owe ${fmtMoney(o.amount)} for the Week ${o.week} ticket${o.split ? ` (split with ${o.payers.filter((n) => n !== b.you).join(' and ')})` : ''}${b.payerNote ? `: ${b.payerNote}` : ''}.`];
    if (o.recorded > 0) lines.push(`I see ${fmtMoney(o.recorded)} recorded from you for that week.`);
    else lines.push('The stake is due by kickoff. Send it the usual way; I can\'t move money.');
    return lines;
  },
  stats(b) {
    const s = b.stats;
    const out = [];
    if (s.parlay) {
      const p = s.parlay;
      out.push(`Parlay picks: ${p.won}-${p.lost} on decided legs, ${pctText(p.rate)} hit rate${p.smallSample ? ' (small sample)' : ''}${p.undecided ? `, ${p.undecided} still open or unknown` : ''}.`);
      out.push(`Streak: ${p.streak === '–' ? 'none yet' : p.streak}${p.best ? `, best run W${p.best}` : ''}.`);
    } else if (b.you) out.push('No decided parlay picks on the weekly record for you yet.');
    if (s.fantasy) out.push(`Fantasy career: ${s.fantasy.wins}-${s.fantasy.losses}, ${pctText(s.fantasy.rate)} wins${s.fantasy.seasons ? ` over ${s.fantasy.seasons} seasons` : ''}${s.fantasy.titles ? `, ${s.fantasy.titles} title${s.fantasy.titles > 1 ? 's' : ''}` : ''}.`);
    if (!out.length) out.push('Tell me who you are and I\'ll pull your numbers.');
    return out;
  },
  matchup(b) {
    const m = b.nextMatch;
    if (m && m.bye) return [`You're on a bye in Week ${b.active}.`];
    if (m && m.opponent) return [`Week ${b.active}: you play ${m.opponent}${m.opponentTeam && m.opponentTeam !== m.opponent ? ` (${m.opponentTeam})` : ''}.`];
    return [`I can't see this week's fantasy matchups yet. The ESPN feed the site reads returns scores but not who plays whom, so check ESPN for your Week ${b.active || ''} opponent.`];
  },
  deadline(b) {
    const d = b.deadline;
    const out = [];
    if (b.pick) out.push(`You're in for Week ${b.active}: ${b.pick.label} (${b.pick.game}). You can change it until that game kicks off.`);
    else if (d.passed) out.push(`Thursday's come and gone, but you can still get a Week ${b.active} pick in for any game that hasn't kicked off.`);
    else out.push(`Get your Week ${b.active} pick in by ${d.today ? 'tonight, Thursday' : `Thursday, ${d.label.replace(/^Thu,?\s*/, '')}`}${b.firstKickLabel ? `. First kick: ${b.firstKickLabel}` : ''}.`);
    if (!b.pick) out.push('Tell me your bet as AWAY at HOME plus the pick (like "BUF at MIA Bills -3.5 -110") and I\'ll type it back for you to enter on the Pick tab.');
    return out;
  },
  help() {
    return [
      'I can recap last week, tell you if you owe the stake, show your streaks and win rates, remind you of the Thursday push, and type a bet back for you.',
      'I can\'t place wagers or save picks. You enter picks on the Pick tab, and a person places the ticket.',
    ];
  },
  place() {
    return [
      'I can\'t place a wager or save a pick for you. A saved pick isn\'t a placed bet either: someone places the ticket at a book.',
      'Tell me the bet and I\'ll type it back so you can enter it on the Pick tab.',
    ];
  },
};

function legWord(state) {
  return { won: 'hit', lost: 'missed', push: 'push', void: 'void', live: 'live', pending: 'not played yet', open: 'open' }[state] || 'no result recorded';
}

/** The intro the Host gives when the site opens. */
export function hostIntro(b) {
  const lines = [];
  lines.push(b.you ? `${greeting(b.hour)}, ${b.nick}. I'm ${HOST_NAME}, your ${HOST_ROLE}.` : `${greeting(b.hour)}. I'm ${HOST_NAME}, your ${HOST_ROLE}. Tell me who you are and I'll pull up your week.`);
  if (!b.you) return lines;
  const recap = TOPICS.recap(b);
  if (recap.length) lines.push(recap[0]);
  const o = b.owe;
  if (o.status === 'owe' || o.status === 'clear') lines.push(TOPICS.owe(b)[0]);
  if (b.nextMatch && b.nextMatch.opponent) lines.push(TOPICS.matchup(b)[0]);
  lines.push(TOPICS.deadline(b)[0]);
  return lines;
}

const GAME_RE = /\b([A-Za-z]{2,3})(?:\s+at\s+|\s*@\s*)([A-Za-z]{2,3})\b/g;
const PROP_RE = /\b(yards|yds|td|tds|touchdowns?|receptions?|catches|anytime|interceptions?|ints?)\b/i;

/** The first "AWAY at HOME" in the text where both sides are real NFL abbreviations ("what is" is not a game). */
export function findGame(text) {
  for (const m of String(text || '').matchAll(GAME_RE)) {
    const a = normalizeAbbr(m[1]), h = normalizeAbbr(m[2]);
    if (a && h && a !== h) return { match: m[0], index: m.index, game: [a, h] };
  }
  return null;
}

/** Which topic a typed message is about. Ordered so "can you place my bet" never routes to the echo. */
export function routeIntent(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return 'help';
  if (/\b(place|submit|save|lock in|put in|enter)\b.*\b(bet|pick|wager|it|ticket)\b|\bbet (it|for me)\b/.test(t) && !findGame(text)) return 'place';
  if (findGame(text)) return 'echo';
  if (/\b(owe|pay|paying|payer|stake|money|cover)\b/.test(t)) return 'owe';
  if (/\b(play|playing|opponent|matchup|versus|vs\.?|face)\b/.test(t)) return 'matchup';
  if (/\b(streak|percent|percentage|rate|record|stats?|how am i)\b|\bwin ?(%|pct)/.test(t)) return 'stats';
  if (/\b(recap|last week|score|scores|won|win|lose|lost)\b/.test(t)) return 'recap';
  if (/\b(deadline|thursday|due|when|lock|kickoff|pick)\b/.test(t)) return 'deadline';
  return 'unknown';
}

/** Write a typed bet back as a HOLM PICK block. Nothing is saved or sent: the manager copies it and enters it
 *  on the Pick tab (or pastes it into Pick → From WhatsApp). `errors` lists what the Pick form would still need. */
export function echoBet(text, { week, who, roster } = {}) {
  const raw = String(text || '').replace(/^\s*(?:type (?:it|my bet) back|my (?:bet|pick) is|bet|pick)\s*[:\-]?\s*/i, '').trim();
  const found = findGame(raw);
  if (!found) return { ok: false, errors: ['Write the game as AWAY at HOME, like BUF at MIA'], text: '' };
  const game = found.game;
  let pick = (raw.slice(0, found.index) + ' ' + raw.slice(found.index + found.match.length)).replace(/[|:]+/g, ' ').replace(/\s+/g, ' ').trim();
  let odds = '';
  const om = pick.match(/(?:^|\s)([+-]\d{3,4})\s*$/);
  if (om) { odds = parseOdds(om[1]); pick = pick.slice(0, om.index).trim(); }
  let type = PROP_RE.test(pick) ? 'player' : parseType(pick);
  if (type === 'ml' && /(?:^|\s)[+-]\d{1,2}(?:\.5)?(?:\s|$)/.test(pick)) type = 'spread';
  const { leg } = blockToLeg(who || '', game, type, pick, odds);
  if (type === 'ml' || type === 'spread') {
    const named = teamInLabel(pick, game);
    leg.team = named || (game.includes(normalizeAbbr(leg.team)) ? normalizeAbbr(leg.team) : '');
  }
  if (type === 'spread') {
    const lm = pick.match(/(?:^|\s)([+-]\d{1,2}(?:\.5)?)(?:\s|$)/);
    leg.line = lm ? Number(lm[1]) : leg.line;
  }
  leg.label = pick;
  const errors = validatePick(leg, who, roster).filter((e) => e !== 'Pick a manager' || !who);
  return { ok: errors.length === 0, errors, leg, text: waBlock(week || '', who || 'You', leg) };
}

/** One reply for a typed message, all deterministic. `kind: 'unknown'` is the only case a model could add to. */
export function hostReply(text, b, opts) {
  const intent = routeIntent(text);
  if (intent === 'echo') {
    const e = echoBet(text, { week: b.active, who: b.you, roster: opts && opts.roster });
    if (!e.text) return { intent, lines: [e.errors[0] + '.'] };
    const lines = ['Here it is, typed back. Check it, then enter it on the Pick tab yourself. I haven\'t saved anything.'];
    if (e.errors.length) lines.push('The Pick form will still want: ' + e.errors.join(', ') + '.');
    return { intent, lines, bet: e.text };
  }
  if (intent === 'unknown') return { intent, lines: ['I don\'t have an answer for that one.'].concat(TOPICS.help(b).slice(0, 1)) };
  return { intent, lines: TOPICS[intent](b) };
}

/** Show the intro on its own once per device per NFL week; after that the Host waits behind its button. */
export function shouldAutoOpen(storage, active) {
  if (!active) return false;
  try { return storage.getItem(HOST_SEEN_KEY) !== String(active); } catch (e) { return false; }
}

export function markSeen(storage, active) {
  try { storage.setItem(HOST_SEEN_KEY, String(active)); } catch (e) { /* ignore */ }
}
