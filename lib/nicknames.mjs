/** Rotating league nicknames (data/nicknames.json), written by the scheduled Claude job and
 *  reviewed in a pull request. Pure: safe on server and client, and the tests import it directly.
 *  A nickname is extra flavor. It never replaces `nick` (the short handle the tables use), and it
 *  only joins the roster lookup when no other manager already owns that spelling. */

export const NICK_MIN = 3;
export const NICK_MAX = 28;
export const WHY_MIN = 10;
export const WHY_MAX = 160;
export const PAST_MAX = 6;

const ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 '’.&!?\-]*$/;
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'fag', 'retard', 'nigg', 'whore', 'slut', 'rape'];

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every spelling that already points at a manager: name, short nick, aliases. */
function ownedKeys(people) {
  const owned = new Map();
  for (const p of people || []) {
    for (const s of [p.name, p.nick, ...(p.aliases || [])]) {
      const k = key(s);
      if (k && !owned.has(k)) owned.set(k, p.id);
    }
  }
  return owned;
}

/** @returns {string[]} problems; empty means the file is fine to ship. */
export function validateNicknames(data, people) {
  const errs = [];
  if (!data || typeof data !== 'object') return ['nicknames file is not an object'];
  if (data.version !== 1) errs.push('version must be 1');
  if (data.updated != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.updated))) errs.push('updated must be YYYY-MM-DD or null');
  const map = data.people;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return errs.concat('people must be an object keyed by manager id');
  const ids = new Set((people || []).map((p) => p.id));
  const owned = ownedKeys(people);
  const seen = new Map();
  for (const [id, n] of Object.entries(map)) {
    const at = `people.${id}`;
    if (!ids.has(id)) { errs.push(`${at}: not a manager id in league-lore.json`); continue; }
    if (!n || typeof n !== 'object') { errs.push(`${at}: must be an object`); continue; }
    const nick = String(n.nickname || '').trim();
    if (nick.length < NICK_MIN || nick.length > NICK_MAX) errs.push(`${at}.nickname: ${NICK_MIN}–${NICK_MAX} characters`);
    else if (!ALLOWED.test(nick)) errs.push(`${at}.nickname: letters, numbers, spaces and ' . & ! ? - only`);
    const k = key(nick);
    if (BLOCKED.some((b) => k.includes(b))) errs.push(`${at}.nickname: not family-friendly`);
    const owner = owned.get(k);
    if (owner && owner !== id) errs.push(`${at}.nickname: "${nick}" already points at ${owner}`);
    if (seen.has(k)) errs.push(`${at}.nickname: same as ${seen.get(k)}`);
    seen.set(k, id);
    const why = String(n.why || '').trim();
    if (why.length < WHY_MIN || why.length > WHY_MAX) errs.push(`${at}.why: ${WHY_MIN}–${WHY_MAX} characters`);
    if (BLOCKED.some((b) => key(why).includes(b))) errs.push(`${at}.why: not family-friendly`);
    if (n.since != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(n.since))) errs.push(`${at}.since: YYYY-MM-DD`);
    if (n.past != null) {
      if (!Array.isArray(n.past) || n.past.some((x) => typeof x !== 'string')) errs.push(`${at}.past: list of strings`);
      else if (n.past.length > PAST_MAX) errs.push(`${at}.past: at most ${PAST_MAX}`);
    }
  }
  return errs;
}

/** Lore with each manager's current nickname attached as `title`, `titleWhy`, `titleSince` and
 *  `pastTitles`. The nickname is added to `aliases` (so chat mentions match) only if no other
 *  manager owns that spelling. Returns a new object; the input is not changed. */
export function withNicknames(lore, data) {
  if (!lore || !Array.isArray(lore.people)) return lore;
  const map = (data && data.people) || {};
  const owned = ownedKeys(lore.people);
  const people = lore.people.map((p) => {
    const n = map[p.id];
    if (!n || !n.nickname) return p;
    const nick = String(n.nickname).trim();
    const owner = owned.get(key(nick));
    const aliases = owner && owner !== p.id ? p.aliases || [] : owner === p.id ? p.aliases || [] : [...(p.aliases || []), nick];
    return { ...p, aliases, title: nick, titleWhy: n.why || '', titleSince: n.since || null, pastTitles: n.past || [] };
  });
  return { ...lore, people, nicknamesUpdated: (data && data.updated) || null };
}

/** Changed rows between two nickname files, for the pull request body. */
export function nicknameChanges(before, after, people) {
  const b = (before && before.people) || {};
  const a = (after && after.people) || {};
  const name = (id) => ((people || []).find((p) => p.id === id) || {}).name || id;
  return Object.keys(a)
    .filter((id) => !b[id] || b[id].nickname !== a[id].nickname || b[id].why !== a[id].why)
    .map((id) => ({ id, name: name(id), from: b[id] ? b[id].nickname : '', to: a[id].nickname, why: a[id].why }));
}
