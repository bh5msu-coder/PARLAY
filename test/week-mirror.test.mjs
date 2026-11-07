import assert from 'node:assert/strict';
import test from 'node:test';
import { PARLAY_11 } from '../lib/ticket.mjs';
import handler from '../pages/api/pick.js';

// Eleven legal picks on eleven different games; the scoreboard is empty, so nothing has kicked off.
const TEAMS = [['DET', 'MIN'], ['BUF', 'MIA'], ['KC', 'LV'], ['SF', 'LAR'], ['DAL', 'NYG'], ['PHI', 'WAS'], ['GB', 'CHI'], ['BAL', 'PIT'], ['CIN', 'CLE'], ['HOU', 'IND'], ['DEN', 'LAC']];
const PICKS = PARLAY_11.map((who, i) => ({ who, source: 'web', updated_at: '2026-11-05T10:00:00.000Z', leg: { type: 'ml', team: TEAMS[i][0], label: TEAMS[i][0] + ' ML', game: TEAMS[i].slice() } }));

async function save(mirrorStatus) {
  const posts = [];
  const prev = global.fetch;
  const ok = (d, status = 200) => ({ ok: status < 400, status, async json() { return d; }, async text() { return JSON.stringify(d); } });
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      posts.push({ u, body });
      if (u.includes('holm_week_put_auto')) return ok({ message: 'nope' }, mirrorStatus);
      return ok(Array.isArray(body) ? body : [body]);
    }
    if (u.includes('holm_parlay_picks')) return ok(PICKS);
    if (u.includes('site.api.espn.com')) return ok({ events: [] });
    return ok([]);
  };
  const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, send(t) { this.body = JSON.parse(t); return this; }, end() { return this; } };
  try {
    await handler({ method: 'POST', query: {}, body: { week: 9, who: 'Brad Holm', leg: PICKS[0].leg } }, res);
  } finally { global.fetch = prev; }
  return { res, posts };
}

test('the 11-pick auto-commit also writes the week to holm_tickets + holm_legs', async () => {
  const { res, posts } = await save(200);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.committed, true);
  assert.equal(res.body.mirror, 'ok');
  const old = posts.find((p) => p.u.includes('holm_parlay_upsert_week_open'));
  const mirror = posts.find((p) => p.u.includes('holm_week_put_auto'));
  assert.ok(old && mirror);
  assert.equal(mirror.body.p_week, 9);
  assert.equal(mirror.body.p_ticket.state, 'proposed');
  assert.equal(mirror.body.p_legs.length, 11);
  assert.deepEqual(mirror.body.p_legs.map((l) => l.leg_id), old.body.p_data.legs.map((l) => l.id), 'same legs, same ids as the old table');
  assert.equal(mirror.body.p_legs.find((l) => l.who === 'Brad Holm').leg_id, 'w9-brad');
});

test('a failed mirror is reported but never fails the save', async () => {
  const { res } = await save(404);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.committed, true);
  assert.match(res.body.mirror, /^failed 404/);
});
