/** Web Push for the Holm Parlay home-screen app.
 *  GET /api/push                         → the public VAPID key (it is public by design)
 *  POST { op:'subscribe', subscription, who }
 *  POST { op:'unsubscribe', endpoint }
 *  POST { op:'sweep', week? }            → grade and send new alerts (also called from the open app)
 *  GET  /api/push?job=grade              → same sweep, for Vercel Cron
 *  GET  /api/push?job=missing            → the "picks still out" reminder only
 *  Never returns private keys. Writes only holm_push_subscriptions and holm_push_state. */
import webpush from 'web-push';
import { normalizeSubscription, pushReady, vapidPublicKey } from '../../lib/push-events.mjs';
import { runSweep } from '../../lib/push-run.mjs';

const SEASON = 2026;

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(body));
}

function serviceHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return Object.assign({
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  }, extra || {});
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const job = req.query && req.query.job;
    if (job === 'grade' || job === 'missing' || job === 'sweep') {
      const out = await runSweep({ env: process.env, webpush, job: job === 'missing' ? 'missing' : 'grade', week: req.query.week });
      json(res, 200, out);
      return;
    }
    json(res, 200, { publicKey: vapidPublicKey(process.env), ready: pushReady(process.env) });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'GET or POST only' });
    return;
  }

  const body = req.body || {};
  if (body.op === 'sweep') {
    const out = await runSweep({ env: process.env, webpush, job: 'grade', week: body.week });
    json(res, 200, out);
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    json(res, 503, { error: 'Push storage is not configured', hint: 'Set SUPABASE_SERVICE_ROLE_KEY on this deploy, and run supabase/migrations/012_web_push.sql.' });
    return;
  }

  if (body.op === 'unsubscribe') {
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) { json(res, 400, { error: 'Need an endpoint' }); return; }
    const r = await fetch(supabaseUrl() + '/rest/v1/holm_push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), {
      method: 'DELETE',
      headers: serviceHeaders({ Prefer: 'return=minimal' }),
    });
    json(res, r.ok ? 200 : 502, r.ok ? { ok: true } : { error: 'Could not remove the subscription' });
    return;
  }

  const parsed = normalizeSubscription(body);
  if (parsed.error) { json(res, 400, { error: parsed.error }); return; }
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  const row = Object.assign({}, parsed.row, { user_agent: ua, updated_at: new Date().toISOString() });
  const r = await fetch(supabaseUrl() + '/rest/v1/holm_push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (r.ok) { json(res, 200, { ok: true, season: SEASON }); return; }
  const text = await r.text();
  const missing = r.status === 404 || /holm_push_subscriptions|schema cache|does not exist/i.test(text);
  json(res, missing ? 412 : 502, {
    error: missing ? 'Push table is not set up yet' : 'Could not save the subscription',
    hint: missing ? 'Run supabase/migrations/012_web_push.sql in the Supabase SQL editor once.' : undefined,
  });
}
