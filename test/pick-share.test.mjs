import test from 'node:test';
import assert from 'node:assert/strict';
import { savedPickText, waShareHref, savedAtLabel, keepPending, readPending, clearPending, shouldKeep, PENDING_KEY } from '../lib/pick-share.mjs';
import { parseWhatsAppExport } from '../lib/import/whatsapp.mjs';
import { PARLAY_11 } from '../lib/ticket.mjs';

const row = { who: 'Brad Holm', source: 'web', updated_at: '2026-11-04T04:33:42.822Z', leg: { type: 'spread', game: ['BUF', 'MIN'], team: 'BUF', line: -3.5, label: 'BUF -3.5', odds: -102 } };

test('saved pick text is a HOLM PICK block with a board link', () => {
  const t = savedPickText(9, row);
  assert.match(t, /^HOLM PICK W9\nWho: Brad Holm\nGame: BUF at MIN\nType: spread\nPick: BUF -3.5\nOdds: -102/);
  assert.match(t, /Saved on the Holm board: https:\/\/holm-parlay\.vercel\.app\/pick$/);
  assert.equal(savedPickText(9, null), '');
});

test('the shared block reads back through the WhatsApp importer as the same pick', () => {
  const parsed = parseWhatsAppExport(savedPickText(9, row), { roster: PARLAY_11, week: 9, season: 2026 });
  assert.equal(parsed.picks.length, 1);
  assert.equal(parsed.picks[0].who, 'Brad Holm');
  assert.equal(parsed.picks[0].leg.label, 'BUF -3.5');
});

test('share link only pre-fills text; it does not name a recipient', () => {
  const h = waShareHref('a b&c');
  assert.equal(h, 'https://wa.me/?text=a%20b%26c');
});

test('saved-at label', () => {
  assert.equal(savedAtLabel('2026-11-04T04:33:42Z', { timeZone: 'America/Chicago' }), 'Saved Tue 10:33 PM');
  assert.equal(savedAtLabel(''), '');
  assert.equal(savedAtLabel('nope'), '');
});

function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }

test('pending pick survives until cleared, and is dropped for another week', () => {
  const s = mem();
  assert.equal(readPending(s, 9), null);
  keepPending(s, { week: 9, who: 'Brad Holm', leg: row.leg });
  assert.equal(readPending(s, 9).who, 'Brad Holm');
  assert.equal(readPending(s, 10), null);
  assert.equal(s.m.has(PENDING_KEY), false);
  keepPending(s, { week: 9, who: 'Brad Holm', leg: row.leg });
  clearPending(s);
  assert.equal(readPending(s, 9), null);
  s.setItem(PENDING_KEY, '{bad json');
  assert.equal(readPending(s, 9), null);
});

test('only network and server failures are kept for retry', () => {
  assert.equal(shouldKeep(0), true);
  assert.equal(shouldKeep(undefined), true);
  assert.equal(shouldKeep(503), true);
  assert.equal(shouldKeep(429), true);
  assert.equal(shouldKeep(400), false);
  assert.equal(shouldKeep(409), false);
});

test('two pasted HOLM PICK blocks import as two picks', () => {
  const a = savedPickText(9, row);
  const b = savedPickText(9, { who: 'Jace Clark', leg: { type: 'total', game: ['LV', 'SF'], side: 'over', line: 52.5, label: 'LV/SF Over 52.5' } });
  const parsed = parseWhatsAppExport(a + '\n' + b, { roster: PARLAY_11, week: 9, season: 2026 });
  assert.deepEqual(parsed.picks.map((p) => p.who), ['Brad Holm', 'Jace Clark']);
});
