/** Web Push for the Holm Parlay home-screen app.
 *  GET /api/push                         → the public VAPID key (it is public by design)
 *  POST { op:'subscribe', subscription, who }
 *  POST { op:'unsubscribe', endpoint }
 *  POST { op:'sweep' }                   → same sweep; requires Authorization: Bearer CRON_SECRET
 *  GET  /api/push?job=grade              → sweep, for Vercel Cron (same secret)
 *  GET  /api/push?job=missing            → the "picks still out" reminder only (same secret)
 *  Never returns private keys. Writes only holm_push_subscriptions and holm_push_state.
 *  The open app does not start a sweep. A GET job from another site cannot either. */
import webpush from 'web-push';
import { cronAuthorized, normalizeSubscription, pushReady, registrationAllowed, secretMatch, subscriptionRoom, sweepRequested, vapidPublicKey, SUBSCRIPTION_CAP } from '../../lib/push-events.mjs';
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

function authorized(req) {
  return cronAuthorized(req.headers && (req.headers.authorization || req.headers.Authorization), process.env);
}

export default async function handler(req, res) {
  const body = req.body || {};
  if (sweepRequested(req.method, req.query, body)) {
    if (!authorized(req)) {
      json(res, 401, { error: 'This sweep needs the cron secret' });
      return;
    }
    const job = req.method === 'GET' && req.query && req.query.job === 'missing' ? 'missing' : 'grade';
    const week = req.method === 'GET' ? req.query.week : body.week;
    const out = await runSweep({ env: process.env, webpush, job, week });
    json(res, 200, out);
    return;
  }

  if (req.method === 'GET') {
    const sweeps = !!(process.env.CRON_SECRET || process.env.PUSH_CRON_SECRET);
    json(res, 200, { publicKey: vapidPublicKey(process.env), ready: pushReady(process.env), sweeps });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'GET or POST only' });
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    json(res, 503, { error: 'Push storage is not configured', hint: 'Set SUPABASE_SERVICE_ROLE_KEY on this deploy, and run supabase/migrations/012_web_push.sql.' });
    return;
  }

  if (body.op === 'unsubscribe') {
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const auth = typeof body.auth === 'string' ? body.auth : '';
    if (!endpoint || !auth) { json(res, 400, { error: 'Need the endpoint and its auth key' }); return; }
    const found = await fetch(supabaseUrl() + '/rest/v1/holm_push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint) + '&select=endpoint,auth', {
      headers: serviceHeaders(),
    });
    const rows = await found.json().catch(() => null);
    if (!found.ok || !Array.isArray(rows)) { json(res, 502, { error: 'Could not read the subscription' }); return; }
    const row = rows[0];
    if (!row) { json(res, 200, { ok: true }); return; }
    if (!secretMatch(auth, row.auth)) { json(res, 403, { error: 'That key does not match this phone' }); return; }
    const r = await fetch(supabaseUrl() + '/rest/v1/holm_push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), {
      method: 'DELETE',
      headers: serviceHeaders({ Prefer: 'return=minimal' }),
    });
    json(res, r.ok ? 200 : 502, r.ok ? { ok: true } : { error: 'Could not remove the subscription' });
    return;
  }

  const parsed = normalizeSubscription(body);
  if (parsed.error) { json(res, 400, { error: parsed.error }); return; }
  const existing = await fetch(supabaseUrl() + '/rest/v1/holm_push_subscriptions?endpoint=eq.' + encodeURIComponent(parsed.row.endpoint) + '&select=endpoint,auth&limit=1', {
    headers: serviceHeaders(),
  });
  const have = await existing.json().catch(() => null);
  if (!existing.ok || !Array.isArray(have)) { json(res, 502, { error: 'Could not read subscriptions' }); return; }
  const previousAuth = typeof body.previousAuth === 'string' ? body.previousAuth : '';
  if (have.length && !registrationAllowed(have[0].auth, parsed.row.auth, previousAuth)) {
    json(res, 403, { error: 'That phone is already registered' });
    return;
  }
  if (!have.length) {
    const counted = await fetch(supabaseUrl() + '/rest/v1/holm_push_subscriptions?select=id&limit=' + SUBSCRIPTION_CAP, {
      headers: serviceHeaders(),
    });
    const rows = await counted.json().catch(() => null);
    if (!counted.ok || !Array.isArray(rows)) { json(res, 502, { error: 'Could not read subscriptions' }); return; }
    if (!subscriptionRoom(rows.length, false)) {
      json(res, 429, { error: 'This league already has ' + SUBSCRIPTION_CAP + ' phones registered' });
      return;
    }
  }
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
