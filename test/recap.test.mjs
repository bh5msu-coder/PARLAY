import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { managerContext } from '../lib/recap-context.mjs';
import { MODEL, recapRequest, readRecap, SCHEMA } from '../pages/api/recap.js';

const lore = JSON.parse(readFileSync(new URL('../league-lore.json', import.meta.url), 'utf8'));
const nicknames = JSON.parse(readFileSync(new URL('../data/nicknames.json', import.meta.url), 'utf8'));

test('the recap runs on Claude Fable 5.2 with structured output and the refusal fallback', () => {
  assert.equal(MODEL, 'claude-fable-5-2');
  const body = recapRequest({ week: 9 }, []);
  assert.equal(body.model, 'claude-fable-5-2');
  assert.equal(body.thinking, undefined, 'Fable thinks on its own; an explicit thinking setting is a 400');
  assert.equal(body.temperature, undefined);
  assert.equal(body.output_config.effort, 'high');
  assert.deepEqual(body.output_config.format, { type: 'json_schema', schema: SCHEMA });
  assert.equal(body.fallbacks, 'default');
  assert.ok(body.max_tokens >= 16000, 'room for thinking plus the answer');
  assert.ok(!body.messages.some((m) => m.role === 'assistant'), 'no prefill');
});

test('each manager profile carries league history, nicknames and the commissioner lock', () => {
  const ctx = managerContext(lore, nicknames, { 'Kevin Sack': 'Wally' });
  const brad = ctx.find((m) => m.who === 'Brad Holm');
  assert.deepEqual(brad.career.titles, [2023]);
  assert.ok(brad.recentSeasons.length >= 1 && brad.recentSeasons.every((s) => s.team));
  assert.equal(brad.currentNickname, nicknames.people.brad.nickname);
  assert.equal(ctx.find((m) => m.who === 'Kevin Sack').lockedNickname, 'Wally');
  assert.ok(ctx[0].inWeeklyParlay, 'parlay players first');
});

test('the reply is read from the text block; locked and repeated nicknames are dropped', () => {
  const managers = [
    { who: 'Brad Holm', currentNickname: 'Holm Field Disadvantage', pastNicknames: ['Low Man Brad'] },
    { who: 'Kevin Sack', lockedNickname: 'Wally' },
    { who: 'John Sachs' },
  ];
  const reply = {
    recap: 'Week 9: busted. ',
    nicknames: [
      { who: 'Brad Holm', nick: 'low man brad', why: 'repeat' },
      { who: 'Kevin Sack', nick: 'Sacked', why: 'locked' },
      { who: 'John Sachs', nick: 'Jets Whisperer', why: 'Took NYJ +10.5 and lost by 23.' },
    ],
  };
  const out = readRecap({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(reply) }] }, managers);
  assert.equal(out.recap, 'Week 9: busted.');
  assert.deepEqual(out.nicknames.map((n) => n.who), ['John Sachs']);
});

test('a refusal or a cut-off reply becomes an error, never a half recap', () => {
  assert.match(readRecap({ stop_reason: 'refusal', content: [] }, []).error, /declined/);
  assert.match(readRecap({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"recap": "Wee' }] }, []).error, /ran out of room/);
});
