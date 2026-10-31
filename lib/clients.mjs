/** Browser clients: Supabase REST (publishable key), the ESPN proxy and the picks API.
 *  Extracted from the legacy app.js. URLs can be overridden with NEXT_PUBLIC_* env vars. */

export const SEASON = 2026;
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';
export const API = '/api/espn';
export const PICK_API = '/api/pick';

export function createSupabase(fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  return {
    async rows() {
      const r = await f(`${SUPABASE_URL}/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&select=week,data,updated_at&order=week.asc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
      });
      if (!r.ok) throw new Error('Could not load league data (' + r.status + ')');
      return r.json();
    },
    async payments() {
      const r = await f(`${SUPABASE_URL}/rest/v1/holm_payments?season=eq.${SEASON}&select=id,week,who,amount,recorded_at,note&order=recorded_at.asc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
      });
      if (!r.ok) throw new Error('Could not load payments (' + r.status + ')');
      return r.json();
    },
    async rpc(fn, args) {
      const r = await f(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const text = await r.text();
      if (!r.ok) {
        let msg = text;
        try { msg = JSON.parse(text).message || text; } catch (e) { /* keep text */ }
        throw new Error(msg);
      }
      return text ? JSON.parse(text) : null;
    },
  };
}

export function createEspn(getLeagueId, fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const cache = { scoreboard: {}, summary: {}, ffl: {} };
  return {
    async scoreboard(week, force) {
      const key = week == null || week === 'now' ? 'now' : String(week);
      const c = cache.scoreboard[key];
      if (c && !force && Date.now() - c.at < 20000) return c.data;
      const qs = key === 'now'
        ? `path=scoreboard&season=${SEASON}`
        : `path=scoreboard&season=${SEASON}&week=${week}`;
      const r = await f(`${API}?${qs}&_=${Date.now()}`);
      if (!r.ok) throw new Error('scores unavailable');
      const data = await r.json();
      cache.scoreboard[key] = { at: Date.now(), data };
      return data;
    },
    async summary(eventId, finalGame) {
      const c = cache.summary[eventId];
      if (c && (finalGame && c.final || Date.now() - c.at < 20000)) return c.data;
      const r = await f(`${API}?path=summary&event=${eventId}&_=${Date.now()}`);
      if (!r.ok) throw new Error('box score unavailable');
      const data = await r.json();
      cache.summary[eventId] = { at: Date.now(), data, final: !!finalGame };
      return data;
    },
    async ffl(scoringPeriodId, force) {
      const key = String(scoringPeriodId);
      const c = cache.ffl[key];
      if (c && !force && Date.now() - c.at < 30000) return c.data;
      const league = (getLeagueId && getLeagueId()) || 182263;
      const r = await f(`${API}?path=ffl&season=${SEASON}&week=${scoringPeriodId}&league=${league}&_=${Date.now()}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = new Error(data.error || 'fantasy scores unavailable');
        err.unauthorized = !!(data.unauthorized || r.status === 401 || r.status === 403);
        err.status = r.status;
        throw err;
      }
      cache.ffl[key] = { at: Date.now(), data };
      return data;
    },
  };
}

export function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}

export function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
}

export const KPI_LS = 'hp_kpi_ideas';
export const CHAT_LS = 'hp_chat_drafts';

export function toast(msg) {
  if (typeof document === 'undefined') return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
