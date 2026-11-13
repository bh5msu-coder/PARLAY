import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPlayers, firstScoreToForm, formPropKey, legPropKey, propToForm, slimRoster } from '../lib/props.mjs';
import { formToLeg } from '../lib/pick-form.mjs';
import { marketKey, parseType, guessStat, validatePick } from '../lib/ticket.mjs';
import { firstScoringTeam, firstTouchdown, gradeLeg } from '../lib/grade.mjs';
import { legMarket } from '../lib/pick-lines.mjs';
import handler from '../pages/api/espn.js';

const game = { away: 'KC', home: 'LV', awayId: '12', homeId: '13' };
const espnRoster = {
  athletes: [
    { position: 'offense', items: [
      { displayName: 'Patrick Mahomes', position: { abbreviation: 'QB' } },
      { displayName: 'Travis Kelce', position: { abbreviation: 'TE' } },
      { displayName: 'Isiah Pacheco', position: { abbreviation: 'RB' } },
      { displayName: 'Lead Blocker', position: { abbreviation: 'FB' } },
      { displayName: 'Big Guard', position: { abbreviation: 'G' } },
      { displayName: 'Hurt Wideout', position: { abbreviation: 'WR' }, status: { type: 'injured-reserve' } },
    ] },
    { position: 'defense', items: [{ displayName: 'Chris Jones', position: { abbreviation: 'DT' } }] },
  ],
};
const gs = (state, away, home) => ({ state, detail: 'Q2', home: { abbr: 'LV', score: home }, away: { abbr: 'KC', score: away }, date: '2026-11-15T18:00Z', id: '1' });
const td = (text, abbr) => ({ type: { text: 'Passing Touchdown' }, text, team: { abbreviation: abbr } });
const fg = (text, abbr) => ({ type: { text: 'Field Goal Good' }, text, team: { abbreviation: abbr } });

test('props: the roster is cut to active skill players, in QB RB WR TE order', () => {
  const list = slimRoster(espnRoster);
  assert.deepEqual(list.map((p) => p.name + ':' + p.pos), ['Patrick Mahomes:QB', 'Isiah Pacheco:RB', 'Lead Blocker:RB', 'Travis Kelce:TE']);
  assert.deepEqual(slimRoster(null), []);
  assert.deepEqual(filterPlayers(list, 'RB', 'pach').map((p) => p.name), ['Isiah Pacheco']);
});

test('props: one tap fills a pick the Pick form and the server both accept', () => {
  const any = formToLeg(propToForm(game, 'Travis Kelce', 'anyTD', 'Brad Holm'));
  assert.deepEqual([any.type, any.stat, any.player, any.line, any.label, any.game], ['player', 'anyTD', 'Travis Kelce', 0.5, 'Travis Kelce Anytime TD', ['KC', 'LV']]);
  assert.deepEqual(validatePick(any, 'Brad Holm'), []);
  const first = formToLeg(propToForm(game, 'Travis Kelce', 'firstTD', 'Brad Holm'));
  assert.deepEqual([first.stat, first.label], ['firstTD', 'Travis Kelce First TD']);
  assert.notEqual(marketKey(any), marketKey(first));
  const team = formToLeg(firstScoreToForm(game, 'home', 'Brad Holm'));
  assert.deepEqual([team.type, team.team, team.label], ['first', 'LV', 'LV scores first']);
  assert.deepEqual(validatePick(team, 'Brad Holm'), []);
  assert.deepEqual(validatePick(Object.assign({}, team, { team: '' }), 'Brad Holm'), ['Pick a team']);
  assert.equal(propToForm(game, 'Travis Kelce', 'recYds', ''), null);
  assert.equal(legMarket(team, game), 'first-home');
  assert.equal(formPropKey(propToForm(game, 'Travis Kelce', 'anyTD', '')), legPropKey(any));
  assert.equal(formPropKey(firstScoreToForm(game, 'home', '')), legPropKey(team));
});

test('props: typed and imported bets read "first TD" and "scores first"', () => {
  assert.equal(parseType('Chiefs scores first'), 'first');
  assert.equal(parseType('first to score: KC'), 'first');
  assert.equal(parseType('Kelce first TD'), 'player');
  assert.equal(guessStat('Kelce first TD'), 'firstTD');
  assert.equal(guessStat('Kelce anytime TD'), 'anyTD');
  // A touchdown prop is yes or no; a yardage prop still needs its number.
  assert.deepEqual(validatePick({ type: 'player', label: 'Kelce TD', game: ['KC', 'LV'], player: 'Kelce', stat: 'anyTD', line: '' }, 'Brad Holm'), []);
  assert.deepEqual(validatePick({ type: 'player', label: 'Kelce yds', game: ['KC', 'LV'], player: 'Kelce', stat: 'recYds', line: '' }, 'Brad Holm'), ['Prop needs a line']);
});

test('grade: First TD goes to the scorer, not the passer, and settles on the first touchdown', () => {
  const plays = [fg('Harrison Butker 40 Yd Field Goal', 'KC'), td('Travis Kelce 12 Yd pass from Patrick Mahomes (Harrison Butker Kick)', 'KC'), td('Davante Adams 5 Yd pass', 'LV')];
  const summary = { scoringPlays: plays };
  assert.deepEqual(firstTouchdown(summary, 'Travis Kelce'), { scored: true, mine: true, text: 'Travis Kelce 12 Yd pass from Patrick Mahomes' });
  assert.equal(firstTouchdown(summary, 'Patrick Mahomes').mine, false);
  assert.equal(firstTouchdown({ scoringPlays: [plays[0]] }, 'Travis Kelce').scored, false);
  const leg = (player) => ({ type: 'player', stat: 'firstTD', player, line: 0.5, side: 'over' });
  const live = gradeLeg(leg('Travis Kelce'), { game: gs('in', 10, 0), summary });
  assert.deepEqual([live.state, live.final], ['won', true]);
  assert.equal(gradeLeg(leg('Patrick Mahomes'), { game: gs('in', 10, 0), summary }).state, 'lost');
  assert.equal(gradeLeg(leg('Travis Kelce'), { game: gs('in', 3, 0), summary: { scoringPlays: [plays[0]] } }).state, 'live');
  assert.equal(gradeLeg(leg('Travis Kelce'), { game: gs('post', 3, 0), summary: { scoringPlays: [plays[0]] } }).state, 'lost');
  assert.equal(gradeLeg(leg('Travis Kelce'), { game: gs('pre', 0, 0), summary: null }).state, 'pending');
  assert.equal(gradeLeg(leg('Travis Kelce'), { game: gs('in', 7, 0), summary: null }).state, 'live');
});

test('grade: Scores first counts any score, and a scoreless final is a push', () => {
  const leg = (team) => ({ type: 'first', team });
  const summary = { scoringPlays: [fg('Daniel Carlson 33 Yd Field Goal', 'LV'), td('Travis Kelce 12 Yd pass', 'KC')] };
  assert.equal(firstScoringTeam(summary), 'LV');
  assert.deepEqual([gradeLeg(leg('LV'), { game: gs('in', 0, 3), summary }).state, gradeLeg(leg('LV'), { game: gs('in', 0, 3), summary }).final], ['won', true]);
  assert.equal(gradeLeg(leg('KC'), { game: gs('post', 7, 3), summary }).state, 'lost');
  assert.equal(gradeLeg(leg('KC'), { game: gs('in', 0, 0), summary: { scoringPlays: [] } }).state, 'live');
  assert.equal(gradeLeg(leg('KC'), { game: gs('post', 0, 0), summary: { scoringPlays: [] } }).state, 'push');
  assert.equal(gradeLeg(leg('KC'), { game: gs('in', 0, 3), summary: null }).state, 'live');
  // The team can come from the header when the play only carries an id.
  const byId = { scoringPlays: [{ type: { text: 'Field Goal Good' }, team: { id: '13' } }], header: { competitions: [{ competitors: [{ team: { id: '13', abbreviation: 'LV' } }] }] } };
  assert.equal(firstScoringTeam(byId), 'LV');
});

test('espn proxy: roster needs a numeric team id and returns only slimmed players', async () => {
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(o) { this.body = o; return this; }, send(t) { this.body = t; return this; }, end() { return this; } });
  const prev = global.fetch;
  const urls = [];
  global.fetch = async (url) => { urls.push(String(url)); return { status: 200, ok: true, async text() { return JSON.stringify(espnRoster); } }; };
  try {
    const bad = res();
    await handler({ method: 'GET', query: { path: 'roster', team: '12/../../x' } }, bad);
    assert.equal(bad.statusCode, 400);
    assert.equal(urls.length, 0);
    const ok = res();
    await handler({ method: 'GET', query: { path: 'roster', team: '12' } }, ok);
    assert.equal(urls[0], 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/12/roster');
    assert.deepEqual(ok.body.players.map((p) => p.name), ['Patrick Mahomes', 'Isiah Pacheco', 'Lead Blocker', 'Travis Kelce']);
    global.fetch = async () => ({ status: 500, ok: false, async text() { return 'nope'; } });
    const down = res();
    await handler({ method: 'GET', query: { path: 'roster', team: '12' } }, down);
    assert.deepEqual([down.statusCode, down.body.players], [502, []]);
  } finally { global.fetch = prev; }
});
