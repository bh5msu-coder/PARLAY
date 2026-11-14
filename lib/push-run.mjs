/** Server-side Web Push sweep. Grades the current week, diffs it against the stored snapshot,
 *  and sends only the new alerts. Writes holm_push_subscriptions and holm_push_state only.
 *  holm_parlay_weeks is never read or written here. */
import { gradeWeek } from './grade.mjs';
import { loadDbWeeks } from './db-weeks.mjs';
import { ident } from './ident.mjs';
import { firstKick, planAlerts, pushReady, pushStatus, vapidPublicKey } from './push-events.mjs';

const SEASON = 2026;
const RATE_MS = 40 * 1000;

function serviceHeaders(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
}

function baseUrl(env) {
  return env.SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
}

async function sb(env, fetchImpl, path, opts) {
  const r = await fetchImpl(baseUrl(env) + path, Object.assign({ headers: serviceHeaders(env) }, opts || {}));
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

function espnClient(fetchImpl) {
  const headers = { 'User-Agent': 'HolmLeagueParlay/1.0', Accept: 'application/json' };
  return {
    async scoreboard(week) {
      const params = new URLSearchParams({ seasontype: '2', dates: String(SEASON), week: String(week) });
      const r = await fetchImpl('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?' + params, { headers });
      if (!r.ok) throw new Error('scoreboard ' + r.status);
      return r.json();
    },
    async summary(eventId) {
      const r = await fetchImpl('https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=' + encodeURIComponent(eventId), { headers });
      if (!r.ok) throw new Error('summary ' + r.status);
      return r.json();
    },
  };
}

async function readState(env, fetchImpl, week) {
  const q = `/rest/v1/holm_push_state?season=eq.${SEASON}&week=eq.${week}&select=snapshot,updated_at`;
  const r = await sb(env, fetchImpl, q);
  if (!r.ok) return { missing: r.status === 404 || (r.data && /holm_push_state/.test(JSON.stringify(r.data))) , row: null, status: r.status };
  const row = Array.isArray(r.data) ? r.data[0] : null;
  return { missing: false, row: row || null, status: r.status };
}

async function writeState(env, fetchImpl, week, snapshot) {
  return sb(env, fetchImpl, '/rest/v1/holm_push_state?on_conflict=season,week', {
    method: 'POST',
    headers: Object.assign({}, serviceHeaders(env), { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ season: SEASON, week, snapshot, updated_at: new Date().toISOString() }),
  });
}

async function readPicks(env, fetchImpl, week) {
  const r = await sb(env, fetchImpl, `/rest/v1/holm_parlay_picks?season=eq.${SEASON}&week=eq.${week}&select=who`);
  if (!r.ok || !Array.isArray(r.data)) return [];
  return r.data.map((row) => ident.canonical(row.who) || row.who);
}

async function readSubs(env, fetchImpl) {
  const r = await sb(env, fetchImpl, '/rest/v1/holm_push_subscriptions?select=endpoint,p256dh,auth');
  if (!r.ok || !Array.isArray(r.data)) return [];
  return r.data;
}

async function deleteSub(env, fetchImpl, endpoint) {
  await sb(env, fetchImpl, '/rest/v1/holm_push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), { method: 'DELETE' });
}

/** Send one payload per alert. 404/410 subscriptions are dropped. `webpush` is the web-push module. */
export async function deliverAlerts(subs, alerts, webpush, env) {
  const subject = env.VAPID_SUBJECT;
  const pub = vapidPublicKey(env);
  const priv = env.VAPID_PRIVATE_KEY;
  webpush.setVapidDetails(subject, pub, priv);
  const results = [];
  for (const alert of alerts) {
    const payload = JSON.stringify({ title: alert.title, body: alert.body, url: alert.url, tag: alert.id });
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        results.push({ ok: true, endpoint: sub.endpoint, id: alert.id });
      } catch (e) {
        const status = e && e.statusCode;
        results.push({ ok: false, endpoint: sub.endpoint, id: alert.id, status: status || 0, gone: status === 404 || status === 410 });
      }
    }
  }
  return results;
}

/**
 * Grade one week and send new alerts.
 * @param {{env: object, fetchImpl?: Function, webpush?: object, now?: number, job?: string, week?: number}} opts
 */
export async function runSweep(opts) {
  const env = opts.env || {};
  const fetchImpl = opts.fetchImpl || fetch;
  const job = opts.job === 'missing' ? 'missing' : 'grade';
  if (!pushStatus(env).serviceKey) return { ok: false, skipped: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  if (!pushReady(env)) return { ok: false, skipped: 'vapid not set' };
  let weeks;
  try { weeks = await loadDbWeeks(SEASON, fetchImpl); } catch (e) { return { ok: false, skipped: 'weeks unreadable' }; }
  const want = Number(opts.week);
  const week = (Number.isInteger(want) && weeks.find((w) => w.week === want)) || (weeks.length ? weeks[weeks.length - 1] : null);
  if (!week) return { ok: true, skipped: 'no week', sent: 0 };

  const state = await readState(env, fetchImpl, week.week);
  if (state.missing && state.row == null && state.status && state.status !== 200) {
    return { ok: false, skipped: 'migration', hint: 'Run supabase/migrations/012_web_push.sql in the Supabase SQL editor.' };
  }
  const prevRow = state.row;
  const now = opts.now == null ? Date.now() : opts.now;
  if (job !== 'missing' && prevRow && prevRow.updated_at && now - Date.parse(prevRow.updated_at) < RATE_MS) {
    return { ok: true, skipped: 'recent', sent: 0 };
  }

  const grade = await gradeWeek(week, { espn: espnClient(fetchImpl) });
  // A live ticket with no scoreboard must not overwrite the cursor (that would re-send old hits
  // on the next good read). A week with no legs yet can still send the missing-picks reminder.
  if (grade.error && (week.legs || []).length) return { ok: true, skipped: 'scores unavailable', sent: 0 };

  const picked = await readPicks(env, fetchImpl, week.week);
  const plan = planAlerts({
    prev: prevRow && prevRow.snapshot,
    grade,
    week: week.week,
    season: SEASON,
    roster: ident.parlayRoster(),
    picked,
    now,
    kickoff: firstKick(grade),
    job,
  });
  const wrote = await writeState(env, fetchImpl, week.week, plan.snapshot);
  if (!wrote.ok) return { ok: false, skipped: 'state not saved', status: wrote.status };

  if (!plan.alerts.length) return { ok: true, sent: 0, baseline: plan.baseline, week: week.week, kinds: [] };
  const subs = await readSubs(env, fetchImpl);
  if (!subs.length || !opts.webpush) return { ok: true, sent: 0, baseline: plan.baseline, week: week.week, kinds: plan.alerts.map((a) => a.kind), subscribers: subs.length };

  const results = await deliverAlerts(subs, plan.alerts, opts.webpush, env);
  const gone = new Set(results.filter((r) => r.gone).map((r) => r.endpoint));
  for (const endpoint of gone) await deleteSub(env, fetchImpl, endpoint);
  return {
    ok: true,
    sent: results.filter((r) => r.ok).length,
    baseline: false,
    week: week.week,
    kinds: plan.alerts.map((a) => a.kind),
    removed: gone.size,
  };
}
