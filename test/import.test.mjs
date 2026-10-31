import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseWhatsAppExport, splitMessages } from '../lib/import/whatsapp.mjs';
import { dedupePicks } from '../lib/import/dedupe.mjs';
import { matchSlip, parseSlip, slipEvidence } from '../lib/import/slip.mjs';
import { PARLAY_11 } from '../lib/ticket.mjs';
import { normalizeFile } from '../lib/weeks.mjs';
import { deriveTicket, hitRate, isPlaced, legStatus, weekMoney, weekStates } from '../lib/model.mjs';
import { rule, undecidedRules, OPEN_RULES } from '../lib/rules.mjs';
import handler from '../pages/api/pick.js';

const roster = PARLAY_11;
const file = JSON.parse(fs.readFileSync(new URL('../data/bets.json', import.meta.url), 'utf8'));
const weeks = normalizeFile(file).weeks;
const byWeek = Object.fromEntries(weeks.map((w) => [w.week, w]));

const EXPORT = [
  '[10/29/26, 7:41:02 PM] Brad Holm: Chiefs ML KC at LV -130',
  '[10/29/26, 7:42:10 PM] Hoss: lol no way',
  '[10/29/26, 7:43:00 PM] Chas Rossman: HOLM PICK W9',
  'Who: Chas',
  'Game: SEA at LAR',
  'Type: spread',
  'Pick: SEA +3.5',
  'Odds: -110',
  '‎[10/29/26, 7:44:00 PM] Jarn: Under 44.5 BUF at MIA',
  '[10/29/26, 7:45:00 PM] Kyle Heller: Bills ML BUF at MIA',
  '[10/29/26, 7:46:00 PM] Nobody Real: Lions ML DET at GB',
  '[10/29/26, 7:47:00 PM] Joey: HOLM PICK W8',
  'Who: Joey',
  'Game: NYJ at NE',
  'Type: ml',
  'Pick: NE ML',
  '[10/29/26, 7:48:00 PM] DJ: Over 0.5 TD',
  '[10/29/26, 7:49:00 PM] Kev: ‎image omitted',
  '[10/29/26, 7:50:00 PM] Nick: HOLM PICK W9',
  'Who: Nick',
  'Type: ml',
].join('\n');

// ---------- WhatsApp parsing ----------

test('iOS export: picks carry author, message time, line number and a stable hash', () => {
  const r = parseWhatsAppExport(EXPORT, { roster, week: 9 });
  assert.equal(r.exportFormat, true);
  const got = r.picks.map((p) => [p.who, p.leg.type, p.leg.label, p.leg.game.join('@'), p.leg.team]);
  assert.deepEqual(got, [
    ['Brad Holm', 'ml', 'Chiefs ML', 'KC@LV', 'KC'],
    ['Chas Rossman', 'spread', 'SEA +3.5', 'SEA@LAR', 'SEA'],
    ['John Sachs', 'total', 'Under 44.5', 'BUF@MIA', ''],
  ]);
  const brad = r.picks[0];
  assert.deepEqual([brad.source.kind, brad.source.author, brad.source.messageAt, brad.source.lineNo], ['whatsapp', 'Brad Holm', '2026-10-29T19:41:02', 1]);
  assert.match(brad.source.rawHash, /^[0-9a-f]{16}$/);
  assert.equal(parseWhatsAppExport(EXPORT, { roster, week: 9 }).picks[0].source.rawHash, brad.source.rawHash, 'hash is deterministic');
  assert.equal(r.picks[1].source.lineNo, 3, 'block line points at the HOLM PICK header');
  assert.equal(r.picks[1].leg.odds, -110);
});

test('malformed and out-of-scope lines are reported with line numbers, not saved', () => {
  const r = parseWhatsAppExport(EXPORT, { roster, week: 9 });
  const byLine = Object.fromEntries(r.errors.map((e) => [e.line, e.reason]));
  assert.match(byLine[10], /Kyle Heller is not in this week's parlay/);
  assert.match(byLine[11], /Unknown manager "Nobody Real"/);
  assert.match(byLine[12], /marked Week 8; you are importing Week 9/);
  assert.match(byLine[17], /no game/);
  assert.match(byLine[19], /missing Game, Pick/);
  assert.deepEqual(r.skipped.map((s) => s.line), [2, 18]);
});

test('Android export format and plain pastes parse too', () => {
  const android = '10/29/26, 7:41 PM - Brad Holm: Broncos ML DEN at ARI -238\n10/29/26, 7:42 PM - Hoss: Over 50.5 NE @ CHI';
  const a = parseWhatsAppExport(android, { roster, week: 9 });
  assert.deepEqual(a.picks.map((p) => [p.who, p.leg.team, p.source.messageAt]), [['Brad Holm', 'DEN', '2026-10-29T19:41:00'], ['Ryan Hoffman', '', '2026-10-29T19:42:00']]);
  const plain = parseWhatsAppExport('Brad | Chiefs ML | KC at LV | -130\nJoey: Patriots -3.5 NYJ at NE\nrandom words', { roster, week: 9 });
  assert.equal(plain.exportFormat, false);
  assert.deepEqual(plain.picks.map((p) => [p.who, p.leg.team, p.leg.line]), [['Brad Holm', 'KC', ''], ['Joe Mckeon', 'NE', -3.5]]);
  assert.equal(plain.skipped.length, 1);
});

test('nicknames resolve exactly; fuzzy substrings do not', () => {
  const r = parseWhatsAppExport('Bra: Chiefs ML KC at LV\nBrlaude: Chiefs ML KC at LV', { roster, week: 9 });
  assert.equal(r.picks.length, 1);
  assert.equal(r.picks[0].who, 'Brad Holm');
  assert.match(r.errors[0].reason, /Unknown manager "Bra"/);
});

test('a moneyline that names neither team is an error, not a guess', () => {
  const r = parseWhatsAppExport('Brad: Lions ML KC at LV', { roster, week: 9 });
  assert.equal(r.picks.length, 0);
  assert.match(r.errors[0].reason, /Can't tell which team/);
});

test('empty, non-string and garbage input fail cleanly', () => {
  assert.match(parseWhatsAppExport('', { roster, week: 9 }).errors[0].reason, /empty/);
  assert.match(parseWhatsAppExport(null, { roster, week: 9 }).errors[0].reason, /empty/);
  const junk = parseWhatsAppExport('\u0000\u0001 ### \n\n[99/99/26, 7:41 PM] Brad: KC ML KC at LV', { roster, week: 9 });
  assert.equal(junk.picks.length, 0);
  assert.match(junk.errors.map((e) => e.reason).join(' '), /Unreadable timestamp/);
});

test('multi-line messages join the previous message', () => {
  const m = splitMessages('[10/29/26, 7:41 PM] Brad Holm: first\nsecond line\n[10/29/26, 7:42 PM] Hoss: next').messages;
  assert.equal(m.length, 2);
  assert.equal(m[0].text, 'first\nsecond line');
});

// ---------- de-duplication ----------

const pick = (who, label, team, at, hash) => ({
  season: 2026, week: 9, who,
  leg: { type: 'ml', label, team, game: ['KC', 'LV'] },
  source: { kind: 'whatsapp', messageAt: at, rawHash: hash || who + label + at },
});

test('dedupe drops repeated messages and reposted picks', () => {
  const a = pick('Brad Holm', 'Chiefs ML', 'KC', '2026-10-29T19:00:00', 'h1');
  const r = dedupePicks([a, Object.assign({}, a), pick('Brad Holm', 'KC ML', 'KC', '2026-10-29T19:05:00')], []);
  assert.equal(r.accepted.length, 1);
  assert.deepEqual(r.duplicates.map((d) => d.reason), ['Same message appears twice in the paste', 'Same pick posted again']);
  assert.equal(r.conflicts.length, 0);
});

test('dedupe flags conflicts by default and saves nothing for that manager', () => {
  const r = dedupePicks([pick('Brad Holm', 'Chiefs ML', 'KC', 't1'), pick('Brad Holm', 'Raiders ML', 'LV', 't2')], []);
  assert.equal(r.accepted.length, 0);
  assert.equal(r.conflicts.length, 2);
  const saved = [{ who: 'Brad Holm', leg: { type: 'ml', label: 'Chiefs ML', team: 'KC', game: ['KC', 'LV'] } }];
  const vsSaved = dedupePicks([pick('Brad Holm', 'Raiders ML', 'LV', 't3')], saved, { season: 2026, week: 9 });
  assert.equal(vsSaved.accepted.length, 0);
  assert.match(vsSaved.conflicts[0].reason, /already has a different saved pick \(Chiefs ML\); not overwritten/);
  const same = dedupePicks([pick('Brad Holm', 'Chiefs ML', 'KC', 't4')], saved, { season: 2026, week: 9 });
  assert.equal(same.duplicates[0].reason, 'Already saved');
});

test('dedupe policies keep-saved and latest behave as named', () => {
  const saved = [{ who: 'Brad Holm', leg: { type: 'ml', label: 'Chiefs ML', team: 'KC', game: ['KC', 'LV'] } }];
  const keep = dedupePicks([pick('Brad Holm', 'Raiders ML', 'LV', 't3')], saved, { policy: 'keep-saved', season: 2026, week: 9 });
  assert.equal(keep.accepted.length, 0);
  assert.match(keep.conflicts[0].reason, /kept it/);
  const latest = dedupePicks([pick('Brad Holm', 'Chiefs ML', 'KC', '2026-10-29T19:00:00'), pick('Brad Holm', 'Raiders ML', 'LV', '2026-10-29T20:00:00')], saved, { policy: 'latest', season: 2026, week: 9 });
  assert.equal(latest.accepted.length, 1);
  assert.equal(latest.accepted[0].leg.label, 'Raiders ML');
  assert.ok(latest.accepted[0].replaces);
});

// ---------- sportsbook slips ----------

const W7_SLIP = [
  'DraftKings',
  '11 Pick Parlay +22840',
  'Denver Broncos Moneyline -238',
  'Under 39.5 Dolphins @ Jets -112',
  'Carolina Panthers ML -162',
  'J.J. McCarthy Over 0.5 Interceptions -197',
  'Chicago Bears ML',
  'Over 50.5 Patriots @ Bears',
  'A.J. Brown Anytime TD Over 0.5',
  'Detroit Lions ML',
  'Jordan Love Over 281.5 Passing Yards',
  'Christian Watson Over 79.5 Receiving Yards',
  'Jahmyr Gibbs Anytime TD Over 0.5',
  'Wager $10.00',
  'To Pay $2,294.04',
].join('\n');

test('slip text parses wager, odds, to-pay and book', () => {
  const s = parseSlip(W7_SLIP);
  assert.deepEqual([s.book, s.odds, s.stake, s.toPay, s.legs.length], ['DraftKings', 22840, 10, 2294.04, 11]);
});

test('the real Week 7 slip matches all 11 picks', () => {
  const picks = byWeek[7].legs.map((l) => ({ who: l.who, leg: l }));
  const m = matchSlip(parseSlip(W7_SLIP), picks);
  assert.equal(m.matched.length, 11);
  assert.equal(m.complete, true);
});

test('a slip leg that matches no pick is reported, and the slip is not evidence', () => {
  const w7 = byWeek[7];
  const picks = w7.legs.map((l) => ({ who: l.who, leg: l }));
  const slip = parseSlip(W7_SLIP.replace('Detroit Lions ML', 'Las Vegas Raiders ML'));
  const m = matchSlip(slip, picks);
  assert.equal(m.complete, false);
  assert.ok(m.unmatchedSlip.some((u) => /Raiders/.test(u.slipLeg.text) && /No saved pick/.test(u.reason)));
  assert.ok(m.unmatchedPicks.some((u) => u.pick.leg.label === 'Lions ML'));
  assert.equal(slipEvidence(m, '2026-10-30'), null);
});

test('a slip leg that fits two picks equally is ambiguous, not guessed', () => {
  const picks = [
    { who: 'Brad Holm', leg: { type: 'ml', team: 'KC', label: 'Chiefs ML', game: ['KC', 'LV'] } },
    { who: 'Ryan Hoffman', leg: { type: 'ml', team: 'KC', label: 'KC ML', game: ['KC', 'LV'] } },
  ];
  const m = matchSlip(parseSlip('Kansas City Chiefs ML -150'), picks);
  assert.equal(m.matched.length, 0);
  assert.match(m.unmatchedSlip[0].reason, /more than one pick: Brad Holm, Ryan Hoffman/);
});

test('malformed slip JSON and empty slips fail cleanly', () => {
  assert.match(parseSlip('{"legs": [').errors[0].reason, /does not parse/);
  assert.match(parseSlip('{"odds": 100}').errors[0].reason, /legs/);
  assert.match(parseSlip('   ').errors[0].reason, /empty/);
  const json = parseSlip(JSON.stringify({ book: 'FanDuel', odds: 500, legs: [{ label: 'Chiefs ML', odds: -150 }, {}] }));
  assert.equal(json.legs.length, 1);
  assert.match(json.errors[0].reason, /no label/);
});

test('a fully matched slip becomes placement evidence (and nothing is graded)', () => {
  const picks = [
    { who: 'Brad Holm', leg: { type: 'ml', team: 'KC', label: 'Chiefs ML', game: ['KC', 'LV'] } },
    { who: 'Ryan Hoffman', leg: { type: 'total', side: 'under', line: 44.5, label: 'Under 44.5', game: ['BUF', 'MIA'] } },
  ];
  const m = matchSlip(parseSlip('FanDuel\nKansas City Chiefs ML -150\nUnder 44.5 Bills @ Dolphins -110\n2 Leg Parlay +240\nWager $10\nTo Pay $34.00'), picks);
  assert.equal(m.complete, true);
  const ev = slipEvidence(m, '2026-10-30T12:00:00Z');
  assert.equal(ev.state, 'placed');
  assert.match(ev.evidence, /2 legs matched · FanDuel/);
  assert.equal(ev.toPay, 34);
  assert.ok(picks.every((p) => p.leg.result === undefined), 'matching a slip never writes a result');
});

// ---------- state separation ----------

test('pick saved, contribution recorded and ticket placed are separate facts', () => {
  const proposed = { week: 9, stake: 10, legs: [{ who: 'Brad Holm', type: 'ml', label: 'Chiefs ML' }], submissions: { 'Brad Holm': {} } };
  const s1 = weekStates(proposed);
  assert.equal(s1.picksSaved, 1);
  assert.equal(s1.ticket.state, 'proposed', 'saved picks are not a placed ticket');
  const paid = Object.assign({}, proposed, { contributions: [{ who: 'Brad Holm', amount: 10, recordedAt: 'x', source: { kind: 'commissioner' } }] });
  const s2 = weekStates(paid);
  assert.equal(s2.contributionsRecorded.amount, 10);
  assert.equal(s2.ticket.state, 'proposed', 'a recorded payment is not a placed ticket');
  assert.equal(isPlaced(s2.ticket), false);
  const placed = Object.assign({}, paid, { ticket: { state: 'placed', evidence: 'Slip imported' } });
  assert.equal(weekStates(placed).ticket.state, 'placed');
});

test('graded legs alone never mark a ticket placed', () => {
  assert.equal(deriveTicket(byWeek[5]).state, 'proposed', 'week 5 has results but no slip data');
  assert.equal(deriveTicket(byWeek[7]).state, 'placed', 'week 7 has slip odds and to-pay');
  assert.equal(deriveTicket(byWeek[8]).state, 'proposed');
  assert.equal(file.weeks.find((w) => w.week === 5).ticket.state, 'proposed', 'migrated file agrees');
});

test('to-pay is hypothetical money; only recorded payouts count', () => {
  const m = weekMoney(byWeek[7]);
  assert.equal(m.hypothetical.toPay, 2294.04);
  assert.equal(m.recorded.payouts, 0);
});

test('hit rate counts decided legs only', () => {
  const r = hitRate(['won', 'lost', 'open', 'unknown', 'unknown', 'push', 'won']);
  assert.deepEqual([r.won, r.lost, r.n, r.open, r.unknown], [2, 1, 3, 1, 2]);
  assert.equal(r.rate, 2 / 3);
  assert.equal(hitRate(['open', 'unknown']).rate, null);
  assert.equal(legStatus({ type: 'ml', result: 'unknown' }), 'unknown');
  assert.equal(legStatus({ type: 'ml' }), 'open');
  assert.equal(legStatus({ type: 'tbd' }), 'unknown');
  assert.equal(legStatus({ type: 'ml' }, { results: 'unknown' }), 'unknown');
});

test('league answers are recorded, and config can still override them', () => {
  assert.equal(OPEN_RULES.length, 15);
  assert.equal(undecidedRules({}).length, 0, 'every rule has a league answer');
  assert.deepEqual([rule({}, 'payoutSplit').value, rule({}, 'payoutSplit').source], ['in-person', 'answer']);
  assert.equal(rule({}, 'importConflict').value, 'slip');
  assert.equal(rule({}, 'editsAndLocks').value, 'until-kickoff');
  assert.equal(rule({}, 'missingPicks').value, 'go-with-what-is-in');
  const o = rule({ rules: { importConflict: 'latest' } }, 'importConflict');
  assert.deepEqual([o.value, o.source], ['latest', 'config']);
});

test('the slip policy never overwrites and says the sportsbook ticket decides', () => {
  const saved = [{ who: 'Brad Holm', leg: { type: 'ml', label: 'Chiefs ML', team: 'KC', game: ['KC', 'LV'] } }];
  const r = dedupePicks([pick('Brad Holm', 'Raiders ML', 'LV', 't3')], saved, { policy: 'slip', season: 2026, week: 9 });
  assert.equal(r.accepted.length, 0);
  assert.match(r.conflicts[0].reason, /not overwritten\. The pick on the placed sportsbook ticket decides/);
});

// ---------- API: import flow with a mocked Supabase ----------

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    send(t) { this.body = typeof t === 'string' ? JSON.parse(t) : t; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; },
  };
}

function fakeSupabase(savedPicks) {
  const calls = [];
  const rows = savedPicks.slice();
  const ok = (data) => ({ ok: true, status: 200, async text() { return JSON.stringify(data); }, async json() { return data; } });
  const impl = async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url: u, method, body });
    if (u.includes('holm_parlay_weeks') && method === 'GET') return ok([]);
    if (u.includes('holm_parlay_picks') && method === 'GET') return ok(rows);
    if (u.includes('holm_parlay_picks') && method === 'POST') { rows.push(body); return ok([body]); }
    if (u.includes('holm_import_records')) return ok([]);
    if (u.includes('rpc/holm_parlay_upsert_week_open')) return ok(null);
    return { ok: false, status: 404, async text() { return '{}'; } };
  };
  return { calls, impl, rows };
}

async function callImport(body, saved) {
  const sb = fakeSupabase(saved || []);
  const prev = global.fetch;
  global.fetch = sb.impl;
  const res = mockRes();
  try { await handler({ method: 'POST', query: {}, body }, res); } finally { global.fetch = prev; }
  return { res, calls: sb.calls };
}

test('API import saves new picks with their source and logs every record', async () => {
  const { res, calls } = await callImport({ week: 9, import: true, text: EXPORT });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.saved.map((s) => s.who), ['Brad Holm', 'Chas Rossman', 'John Sachs']);
  assert.equal(res.body.errors.length, 5);
  assert.equal(res.body.policy, 'slip');
  const upserts = calls.filter((c) => c.url.includes('holm_parlay_picks') && c.method === 'POST');
  assert.equal(upserts.length, 3);
  assert.equal(upserts[0].body.leg.source.author, 'Brad Holm');
  assert.equal(upserts[0].body.leg.source.lineNo, 1);
  const log = calls.find((c) => c.url.includes('holm_import_records'));
  const outcomes = log.body.map((r) => r.outcome).sort();
  assert.deepEqual(outcomes, ['error', 'error', 'error', 'error', 'error', 'saved', 'saved', 'saved']);
  assert.ok(log.body.every((r) => r.raw_hash && r.week === 9 && r.kind === 'whatsapp'));
});

test('API import never overwrites a different saved pick under the league policy', async () => {
  const saved = [{ who: 'Brad Holm', source: 'web', leg: { type: 'ml', label: 'Raiders ML', team: 'LV', game: ['KC', 'LV'] }, updated_at: 'x' }];
  const { res, calls } = await callImport({ week: 9, import: true, text: '[10/29/26, 7:41 PM] Brad Holm: Chiefs ML KC at LV' }, saved);
  assert.equal(res.body.saved.length, 0);
  assert.equal(res.body.conflicts.length, 1);
  assert.equal(calls.filter((c) => c.url.includes('holm_parlay_picks') && c.method === 'POST').length, 0);
});

test('legacy pre-parsed imports are validated before saving', async () => {
  const { res } = await callImport({ week: 9, import: true, picks: [{ who: 'Brad', leg: { type: 'ml', label: 'Chiefs ML' } }] });
  assert.equal(res.body.saved.length, 0);
  assert.match(res.body.errors[0].reason, /Need both teams/);
});

test('auto-commit proposes the ticket; it never claims it was placed', async () => {
  const eleven = roster.map((who, i) => ({ who, source: 'web', leg: { type: 'ml', label: `T${i} ML`, team: 'T' + i, game: ['T' + i, 'H' + i] }, updated_at: 'x' }));
  const last = eleven.pop();
  const sb = fakeSupabase(eleven);
  const prev = global.fetch;
  global.fetch = sb.impl;
  const res = mockRes();
  try { await handler({ method: 'POST', query: {}, body: { week: 9, who: last.who, leg: last.leg } }, res); } finally { global.fetch = prev; }
  assert.equal(res.body.committed, true);
  const rpc = sb.calls.find((c) => c.url.includes('rpc/holm_parlay_upsert_week_open'));
  assert.equal(rpc.body.p_data.ticket.state, 'proposed');
  assert.match(rpc.body.p_data.ticket.evidence, /Not placed/);
  assert.equal(rpc.body.p_data.placedBy, undefined);
});
