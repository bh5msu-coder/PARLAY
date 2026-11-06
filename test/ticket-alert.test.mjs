import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertClaimRow, claimWon, alertSequenceId, shouldAlert, ticketMessage, alertPayload, sendTicketAlert } from '../lib/ticket-alert.mjs';

const ticket = {
  complete: true, count: 2, need: 2, groups: {},
  legs: [
    { who: 'Brad Holm', label: 'BUF -3.5', game: ['BUF', 'MIN'] },
    { who: 'Jace Clark', label: 'LV/SF Over 52.5', game: ['LV', 'SF'] },
  ],
};

test('alerts only on the save that fills the ticket', () => {
  assert.equal(shouldAlert({ complete: false }, { complete: true }), true);
  assert.equal(shouldAlert({ complete: true }, { complete: true }), false, 'edit after full');
  assert.equal(shouldAlert({ complete: false }, { complete: false }), false);
  assert.equal(shouldAlert(null, { complete: true }), true);
  assert.equal(shouldAlert({ complete: false }, null), false);
});

test('WhatsApp message has every leg and the board link', () => {
  const m = ticketMessage(ticket, 9, { url: 'https://x.test' });
  assert.match(m, /Week 9/);
  assert.match(m, /Brad Holm: BUF -3\.5 \(BUF at MIN\)/);
  assert.match(m, /Jace Clark: LV\/SF Over 52\.5/);
  assert.match(m, /https:\/\/x\.test\/pick$/);
});

test('push opens WhatsApp with the ticket on tap', () => {
  const p = alertPayload('t0pic', ticket, 9, { url: 'https://x.test' });
  assert.equal(p.topic, 't0pic');
  assert.equal(p.title, 'Week 9 ticket is full');
  assert.ok(p.click.startsWith('https://wa.me/?text='));
  assert.match(decodeURIComponent(p.click.slice('https://wa.me/?text='.length)), /Jace Clark: LV\/SF Over 52\.5/);
  assert.deepEqual(p.actions.map((a) => a.label), ['Send to WhatsApp', 'Open the board']);
  assert.equal(p.actions[1].url, 'https://x.test/pick');
});

test('send is skipped without a topic and never throws', async () => {
  assert.deepEqual(await sendTicketAlert(ticket, 9, {}), { sent: false, skipped: 'NTFY_TOPIC not set' });
  const boom = async () => { throw new Error('network down'); };
  assert.deepEqual(await sendTicketAlert(ticket, 9, { NTFY_TOPIC: 't' }, boom), { sent: false, error: 'network down' });
});

test('send posts JSON to ntfy with an optional token', async () => {
  let seen;
  const fake = async (url, init) => { seen = { url, init }; return { ok: true, status: 200 }; };
  const r = await sendTicketAlert(ticket, 9, { NTFY_TOPIC: 'abc', NTFY_TOKEN: 'tk', NTFY_SERVER: 'https://n.test/' }, fake);
  assert.deepEqual(r, { sent: true, status: 200 });
  assert.equal(seen.url, 'https://n.test');
  assert.equal(seen.init.headers.Authorization, 'Bearer tk');
  assert.equal(JSON.parse(seen.init.body).topic, 'abc');
});

test('same week always gets the same sequence id, so racing sends collapse into one alert', () => {
  const a = alertPayload('t', ticket, 9);
  const b = alertPayload('t', ticket, 9);
  assert.equal(a.sequence_id, 'holm-ticket-2026-w9');
  assert.equal(a.sequence_id, b.sequence_id);
  assert.notEqual(alertPayload('t', ticket, 10).sequence_id, a.sequence_id);
  assert.equal(alertSequenceId(9), 'holm-ticket-2026-w9');
});

test('claim row is the same for racing requests, so the unique key lets only one send', () => {
  assert.deepEqual(alertClaimRow(9), alertClaimRow(9));
  assert.equal(alertClaimRow(9).raw_hash, 'ticket-full-alert');
  assert.notEqual(alertClaimRow(10).week, alertClaimRow(9).week);
  assert.equal(claimWon(201, [{ id: 1 }]), true, 'won the insert');
  assert.equal(claimWon(201, []), false, 'someone else already claimed it');
  assert.equal(claimWon(404, null), true, 'table missing: fail open');
  assert.equal(claimWon(401, { message: 'rls' }), true, 'no permission: fail open');
});
