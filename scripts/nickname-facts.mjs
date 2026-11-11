// Writes the facts the nickname job may use: one block per manager from league-lore.json
// (2010–2025 seasons) and parlay-history.json (this season's graded legs). Read-only.
// Usage: node scripts/nickname-facts.mjs > nickname-facts.md
import { readFileSync } from 'node:fs';
import { calcParlayStats } from '../lib/history-stats.mjs';
import { ident } from '../lib/ident.mjs';

const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url)));
const lore = read('league-lore.json');
const history = read('parlay-history.json');
const nicknames = read('data/nicknames.json');
ident.load(lore);
// Commissioner nicknames (league settings, public read). Claude must leave these managers alone.
let commish = {};
try {
  const r = await fetch('https://ivucfpduvaiyxjcqbsqa.supabase.co/rest/v1/holm_settings?season=eq.2026&select=data',
    { headers: { apikey: 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D' } });
  const rows = r.ok ? await r.json() : [];
  commish = (rows[0] && rows[0].data && rows[0].data.nicknames) || {};
} catch (e) { commish = {}; }
const stats = calcParlayStats(history, (n) => n);
const byName = Object.fromEntries(stats.rows.map((r) => [ident.canonical(r.name), r]));

const out = [`# Our Holm League nickname facts (${new Date().toISOString().slice(0, 10)})`, ''];
for (const p of lore.people) {
  const c = p.career || {};
  const hist = (c.history || []).filter((s) => s && s.rank);
  const last3 = hist.slice(-3).map((s) => `${s.season}: #${s.rank} (${s.wins}–${s.losses}, "${s.team}")`).join('; ');
  const r = byName[p.name];
  const cur = nicknames.people[p.id];
  out.push(`## ${p.id} — ${p.name}`);
  if (commish[p.name]) out.push(`- Commissioner nickname (locked): "${commish[p.name]}". Do not change this manager.`);
  out.push(`- Short handle (do not change): ${p.nick}. Existing aliases: ${(p.aliases || []).join(', ') || 'none'}.`);
  if (p.abstain) out.push('- Sits out the weekly parlay.');
  if (p.firstYear) out.push('- First season in the league.');
  if (c.seasons) out.push(`- Career 2010–2025: ${c.seasons} seasons, ${c.wins}–${c.losses}, titles ${(c.titles || []).join(', ') || 'none'}, last place ${c.lastPlaceCount || 0}x, avg finish ${c.avgFinish}.`);
  if (last3) out.push(`- Last three seasons: ${last3}.`);
  if (r) {
    const types = Object.entries(r.types).map(([t, v]) => `${t} ${v.w}/${v.n}`).join(', ');
    const recent = r.picks.slice(-3).map((l) => `Wk${l.week} ${l.label} (${l.result})`).join('; ');
    out.push(`- 2026 parlay legs: ${r.w}–${r.l}${r.u ? `, ${r.u} ungraded` : ''}; current streak ${r.streak}; best ${r.bestStreak} straight; legs that busted a ticket ${r.busts}; by type ${types}.`);
    if (recent) out.push(`- Recent legs: ${recent}.`);
  }
  if (cur) out.push(`- Current nickname: "${cur.nickname}" since ${cur.since || '?'} (${cur.why}). Past: ${(cur.past || []).join(', ') || 'none'}.`);
  out.push('');
}
process.stdout.write(out.join('\n'));
