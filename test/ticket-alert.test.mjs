import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAlert, ticketMessage, alertPayload, sendTicketAlert } from '../lib/ticket-alert.mjs';

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
