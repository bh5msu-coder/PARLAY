import { assembleTicket, validatePick, PARLAY_11, canonicalWho, nicknameAliases } from '../../lib/ticket.mjs';
import titles from '../../data/nicknames.json' with { type: 'json' };
import { parseWhatsAppExport } from '../../lib/import/whatsapp.mjs';
import { dedupePicks } from '../../lib/import/dedupe.mjs';
import { rawHash } from '../../lib/import/hash.mjs';
import { rule } from '../../lib/rules.mjs';
import { checkPickLock, loadScoreboard } from '../../lib/pick-lock.mjs';
import { shouldAlert, sendTicketAlert, alertClaimRow, claimWon } from '../../lib/ticket-alert.mjs';
import { commitPayload, frozenWeek } from '../../lib/commit.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';
// Service role key is server-only (never NEXT_PUBLIC_). Used for the one privileged call: the 11/11
// auto-commit. Without it, the publishable key is used, as before migration 004.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SEASON = 2026;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};
// Writes (picks, import log, auto-commit) go out with the server-only key when Vercel has it, so the
// tables can be closed to direct browser writes (migration 005). Reads stay on the public key.
const writeHeaders = SERVICE_KEY
  ? Object.assign({}, headers, { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY })
  : headers;

/** POST with the server key; if Supabase rejects that key (wrong project, revoked), fall back to the
 *  public key so picks keep saving exactly as before. extra = per-call headers such as Prefer. */
let serviceRejected = false;
async function writeFetch(url, extra, body) {
  const send = (base) => fetch(url, { method: 'POST', headers: Object.assign({}, base, extra || {}), body });
  if (SERVICE_KEY && !serviceRejected) {
    const r = await send(writeHeaders);
    if (r.status !== 401 && r.status !== 403) return r;
    serviceRejected = true; // the service role is never refused for permissions, so this is a bad key
  }
  return send(headers);
}

/** Does the server key work? Reads a table the public key cannot see (holm_parlay_auth_fails), so
 *  'ok' means a real service key for this project. Never returns the key itself. */
async function serviceKeyHealth() {
  if (!SERVICE_KEY) return 'missing';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/holm_parlay_auth_fails?select=ip&limit=1`, { headers: writeHeaders });
    if (r.ok) return 'ok';
    if (r.status === 401 || r.status === 403) { serviceRejected = true; return 'rejected'; }
    return 'error ' + r.status;
  } catch (e) { return 'unreachable'; }
}

function allowBrowser(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, body) {
  allowBrowser(res);
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(body));
}

async function sbGet(path) {
  const r = await fetch(SUPABASE_URL + path, { headers });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

/** League settings (week 0) and the nicknames that work as names: the commissioner's and Claude's. */
async function loadSettings() {
  const r = await sbGet(`/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&week=eq.0&select=data`);
  const cfg = (r.data && r.data[0] && r.data[0].data) || {};
  return { cfg, aliases: nicknameAliases(cfg.nicknames, titles) };
}

/** The stored week row (data and when it was last written), or null. */
async function loadWeekRow(week) {
  const r = await sbGet(`/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&week=eq.${week}&select=data,updated_at`);
  const row = r.ok && Array.isArray(r.data) ? r.data[0] : null;
  return row ? { data: row.data || {}, updatedAt: row.updated_at || null } : null;
}

/** Once a week's ticket is placed (or the week is locked), its legs are what the book took, so the
 *  week's picks are final. Changing one would leave the board showing a ticket nobody bet. */
function frozenMessage(week, data) {
  return data && data.locked
    ? `Week ${week} is locked. Picks are final.`
    : `Week ${week}'s ticket is placed. Picks are final; ask the commissioner to fix a leg.`;
}

async function loadPicks(week) {
  const r = await sbGet(`/rest/v1/holm_parlay_picks?season=eq.${SEASON}&week=eq.${week}&select=who,source,leg,updated_at`);
  if (!r.ok) return { ok: false, status: r.status, data: r.data };
  return { ok: true, data: r.data || [] };
}

/** Pick history (migration 005) for the Week page's Pick changes card. Only the server key can read it;
 *  any other answer means the card falls back to save times from the current picks. */
async function loadHistory(week) {
  if (!SERVICE_KEY || serviceRejected) return { available: false, reason: SERVICE_KEY ? 'server key rejected' : 'server key missing' };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/holm_parlay_pick_history?season=eq.${SEASON}&week=eq.${week}&select=who,source,leg,op,saved_at&order=saved_at.asc&limit=500`, { headers: writeHeaders });
    if (r.status === 401 || r.status === 403) { serviceRejected = true; return { available: false, reason: 'server key rejected' }; }
    if (!r.ok) return { available: false, reason: r.status === 404 ? 'history table not created yet' : 'history read failed ' + r.status };
    return { available: true, rows: await r.json() };
  } catch (e) { return { available: false, reason: 'history unreachable' }; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    allowBrowser(res);
    res.status(204).end();
    return;
  }
  const week = Number(req.query.week || req.body && req.body.week);
  try {
    if (req.method === 'GET' && req.query.health != null) {
      res.setHeader('Cache-Control', 'no-store');
      json(res, 200, { serviceKey: await serviceKeyHealth(), writesWith: SERVICE_KEY && !serviceRejected ? 'server key' : 'public key' });
      return;
    }
    if (req.method === 'GET' && req.query.history != null) {
      res.setHeader('Cache-Control', 'no-store');
      json(res, 200, Object.assign({ week: week || 0 }, await loadHistory(week || 0)));
      return;
    }
    if (req.method === 'GET') {
      const picks = await loadPicks(week || 0);
      if (!picks.ok) {
        json(res, picks.status === 404 ? 412 : picks.status, {
          error: 'Picks table is not set up yet. Run supabase/picks.sql in the Supabase SQL editor once.',
          detail: picks.data,
        });
        return;
      }
      json(res, 200, { week, picks: picks.data, ticket: assembleTicket(picks.data, PARLAY_11, { week }) });
      return;
    }
    if (req.method !== 'POST') {
      json(res, 405, { error: 'GET or POST' });
      return;
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const wk = Number(body.week);
    if (!wk) { json(res, 400, { error: 'week required' }); return; }

    const roster = PARLAY_11;

    const [stored, { cfg, aliases }] = await Promise.all([loadWeekRow(wk), loadSettings()]);
    if (stored && frozenWeek(stored.data)) { json(res, 409, { error: frozenMessage(wk, stored.data), placed: true }); return; }

    if (body.import) {
      const result = await importPicks(wk, body, roster, cfg, aliases);
      json(res, result.status || 200, result.body);
      return;
    }

    const who = canonicalWho(String(body.who || '').trim(), roster, aliases);
    const source = body.source || 'web';
    const leg = body.leg || {};
    const errors = validatePick(leg, who, roster.length ? roster : null);
    if (errors.length) { json(res, 400, { error: errors.join('. ') }); return; }

    const board = await loadScoreboard(SEASON, wk);
    const current = await loadPicks(wk);
    const mine = current.ok ? current.data.find((r) => canonicalWho(r.who, roster) === who) : null;
    const lock = checkPickLock(board, leg, mine);
    if (!lock.ok) { json(res, 409, { error: lock.reason, locked: true }); return; }

    const result = await upsertOne(wk, who, Object.assign({}, leg, { source: { kind: source === 'whatsapp' ? 'whatsapp' : 'web', savedAt: new Date().toISOString() } }), source, roster);
    if (!result.ok) { json(res, result.status, result); return; }
    const committed = await maybeCommit(wk, roster, current.ok ? current.data : null);
    json(res, 200, { row: result.row, lockChecked: lock.checked, ...committed });
  } catch (e) {
    json(res, 500, { error: e.message || 'pick failed' });
  }
}

async function upsertOne(week, who, leg, source, roster) {
  who = canonicalWho(who, roster);
  const r = await writeFetch(`${SUPABASE_URL}/rest/v1/holm_parlay_picks?on_conflict=season,week,who`,
    { Prefer: 'resolution=merge-duplicates,return=representation' },
    JSON.stringify({ season: SEASON, week, who, source, leg, updated_at: new Date().toISOString() }));
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    return {
      ok: false,
      status: r.status === 404 ? 412 : r.status,
      error: r.status === 404
        ? 'Picks table is not set up yet. Run supabase/picks.sql in the Supabase SQL editor once.'
        : (data && data.message) || text,
      detail: data,
    };
  }
  return { ok: true, row: Array.isArray(data) ? data[0] : data };
}

async function maybeCommit(week, roster, beforePicks) {
  const picks = await loadPicks(week);
  if (!picks.ok) return { picks: [], ticket: null };
  const ticket = assembleTicket(picks.data, roster, { week });
  // The save that fills the ticket pings Brad's phone once (see lib/ticket-alert.mjs).
  const before = Array.isArray(beforePicks) ? assembleTicket(beforePicks, roster, { week }) : null;
  let alert = null;
  if (before && shouldAlert(before, ticket) && process.env.NTFY_TOPIC) {
    alert = (await claimTicketAlert(week)) ? await sendTicketAlert(ticket, week) : { sent: false, skipped: 'already sent for this week' };
  }
  let committed = false;
  if (ticket.complete) {
    const stored = await loadWeekRow(week);
    const payload = commitPayload(stored && stored.data, stored && stored.updatedAt, ticket, picks.data);
    if (!payload) return { picks: picks.data, ticket, committed: false, locked: !!(stored && stored.data.locked), placed: true };
    const rpc = await writeFetch(`${SUPABASE_URL}/rest/v1/rpc/holm_parlay_upsert_week_open`, null,
      JSON.stringify({ p_season: SEASON, p_week: week, p_data: payload }));
    committed = rpc.ok;
    if (!rpc.ok) {
      const t = await rpc.text();
      ticket.commitError = t;
    }
  }
  return { picks: picks.data, ticket, committed, ...(alert ? { alert } : {}) };
}

/** Import a WhatsApp paste: parse → validate → dedupe against saved picks → save accepted → log.
 *  Body: { week, import: true, text } (raw paste, preferred) or { week, import: true, picks: [...] }. */
async function importPicks(week, body, roster, cfg, aliases) {
  const policy = rule(cfg, 'importConflict').value;

  let parsed;
  if (typeof body.text === 'string') {
    parsed = parseWhatsAppExport(body.text, { roster, week, season: SEASON, aliases });
  } else if (Array.isArray(body.picks)) {
    // legacy clients send pre-parsed picks: validate each one, and give it a source
    parsed = { picks: [], errors: [], skipped: [] };
    body.picks.forEach((p, i) => {
      const who = canonicalWho(p && p.who, roster, aliases);
      const leg = Object.assign({}, (p && p.leg) || {});
      const errs = validatePick(leg, who, roster);
      if (errs.length) { parsed.errors.push({ line: i + 1, text: (leg.label || ''), reason: errs.join('; '), who }); return; }
      parsed.picks.push({ season: SEASON, week, who, leg: Object.assign(leg, { who }), source: { kind: 'whatsapp', lineNo: i + 1, rawHash: rawHash(JSON.stringify([who, leg])) } });
    });
  } else {
    return { status: 400, body: { error: 'import needs text (the pasted chat) or picks' } };
  }

  const existing = await loadPicks(week);
  if (!existing.ok) {
    return { status: existing.status === 404 ? 412 : existing.status, body: { error: 'Picks table is not set up yet. Run supabase/picks.sql in the Supabase SQL editor once.', detail: existing.data } };
  }
  const { accepted, duplicates, conflicts } = dedupePicks(parsed.picks, existing.data.map((r) => Object.assign({ season: SEASON, week }, r)), { policy, season: SEASON, week });

  const board = accepted.length ? await loadScoreboard(SEASON, week) : null;
  const savedByWho = new Map(existing.data.map((r) => [canonicalWho(r.who, roster), r]));
  const saved = [];
  const failed = [];
  for (const p of accepted) {
    const lock = checkPickLock(board, p.leg, savedByWho.get(p.who));
    if (!lock.ok) { parsed.errors.push({ line: p.source && p.source.lineNo, text: p.leg.label, reason: lock.reason, who: p.who, leg: p.leg }); continue; }
    const leg = Object.assign({}, p.leg, { source: p.source });
    const r = await upsertOne(week, p.who, leg, 'whatsapp', roster);
    if (r.ok) saved.push({ who: p.who, label: leg.label, source: p.source, row: r.row });
    else failed.push({ who: p.who, label: leg.label, reason: r.error || 'save failed' });
  }

  const log = [];
  const rec = (outcome, p, reason) => log.push({
    season: SEASON, week, kind: 'whatsapp', raw_hash: (p.source && p.source.rawHash) || rawHash(JSON.stringify(p)),
    author: (p.source && p.source.author) || null, message_at: (p.source && p.source.messageAt) || null,
    line_no: (p.source && p.source.lineNo) || p.line || null, who: p.who || null, outcome, reason: reason || null,
    payload: { leg: p.leg || null, text: p.text || null },
  });
  saved.forEach((s) => rec('saved', { who: s.who, source: s.source, leg: { label: s.label } }));
  duplicates.forEach((d) => rec('duplicate', d.pick, d.reason));
  conflicts.forEach((c) => rec('conflict', c.pick, c.reason));
  parsed.errors.forEach((e) => rec('error', { who: e.who, line: e.line, text: e.text, leg: e.leg, source: { lineNo: e.line, rawHash: rawHash(['error', week, e.line, e.text].join('|')) } }, e.reason));
  const importLog = await logImports(log);

  const committed = saved.length ? await maybeCommit(week, roster, existing.ok ? existing.data : null) : { picks: (await loadPicks(week)).data || [], ticket: null, committed: false };
  return {
    body: {
      policy,
      saved: saved.map(({ who, label, source }) => ({ who, label, source })),
      failed,
      duplicates: duplicates.map((d) => ({ who: d.pick.who, label: d.pick.leg && d.pick.leg.label, line: d.pick.source && d.pick.source.lineNo, reason: d.reason })),
      conflicts: conflicts.map((c) => ({ who: c.pick.who, label: c.pick.leg && c.pick.leg.label, line: c.pick.source && c.pick.source.lineNo, reason: c.reason })),
      errors: parsed.errors.map((e) => ({ line: e.line, text: e.text, reason: e.reason })),
      skipped: (parsed.skipped || []).length,
      importLog,
      lockChecked: !!board,
      ...committed,
    },
  };
}

/** One push per week: whichever request inserts the claim row sends it (see alertClaimRow). */
async function claimTicketAlert(week) {
  try {
    const r = await writeFetch(`${SUPABASE_URL}/rest/v1/holm_import_records?on_conflict=kind,raw_hash,season,week`,
      { Prefer: 'resolution=ignore-duplicates,return=representation' }, JSON.stringify(alertClaimRow(week, SEASON)));
    let rows = null;
    try { rows = await r.json(); } catch (e) { rows = null; }
    return claimWon(r.status, rows);
  } catch (e) {
    return true;
  }
}

/** Best-effort audit log. Returns 'saved', 'table-missing' (run supabase/migrations/002) or an error. */
async function logImports(rows) {
  if (!rows.length) return 'nothing to log';
  const r = await writeFetch(`${SUPABASE_URL}/rest/v1/holm_import_records?on_conflict=kind,raw_hash,season,week`,
    { Prefer: 'resolution=ignore-duplicates,return=minimal' }, JSON.stringify(rows));
  if (r.ok) return 'saved';
  if (r.status === 404) return 'table-missing';
  return 'error ' + r.status;
}
