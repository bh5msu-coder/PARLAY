/** League identity: roster, aliases, Auction House handles, rivalries and lore receipts.
 *  Extracted from the legacy app.js (behavior unchanged). Pure — safe on server and client. */

export const FALLBACK_PEOPLE = [
  { id: 'brad', name: 'Brad Holm', nick: 'Brad', aliases: ['Brad', 'Brlaude', 'Low Man Brad'], parlay: true, abstain: false, firstYear: false },
  { id: 'sachs', name: 'John Sachs', nick: 'Jarn', aliases: ['Jarn', 'Jarn Sachs', 'Jarn the Action', 'Jarn Home Depot', 'Jarn the Ticket'], parlay: true, abstain: false, firstYear: false },
  { id: 'hoffman', name: 'Ryan Hoffman', nick: 'Hoss', aliases: ['Hoss', 'Hoss the Three-Peat', 'Hoss Greatness'], parlay: true, abstain: false, firstYear: false },
  { id: 'sack', name: 'Kevin Sack', nick: 'Kev', aliases: ['Kev', 'Kev the Belt', 'Kev Nice Thought'], parlay: true, abstain: false, firstYear: false },
  { id: 'mckeon', name: 'Joe Mckeon', nick: 'Joey', aliases: ['Joey', 'Joseph McKeon', 'Joe McKeon', 'Joey Dawg Pound', 'Joey Auto-Draft'], parlay: true, abstain: false, firstYear: false },
  { id: 'curtis', name: 'Nick Curtis', nick: 'Nick', aliases: ['Nick', 'Nick O-Town', 'Nick Barely Tracks'], parlay: true, abstain: false, firstYear: false },
  { id: 'chas', name: 'Chas Rossman', nick: 'Chas', aliases: ['Chas', 'Charles Q', 'Charles Q on Tab'], parlay: true, abstain: false, firstYear: false },
  { id: 'mcfadden', name: 'Kyle McFadden', nick: 'Kyle', aliases: ['Kyle Mcfadden', 'Kyle', 'Worst Team Kyle', 'Kyle-on-Kyle'], parlay: true, abstain: false, firstYear: false },
  { id: 'heller', name: 'Kyle Heller', nick: 'Heller', aliases: ['Heller', 'H-Bomb', 'H 💣'], parlay: false, abstain: true, firstYear: false },
  { id: 'jace', name: 'Jace Clark', nick: 'Jace', aliases: ['Jace', 'Jace the Bowtie', 'Jace Last-Place Hill'], parlay: true, abstain: false, firstYear: false },
  { id: 'meltser', name: 'Adam Meltser', nick: 'Meltser', aliases: ['Meltser', 'Meltser Truck Stick', 'Bloomfield Meltser'], parlay: true, abstain: false, firstYear: false },
  { id: 'dj', name: 'DJ Dangerous', nick: 'DJ', aliases: ['DJ', 'DJ Cricket', 'Rickety Cricket', 'DJ the Trap'], parlay: true, abstain: false, firstYear: true },
];

export const ident = {
  people: FALLBACK_PEOPLE,
  lore: null,
  selectedOwner: null,
  _map: {},
  load(lore) {
    this.lore = lore;
    this.people = (lore && lore.people && lore.people.length) ? lore.people : FALLBACK_PEOPLE;
    this._map = {};
    for (const p of this.people) {
      this._index(p.name, p);
      this._index(p.nick, p);
      for (const a of p.aliases || []) this._index(a, p);
      const hist = (p.career && p.career.history) || [];
      let latest = null;
      for (const s of hist) if (s && s.team && s.team !== '- -' && (!latest || s.season > latest.season)) latest = s;
      if (latest) this._index(latest.team, p);
    }
  },
  _index(s, p) {
    const k = this.key(s);
    if (k && !this._map[k]) this._map[k] = p;
  },
  key(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); },
  person(name) { return this._map[this.key(name)] || null; },
  canonical(name) {
    if (name == null || name === '') return '';
    const p = this.person(name);
    return p ? p.name : String(name).trim();
  },
  parlayRoster() { return this.people.filter((p) => p.parlay).map((p) => p.name); },
  abstainNames() { return this.people.filter((p) => p.abstain).map((p) => p.name); },
  nick(name) {
    const p = this.person(name);
    if (p) return p.nick || String(p.name || '').split(/\s+/)[0] || p.name;
    const s = String(name || '').trim();
    return s.split(/\s+/)[0] || s;
  },
};
ident.load(null);

export const RIVALRIES = [
  {
    title: 'Three rings vs the repeat',
    a: 'heller',
    b: 'hoffman',
    pair: 'Heller / Hoss',
    why: 'Heller has the most titles in the current 12 (2011, 2021, 2022) and sits the weekly $10 parlay. Hoss just went back-to-back (2024, 2025). They shared eight seasons: Heller finished ahead 6–2, then Hoss flipped it in 2024 (#1 vs Heller #11) and 2025 (#1 vs #5).',
    stat: 'Overlap 2012, 2019–2025: Heller better finish 6, Hoss 2. Neither has a last-place season.',
  },
  {
    title: 'The 16-year drought',
    a: 'meltser',
    b: 'heller',
    pair: 'Meltser / Heller',
    why: 'Meltser has played every season since 2010 and still has zero championships — longest drought among current managers. Heller, same 16-year span, has three. Meltser’s best finishes are 3rd (2012, 2016, 2017).',
    stat: 'All 16 overlapping seasons: Heller ranked ahead 12–4. Meltser last-place count is 0 — stuck in the middle, not the cellar.',
  },
  {
    title: 'Last, last, then a monster',
    a: 'sachs',
    b: 'chas',
    pair: 'Jarn / Chas',
    why: 'Jarn took last in 2023 and 2024, then posted 2025’s scoring high: 1,830.1 PF, 26–2, finish #2 (Hoss still won the title). Chas has two titles (2012, 2020) and the most last places in the current 12 (2016, 2022, 2025). Sixteen shared seasons split 8–8; 2025 they swapped poles.',
    stat: '2025 Jarn 1,830.1 PF vs Chas 1,387.0. Career titles 2–2. Last places Jarn 2, Chas 3.',
  },
  {
    title: 'Champion of the toilet bowl',
    a: 'chas',
    b: 'chas',
    pair: 'Chas',
    why: 'Chas is the only current manager with multiple titles and the league-high last-place count. 2024 he went 24–4 and finished 3rd; 2025 he went 6–22 and finished last.',
    stat: 'Titles 2012, 2020. Last places 2016, 2022, 2025 (3). Career PF 24,224.1 is the current-12 high.',
  },
  {
    title: 'Cellar to Holm Field',
    a: 'brad',
    b: 'heller',
    pair: 'Brad / Heller',
    why: 'Brad finished last in 2012 and 2013, then won 2023. Across 16 shared seasons Heller still leads the rank battle 12–4, but Brad has taken four of the last seven years (2019, 2023–2025).',
    stat: 'Brad titles: 2023. Heller titles: 3. Brad last places: 2. Heller last places: 0. 2023 Brad #1, Heller #5.',
  },
  {
    title: 'The 2021 runner-up fade',
    a: 'curtis',
    b: 'hoffman',
    pair: 'Nick / Hoss',
    why: 'Nick’s first season (2021) was #2. He has not finished higher than 7th since. In the five years they overlapped, Hoss finished ahead 4–1 and then stacked 2024–2025 titles.',
    stat: 'Nick 2021 #2, then 9 / 11 / 7 / 10. Overlap 2021–2025: Hoss better finish 4, Nick 1 (only 2021).',
  },
];

// Unique Auction House handles from chat lore. Short nicks stay on Elo and the tape.
export const HOUSE_HANDLE = {
  heller: { sit: 'H-Bomb', default: 'H-Bomb' },
  hoffman: { chalk: 'Hoss the Three-Peat', ml: 'Hoss the Three-Peat', killer: 'Hoss Greatness', default: 'Hoss the Three-Peat' },
  sachs: { sgp: 'Jarn the Action', ml: 'Jarn the Action', tab: 'Jarn the Ticket', default: 'Jarn the Action' },
  chas: { props: 'Charles Q', player: 'Charles Q', tab: 'Charles Q on Tab', default: 'Charles Q' },
  mckeon: { total: 'Joey Dawg Pound', mixer: 'Joey Auto-Draft', default: 'Joey Dawg Pound' },
  dj: { sgp: 'DJ Cricket', player: 'DJ Cricket', killer: 'DJ the Trap', default: 'DJ Cricket' },
  jace: { sgp: 'Jace the Bowtie', total: 'Jace the Bowtie', bricks: 'Jace Last-Place Hill', default: 'Jace the Bowtie' },
  curtis: { sgp: 'Nick O-Town', player: 'Nick O-Town', default: 'Nick O-Town' },
  sack: { sgp: 'Kev the Belt', ml: 'Kev the Belt', default: 'Kev the Belt' },
  meltser: { sgp: 'Meltser Truck Stick', player: 'Meltser Truck Stick', default: 'Meltser Truck Stick' },
  mcfadden: { chalk: 'Worst Team Kyle', ml: 'Worst Team Kyle', default: 'Worst Team Kyle' },
  brad: { sgp: 'Brlaude', player: 'Brlaude', default: 'Brlaude' },
};

export function houseHandle(name, key) {
  const p = ident.person(name);
  const nick = ident.nick(name);
  if (!p) return nick;
  const bank = HOUSE_HANDLE[p.id] || {};
  if (p.abstain || key === 'sit') return bank.sit || nick;
  if (!key) return bank.default || nick;
  return bank[key] || bank.default || nick;
}

export function sitHandle(name) {
  return houseHandle(name, 'sit');
}

export function houseNeedle(a, b) {
  const id = a && a.id;
  const vs = b && b.id;
  if (id === 'heller') return 'H-Bomb sat the ticket so Sundays can be football again.';
  if (id === 'hoffman' && vs === 'heller') return 'Hoss said we should not concern ourselves with the opinions of non-gamblers.';
  if (id === 'hoffman') return 'Quiet as a church. Is the three-peat intimidating, or just the Vegas tab?';
  if (id === 'sachs') return 'Wrote 519 last year in rage. The belt is for Home Depot, not the mantle.';
  if (id === 'mckeon') return 'Oktoberfest, auto-draft, nachos in a Dawg Bowl.';
  if (id === 'dj') return 'Texas rickety cricket. Broker-of-the-year adjacent.';
  if (id === 'jace') return 'Dying on the worst-team hill. Championship bowtie pending.';
  if (id === 'curtis') return 'O-Town. Barely tracks the matchup.';
  if (id === 'sack') return 'Proposed the belt. Not that he will ever win it. Nice thought.';
  if (id === 'meltser') return 'Human truck stick. Henry every week until it was Gibbs.';
  if (id === 'chas') return 'Charles Q wants the DK points and would lose the belt before displaying it.';
  if (id === 'mcfadden') return 'Put some disrespect in the name. Self-appointed worst team.';
  if (id === 'brad') return 'Brlaude will cover your $10.';
  return '';
}

export function lorePerson(id) {
  return ident.people.find((p) => p.id === id) || null;
}

export function seasonRows(p) {
  return (p && p.career && p.career.history) || [];
}
export function titlesOf(p) {
  const stored = p && p.career && p.career.titles;
  if (stored && stored.length) return stored.slice();
  return seasonRows(p).filter((s) => s.champion).map((s) => s.season);
}
export function lastOf(p) {
  return seasonRows(p).filter((s) => s.rank === 12).map((s) => s.season);
}
export function atYear(p, y) {
  return seasonRows(p).find((s) => s.season === y) || null;
}
export function fmtPf(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
export function ringsWord(n) {
  return n === 1 ? '1 ring' : n + ' rings';
}
export function ordPlace(n) {
  const v = n % 100;
  const suf = (v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return n + suf;
}
export function buildReceipt(a, b) {
  const titlesA = titlesOf(a);
  const titlesB = titlesOf(b);
  const lastA = lastOf(a);
  const lastB = lastOf(b);
  const same = a.id === b.id;
  const years = seasonRows(a).map((s) => s.season).filter((y) => atYear(b, y)).sort((x, y) => x - y);
  let aBetter = 0;
  let bBetter = 0;
  let ties = 0;
  for (const y of years) {
    const ar = atYear(a, y).rank;
    const br = atYear(b, y).rank;
    if (ar < br) aBetter += 1;
    else if (br < ar) bBetter += 1;
    else ties += 1;
  }
  const a25 = atYear(a, 2025);
  const b25 = atYear(b, 2025);
  const seasonsA = (a.career && a.career.seasons) || seasonRows(a).length;
  const seasonsB = (b.career && b.career.seasons) || seasonRows(b).length;
  const pack = { years, aBetter, bBetter, ties, titlesA, titlesB, lastA, lastB, a25, b25, same };
  if (!seasonsA) {
    const extra = !same && seasonsB ? ' ' + b.nick + ' has ' + seasonsB + ' seasons on file.' : '';
    return Object.assign(pack, {
      line: a.nick + ', there is no season on file. The receipt starts when you finish one.',
      stat: 'Seasons on file: 0.' + extra,
    });
  }
  const stole = !same && a25 && b25 && a25.pf > b25.pf && !a25.champion && b25.champion;
  const drought = titlesA.length === 0 && seasonsA >= 8;
  const toilet = titlesA.length > 0 && lastA.length >= 2;
  let open;
  if (stole) {
    open = a.nick + ', you put up ' + fmtPf(a25.pf) + ' points in 2025 and ' + b.nick + ' still took the title on ' + fmtPf(b25.pf);
  } else if (drought && lastA.length === 0) {
    open = a.nick + ', ' + seasonsA + ' seasons, 0 last places, and the trophy case is still a suggestion';
  } else if (drought) {
    open = a.nick + ', ' + seasonsA + ' seasons and the trophy case is still a suggestion';
  } else if (toilet) {
    open = a.nick + ', ' + ringsWord(titlesA.length) + ' and ' + lastA.length + ' toilet bowls (' + lastA.join(', ') + ')';
  } else if (a25 && a25.rank === 12) {
    open = a.nick + ', you finished last in 2025 and the take is still yours to make';
  } else {
    const yr = titlesA.length ? ' (' + titlesA.join(', ') + ')' : '';
    open = a.nick + ', ' + ringsWord(titlesA.length) + yr + ' in ' + seasonsA + ' seasons';
  }
  let h2h;
  if (same) {
    const tail = a25 ? ', and 2025 you finished ' + ordPlace(a25.rank) + ' on ' + fmtPf(a25.pf) + ' points' : '';
    h2h = seasonsA + ' seasons on file' + tail;
  } else if (!years.length) {
    h2h = b.nick + ' shares no season with you (' + seasonsB + ' seasons, ' + ringsWord(titlesB.length) + ' on file)';
  } else if (bBetter > aBetter) {
    h2h = b.nick + ' finished ahead of you ' + bBetter + '–' + aBetter + ' and left with ' + ringsWord(titlesB.length);
  } else if (aBetter > bBetter) {
    h2h = 'you finished ahead of ' + b.nick + ' ' + aBetter + '–' + bBetter + ' (' + b.nick + ' left with ' + ringsWord(titlesB.length) + ')';
  } else {
    h2h = 'better finishes split ' + aBetter + '–' + bBetter + ' (' + b.nick + ' left with ' + ringsWord(titlesB.length) + ')';
  }
  let extraClause = '';
  let mentionedPf = false;
  if (!same && !stole && years.length) {
    const y = years[years.length - 1];
    const ar = atYear(a, y).rank;
    const br = atYear(b, y).rank;
    const flipped = (aBetter > bBetter && br < ar) || (bBetter > aBetter && ar < br);
    const splitSwing = aBetter === bBetter && ar !== br;
    if (flipped || splitSwing) {
      let aside = '';
      let clause;
      if (br < ar) {
        clause = b.nick + ' finished ' + ordPlace(br) + ' to your ' + ordPlace(ar);
        if (y === 2025 && a25 && b25) aside = ' (' + fmtPf(b25.pf) + ' PF to your ' + fmtPf(a25.pf) + ')';
      } else {
        clause = 'you finished ' + ordPlace(ar) + ' to ' + b.nick + "'s " + ordPlace(br);
        if (y === 2025 && a25 && b25) aside = ' (your ' + fmtPf(a25.pf) + ' PF to ' + fmtPf(b25.pf) + ')';
      }
      extraClause = (flipped ? ', but in ' : ', and in ') + y + ' ' + clause + aside;
      mentionedPf = aside.length > 0;
    }
  }
  let pf = '';
  if (!mentionedPf && !stole && !same && a25 && b25) {
    pf = '2025 points for: you ' + fmtPf(a25.pf) + ', ' + b.nick + ' ' + fmtPf(b25.pf);
  }
  const shared = years.length > 0 && years.length <= 3 ? ' (' + years.join(', ') + ')' : '';
  const statBits = [
    'Shared seasons: ' + years.length + shared + '.',
    a.nick + ' better finish ' + aBetter + ', ' + b.nick + ' ' + bBetter + ', ties ' + ties + '.',
    'Titles ' + titlesA.length + '–' + titlesB.length + '.',
    'Last places ' + lastA.length + '–' + lastB.length + '.',
  ];
  if (!same && a25 && b25) statBits.push('2025 PF ' + a.nick + ' ' + fmtPf(a25.pf) + ', ' + b.nick + ' ' + fmtPf(b25.pf) + '.');
  else if (same && a25) statBits.push('2025 finish ' + ordPlace(a25.rank) + ', ' + fmtPf(a25.pf) + ' PF.');
  const sentence = (s) => {
    const t = String(s || '').trim();
    if (!t) return '';
    const head = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?]$/.test(head) ? head : head + '.';
  };
  return Object.assign(pack, { line: [sentence(open), sentence(h2h + extraClause), sentence(houseNeedle(a, b)), sentence(pf)].filter(Boolean).join(' '), stat: statBits.join(' ') });
}

export function whoLabel(name) {
  return houseHandle(name) || name || '—';
}
