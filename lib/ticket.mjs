/** Michigan sportsbook parlay rules (DK / FanDuel / BetMGM style). */

export const BOOKS = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'ESPN BET'];

export const PEOPLE = [
  { id: 'brad', name: 'Brad Holm', nick: 'Brad', aliases: ['Brad', 'Brlaude', 'Low Man Brad'], parlay: true, abstain: false },
  { id: 'sachs', name: 'John Sachs', nick: 'Jarn', aliases: ['Jarn', 'Jarn Sachs', 'Jarn the Action', 'Jarn Home Depot', 'Jarn the Ticket'], parlay: true, abstain: false },
  { id: 'hoffman', name: 'Ryan Hoffman', nick: 'Hoss', aliases: ['Hoss', 'Hoss the Three-Peat', 'Hoss Greatness'], parlay: true, abstain: false },
  { id: 'sack', name: 'Kevin Sack', nick: 'Kev', aliases: ['Kev', 'Kev the Belt', 'Kev Nice Thought'], parlay: true, abstain: false },
  { id: 'mckeon', name: 'Joe Mckeon', nick: 'Joey', aliases: ['Joey', 'Joseph McKeon', 'Joe McKeon', 'Joey Dawg Pound', 'Joey Auto-Draft'], parlay: true, abstain: false },
  { id: 'curtis', name: 'Nick Curtis', nick: 'Nick', aliases: ['Nick', 'Nick O-Town', 'Nick Barely Tracks'], parlay: true, abstain: false },
  { id: 'chas', name: 'Chas Rossman', nick: 'Chas', aliases: ['Chas', 'Charles Q', 'Charles Q on Tab'], parlay: true, abstain: false },
  { id: 'mcfadden', name: 'Kyle McFadden', nick: 'Kyle', aliases: ['Kyle Mcfadden', 'Kyle', 'Worst Team Kyle', 'Kyle-on-Kyle'], parlay: true, abstain: false },
  { id: 'heller', name: 'Kyle Heller', nick: 'Heller', aliases: ['Heller', 'H-Bomb', 'H 💣'], parlay: false, abstain: true },
  { id: 'jace', name: 'Jace Clark', nick: 'Jace', aliases: ['Jace', 'Jace the Bowtie', 'Jace Last-Place Hill'], parlay: true, abstain: false },
  { id: 'meltser', name: 'Adam Meltser', nick: 'Meltser', aliases: ['Meltser', 'Meltser Truck Stick', 'Bloomfield Meltser'], parlay: true, abstain: false },
  { id: 'dj', name: 'DJ Dangerous', nick: 'DJ', aliases: ['DJ', 'DJ Cricket', 'Rickety Cricket', 'DJ the Trap'], parlay: true, abstain: false },
];

export const PARLAY_11 = PEOPLE.filter((p) => p.parlay).map((p) => p.name);

function identKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const PERSON_BY_KEY = {};
for (const p of PEOPLE) {
  for (const a of [p.name, p.nick, ...(p.aliases || [])]) {
    const k = identKey(a);
    if (k && !PERSON_BY_KEY[k]) PERSON_BY_KEY[k] = p;
  }
}

/** Exact roster lookup: full name, nickname or alias only (no fuzzy or substring matching).
 *  Returns the canonical name, or '' when the name is not a known manager. */
export function strictWho(name) {
  const p = PERSON_BY_KEY[identKey(name)];
  return p ? p.name : '';
}

export function canonicalWho(name, roster) {
  if (name == null || name === '') return '';
  const p = PERSON_BY_KEY[identKey(name)];
  if (p) return p.name;
  const trimmed = String(name).trim();
  if (roster && roster.length) {
    const hit = roster.find((n) => identKey(n) === identKey(trimmed));
    if (hit) return hit;
  }
  return trimmed;
}

export function gameKey(game) {
  const g = (game || []).map((t) => String(t || '').toUpperCase()).filter(Boolean);
  if (g.length < 2) return '';
  return g.slice().sort().join('|');
}

export function marketKey(leg) {
  const g = gameKey(leg.game);
  const type = leg.type;
  if (type === 'ml') return [g, 'ml', String(leg.team || '').toUpperCase()].join(':');
  if (type === 'spread') return [g, 'spread', String(leg.team || '').toUpperCase(), String(leg.line)].join(':');
  if (type === 'total') return [g, 'total', String(leg.side || '').toLowerCase(), String(leg.line)].join(':');
  if (type === 'player') return [g, 'player', String(leg.player || '').toLowerCase(), String(leg.stat), String(leg.side || 'over'), String(leg.line)].join(':');
  return [g, type, String(leg.label || '')].join(':');
}

export function validatePick(leg, who, roster) {
  const errors = [];
  const canon = canonicalWho(who, roster);
  if (!who) errors.push('Pick a manager');
  else if (roster && roster.length && !roster.includes(canon)) errors.push('Not a parlay participant (Heller sits)');
  if (!leg || !leg.type) errors.push('Choose a market');
  const g = (leg && leg.game) || [];
  if (g.filter(Boolean).length < 2) errors.push('Need both teams');
  if (leg && (leg.type === 'ml' || leg.type === 'spread') && !leg.team) errors.push('Pick a team');
  if (leg && leg.type === 'spread' && (leg.line === '' || leg.line == null || isNaN(Number(leg.line)))) errors.push('Spread needs a line');
  if (leg && leg.type === 'total') {
    if (!['over', 'under'].includes(String(leg.side || '').toLowerCase())) errors.push('Over or under');
    if (leg.line === '' || leg.line == null || isNaN(Number(leg.line))) errors.push('Total needs a line');
  }
  if (leg && leg.type === 'player') {
    if (!leg.player) errors.push('Player name');
    if (!leg.stat) errors.push('Player stat');
    if (leg.line === '' || leg.line == null || isNaN(Number(leg.line))) errors.push('Prop needs a line');
  }
  if (!leg || !leg.label) errors.push('Add a short label (e.g. Broncos ML)');
  return errors;
}

export function assembleTicket(submissions, roster) {
  const wanted = [];
  const seenWanted = new Set();
  for (const n of (roster && roster.length ? roster : PARLAY_11)) {
    const c = canonicalWho(n, roster);
    if (!c || seenWanted.has(c)) continue;
    seenWanted.add(c);
    wanted.push(c);
  }
  const byWho = {};
  for (const s of submissions || []) {
    if (!s || !s.who) continue;
    const who = canonicalWho(s.who, wanted);
    byWho[who] = Object.assign({}, s, { who, leg: Object.assign({}, s.leg || {}, { who }) });
  }
  const missing = wanted.filter((n) => !byWho[n]);
  const extras = Object.keys(byWho).filter((n) => wanted.length && !wanted.includes(n));
  const legs = wanted.map((who) => byWho[who]).filter(Boolean).map((s) => s.leg);
  const pickErrors = {};
  for (const s of Object.values(byWho)) {
    const err = validatePick(s.leg, s.who, wanted);
    if (err.length) pickErrors[s.who] = err;
  }

  const issues = [];
  if (extras.length) issues.push({ level: 'error', text: `Not in the 11: ${extras.join(', ')}` });
  if (missing.length) issues.push({ level: 'warn', text: `Still need picks from ${missing.join(', ')}`, names: missing, lead: 'Still need picks from' });

  const keys = {};
  for (const s of Object.values(byWho)) {
    const k = marketKey(s.leg || {});
    if (!k) continue;
    keys[k] = keys[k] || [];
    keys[k].push(s.who);
  }
  for (const [k, names] of Object.entries(keys)) {
    if (names.length > 1) {
      issues.push({
        level: 'error',
        text: `${names.join(' & ')} picked the same market. Michigan books will not let the group parlay a duplicate leg. One of you has to switch.`,
      });
    }
  }

  const byGame = {};
  for (const s of Object.values(byWho)) {
    const gk = gameKey(s.leg && s.leg.game);
    if (!gk) continue;
    byGame[gk] = byGame[gk] || [];
    byGame[gk].push(s);
  }

  const groups = {};
  const outLegs = [];
  let sgp = 0;
  for (const s of wanted.map((w) => byWho[w]).filter(Boolean)) {
    const leg = Object.assign({ id: s.leg.id || ('l' + Math.random().toString(36).slice(2, 8)), who: s.who }, s.leg);
    delete leg.group;
    outLegs.push(leg);
  }
  for (const [gk, members] of Object.entries(byGame)) {
    if (members.length < 2) continue;
    sgp++;
    const gid = 'sgp' + sgp;
    groups[gid] = {
      label: members.length + ' pick SGP',
      odds: '',
      note: 'Priced as one leg at DraftKings / FanDuel / BetMGM',
    };
    issues.push({
      level: 'info',
      text: `${members.map((m) => m.who.split(' ')[0]).join(', ')} are on ${members[0].leg.game.join(' at ')} — grouped as a same-game parlay so the book accepts the ticket.`,
    });
    for (const leg of outLegs) {
      if (gameKey(leg.game) === gk) leg.group = gid;
    }
  }

  const complete = missing.length === 0 && wanted.length >= 11
    && extras.length === 0
    && Object.keys(pickErrors).length === 0
    && !issues.some((i) => i.level === 'error');

  return {
    complete,
    missing,
    pickErrors,
    issues,
    legs: outLegs,
    groups,
    count: Object.keys(byWho).length,
    need: wanted.length || 11,
  };
}

export function slipText(ticket, week) {
  const lines = [`Our Holm League · Week ${week} · parlay ($10)` + (ticket.complete === false ? ` · ${ticket.count} of ${ticket.need} picks in` : '')];
  const grouped = new Set();
  for (const leg of ticket.legs || []) {
    if (leg.group && ticket.groups[leg.group] && !grouped.has(leg.group)) {
      grouped.add(leg.group);
      const members = ticket.legs.filter((l) => l.group === leg.group);
      lines.push(`${ticket.groups[leg.group].label} · ${members[0].game.join(' at ')}`);
      for (const m of members) lines.push(`  - ${m.who}: ${m.label}`);
    } else if (!leg.group) {
      lines.push(`${leg.who}: ${leg.label} (${(leg.game || []).join(' at ')})`);
    }
  }
  lines.push('Place as ONE parlay at any book (boosts encouraged). Same-game legs go in as an SGP. Post a screenshot of the slip.');
  return lines.join('\n');
}

function nickMap(roster) {
  const map = {};
  for (const p of PEOPLE) {
    for (const a of [p.name, p.nick, ...(p.aliases || [])]) {
      map[a.toLowerCase()] = p.name;
      map[identKey(a)] = p.name;
    }
  }
  for (const n of roster || []) {
    const canon = canonicalWho(n, roster) || n;
    map[n.toLowerCase()] = canon;
    map[n.split(' ')[0].toLowerCase()] = canon;
    map[identKey(n)] = canon;
  }
  return map;
}

export function parseWhatsApp(text, roster) {
  const names = nickMap(roster);
  const picks = [];
  const chunks = String(text || '').split(/\n{2,}/);
  const lines = String(text || '').split(/\n/);

  const tryLine = (raw) => {
    const line = raw.replace(/^\[?\d{1,2}:\d{2}.*?\]\s*/, '').replace(/^[^:]+:\s/, (m) => m);
    // HOLM PICK block
    return line;
  };

  // Structured blocks
  const blockRe = /HOLM PICK\s+W?(\d+)?\s*[\s\S]*?Who:\s*(.+)\s*Game:\s*(.+)\s*Type:\s*(.+)\s*Pick:\s*(.+)\s*(?:Odds:\s*(.+))?/gi;
  let m;
  const src = String(text || '');
  while ((m = blockRe.exec(src))) {
    const who = resolveWho(m[2], names);
    const game = parseGame(m[3]);
    const type = parseType(m[4]);
    const pick = m[5].trim();
    const odds = parseOdds(m[6]);
    picks.push(blockToLeg(who, game, type, pick, odds));
  }
  if (picks.length) return picks.filter((p) => p.who);

  // One-liners: "Brad | Broncos ML | DEN at ARI | -110" or "Brad: DEN ML DEN at ARI"
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /joined|left|image omitted|waiting for this message/i.test(line)) continue;
    const cleaned = line.replace(/^\[?\d{1,2}:\d{2}[^\]]*\]\s*/, '');
    const pipe = cleaned.split('|').map((s) => s.trim());
    let who, rest, game, label, odds;
    if (pipe.length >= 3) {
      who = resolveWho(pipe[0].replace(/:$/, ''), names);
      label = pipe[1];
      game = parseGame(pipe[2]);
      odds = parseOdds(pipe[3]);
    } else {
      const colon = cleaned.match(/^([^:]{2,40}):\s*(.+)$/);
      if (!colon) continue;
      who = resolveWho(colon[1], names);
      rest = colon[2];
      odds = parseOdds((rest.match(/([+-]\d{3,})/) || [])[1]);
      game = parseGame(rest);
      label = rest.replace(/[A-Z]{2,3}\s*(at|@)\s*[A-Z]{2,3}/i, '').replace(/[+-]\d{3,}/, '').trim();
    }
    if (!who) continue;
    const type = parseType(label || rest || '');
    const team = (label || '').match(/\b([A-Z]{2,3})\b/);
    picks.push({
      who,
      source: 'whatsapp',
      leg: {
        type: type || 'ml',
        label: label || 'Pick',
        game: game || ['', ''],
        team: team ? team[1] : '',
        odds: odds || '',
        side: /under/i.test(label || '') ? 'under' : /over/i.test(label || '') ? 'over' : 'over',
        line: numberIn(label || rest || ''),
        player: type === 'player' ? guessPlayer(label) : '',
        stat: type === 'player' ? guessStat(label) : 'anyTD',
      },
    });
  }
  return picks.filter((p) => p.who);
}

function resolveWho(s, names) {
  const raw = String(s || '').trim();
  const fromPeople = canonicalWho(raw);
  if (fromPeople && PERSON_BY_KEY[identKey(raw)]) return fromPeople;
  const k = raw.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (names[k]) return names[k];
  const compact = identKey(raw);
  if (names[compact]) return names[compact];
  const first = k.split(' ')[0];
  if (names[first]) return names[first];
  for (const [alias, n] of Object.entries(names)) {
    if (k.includes(alias) || alias.includes(k)) return n;
  }
  return fromPeople || '';
}

export function parseGame(s) {
  const m = String(s || '').toUpperCase().match(/\b([A-Z]{2,3})\s*(?:AT|@)\s*([A-Z]{2,3})\b/);
  return m ? [m[1], m[2]] : ['', ''];
}

export function parseType(s) {
  const t = String(s || '').toLowerCase();
  if (/spread|cover|-?\d+\.5/.test(t) && !/over|under/.test(t)) return 'spread';
  if (/over|under|total|o\/u/.test(t)) return 'total';
  if (/anytime|td|yards|pass|rec|rush|int|prop/.test(t)) return 'player';
  return 'ml';
}

export function parseOdds(s) {
  if (s == null || s === '') return '';
  const n = Number(String(s).replace(/[^0-9+-]/g, ''));
  return isNaN(n) ? '' : n;
}

export function numberIn(s) {
  const m = String(s).match(/-?\d+\.?\d*/);
  return m ? Number(m[0]) : '';
}

export function guessPlayer(label) {
  return String(label || '').replace(/over|under|anytime|\btd\b|yards|pass|rec|rush|\d+.*/ig, '').trim();
}

export function guessStat(label) {
  const t = String(label || '').toLowerCase();
  if (/pass yds|passing yards/.test(t)) return 'passYds';
  if (/rush/.test(t)) return 'rushYds';
  if (/rec yds|receiving/.test(t)) return 'recYds';
  if (/int/.test(t)) return 'passINT';
  if (/reception/.test(t)) return 'receptions';
  if (/pass td/.test(t)) return 'passTD';
  return 'anyTD';
}

export function blockToLeg(who, game, type, pick, odds) {
  const side = /under/i.test(pick) ? 'under' : 'over';
  return {
    who,
    source: 'whatsapp',
    leg: {
      type,
      label: pick,
      game,
      team: type !== 'total' && type !== 'player' ? (pick.match(/\b([A-Z]{2,3})\b/) || [null, ''])[1] : '',
      odds,
      side,
      line: numberIn(pick),
      player: type === 'player' ? guessPlayer(pick) : '',
      stat: type === 'player' ? guessStat(pick) : 'anyTD',
    },
  };
}
