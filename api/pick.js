import { assembleTicket, validatePick, PARLAY_11, canonicalWho } from '../lib/ticket.mjs';

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

// ---- Reconstructed below this line (original source truncated on recovery) ----

function setupError(r) {
  const d = r.data || {};
  return r.status === 404 || d.code === '42P01' || d.code === 'PGRST205';
}

async function loadPicks(week) {
  return sbGet(`/rest/v1/holm_parlay_picks?season=eq.${SEASON}&week=eq.${week}&select=who,leg,source,updated_at&order=updated_at.asc`);
}

async function upsertPicks(rows) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/holm_parlay_picks?on_conflict=season,week,who', {
    method: 'POST',
    headers: Object.assign({}, headers, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(rows),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function loadWeek(week) {
  const r = await sbGet(`/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&week=eq.${week}&select=data`);
  return (r.ok && r.data && r.data[0] && r.data[0].data) || null;
}

// When all 11 picks are in and valid, write the ticket into holm_parlay_weeks so the Week tab shows it.
// Never overwrites a locked week. Requires a key with write access to holm_parlay_weeks (or RLS allowing it).
async function commitTicket(week, ticket) {
  const existing = await loadWeek(week);
  if (existing && existing.locked) return false;
  const data = Object.assign({}, existing || {}, {
    legs: ticket.legs,
    groups: ticket.groups,
    source: 'picks',
    committedAt: new Date().toISOString(),
  });
  const r = await fetch(SUPABASE_URL + '/rest/v1/holm_parlay_weeks?on_conflict=season,week', {
    method: 'POST',
    headers: Object.assign({}, headers, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ season: SEASON, week, data }]),
  });
  return r.ok;
}

async function state(week, roster) {
  const r = await loadPicks(week);
  if (!r.ok) return { error: r, picks: [] };
  const picks = r.data || [];
  const ticket = assembleTicket(picks, roster.length ? roster : PARLAY_11);
  const wk = await loadWeek(week);
  const committed = !!(wk && wk.source === 'picks' && ticket.complete);
  return { picks, ticket, committed };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  allowBrowser(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    const { roster } = await loadRoster();
    const list = roster.length ? roster.map((n) => canonicalWho(n, roster)) : PARLAY_11;

    if (req.method === 'GET') {
      const week = req.query.week != null && req.query.week !== '' ? Number(req.query.week) : null;
      if (week == null || isNaN(week)) {
        json(res, 200, { week: null, picks: [], ticket: assembleTicket([], list) });
        return;
      }
      const s = await state(week, list);
      if (s.error) {
        if (setupError(s.error)) { json(res, 412, { error: 'Picks table is not set up yet. Run supabase/picks.sql in the Supabase SQL editor once.' }); return; }
        json(res, 502, { error: 'Could not load picks' }); return;
      }
      json(res, 200, { week, picks: s.picks, ticket: s.ticket, committed: s.committed });
      return;
    }

    if (req.method !== 'POST') { json(res, 405, { error: 'GET or POST only' }); return; }

    const body = readBody(req);
    const week = Number(body.week);
    if (!week || isNaN(week) || week < 1 || week > 22) { json(res, 400, { error: 'Need a valid week' }); return; }

    let rows = [];
    if (body.import) {
      const incoming = Array.isArray(body.picks) ? body.picks : [];
      const errors = {};
      for (const p of incoming) {
        const who = canonicalWho(p && p.who, list);
        const leg = Object.assign({}, (p && p.leg) || {}, { who });
        const err = validatePick(leg, who, list);
        if (err.length) { errors[who || '?'] = err; continue; }
        rows.push({ season: SEASON, week, who, leg, source: p.source || 'whatsapp', updated_at: new Date().toISOString() });
      }
      if (!rows.length) { json(res, 400, { error: 'No valid picks to import', pickErrors: errors }); return; }
    } else {
      const who = canonicalWho(body.who, list);
      const leg = Object.assign({}, body.leg || {}, { who });
      const err = validatePick(leg, who, list);
      if (err.length) { json(res, 400, { error: err.join('. '), pickErrors: { [who || '?']: err } }); return; }
      rows = [{ season: SEASON, week, who, leg, source: body.source || 'web', updated_at: new Date().toISOString() }];
    }

    const existingWeek = await loadWeek(week);
    if (existingWeek && existingWeek.locked) { json(res, 409, { error: `Week ${week} is locked` }); return; }

    const up = await upsertPicks(rows);
    if (!up.ok) {
      if (setupError(up)) { json(res, 412, { error: 'Picks table is not set up yet. Run supabase/picks.sql in the Supabase SQL editor once.' }); return; }
      json(res, 502, { error: (up.data && up.data.message) || 'Save failed' }); return;
    }

    const s = await state(week, list);
    if (s.error) { json(res, 502, { error: 'Saved, but could not reload picks' }); return; }
    let committed = s.committed;
    if (s.ticket.complete && !committed) committed = await commitTicket(week, s.ticket);
    json(res, 200, { week, saved: up.data || rows, picks: s.picks, ticket: s.ticket, committed });
  } catch (e) {
    json(res, 500, { error: 'Pick API failed' });
  }
}
