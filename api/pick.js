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

    if (body.import && Array.isArray(body.picks)) {
      const saved = [];
      for (const p of body.picks) {
        const result = await upsertOne(wk, canonicalWho(p.who, roster), p.leg, p.source || 'whatsapp', roster);
        if (!result.ok) { json(res, result.status, result); return; }
        saved.push(result.row);
      }
      const committed = await maybeCommit(wk, roster);
      json(res, 200, { saved, ...committed });
      return;
    }

    const who = canonicalWho(String(body.who || '').trim(), roster);
    const source = body.source || 'web';
    const leg = body.leg || {};
    const errors = validatePick(leg, who, roster.length ? roster : null);
    if (errors.length) { json(res, 400, { error: errors.join('. ') }); return; }

    const result = await upsertOne(wk, who, leg, source, roster);
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
      placedBy: prev.placedBy || 'League picks',
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
