import { assembleTicket, validatePick, PARLAY_11, canonicalWho } from '../../lib/ticket.mjs';
import { parseWhatsAppExport } from '../../lib/import/whatsapp.mjs';
import { dedupePicks } from '../../lib/import/dedupe.mjs';
import { rawHash } from '../../lib/import/hash.mjs';
import { rule } from '../../lib/rules.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';
const SEASON = 2026;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

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

async function loadRoster() {
  const r = await sbGet(`/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&week=eq.0&select=data`);
  const cfg = r.data && r.data[0] && r.data[0].data;
  const roster = (cfg && cfg.roster) || [];
  const abstain = (cfg && cfg.abstain) || ['Kyle Heller'];
  return { roster, abstain, cfg };
}

async function loadPicks(week) {
  const r = await sbGet(`/rest/v1/holm_parlay_picks?season=eq.${SEASON}&week=eq.${week}&select=who,source,leg,updated_at`);
  if (!r.ok) return { ok: false, status: r.status, data: r.data };
  return { ok: true, data: r.data || [] };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    allowBrowser(res);
    res.status(204).end();
    return;
  }
  const week = Number(req.query.week || req.body && req.body.week);
  try {
    if (req.method === 'GET') {
      const picks = await loadPicks(week || 0);
      if (!picks.ok) {
        json(res, picks.status === 404 ? 412 : picks.status, {
          error: 'Picks table is not set up yet. Run supabase/picks.sql in the Supabase SQL editor once.',
          detail: picks.data,
        });
        return;
      }
      json(res, 200, { week, picks: picks.data, ticket: assembleTicket(picks.data, PARLAY_11) });
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

    if (body.import) {
      const result = await importPicks(wk, body, roster);
      json(res, result.status || 200, result.body);
      return;
    }

    const who = canonicalWho(String(body.who || '').trim(), roster);
    const source = body.source || 'web';
    const leg = body.leg || {};
    const errors = validatePick(leg, who, roster.length ? roster : null);
    if (errors.length) { json(res, 400, { error: errors.join('. ') }); return; }

    const result = await upsertOne(wk, who, Object.assign({}, leg, { source: { kind: source === 'whatsapp' ? 'whatsapp' : 'web', savedAt: new Date().toISOString() } }), source, roster);
    if (!result.ok) { json(res, result.status, result); return; }
    const committed = await maybeCommit(wk, roster);
    json(res, 200, { row: result.row, ...committed });
  } catch (e) {
    json(res, 500, { error: e.message || 'pick failed' });
  }
}

async function upsertOne(week, who, leg, source, roster) {
  who = canonicalWho(who, roster);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/holm_parlay_picks?on_conflict=season,week,who`, {
    method: 'POST',
    headers: Object.assign({}, headers, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ season: SEASON, week, who, source, leg, updated_at: new Date().toISOString() }),
  });
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

async function maybeCommit(week, roster) {
  const picks = await loadPicks(week);
  if (!picks.ok) return { picks: [], ticket: null };
  const ticket = assembleTicket(picks.data, roster);
  let committed = false;
  if (ticket.complete) {
    const existing = await sbGet(`/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&week=eq.${week}&select=data`);
    const prev = existing.data && existing.data[0] && existing.data[0].data || {};
    if (prev.locked) return { picks: picks.data, ticket, committed: false, locked: true };
    const payload = Object.assign({}, prev, {
      week,
      stake: prev.stake || 10,
      book: prev.book || 'DraftKings (MI)',
      // A full set of saved picks is a proposed ticket. It is not placed until someone records the slip.
      ticket: prev.ticket && prev.ticket.state && prev.ticket.state !== 'proposed'
        ? prev.ticket
        : { state: 'proposed', evidence: 'Auto-built from 11 saved picks. Not placed at a sportsbook yet.' },
      note: prev.note || 'Auto-built from 11 unique manager picks. Same-game bets grouped as SGPs so one Michigan book ticket can take the whole parlay.',
      legs: ticket.legs,
      groups: ticket.groups,
      submissions: Object.fromEntries((picks.data || []).map((p) => [canonicalWho(p.who, roster), { source: p.source, at: p.updated_at }])),
    });
    delete payload.week;
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/holm_parlay_upsert_week_open`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_season: SEASON, p_week: week, p_data: payload }),
    });
    committed = rpc.ok;
    if (!rpc.ok) {
      const t = await rpc.text();
      ticket.commitError = t;
    }
  }
  return { picks: picks.data, ticket, committed };
}

/** Import a WhatsApp paste: parse → validate → dedupe against saved picks → save accepted → log.
 *  Body: { week, import: true, text } (raw paste, preferred) or { week, import: true, picks: [...] }. */
async function importPicks(week, body, roster) {
  const cfgRow = await sbGet(`/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&week=eq.0&select=data`);
  const cfg = (cfgRow.data && cfgRow.data[0] && cfgRow.data[0].data) || {};
  const policy = rule(cfg, 'importConflict').value;

  let parsed;
  if (typeof body.text === 'string') {
    parsed = parseWhatsAppExport(body.text, { roster, week, season: SEASON });
  } else if (Array.isArray(body.picks)) {
    // legacy clients send pre-parsed picks: validate each one, and give it a source
    parsed = { picks: [], errors: [], skipped: [] };
    body.picks.forEach((p, i) => {
      const who = canonicalWho(p && p.who, roster);
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

  const saved = [];
  const failed = [];
  for (const p of accepted) {
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

  const committed = saved.length ? await maybeCommit(week, roster) : { picks: (await loadPicks(week)).data || [], ticket: null, committed: false };
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
      ...committed,
    },
  };
}

/** Best-effort audit log. Returns 'saved', 'table-missing' (run supabase/migrations/002) or an error. */
async function logImports(rows) {
  if (!rows.length) return 'nothing to log';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/holm_import_records?on_conflict=kind,raw_hash,season,week`, {
    method: 'POST',
    headers: Object.assign({}, headers, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (r.ok) return 'saved';
  if (r.status === 404) return 'table-missing';
  return 'error ' + r.status;
}
