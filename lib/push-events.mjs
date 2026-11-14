import { timingSafeEqual } from 'node:crypto';

/** Decide which Web Push alerts a grade change is worth. Pure: no network, no secrets.
 *  The first time a week is seen, the snapshot is stored and nothing is sent, so turning alerts
 *  on mid-season does not replay every leg that already hit. */

export function legId(leg) {
  if (!leg) return 'leg';
  if (leg.id) return String(leg.id);
  return [leg.who, leg.label, (leg.game || []).join('@')].filter(Boolean).join('|') || 'leg';
}

function firstName(who) {
  const s = String(who || '').trim();
  return s.split(/\s+/)[0] || 'Someone';
}

/** Weekday and hour in America/New_York, for the "picks still out" window. */
export function etParts(now) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, hour: Number(parts.hour) };
}

/** Thursday 4pm ET through Sunday, and only before the first kickoff when we know it. */
export function inMissingWindow(now, kickoff) {
  if (kickoff != null && Number(now) >= Number(kickoff)) return false;
  const { weekday, hour } = etParts(now);
  if (weekday === 'Thu') return hour >= 16;
  return weekday === 'Fri' || weekday === 'Sat' || weekday === 'Sun';
}

export function firstKick(grade) {
  const times = ((grade && grade.graded) || [])
    .map((g) => (g.gameDate ? Date.parse(g.gameDate) : NaN))
    .filter((n) => !Number.isNaN(n));
  if (!times.length) return null;
  return Math.min(...times);
}

/** True when a freshly graded week differs from the one already on screen. */
export function gradeChanged(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  const states = (g) => (g && g.graded || []).map((x) => x.state).join(',');
  const ticket = (g) => (g && g.summary && g.summary.state) || '';
  return states(prev) !== states(next) || ticket(prev) !== ticket(next);
}

function legRows(grade) {
  return ((grade && grade.graded) || []).map((g) => ({
    id: legId(g.leg),
    state: g.state,
    who: g.leg && g.leg.who,
    label: (g.leg && g.leg.label) || '',
  }));
}

/**
 * @param {{prev?: object, grade: object, week: number, season?: number, roster?: string[], picked?: string[], now?: number, kickoff?: number|null, job?: string}} opts
 * `job` is `grade` (hits, busts, cash, and the missing reminder) or `missing` (the reminder only).
 */
export function planAlerts(opts) {
  const grade = opts.grade || {};
  const week = opts.week;
  const season = opts.season || 2026;
  const job = opts.job || 'grade';
  const legs = legRows(grade);
  const ticket = (grade.summary && grade.summary.state) || 'open';
  const seen = !!(opts.prev && opts.prev.seen);
  const sent = new Set((opts.prev && opts.prev.sent) || []);
  const snapshot = {
    seen: true,
    legs: legs.map(({ id, state }) => ({ id, state })),
    ticket,
    sent: [...sent],
  };
  const prev = seen ? opts.prev : null;

  const alerts = [];
  // Leg and ticket alerts only after a baseline snapshot exists, so enabling push mid-season
  // does not replay hits that already happened. The missing-picks reminder can fire on first sight.
  if (prev && job !== 'missing') {
    const before = new Map((prev.legs || []).map((l) => [l.id, l.state]));
    let died = false;
    for (const leg of legs) {
      if (before.get(leg.id) === leg.state) continue;
      if (leg.state === 'won') {
        alerts.push({
          id: `leg-hit:${season}:${week}:${leg.id}`,
          kind: 'leg-hit',
          title: 'Leg hit',
          body: `${firstName(leg.who)} — ${leg.label}`,
          url: '/week',
        });
      } else if (leg.state === 'lost') {
        const kills = ticket === 'busted' && prev.ticket !== 'busted';
        if (kills && !died) {
          died = true;
          alerts.push({
            id: `ticket-dies:${season}:${week}`,
            kind: 'ticket-dies',
            title: 'Ticket busted',
            body: `${firstName(leg.who)} missed: ${leg.label}`,
            url: '/week',
          });
        } else if (!kills && ticket !== 'busted') {
          alerts.push({
            id: `leg-bust:${season}:${week}:${leg.id}`,
            kind: 'leg-bust',
            title: 'Leg missed',
            body: `${firstName(leg.who)} — ${leg.label}`,
            url: '/week',
          });
        }
      }
    }
    if (ticket === 'cashed' && prev.ticket !== 'cashed') {
      alerts.push({
        id: `ticket-cash:${season}:${week}`,
        kind: 'ticket-cash',
        title: 'Ticket cashed',
        body: `Week ${week} hit. Every leg got there.`,
        url: '/week',
      });
    }
  }

  const missing = (opts.roster || []).filter((n) => !(opts.picked || []).includes(n));
  const missingId = `picks-missing:${season}:${week}`;
  if (missing.length && inMissingWindow(opts.now == null ? Date.now() : opts.now, opts.kickoff) && !sent.has(missingId)) {
    const names = missing.slice(0, 4).map(firstName).join(', ');
    const more = missing.length > 4 ? ` +${missing.length - 4}` : '';
    alerts.push({
      id: missingId,
      kind: 'picks-missing',
      title: 'Picks still out',
      body: `Week ${week} still needs ${names}${more}.`,
      url: '/week#pick',
    });
  }

  // The reminder job must not record live leg states, or a hit between grade sweeps would be swallowed.
  if (job === 'missing' && prev) {
    snapshot.legs = prev.legs || [];
    snapshot.ticket = prev.ticket || snapshot.ticket;
  }
  const fresh = alerts.filter((a) => a.id && !sent.has(a.id));
  for (const a of fresh) sent.add(a.id);
  snapshot.sent = [...sent];
  return { alerts: fresh, baseline: !seen, snapshot };
}

function has(env, ...names) {
  return names.some((n) => env && typeof env[n] === 'string' && env[n].trim() !== '');
}

/** Booleans only. Safe to put on /api/health. */
export function pushStatus(env) {
  return {
    vapidPublic: has(env, 'VAPID_PUBLIC_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    vapidPrivate: has(env, 'VAPID_PRIVATE_KEY'),
    vapidSubject: has(env, 'VAPID_SUBJECT'),
    cronSecret: has(env, 'CRON_SECRET', 'PUSH_CRON_SECRET'),
    serviceKey: has(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function pushReady(env) {
  const s = pushStatus(env);
  return s.vapidPublic && s.vapidPrivate && s.vapidSubject && s.serviceKey;
}

export function vapidPublicKey(env) {
  return (env && (env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)) || '';
}

/** Twelve phones, a couple of browsers each, and a little room. Stops a stranger filling the table. */
export const SUBSCRIPTION_CAP = 40;

export function subscriptionRoom(existingCount, alreadyStored) {
  if (alreadyStored) return true;
  return Number(existingCount) < SUBSCRIPTION_CAP;
}

/** A new endpoint can be stored. An endpoint already on file can be refreshed only by someone
 *  who still has its auth key (the same subscription, or a rotation that presents the old key). */
export function registrationAllowed(storedAuth, incomingAuth, previousAuth) {
  if (!storedAuth) return true;
  if (secretMatch(incomingAuth, storedAuth)) return true;
  if (previousAuth && secretMatch(previousAuth, storedAuth)) return true;
  return false;
}

/** Equal-length compare. A missing or different-length secret is a no, without throwing. */
export function secretMatch(given, expected) {
  const a = Buffer.from(String(given ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (!expected || a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. No secret, or the wrong one, is a no.
 *  Sweeps do not run for an anonymous caller. */
export function cronAuthorized(authorization, env) {
  const secret = (env && (env.CRON_SECRET || env.PUSH_CRON_SECRET)) || '';
  if (!secret) return false;
  const header = String(authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return secretMatch(bearer, secret);
}

export function sweepRequested(method, query, body) {
  if (method === 'GET' && query && (query.job === 'grade' || query.job === 'missing' || query.job === 'sweep')) return true;
  if (method === 'POST' && body && body.op === 'sweep') return true;
  return false;
}

function isIpHost(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(':')) return true;
  return false;
}

/** Browser push services only. Anything else would make the server call a URL a stranger chose,
 *  including a private address. */
export function pushEndpointAllowed(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch (e) { return false; }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (isIpHost(host)) return false;
  if (host === 'fcm.googleapis.com' || host === 'android.googleapis.com') return true;
  if (host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com') return true;
  if (/^[a-z0-9-]+\.notify\.windows\.com$/.test(host)) return true;
  return false;
}

/** The browser's PushSubscription, checked before it is stored. */
export function normalizeSubscription(body) {
  const sub = body && body.subscription;
  const endpoint = sub && typeof sub.endpoint === 'string' ? sub.endpoint.trim() : '';
  const keys = sub && sub.keys;
  if (!endpoint || !pushEndpointAllowed(endpoint)) return { error: 'Need a browser push endpoint' };
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || !keys.p256dh || !keys.auth) {
    return { error: 'Need push keys' };
  }
  if (endpoint.length > 2000 || keys.p256dh.length > 200 || keys.auth.length > 200) return { error: 'Push subscription is too large' };
  const who = String((body && body.who) || '').trim().slice(0, 80);
  return { row: { endpoint, p256dh: keys.p256dh, auth: keys.auth, who } };
}
