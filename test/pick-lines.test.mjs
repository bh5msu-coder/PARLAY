import assert from 'node:assert/strict';
import test from 'node:test';
import { gameLines, tapToForm, legMarket, fmtLine } from '../lib/pick-lines.mjs';
import { formToLeg } from '../lib/pick-form.mjs';
import { validatePick } from '../lib/ticket.mjs';
import { ident } from '../lib/ident.mjs';
import { readFileSync } from 'node:fs';

// Shape of ESPN scoreboard competitions[0].odds[0] (DraftKings), trimmed.
const comp = { odds: [{
  provider: { displayName: 'DraftKings' }, details: 'KC -9.5', overUnder: 47.5, spread: -9.5,
  moneyline: { home: { close: { odds: '-500' } }, away: { close: { odds: '+380' } } },
  pointSpread: { home: { close: { line: '-9.5', odds: '-110' } }, away: { close: { line: '+9.5', odds: '-110' } } },
  total: { over: { close: { line: 'o47.5', odds: '-105' } }, under: { close: { line: 'u47.5', odds: '-115' } } },
}] };
const game = { away: 'NYJ', home: 'KC', pre: true, lines: gameLines(comp) };

test('gameLines reads spread, total and moneyline from the ESPN odds block', () => {
  const L = game.lines;
  assert.equal(L.book, 'DraftKings');
  assert.deepEqual(L.spread.home, { line: -9.5, odds: -110 });
  assert.deepEqual(L.spread.away, { line: 9.5, odds: -110 });
  assert.deepEqual(L.total.over, { line: 47.5, odds: -105 });
  assert.equal(L.total.under.odds, -115);
  assert.equal(L.ml.away.odds, 380);
  assert.equal(L.ml.home.odds, -500);
});

test('gameLines falls back to the flat spread/overUnder and returns null with no odds', () => {
  const L = gameLines({ odds: [{ spread: 3, overUnder: 41 }] });
  assert.equal(L.spread.home.line, 3);
  assert.equal(L.spread.away.line, -3);
  assert.equal(L.total.over.line, 41);
  assert.equal(gameLines({}), null);
  assert.equal(gameLines({ odds: [{}] }), null);
});

test('a tapped line becomes a legal pick that round-trips to the same market', () => {
  for (const m of ['spread-away', 'spread-home', 'total-over', 'total-under', 'ml-away', 'ml-home']) {
    const f = tapToForm(game, m, 'Brad');
    const leg = formToLeg(f);
    assert.equal(legMarket(leg, game), m, m);
    assert.deepEqual(leg.game, ['NYJ', 'KC']);
  }
  const spread = formToLeg(tapToForm(game, 'spread-home', 'Brad'));
  assert.equal(spread.label, 'KC -9.5');
  assert.equal(spread.line, -9.5);
  assert.equal(spread.odds, -110);
  const under = formToLeg(tapToForm(game, 'total-under', 'Brad'));
  assert.equal(under.side, 'under');
  assert.equal(under.line, 47.5);
  assert.equal(fmtLine(9.5), '+9.5');
});

test('tapped picks pass validatePick for a roster manager', () => {
  ident.load(JSON.parse(readFileSync(new URL('../league-lore.json', import.meta.url))));
  const roster = ident.parlayRoster();
  const who = roster[0];
  const leg = formToLeg(tapToForm(game, 'ml-away', who));
  assert.deepEqual(validatePick(leg, who, roster), []);
});
