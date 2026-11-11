/** Claude-written weekly recap + nickname suggestions. Commissioner-only: the passphrase is checked
 *  against Supabase (holm_parlay_check_pass) before anything is sent to Claude. Nothing is posted
 *  anywhere; the commissioner reviews the draft and shares it by hand, and approves each nickname.
 *
 *  Model: Claude Fable 5.2 (the most capable model, for the jokes and the nickname reasoning).
 *  Thinking is always on with Fable; effort "high". Output is held to a JSON schema (structured outputs).
 *  If Fable declines a request on safety grounds, the API reruns it on a fallback model it picks
 *  (`fallbacks: "default"`); if that declines too, the page keeps the built-in template recap.
 *  Needs ANTHROPIC_API_KEY in Vercel (server-only). ANTHROPIC_MODEL overrides the model. */
import { NICK_MAX } from '../../lib/nicknames.mjs';
import { managerContext } from '../../lib/recap-context.mjs';
import lore from '../../league-lore.json' with { type: 'json' };
import nicknamesFile from '../../data/nicknames.json' with { type: 'json' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-fable-5-2';
const SEASON = 2026;

// A Fable turn with thinking can take a minute or more.
export const config = { maxDuration: 300 };

async function passOk(pass) {
  if (!pass) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/holm_parlay_check_pass`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_pass: String(pass) }),
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

/** Nicknames the commissioner set by hand. Claude leaves those managers' nicknames alone. */
async function commishNicknames() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/holm_settings?season=eq.${SEASON}&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    });
    const rows = r.ok ? await r.json() : [];
    return (rows[0] && rows[0].data && rows[0].data.nicknames) || {};
  } catch (e) { return {}; }
}

export const SYSTEM = `You write the weekly recap for "Our Holm League", a fantasy football league of longtime friends. Every week each of eleven managers adds one leg to a single shared NFL parlay, and one person places it at a sportsbook. They are betting together, on the same ticket: when a leg loses, everyone loses. The recap goes into the group's WhatsApp chat, and the nicknames show on the league website next to each manager's name.

You get two things: this week's facts (the ticket, every leg with who picked it and how it graded, and each manager's season record on legs), and a profile for each manager (league history back to 2010, titles, last-place finishes, fantasy team names, the nickname they carry now and why, past nicknames, and any nickname the commissioner locked).

The recap: 90–140 words, plain text, no hashtags, at most two emoji. Lead with how the ticket went. Credit the legs that hit and roast the one that sank it, the way friends rib each other, never mean. Use only the facts given. Never invent a score, stat, payout, or who paid; if a leg's result is unknown, say so. A payout is hypothetical unless payoutRecorded is set.

The nicknames are where you can be really funny, and the group cares about them. A good one is short (at most ${NICK_MAX} characters), lands for this group, and points at something specific and true: a pun on their name or fantasy team name, a callback to a title or a last-place finish, their habit of taking player props or unders, a streak, the leg that busted the ticket. Work through each manager's profile before you settle on one. Think of several candidates and keep the one with the sharpest link to a real fact. A good nickname beats a timely one: if their current nickname still fits better than anything new, skip them. Never repeat a current or past nickname. Skip anyone with a lockedNickname. Nothing about looks, family, health, jobs, or money owed. In "why", name the fact the joke rests on, in one plain sentence.`;

export const SCHEMA = {
  type: 'object',
  properties: {
    recap: { type: 'string' },
    nicknames: {
      type: 'array',
      items: {
        type: 'object',
        properties: { who: { type: 'string' }, nick: { type: 'string' }, why: { type: 'string' } },
        required: ['who', 'nick', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['recap', 'nicknames'],
  additionalProperties: false,
};

/** The Messages API request body. Exported for the test. */
export function recapRequest(facts, managers) {
  return {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    fallbacks: 'default',
    messages: [{
      role: 'user',
      content: 'This week (JSON):\n' + JSON.stringify(facts || {}).slice(0, 12000)
        + '\n\nManager profiles (JSON):\n' + JSON.stringify(managers || []).slice(0, 24000),
    }],
  };
}

/** Pull the recap and nicknames out of a Messages API response. Locked managers and nicknames that
 *  repeat a current or past one are dropped here too, whatever the model returned. */
export function readRecap(data, managers) {
  if (data.stop_reason === 'refusal') return { error: 'Claude declined to write this recap. The template recap is below.' };
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
  if (!parsed || typeof parsed.recap !== 'string') {
    if (data.stop_reason === 'max_tokens') return { error: 'Claude ran out of room before finishing. Try again.' };
    return { recap: text.trim(), nicknames: [] };
  }
  const byWho = new Map((managers || []).map((m) => [m.who, m]));
  const used = (m) => new Set([m.currentNickname, ...(m.pastNicknames || [])].filter(Boolean).map((s) => String(s).toLowerCase()));
  const nicknames = (Array.isArray(parsed.nicknames) ? parsed.nicknames : [])
    .filter((n) => n && n.who && n.nick)
    .filter((n) => {
      const m = byWho.get(n.who);
      if (!m) return true;
      return !m.lockedNickname && !used(m).has(String(n.nick).trim().toLowerCase());
    })
    .map((n) => ({ who: String(n.who).slice(0, 60), nick: String(n.nick).trim().slice(0, NICK_MAX), why: String(n.why || '').slice(0, 160) }));
  return { recap: parsed.recap.trim(), nicknames };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  try {
    if (!(await passOk(body.pass))) { res.status(401).json({ error: 'Wrong passphrase' }); return; }
  } catch (e) { res.status(502).json({ error: 'Could not check the passphrase' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel yet', setup: true }); return; }
  const managers = managerContext(lore, nicknamesFile, await commishNicknames());
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(recapRequest(body.facts, managers)),
    });
    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: (data.error && data.error.message) || 'Claude request failed ' + r.status }); return; }
    const out = readRecap(data, managers);
    if (out.error) { res.status(502).json({ error: out.error }); return; }
    res.status(200).json({ ...out, model: data.model || MODEL });
  } catch (e) {
    res.status(502).json({ error: 'Claude unreachable' });
  }
}
