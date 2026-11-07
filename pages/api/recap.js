/** Claude-written weekly recap + nickname suggestions. Commissioner-only: the passphrase is checked
 *  against Supabase (holm_parlay_check_pass) before anything is sent to Claude. Nothing is posted
 *  anywhere; the commissioner reviews the draft and shares it by hand.
 *  Needs ANTHROPIC_API_KEY in Vercel (server-only). ANTHROPIC_MODEL overrides the model. */
import { NICK_MAX } from '../../lib/nicknames.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

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

const SYSTEM = `You write the weekly recap for "Our Holm League", a group of friends who each add one leg to a shared NFL parlay.
Rules:
- Use only the facts given. Never invent scores, stats, payouts, or who paid. If a leg's result is unknown, say so.
- Payout amounts are hypothetical unless "payoutRecorded" is set.
- Keep it short (90-140 words), funny, WhatsApp-ready, plain text, no hashtags, at most 2 emoji.
- Roast the leg(s) that killed the ticket; credit the ones that hit. Keep it friendly.
Also suggest a fresh nickname for each manager based on their season and this week (max 3 words, no slurs, nothing about looks, family, or money owed).
Reply with JSON only: {"recap": string, "nicknames": [{"who": full name, "nick": string, "why": short reason}]}`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  try {
    if (!(await passOk(body.pass))) { res.status(401).json({ error: 'Wrong passphrase' }); return; }
  } catch (e) { res.status(502).json({ error: 'Could not check the passphrase' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel yet', setup: true }); return; }
  const facts = JSON.stringify(body.facts || {}).slice(0, 12000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: 'Facts for this week (JSON):\n' + facts }] }),
    });
    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: (data.error && data.error.message) || 'Claude request failed ' + r.status }); return; }
    const textOut = (data.content || []).map((c) => c.text || '').join('');
    const m = textOut.match(/\{[\s\S]*\}/);
    let parsed = null;
    try { parsed = m ? JSON.parse(m[0]) : null; } catch (e) { parsed = null; }
    if (!parsed || typeof parsed.recap !== 'string') { res.status(200).json({ recap: textOut.trim(), nicknames: [], model: MODEL }); return; }
    const nicknames = (Array.isArray(parsed.nicknames) ? parsed.nicknames : [])
      .filter((n) => n && n.who && n.nick)
      .map((n) => ({ who: String(n.who).slice(0, 60), nick: String(n.nick).slice(0, NICK_MAX), why: String(n.why || '').slice(0, 140) }));
    res.status(200).json({ recap: parsed.recap.trim(), nicknames, model: MODEL });
  } catch (e) {
    res.status(502).json({ error: 'Claude unreachable' });
  }
}
