// Validates data/nicknames.json against the roster. With --summary BASE_FILE, prints a Markdown
// table of what changed (for the pull request body). Exit code 1 on any problem.
import { readFileSync } from 'node:fs';
import { validateNicknames, nicknameChanges } from '../lib/nicknames.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const root = new URL('../', import.meta.url);
const lore = read(new URL('league-lore.json', root));
let data;
try { data = read(new URL('data/nicknames.json', root)); } catch (e) { console.error('data/nicknames.json is not valid JSON: ' + e.message); process.exit(1); }
const errs = validateNicknames(data, lore.people);
if (errs.length) { console.error(errs.map((e) => '- ' + e).join('\n')); process.exit(1); }

const i = process.argv.indexOf('--summary');
if (i > -1) {
  const before = read(process.argv[i + 1]);
  const rows = nicknameChanges(before, data, lore.people);
  if (!rows.length) { console.log('No nickname changes.'); process.exit(0); }
  const cell = (s) => String(s || '–').replace(/\|/g, '/');
  console.log('| Manager | Was | Now | Why |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${cell(r.name)} | ${cell(r.from)} | **${cell(r.to)}** | ${cell(r.why)} |`);
} else {
  console.log(`nicknames ok (${Object.keys(data.people).length} set)`);
}
