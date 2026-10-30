/* Holm League Parlay Tracker
   Data: Supabase table holm_parlay_weeks (season, week, data jsonb). Week 0 = league config.
   Scores: ESPN public API via /api/espn (same-origin proxy). Grading runs in the browser.
   NFL week rolls as soon as the prior week's last game is final (usually MNF; Wednesday
   kickoffs do not wait for ESPN's Wednesday calendar tick). Last-place payer is prior
   ESPN FFL scoring period via /api/espn?path=ffl (needs ESPN_S2 + ESPN_SWID if private). */
(function () {
  'use strict';

  const SUPABASE_URL = window.__SUPABASE_URL || 'https://ivucfpduvaiyxjcqbsqa.supabase.co';
  const SUPABASE_KEY = window.__SUPABASE_KEY || 'sb_publishable_l8oekCrp1RalXOZBZjtTNQ_LmR6x-8D';
  const SEASON = 2026;
  const localPreview = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const vercelDev = localPreview && location.port === '3000';
  const liveOrigin = localPreview && !vercelDev ? 'https://holm-parlay.vercel.app' : '';
  const API = window.__ESPN_API || (liveOrigin + '/api/espn');
  const PICK_API = window.__PICK_API || (liveOrigin + '/api/pick');

  const FALLBACK_PEOPLE = [
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

  const ident = {
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

  const RIVALRIES = [
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

  const KPI_LS = 'hp_kpi_ideas';
  const CHAT_LS = 'hp_chat_drafts';
  let pendingChatDraft = '';
  let Weeks = null;

  // Unique Auction House handles from chat lore. Short nicks stay on Elo and the tape.
  const HOUSE_HANDLE = {
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

  function houseHandle(name, key) {
    const p = ident.person(name);
    const nick = ident.nick(name);
    if (!p) return nick;
    const bank = HOUSE_HANDLE[p.id] || {};
    if (p.abstain || key === 'sit') return bank.sit || nick;
    if (!key) return bank.default || nick;
    return bank[key] || bank.default || nick;
  }

  function sitHandle(name) {
    return houseHandle(name, 'sit');
  }

  function houseNeedle(a, b) {
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

  function lorePerson(id) {
    return ident.people.find((p) => p.id === id) || null;
  }

  function seasonRows(p) {
    return (p && p.career && p.career.history) || [];
  }
  function titlesOf(p) {
    const stored = p && p.career && p.career.titles;
    if (stored && stored.length) return stored.slice();
    return seasonRows(p).filter((s) => s.champion).map((s) => s.season);
  }
  function lastOf(p) {
    return seasonRows(p).filter((s) => s.rank === 12).map((s) => s.season);
  }
  function atYear(p, y) {
    return seasonRows(p).find((s) => s.season === y) || null;
  }
  function fmtPf(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function ringsWord(n) {
    return n === 1 ? '1 ring' : n + ' rings';
  }
  function ordPlace(n) {
    const v = n % 100;
    const suf = (v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return n + suf;
  }
  function buildReceipt(a, b) {
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
  function hashRoute() {
    const raw = (location.hash || '#week').replace(/^#/, '');
    const q = raw.indexOf('?');
    const path = q === -1 ? raw : raw.slice(0, q);
    const params = new URLSearchParams(q === -1 ? '' : raw.slice(q + 1));
    const routes = ['week', 'pick', 'standings', 'league', 'history', 'chat', 'admin'];
    return { path: routes.indexOf(path) === -1 ? 'week' : path, params };
  }
  function openChatPair(a, b, draft) {
    const next = '#chat?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b);
    if (draft) pendingChatDraft = draft;
    if (location.hash === next) render();
    else location.hash = next;
  }
  function chatPair() {
    const params = hashRoute().params;
    const wantA = params.get('a') || 'meltser';
    const wantB = params.get('b') || 'heller';
    return {
      a: lorePerson(wantA) || lorePerson('meltser') || ident.people[0],
      b: lorePerson(wantB) || lorePerson('heller') || ident.people[0],
    };
  }
  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }

  // ---------- small helpers ----------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === false || attrs[k] == null) continue;
      else el.setAttribute(k, attrs[k]);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  };
  const MINUS = '−';
  const fmtOdds = (o) => {
    if (o == null || o === '' || isNaN(o)) return '–';
    const n = Number(o);
    if (n === 100) return 'EVEN';
    return (n > 0 ? '+' : MINUS) + Math.abs(n).toLocaleString('en-US');
  };
  const fmtMoney = (n, signed) => {
    if (n == null || isNaN(n)) return '–';
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!signed) return '$' + abs;
    return (n < 0 ? MINUS : n > 0 ? '+' : '') + '$' + abs;
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fmtKick = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
  };
  const toast = (msg) => {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  // ---------- data layer ----------
  const sb = {
    async rows() {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/holm_parlay_weeks?season=eq.${SEASON}&select=week,data,updated_at&order=week.asc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
      });
      if (!r.ok) throw new Error('Could not load league data (' + r.status + ')');
      return r.json();
    },
    async rpc(fn, args) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
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

  const espnCache = { scoreboard: {}, summary: {}, ffl: {} };
  const espn = {
    async scoreboard(week, force) {
      const key = week == null || week === 'now' ? 'now' : String(week);
      const c = espnCache.scoreboard[key];
      if (c && !force && Date.now() - c.at < 20000) return c.data;
      const qs = key === 'now'
        ? `path=scoreboard&season=${SEASON}`
        : `path=scoreboard&season=${SEASON}&week=${week}`;
      const r = await fetch(`${API}?${qs}&_=${Date.now()}`);
      if (!r.ok) throw new Error('scores unavailable');
      const data = await r.json();
      espnCache.scoreboard[key] = { at: Date.now(), data };
      return data;
    },
    async summary(eventId, finalGame) {
      const c = espnCache.summary[eventId];
      if (c && (finalGame && c.final || Date.now() - c.at < 20000)) return c.data;
      const r = await fetch(`${API}?path=summary&event=${eventId}&_=${Date.now()}`);
      if (!r.ok) throw new Error('box score unavailable');
      const data = await r.json();
      espnCache.summary[eventId] = { at: Date.now(), data, final: !!finalGame };
      return data;
    },
    async ffl(scoringPeriodId, force) {
      const key = String(scoringPeriodId);
      const c = espnCache.ffl[key];
      if (c && !force && Date.now() - c.at < 30000) return c.data;
      const league = (ident.lore && ident.lore.espnLeagueId) || 182263;
      const r = await fetch(`${API}?path=ffl&season=${SEASON}&week=${scoringPeriodId}&league=${league}&_=${Date.now()}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = new Error(data.error || 'fantasy scores unavailable');
        err.unauthorized = !!(data.unauthorized || r.status === 401 || r.status === 403);
        err.status = r.status;
        throw err;
      }
      espnCache.ffl[key] = { at: Date.now(), data };
      return data;
    },
  };

  function weekdayET(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(new Date(iso));
  }

  function formatKickET(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    }).format(new Date(iso)) + ' ET';
  }

  function boardSnapshot(board, weekNum) {
    const events = ((board && board.events) || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const snaps = events.map((ev) => {
      const st = (ev.status || {}).type || {};
      const state = st.state || 'pre';
      return { date: ev.date, state, completed: !!st.completed || state === 'post', name: ev.shortName || ev.name || '' };
    });
    const first = snaps[0] || null;
    const last = snaps[snaps.length - 1] || null;
    const firstAbbr = first && first.name ? first.name.replace(/\s+/g, ' ') : '';
    return {
      week: weekNum,
      count: events.length,
      allFinal: events.length > 0 && snaps.every((s) => s.completed),
      anyLive: snaps.some((s) => s.state === 'in'),
      anyStarted: snaps.some((s) => s.state === 'in' || s.completed),
      firstKick: first ? first.date : null,
      lastKick: last ? last.date : null,
      firstGame: firstAbbr,
      wednesdayOpen: weekdayET(first && first.date) === 'Wed',
      firstKickLabel: formatKickET(first && first.date),
    };
  }

  function resolveNflWeek(espnWeek, prevS, currS) {
    let n = Math.max(1, Math.min(18, Number(espnWeek) || 1));
    if (currS && currS.allFinal) n = n >= 18 ? 18 : n + 1;
    else if (prevS && prevS.count && !prevS.allFinal) n = Math.max(1, n - 1);
    return n;
  }

  async function loadNflClock(force) {
    const nowBoard = await espn.scoreboard('now', force);
    const seasonType = Number((nowBoard.season || {}).type) || 2;
    let espnWeek = Number((nowBoard.week || {}).number) || 1;
    if (seasonType !== 2) espnWeek = 1;
    espnWeek = Math.max(1, Math.min(18, espnWeek));
    const prevN = espnWeek > 1 ? espnWeek - 1 : null;
    const nextN = espnWeek < 18 ? espnWeek + 1 : null;
    const curr = await espn.scoreboard(espnWeek, force);
    const prev = prevN ? await espn.scoreboard(prevN, force) : null;
    const currS = boardSnapshot(curr, espnWeek);
    const prevS = prev ? boardSnapshot(prev, prevN) : { week: prevN, count: 0, allFinal: true };
    const active = resolveNflWeek(espnWeek, prevS, currS);
    let activeS = active === espnWeek ? currS : active === prevN ? prevS : null;
    if (!activeS && nextN && active === nextN) {
      try { activeS = boardSnapshot(await espn.scoreboard(nextN, force), nextN); } catch (e) { activeS = { week: nextN, count: 0, wednesdayOpen: false }; }
    }
    if (!activeS) activeS = { week: active, count: 0, wednesdayOpen: false, firstKickLabel: '', firstGame: '' };
    state.nfl = {
      active,
      espnWeek,
      payerWeek: Math.max(1, active - 1),
      prevFinal: !prevN || !!prevS.allFinal,
      wednesday: !!activeS.wednesdayOpen,
      firstKick: activeS.firstKick || null,
      firstKickLabel: activeS.firstKickLabel || '',
      firstGame: activeS.firstGame || '',
      snapshot: activeS,
    };
    return state.nfl;
  }

  function ownerPerson(ownerName, teamName) {
    let p = ident.person(ownerName);
    if (p) return p;
    p = ident.person(teamName);
    if (p) return p;
    const first = String(ownerName || '').trim().split(/\s+/)[0];
    if (!first) return null;
    const k = ident.key(first);
    const hits = ident.people.filter((x) => ident.key(x.nick) === k || ident.key(x.name).startsWith(k));
    return hits.length === 1 ? hits[0] : null;
  }

  async function loadLastPlace(scoringPeriodId, force) {
    if (!scoringPeriodId) {
      state.lastPlace = null;
      return null;
    }
    try {
      const data = await espn.ffl(scoringPeriodId, force);
      const rows = (data.standings || []).map((row) => {
        const p = ownerPerson(row.owner, row.team);
        return Object.assign({}, row, { who: p ? p.name : ident.canonical(row.owner) || row.owner || '' });
      });
      const last = rows.find((r) => r.points != null) || null;
      state.lastPlace = {
        week: Number(data.scoringPeriodId || scoringPeriodId),
        who: last ? last.who : '',
        points: last ? last.points : null,
        team: last ? last.team : '',
        rows,
        unauthorized: false,
        error: last ? '' : 'No weekly points yet',
      };
    } catch (e) {
      state.lastPlace = {
        week: Number(scoringPeriodId),
        who: '',
        points: null,
        team: '',
        rows: [],
        unauthorized: !!e.unauthorized,
        error: e.message || 'fantasy scores unavailable',
      };
    }
    return state.lastPlace;
  }

  function payerRoster() {
    return uniq((state.config.roster || ident.parlayRoster()).concat(state.config.abstain || ident.abstainNames()).concat(ident.people.map((p) => p.name)));
  }

  function lastPlaceFor(priorWeek) {
    const lp = state.lastPlace;
    if (!lp || !priorWeek || lp.week !== priorWeek) return null;
    return lp;
  }

  function weekPayer(week) {
    if (week && week.payer) return week.payer;
    const lp = lastPlaceFor(week && week.week ? week.week - 1 : 0);
    return (lp && lp.who) || '';
  }

  function weekPayerNote(week) {
    if (week && week.payerNote) return week.payerNote;
    const prior = week && week.week ? week.week - 1 : (state.nfl && state.nfl.payerWeek);
    const lp = lastPlaceFor(prior);
    if (lp && lp.who) {
      const pts = lp.points != null ? `${Number(lp.points).toFixed(1)} PF` : '';
      return `Last in Week ${lp.week} fantasy${pts ? ' · ' + pts : ''}${lp.team ? ' · ' + lp.team : ''}`;
    }
    if (lp && lp.unauthorized) return `Last place in Week ${prior} matchups · ESPN league is private`;
    return prior ? `Last place in Week ${prior} matchups` : 'Last place last week';
  }

  function weekKickNote(n) {
    const clock = state.nfl;
    if (!clock || clock.active !== n) return '';
    if (clock.wednesday) {
      return `Week ${n} opens Wednesday — first kick ${clock.firstKickLabel}${clock.firstGame ? ' · ' + clock.firstGame : ''}. Picks are due before that game, not after the prior Monday night.`;
    }
    if (clock.firstKickLabel) return `First kick ${clock.firstKickLabel}${clock.firstGame ? ' · ' + clock.firstGame : ''}. The board rolls as soon as the previous week’s last game is final.`;
    return '';
  }

  function placeholderWeek(n) {
    return {
      week: n, payer: '', placedBy: '', stake: 10, odds: '', toPay: '', book: '',
      note: '', legs: [], groups: {}, overrides: {}, pendingTicket: true,
    };
  }

  function weekRecord(n) {
    return state.weeks.find((w) => w.week === n) || (state.nfl && state.nfl.active === n ? placeholderWeek(n) : null);
  }

  function weekTabNumbers() {
    const nums = state.weeks.map((w) => w.week);
    const active = state.nfl && state.nfl.active;
    if (active && !nums.includes(active)) nums.push(active);
    nums.sort((a, b) => a - b);
    return nums;
  }

  async function syncNflClock(force) {
    const prevActive = state.nfl && state.nfl.active;
    try { await loadNflClock(force); } catch (e) { if (!state.nfl) return null; }
    const clock = state.nfl;
    if (!clock) return null;
    if (state.weekFollowClock !== false) state.selectedWeek = clock.active;
    else if (prevActive != null && state.selectedWeek === prevActive && clock.active !== prevActive) {
      state.weekFollowClock = true;
      state.selectedWeek = clock.active;
    }
    const payerWeek = clock.payerWeek;
    if (!state.lastPlace || state.lastPlace.week !== payerWeek || force) {
      await loadLastPlace(payerWeek, force);
    }
    return clock;
  }

  // ---------- grading ----------
  function findEvent(scoreboard, legGame) {
    const want = (legGame || []).map((t) => String(t).toUpperCase());
    if (want.length < 2) return null;
    for (const ev of scoreboard.events || []) {
      const comp = ev.competitions && ev.competitions[0];
      if (!comp) continue;
      const abbrs = comp.competitors.map((c) => c.team.abbreviation.toUpperCase());
      if (want.every((t) => abbrs.includes(t))) return { ev, comp };
    }
    return null;
  }

  function gameState(comp, ev) {
    const st = (ev.status || comp.status || {}).type || {};
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    return {
      state: st.state || 'pre', // pre | in | post
      completed: !!st.completed,
      detail: st.shortDetail || st.detail || '',
      home: { abbr: home.team.abbreviation, score: Number(home.score || 0) },
      away: { abbr: away.team.abbreviation, score: Number(away.score || 0) },
      date: ev.date,
      id: ev.id,
    };
  }

  function playerStat(summary, playerName, stat) {
    // returns {value, found}
    const target = norm(playerName);
    const teams = (summary.boxscore && summary.boxscore.players) || [];
    let found = false;
    let rushTD = 0, recTD = 0, value = null;
    for (const t of teams) {
      for (const cat of t.statistics || []) {
        const labels = (cat.labels || []).map((l) => String(l).toUpperCase());
        for (const a of cat.athletes || []) {
          const nm = a.athlete && (a.athlete.displayName || a.athlete.shortName);
          if (norm(nm) !== target) continue;
          found = true;
          const get = (lab) => { const i = labels.indexOf(lab); return i >= 0 ? Number(String(a.stats[i]).split('/')[0]) || 0 : 0; };
          if (stat === 'passYds' && cat.name === 'passing') value = get('YDS');
          if (stat === 'passTD' && cat.name === 'passing') value = get('TD');
          if (stat === 'passINT' && cat.name === 'passing') value = get('INT');
          if (stat === 'rushYds' && cat.name === 'rushing') value = get('YDS');
          if (stat === 'recYds' && cat.name === 'receiving') value = get('YDS');
          if (stat === 'receptions' && cat.name === 'receiving') value = get('REC');
          if (stat === 'anyTD') {
            if (cat.name === 'rushing') rushTD = get('TD');
            if (cat.name === 'receiving') recTD = get('TD');
          }
        }
      }
    }
    if (stat === 'anyTD') {
      let td = rushTD + recTD;
      // fallback: scoring plays naming the player (covers return TDs, and boxscores that lag)
      const last = norm(String(playerName).split(' ').slice(-1)[0]);
      for (const sp of summary.scoringPlays || []) {
        const txt = norm(sp.text || '');
        if ((sp.type && /touchdown/i.test(sp.type.text || '')) && txt.includes(norm(playerName))) { td = Math.max(td, 1); found = true; }
        else if (/touchdown/i.test((sp.type && sp.type.text) || '') && last.length > 3 && txt.startsWith(last)) { td = Math.max(td, 1); found = true; }
      }
      value = td;
    }
    return { value: value == null ? 0 : value, found };
  }

  function gradeLeg(leg, ctx) {
    // ctx: {game (gameState) | null, summary | null, override}
    const res = { leg, state: 'pending', detail: '', current: null, final: false };
    if (ctx.override && ['won', 'lost', 'push', 'void'].includes(ctx.override)) {
      res.state = ctx.override; res.final = true; res.detail = 'Set by commissioner';
      return res;
    }
    if (leg.type === 'tbd') {
      res.state = 'unknown'; res.detail = 'Pick not in yet'; return res;
    }
    const recorded = Weeks && Weeks.terminalState(leg.result);
    if (recorded) {
      res.state = recorded; res.final = true;
      res.detail = leg.detail || ('Recorded ' + (recorded === 'won' ? 'win' : recorded === 'lost' ? 'loss' : recorded));
      return res;
    }
    if (leg.period && leg.period !== 'game' && leg.period !== 'full') {
      res.state = 'unknown'; res.detail = leg.note || 'Result unknown'; return res;
    }
    if (leg.result === 'unknown' || leg.result === 'pending') {
      res.state = 'unknown'; res.detail = leg.note || 'Result unknown'; return res;
    }
    const lineOk = leg.line != null && leg.line !== '' && !Number.isNaN(Number(leg.line));
    const g = ctx.game;
    if (!g) { res.detail = 'Game not found yet'; return res; }
    const total = g.home.score + g.away.score;
    const scoreTxt = `${g.away.abbr} ${g.away.score}–${g.home.abbr} ${g.home.score}`;
    if (g.state === 'pre') { res.detail = fmtKick(g.date); return res; }
    const live = g.state === 'in';
    res.final = g.state === 'post';
    const clock = live ? g.detail : 'Final';
    const teamScore = (abbr) => (g.home.abbr === abbr ? g.home.score : g.away.score);
    const oppScore = (abbr) => (g.home.abbr === abbr ? g.away.score : g.home.score);
    const settle = (won, pushed) => {
      if (res.final) res.state = pushed ? 'push' : won ? 'won' : 'lost';
      else res.state = 'live';
    };
    if (leg.type === 'ml') {
      const t = String(leg.team).toUpperCase();
      const mine = teamScore(t), theirs = oppScore(t);
      res.detail = `${clock} · ${scoreTxt}`;
      res.current = res.final ? (mine > theirs ? `won by ${mine - theirs}` : mine < theirs ? `lost by ${theirs - mine}` : 'tie') : (mine > theirs ? 'leading' : mine < theirs ? 'trailing' : 'tied');
      settle(mine > theirs, mine === theirs);
    } else if (leg.type === 'spread') {
      if (!lineOk) { res.detail = 'Line not posted'; res.state = 'pending'; return res; }
      const t = String(leg.team).toUpperCase();
      const margin = teamScore(t) - oppScore(t) + Number(leg.line);
      res.detail = `${clock} · ${scoreTxt}`;
      res.current = (margin > 0 ? 'covering' : margin < 0 ? 'not covering' : 'push');
      settle(margin > 0, margin === 0);
    } else if (leg.type === 'total') {
      if (!lineOk) { res.detail = 'Line not posted'; res.state = 'pending'; return res; }
      const line = Number(leg.line);
      res.detail = `${clock} · ${scoreTxt} · ${total} pts`;
      res.current = `${total} pts`;
      const over = leg.side === 'over';
      if (!res.final && !over && total > line) { res.state = 'lost'; res.final = true; return res; } // under can't come back
      if (!res.final && over && total > line) { res.state = 'won'; res.final = true; return res; } // over already clinched
      settle(over ? total > line : total < line, total === line);
    } else if (leg.type === 'player') {
      if (!lineOk) { res.detail = 'Line not posted'; res.state = 'pending'; return res; }
      const s = ctx.summary ? playerStat(ctx.summary, leg.player, leg.stat) : { value: null, found: false };
      const line = Number(leg.line);
      const unit = { passYds: 'pass yds', recYds: 'rec yds', rushYds: 'rush yds', passTD: 'pass TD', passINT: 'INT', receptions: 'rec', anyTD: 'TD' }[leg.stat] || '';
      const v = s.value == null ? 0 : s.value;
      res.current = `${v} ${unit}`.trim();
      res.detail = `${clock} · ${scoreTxt}`;
      if (!ctx.summary) { res.detail += ' · box score pending'; res.state = live ? 'live' : 'pending'; if (!live) res.final = false; return res; }
      const over = leg.side !== 'under';
      if (!res.final && over && v > line) { res.state = 'won'; res.final = true; return res; } // over clinched early
      if (!res.final && !over && v > line) { res.state = 'lost'; res.final = true; return res; }
      if (res.final && !s.found && leg.stat !== 'anyTD') { res.detail += ' · player not in box score'; }
      settle(over ? v > line : v < line, v === line);
    } else {
      res.detail = 'Unknown leg type';
    }
    return res;
  }

  function summarizeParlay(week, graded) {
    if (Weeks) return Weeks.summarizeParlay(graded);
    const lost = graded.filter((g) => g.state === 'lost');
    const won = graded.filter((g) => g.state === 'won');
    const pushes = graded.filter((g) => g.state === 'push' || g.state === 'void');
    const live = graded.filter((g) => g.state === 'live');
    const pending = graded.filter((g) => g.state === 'pending' || g.state === 'unknown');
    let state = 'open';
    if (lost.length) state = 'busted';
    else if (won.length + pushes.length === graded.length && graded.length) state = 'cashed';
    else if (live.length) state = 'live';
    // killers: losers whose game finished earliest
    let killers = [];
    if (lost.length) {
      const withTime = lost.map((g) => ({ g, t: g.gameDate ? new Date(g.gameDate).getTime() : 0 }));
      const min = Math.min(...withTime.map((x) => x.t));
      killers = withTime.filter((x) => x.t === min).map((x) => x.g.leg.who);
    }
    return { state, won: won.length, lost: lost.length, pushes: pushes.length, live: live.length, pending: pending.length, killers, total: graded.length };
  }

  async function gradeWeek(week, opts) {
    opts = opts || {};
    const legs = week.legs || [];
    if (Weeks) {
      const stored = Weeks.gradeStoredWeek(week);
      if (stored) {
        return { graded: stored.graded, summary: summarizeParlay(week, stored.graded), fromLock: true, fetchedAt: null };
      }
    }
    if (week.locked && week.locked.results && !opts.force) {
      // settled week: use stored results, no network
      const graded = legs.map((leg) => {
        const r = week.locked.results[leg.id] || {};
        return { leg, state: r.state || 'pending', detail: r.detail || 'Locked', current: r.current || null, final: true, gameDate: r.gameDate || null };
      });
      return { graded, summary: summarizeParlay(week, graded), fromLock: true, fetchedAt: null };
    }
    let scoreboard = null, err = null;
    try { scoreboard = await espn.scoreboard(week.week, opts.force); } catch (e) { err = e; }
    const overrides = week.overrides || {};
    const summaries = {};
    const graded = [];
    for (const leg of legs) {
      let game = null, summary = null;
      if (scoreboard) {
        const m = findEvent(scoreboard, leg.game);
        if (m) {
          game = gameState(m.comp, m.ev);
          if (leg.type === 'player' && game.state !== 'pre' && !overrides[leg.id]) {
            if (!summaries[game.id]) {
              try { summaries[game.id] = await espn.summary(game.id, game.state === 'post'); } catch (e) { summaries[game.id] = null; }
            }
            summary = summaries[game.id];
          }
        }
      }
      const r = gradeLeg(leg, { game, summary, override: overrides[leg.id] });
      r.gameDate = game ? game.date : null;
      if (!scoreboard && !overrides[leg.id]) r.detail = 'Scores unavailable right now';
      graded.push(r);
    }
    return { graded, summary: summarizeParlay(week, graded), fromLock: false, fetchedAt: Date.now(), error: err };
  }

  // ---------- state ----------
  let Ticket = null;

  function blankPickForm() {
    let who = '';
    try { who = localStorage.getItem('hp_who') || ''; } catch (e) { /* ignore */ }
    return { who, type: 'ml', gameAway: '', gameHome: '', team: '', side: 'over', line: '', player: '', stat: 'anyTD', odds: '', label: '' };
  }

  const state = {
    config: { leagueName: 'Our Holm League', chat: '', roster: [], abstain: [], you: '' },
    weeks: [], // [{week, data}]
    route: 'week',
    selectedWeek: null,
    weekFollowClock: true,
    nfl: null,
    lastPlace: null,
    graded: {}, // week -> gradeWeek result
    admin: { pass: sessionStorage.getItem('hp_pass') || '', editing: null },
    timer: null,
    pick: {
      week: null,
      rows: [],
      games: [],
      setupError: '',
      committed: false,
      ticket: null,
      waText: '',
      form: blankPickForm(),
    },
  };

  function uniq(arr) {
    const out = [];
    const seen = new Set();
    for (const x of arr) {
      if (!x || seen.has(x)) continue;
      seen.add(x);
      out.push(x);
    }
    return out;
  }

  function canonicalizeLoaded() {
    const cfg = state.config;
    cfg.you = ident.canonical(cfg.you) || cfg.you;
    cfg.roster = uniq((cfg.roster || []).map((n) => ident.canonical(n)));
    if (!cfg.roster.length) cfg.roster = ident.parlayRoster();
    cfg.abstain = uniq((cfg.abstain || []).map((n) => ident.canonical(n)));
    if (!cfg.abstain.length) cfg.abstain = ident.abstainNames();
    for (const w of state.weeks) {
      w.payer = ident.canonical(w.payer);
      w.placedBy = ident.canonical(w.placedBy);
      for (const leg of w.legs || []) leg.who = ident.canonical(leg.who);
    }
  }

  async function loadData() {
    const fileRes = await fetch('/data/bets.json', { cache: 'no-store' });
    if (!fileRes.ok) throw new Error('Could not load data/bets.json (' + fileRes.status + ')');
    const file = await fileRes.json();
    const normalized = Weeks.normalizeFile(file);
    state.config = Object.assign(state.config, normalized.config || {});
    let remote = [];
    try { remote = await sb.rows(); } catch (e) { remote = []; }
    const cfg = remote.find((r) => r.week === 0);
    if (cfg && cfg.data) state.config = Object.assign(state.config, cfg.data);
    const fileNums = new Set(normalized.weeks.map((w) => w.week));
    const extra = [];
    const conflicts = [];
    for (const r of remote) {
      if (!r || !(r.week > 0)) continue;
      if (fileNums.has(r.week)) {
        const diff = Weeks.diffWeek(normalized.weeks.find((w) => w.week === r.week), r.data);
        if (diff) conflicts.push(diff);
      } else {
        extra.push(Object.assign({ week: r.week }, r.data, { week: r.week, source: 'supabase' }));
      }
    }
    state.dataConflicts = conflicts;
    state.weeks = normalized.weeks.concat(extra).sort((a, b) => a.week - b.week);
    canonicalizeLoaded();
    const onClock = state.nfl && state.nfl.active === state.selectedWeek;
    const inWeeks = state.weeks.find((w) => w.week === state.selectedWeek);
    if (!state.selectedWeek || (!inWeeks && !onClock)) {
      state.selectedWeek = (state.nfl && state.nfl.active)
        || (state.weeks.length ? state.weeks[state.weeks.length - 1].week : null);
    }
  }

  // ---------- rendering ----------
  function statusBadge(st) {
    const map = { won: 'Won', lost: 'Lost', push: 'Push', void: 'Void', live: 'Live', pending: 'Pending', unknown: 'Unknown' };
    return h('span', { class: 'status status--' + (st === 'unknown' ? 'unknown' : st) }, map[st] || st);
  }

  function renderHeader(title, sub) {
    $('#pageTitle').textContent = title;
    const clock = state.nfl;
    const clockBit = clock
      ? `NFL Week ${clock.active}${clock.wednesday ? ' · Wednesday kickoff' : clock.firstKickLabel ? ' · ' + clock.firstKickLabel : ''}`
      : '';
    $('#pageSub').textContent = [sub || '', clockBit].filter(Boolean).join(' · ');
    $('#leagueName').textContent = `${state.config.leagueName} · ${SEASON}${clock ? ' · Wk ' + clock.active : ''}`;
    const chat = $('#chatLink');
    if (state.config.chat) { chat.href = state.config.chat; chat.hidden = false; } else chat.hidden = true;
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === state.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function selectWeek(n) {
    state.selectedWeek = Number(n);
    state.weekFollowClock = !!(state.nfl && state.selectedWeek === state.nfl.active);
    render();
  }

  function weekTabs() {
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Weeks' });
    for (const n of weekTabNumbers()) {
      tabs.appendChild(h('button', {
        class: 'tab', role: 'tab', type: 'button',
        'aria-selected': n === state.selectedWeek ? 'true' : 'false',
        'data-week': String(n),
      }, 'Wk ' + n));
    }
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-week]');
      if (!btn || !tabs.contains(btn)) return;
      selectWeek(btn.getAttribute('data-week'));
    });
    return tabs;
  }

  function legRow(g, week, dead) {
    const leg = g.leg;
    const typeLabel = { ml: 'Moneyline', spread: 'Spread', total: 'Total', player: 'Player prop', tbd: 'Not posted' }[leg.type] || leg.type;
    const game = (leg.game || []).filter(Boolean).join(' at ');
    const inGroup = leg.group && week.groups && week.groups[leg.group];
    const right = h('div', { class: 'leg__right' },
      h('span', { class: 'leg__odds num' }, inGroup ? 'SGP' : fmtOdds(leg.odds)),
      statusBadge(g.state));
    const gameLine = h('div', { class: 'leg__game' },
      h('span', null, g.detail || ''),
      g.current != null && (g.state === 'live' || g.state === 'won' || g.state === 'lost') ? h('span', { class: 'cur' }, String(g.current)) : null);
    return h('li', { class: 'leg' + (dead && g.state !== 'won' && g.state !== 'lost' && g.state !== 'push' ? ' leg--dead' : '') },
      h('span', { class: 'leg__who' }, whoLabel(leg.who)),
      h('div', null, h('div', { class: 'leg__pick' }, leg.label || ''), h('div', { class: 'leg__market' }, game ? `${typeLabel} · ${game}` : typeLabel)),
      gameLine,
      right);
  }

  function renderWeek() {
    const view = $('#view');
    view.innerHTML = '';
    const n = state.selectedWeek || (state.nfl && state.nfl.active);
    const week = (n && weekRecord(n)) || (state.weeks.length ? state.weeks[state.weeks.length - 1] : null);
    if (!week) {
      renderHeader('No tickets yet', 'The commissioner adds the first week from the Commissioner tab.');
      view.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' }, 'No weeks yet. Add the current NFL week from the Commissioner tab.')));
      return;
    }
    const gr = state.graded[week.week];
    const legs = week.legs || [];
    const pending = !!week.pendingTicket || !legs.length;
    const participants = legs.length || (state.config.roster || []).length || 11;
    const share = week.toPay ? week.toPay / participants : null;
    const payer = weekPayer(week);
    renderHeader(`Week ${week.week} parlay`, pending
      ? 'Picks are open'
      : `${participants}-way split`);

    view.appendChild(weekTabs());
    const kick = weekKickNote(week.week);
    if (kick) view.appendChild(h('p', { class: 'rules rules--warn' }, kick));
    if (state.dataConflicts && state.dataConflicts.length) {
      view.appendChild(h('p', { class: 'rules' }, 'Supabase has a different ticket for week ' + state.dataConflicts.map((c) => c.week).join(', ') + '. This board is showing data/bets.json.'));
    }

    // banner
    const s = gr ? gr.summary : null;
    const hold = week.results === 'unknown' || week.results === 'pending';
    let statusEl;
    if (pending && !s) statusEl = h('span', { class: 'status status--pending' }, 'Waiting on the ticket');
    else if (!s) statusEl = h('span', { class: 'status status--pending' }, 'Loading scores');
    else if (s.state === 'busted') statusEl = h('span', { class: 'status status--lost' }, `Busted · killed by ${s.killers.map((k) => whoLabel(k)).join(', ')}`);
    else if (s.state === 'cashed') statusEl = h('span', { class: 'status status--won' }, `Cashed · ${fmtMoney(week.toPay)}`);
    else if (hold) statusEl = h('span', { class: 'status status--unknown' }, `Unknown · ${s.pending} of ${s.total} not graded`);
    else statusEl = h('span', { class: 'status status--' + (s.live ? 'live' : 'pending') }, `${s.state === 'live' ? 'Live' : 'Open'} · ${s.won} of ${s.total} hit`);
    const gradeNote = gr && gr.fetchedAt ? 'Updated ' + new Date(gr.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : hold ? 'Results not recorded' : gr && gr.fromLock ? 'Recorded result' : '';
    view.appendChild(h('section', { class: 'card banner' },
      h('div', null, h('span', { class: 'label' }, 'Payer'), h('span', { class: 'big' }, payer ? `${whoLabel(payer)} pays ${fmtMoney(week.stake || 10)}` : `Stake ${fmtMoney(week.stake || 10)} · payer not recorded`), h('span', { class: 'small' }, weekPayerNote(week))),
      h('div', null, h('span', { class: 'label' }, 'Ticket'), h('span', { class: 'big' }, pending ? 'Not placed yet' : `${legs.length} legs · placed by ${week.placedBy ? whoLabel(week.placedBy) : '—'}`), h('span', { class: 'small' }, (state.config.abstain || []).length ? `${state.config.abstain.map((n) => sitHandle(n)).join(', ')} sits` : '')),
      h('div', null, h('span', { class: 'label' }, 'Parlay status'), h('div', null, statusEl), h('span', { class: 'small' }, gradeNote || (pending ? 'After the previous week’s last game is final' : '')))));

    // stats
    view.appendChild(h('section', { class: 'stats', 'aria-label': 'Week stats' },
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Parlay odds'), h('span', { class: 'stat__value' }, pending ? '—' : fmtOdds(week.odds)), h('span', { class: 'stat__delta' }, `${fmtMoney(week.stake || 10)} stake`)),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Pays if it hits'), h('span', { class: 'stat__value' }, pending ? '—' : fmtMoney(week.toPay)), h('span', { class: 'stat__delta' }, share ? `${fmtMoney(share)} each` : '')),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Legs settled'), h('span', { class: 'stat__value' }, s ? `${s.won + s.lost + s.pushes} / ${s.total}` : '–'), h('span', { class: 'stat__delta' }, s ? `${s.live} live · ${s.pending} to play` : (pending ? 'Ticket not in yet' : ''))),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Season parlays'), h('span', { class: 'stat__value' }, seasonRecord()), h('span', { class: 'stat__delta' }, 'cashed – busted'))));

    if (pending) {
      view.appendChild(h('section', { class: 'card' },
        h('div', { class: 'empty' }, 'No ticket for this NFL week yet. Enter picks on the Pick tab — the board already moved on because last week’s games are final.'),
        h('div', { class: 'notice' }, h('a', { href: '#pick' }, 'Open the pick board'))));
      return;
    }

    // legs
    const list = h('ol', { class: 'legs' });
    const dead = s && s.state === 'busted';
    const graded = gr ? gr.graded : legs.map((leg) => ({ leg, state: 'pending', detail: 'Loading…' }));
    const groups = week.groups || {};
    const done = new Set();
    for (const g of graded) {
      const gid = g.leg.group;
      if (gid && groups[gid] && !done.has(gid)) {
        done.add(gid);
        const members = graded.filter((x) => x.leg.group === gid);
        const gs = summarizeParlay(week, members);
        list.appendChild(h('li', { class: 'leg leg--group' },
          h('span', { class: 'label' }, groups[gid].label || 'Same-game parlay'),
          h('span', { class: 'muted', style: 'font-size:13px' }, 'Same-game parlay, priced as one leg'),
          h('span', { class: 'muted', style: 'font-size:13px' }, (members[0].leg.game || []).join(' at ')),
          h('span', { class: 'num leg__odds', style: 'text-align:right' }, fmtOdds(groups[gid].odds)),
          h('span', { style: 'text-align:right' }, statusBadge(gs.state === 'busted' ? 'lost' : gs.state === 'cashed' ? 'won' : gs.live ? 'live' : 'pending'))));
        for (const m of members) list.appendChild(legRow(m, week, dead));
      } else if (!gid || !groups[gid]) {
        list.appendChild(legRow(g, week, dead));
      }
    }
    const card = h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Legs'), h('span', { class: 'sub' }, gr && gr.error ? 'Live scores unavailable; showing what we have.' : 'Scores refresh every 45 seconds during games.')),
      list,
      h('div', { class: 'notice' }, h('span', null, week.note || ''), h('span', null, week.book ? `Book: ${week.book}` : '')));
    view.appendChild(card);
  }

  function seasonRecord() {
    let c = 0, b = 0;
    for (const w of state.weeks) {
      const g = state.graded[w.week];
      if (!g) continue;
      if (g.summary.state === 'cashed') c++;
      if (g.summary.state === 'busted') b++;
    }
    return `${c} – ${b}`;
  }

  function whoLabel(name) {
    return houseHandle(name) || name || '—';
  }

  function emptyBettingStyle() {
    return { n: 0, ml: 0, spread: 0, total: 0, player: 0, sgp: 0, fav: 0, dog: 0, paidWeeks: 0, busts: 0, hit: 0, miss: 0 };
  }

  function computeBettingStyles() {
    const byWho = new Map();
    const row = (who) => {
      const c = ident.canonical(who);
      if (!c) return null;
      if (!byWho.has(c)) byWho.set(c, emptyBettingStyle());
      return byWho.get(c);
    };
    for (const w of state.weeks) {
      const groups = w.groups || {};
      const payer = row(w.payer);
      if (payer) payer.paidWeeks++;
      const g = state.graded[w.week];
      if (g) {
        for (const k of g.summary.killers || []) {
          const killer = row(k);
          if (killer) killer.busts++;
        }
        for (const r of g.graded) {
          const s = row(r.leg.who);
          if (!s) continue;
          const bucket = Weeks ? Weeks.tallyState(r.state) : (r.state === 'won' ? 'hit' : r.state === 'lost' ? 'miss' : 'open');
          if (bucket === 'hit') s.hit++;
          else if (bucket === 'miss') s.miss++;
        }
      }
      const pricedSgp = new Set();
      for (const leg of w.legs || []) {
        const s = row(leg.who);
        if (!s) continue;
        s.n++;
        const gid = leg.group;
        if (gid && groups[gid]) {
          s.sgp++;
          const key = ident.canonical(leg.who) + '\0' + gid;
          if (pricedSgp.has(key)) continue;
          pricedSgp.add(key);
          const o = Number(groups[gid].odds);
          if (!isNaN(o) && o !== 0) (o < 0 ? s.fav++ : s.dog++);
        } else {
          if (Object.prototype.hasOwnProperty.call(s, leg.type)) s[leg.type]++;
          const o = Number(leg.odds);
          if (!isNaN(o) && o !== 0) (o < 0 ? s.fav++ : s.dog++);
        }
      }
    }
    return byWho;
  }

  function pickEpithet(person, s) {
    if (person && person.abstain) return null;
    if (!s || s.n < 1) return null;
    const weekCount = state.weeks.length || 1;
    if (s.paidWeeks >= 2 && s.paidWeeks >= weekCount / 2) return 'tab';
    if (s.busts >= 2) return 'killer';
    if (s.sgp / s.n >= 0.5) return 'sgp';
    if (s.player / s.n >= 0.5) return 'props';
    const priced = s.fav + s.dog;
    if (priced && s.dog / priced >= 0.6) return 'dogs';
    if (priced && s.fav / priced >= 0.6) return 'chalk';
    let best = null, bestN = 0;
    for (const t of ['ml', 'spread', 'total']) {
      if (s[t] > bestN) { best = t; bestN = s[t]; }
    }
    const standalone = Math.max(s.n - s.sgp, 0);
    if (best && standalone && bestN >= standalone * 0.5) return best;
    const settled = s.hit + s.miss;
    if (settled >= 4) {
      const rate = s.hit / settled;
      if (rate >= 0.75) return 'locks';
      if (rate <= 0.25) return 'bricks';
    }
    return 'mixer';
  }

  function styleNick(name, styles) {
    const p = ident.person(name);
    const key = pickEpithet(p, styles && styles.get(ident.canonical(name)));
    return houseHandle(name, key);
  }

  function computeStandings() {
    const names = new Set(ident.parlayRoster());
    for (const n of state.config.roster || []) {
      const c = ident.canonical(n);
      if (ident.person(c) && ident.person(c).parlay) names.add(c);
    }
    for (const w of state.weeks) for (const l of w.legs || []) if (l.who) {
      const c = ident.canonical(l.who);
      const p = ident.person(c);
      if (p ? p.parlay : false) names.add(c);
    }
    for (const a of ident.abstainNames()) names.delete(a);
    const rows = {};
    for (const n of names) {
      if (!n) continue;
      rows[n] = { who: n, legs: 0, hit: 0, miss: 0, push: 0, busts: 0, paid: 0, share: 0, streak: [], open: 0 };
    }
    for (const w of state.weeks) {
      const g = state.graded[w.week];
      const payer = ident.canonical(w.payer);
      if (payer && rows[payer]) rows[payer].paid += Number(w.stake || 10);
      if (!g) continue;
      const participants = (w.legs || []).length || 1;
      for (const r of g.graded) {
        const who = ident.canonical(r.leg.who);
        const row = rows[who]; if (!row) continue;
        if (Weeks) Weeks.applyLegToRow(row, r.state);
        else {
          row.legs++;
          if (r.state === 'won') { row.hit++; row.streak.push('W'); }
          else if (r.state === 'lost') { row.miss++; row.streak.push('L'); }
          else if (r.state === 'push' || r.state === 'void') row.push++;
          else row.open++;
        }
        if (g.summary.state === 'cashed' && w.toPay) row.share += w.toPay / participants;
      }
      for (const k of g.summary.killers) {
        const who = ident.canonical(k);
        if (rows[who]) rows[who].busts++;
      }
    }
    const list = Object.values(rows);
    list.sort((a, b) => {
      const ra = a.hit + a.miss ? a.hit / (a.hit + a.miss) : -1, rb = b.hit + b.miss ? b.hit / (b.hit + b.miss) : -1;
      return rb - ra || a.busts - b.busts || b.hit - a.hit || a.who.localeCompare(b.who);
    });
    return list;
  }

  function streakText(arr) {
    if (!arr.length) return '–';
    const last = arr[arr.length - 1]; let n = 0;
    for (let i = arr.length - 1; i >= 0 && arr[i] === last; i--) n++;
    return last + n;
  }

  function renderStandings() {
    const view = $('#view'); view.innerHTML = '';
    renderHeader('Standings', 'Ranked by leg hit rate, then fewest busts.');
    const rows = computeStandings();
    const settled = state.weeks.filter((w) => state.graded[w.week] && ['cashed', 'busted'].includes(state.graded[w.week].summary.state));
    const pot = state.weeks.reduce((a, w) => a + ((state.graded[w.week] && state.graded[w.week].summary.state === 'cashed') ? Number(w.toPay || 0) : 0), 0);
    const stakes = state.weeks.reduce((a, w) => a + Number(w.stake || 10), 0);
    const totLegs = rows.reduce((a, r) => a + r.hit + r.miss, 0), totHit = rows.reduce((a, r) => a + r.hit, 0);
    const payers = {};
    for (const w of state.weeks) if (w.payer) payers[w.payer] = (payers[w.payer] || 0) + 1;
    const topPayer = Object.entries(payers).sort((a, b) => b[1] - a[1])[0];

    view.appendChild(h('section', { class: 'stats' },
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Pot won together'), h('span', { class: 'stat__value' }, fmtMoney(pot)), h('span', { class: 'stat__delta' }, `${settled.length} of ${state.weeks.length} parlays settled`)),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Stakes paid in'), h('span', { class: 'stat__value' }, fmtMoney(stakes)), h('span', { class: 'stat__delta' }, `${state.weeks.length} week${state.weeks.length === 1 ? '' : 's'}`)),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'League leg hit rate'), h('span', { class: 'stat__value' }, pct(totHit, totLegs)), h('span', { class: 'stat__delta' }, `${totHit} of ${totLegs} settled legs`)),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Most frequent payer'), h('span', { class: 'stat__value', style: 'font:600 26px/40px var(--font-display);letter-spacing:0' }, topPayer ? whoLabel(topPayer[0]) : '–'), h('span', { class: 'stat__delta' }, topPayer ? `Paid ${topPayer[1]} of ${state.weeks.length}` : ''))));

    const styles = computeBettingStyles();
    const tbody = h('tbody');
    rows.forEach((r, i) => {
      const rate = r.hit + r.miss ? r.hit / (r.hit + r.miss) : null;
      tbody.appendChild(h('tr', { class: r.who === state.config.you ? 'me' : '' },
        h('td', { class: 'rank' }, String(i + 1)),
        h('td', { style: 'font-weight:600' }, styleNick(r.who, styles), r.who === state.config.you ? h('span', { class: 'muted', style: 'font-weight:400' }, ' (you)') : null),
        h('td', { class: 'r num hide-m' }, String(r.legs)),
        h('td', { class: 'r num' }, String(r.hit)),
        h('td', { class: 'r num' }, String(r.miss)),
        h('td', { class: 'r num ' + (rate == null ? '' : rate >= 0.6 ? 'pos' : rate < 0.4 ? 'neg' : '') }, rate == null ? '–' : Math.round(rate * 100) + '%'),
        h('td', { class: 'r num' }, String(r.busts)),
        h('td', { class: 'r num hide-m ' + (r.streak.length && r.streak[r.streak.length - 1] === 'W' ? 'pos' : r.streak.length ? 'neg' : '') }, streakText(r.streak)),
        h('td', { class: 'r num hide-m' }, fmtMoney(r.paid)),
        h('td', { class: 'r num hide-m ' + (r.share ? 'pos' : '') }, r.share ? '+' + fmtMoney(r.share) : fmtMoney(0))));
    });
    for (const a of state.config.abstain || []) {
      tbody.appendChild(h('tr', null, h('td', { class: 'rank' }, '–'), h('td', null, sitHandle(a), h('span', { class: 'muted' }, ' (sits the ticket)')), h('td', { class: 'r num hide-m' }, '0'), h('td', { class: 'r num' }, '–'), h('td', { class: 'r num' }, '–'), h('td', { class: 'r num' }, '–'), h('td', { class: 'r num' }, '–'), h('td', { class: 'r num hide-m' }, '–'), h('td', { class: 'r num hide-m' }, '$0.00'), h('td', { class: 'r num hide-m' }, '$0.00')));
    }
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Managers'), h('span', { class: 'sub' }, 'Auction House handles. Last names stay off this board. Open legs stay out of the hit rate.')),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Manager'), h('th', { class: 'r hide-m' }, 'Legs'), h('th', { class: 'r' }, 'Hit'), h('th', { class: 'r' }, 'Miss'), h('th', { class: 'r' }, 'Hit %'), h('th', { class: 'r' }, 'Busts'), h('th', { class: 'r hide-m' }, 'Streak'), h('th', { class: 'r hide-m' }, 'Paid'), h('th', { class: 'r hide-m' }, 'Won share'))),
        tbody))));

    // week by week
    const wb = h('tbody');
    for (const w of state.weeks) {
      const g = state.graded[w.week];
      const s = g ? g.summary : null;
      wb.appendChild(h('tr', null,
        h('td', { class: 'num' }, String(w.week)),
        h('td', null, w.payer ? whoLabel(w.payer) : '–'),
        h('td', { class: 'r num' }, s ? `${s.won} / ${s.total}` : '–'),
        h('td', { class: 'r num hide-m' }, fmtOdds(w.odds)),
        h('td', null, s && s.killers.length ? s.killers.map((k) => whoLabel(k)).join(', ') : '–'),
        h('td', { class: 'r' }, statusBadge(!s ? 'pending' : s.state === 'busted' ? 'lost' : s.state === 'cashed' ? 'won' : s.pending && !s.won && !s.lost && !s.live ? 'unknown' : s.live ? 'live' : 'pending'))));
    }
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Week by week')),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Week'), h('th', null, 'Payer'), h('th', { class: 'r' }, 'Legs hit'), h('th', { class: 'r hide-m' }, 'Odds'), h('th', null, 'Killed by'), h('th', { class: 'r' }, 'Result'))),
        wb))));

    view.appendChild(renderParlayExtras());
  }

  function tallyRate(hit, miss) {
    const n = hit + miss;
    return { hit, miss, n, rate: n ? hit / n : null };
  }

  function renderParlayExtras() {
    const types = { ml: [0, 0], spread: [0, 0], total: [0, 0], player: [0, 0], sgp: [0, 0] };
    const labels = { ml: 'Moneyline', spread: 'Spread', total: 'Total', player: 'Player prop', sgp: 'Same-game parlay' };
    let fav = [0, 0], dog = [0, 0];
    const killers = {};
    for (const w of state.weeks) {
      const g = state.graded[w.week];
      if (!g) continue;
      const groups = w.groups || {};
      const seenG = new Set();
      for (const r of g.graded) {
        const st = r.state;
        if (st !== 'won' && st !== 'lost') continue;
        const i = st === 'won' ? 0 : 1;
        const gid = r.leg.group;
        if (gid && groups[gid]) {
          if (!seenG.has(gid)) {
            seenG.add(gid);
            const members = g.graded.filter((x) => x.leg.group === gid);
            const gs = summarizeParlay(w, members);
            if (gs.state === 'cashed') types.sgp[0]++;
            else if (gs.state === 'busted') types.sgp[1]++;
            const o = Number(groups[gid].odds);
            if (!isNaN(o) && o !== 0) {
              if (gs.state === 'cashed') (o < 0 ? fav : dog)[0]++;
              else if (gs.state === 'busted') (o < 0 ? fav : dog)[1]++;
            }
          }
        } else {
          const t = r.leg.type;
          if (types[t]) types[t][i]++;
          const o = Number(r.leg.odds);
          if (!isNaN(o) && o !== 0) (o < 0 ? fav : dog)[i]++;
        }
      }
      for (const k of g.summary.killers || []) {
        const who = ident.canonical(k);
        if (who) killers[who] = (killers[who] || 0) + 1;
      }
    }
    const typeRows = Object.keys(types).map((k) => {
      const [hit, miss] = types[k];
      const t = tallyRate(hit, miss);
      return h('tr', null,
        h('td', null, labels[k]),
        h('td', { class: 'r num' }, String(t.n)),
        h('td', { class: 'r num pos' }, String(t.hit)),
        h('td', { class: 'r num neg' }, String(t.miss)),
        h('td', { class: 'r num' }, t.rate == null ? '–' : Math.round(t.rate * 100) + '%'));
    });
    const sideRow = (label, pair) => {
      const t = tallyRate(pair[0], pair[1]);
      return h('tr', null, h('td', null, label), h('td', { class: 'r num' }, String(t.n)), h('td', { class: 'r num' }, t.rate == null ? '–' : Math.round(t.rate * 100) + '%'));
    };
    const killList = Object.entries(killers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const wrap = h('div', { class: 'two' });
    wrap.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'By bet type')),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Market'), h('th', { class: 'r' }, 'Settled'), h('th', { class: 'r' }, 'Hit'), h('th', { class: 'r' }, 'Miss'), h('th', { class: 'r' }, 'Hit %'))),
        h('tbody', null, typeRows)))));
    wrap.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Style & damage')),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Favorites vs dogs'), h('th', { class: 'r' }, 'N'), h('th', { class: 'r' }, 'Hit %'))),
        h('tbody', null, sideRow('Favorites (minus odds)', fav), sideRow('Dogs / plus-odds SGPs', dog)))),
      h('div', { class: 'card__head' }, h('h3', { class: 'h3' }, 'Ticket killers')),
      killList.length
        ? h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Manager'), h('th', { class: 'r' }, 'Busts'))),
          h('tbody', null, killList.map(([who, n]) => h('tr', null, h('td', null, whoLabel(who)), h('td', { class: 'r num neg' }, String(n)))))))
        : h('div', { class: 'empty' }, 'No killers yet. Give it a week.')));
    return wrap;
  }

  function fmtFinish(n) { return n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''); }

  function renderLeague() {
    const view = $('#view'); view.innerHTML = '';
    const lore = ident.lore;
    renderHeader('League', lore ? `${lore.span} · ${lore.seasonCount} seasons of Holm League history` : 'Career records and championships');
    if (!lore) {
      view.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' }, 'League history did not load. Refresh and try again.')));
      return;
    }
    const k = lore.kpis || {};
    const nickOf = (owner) => { const p = ident.person(owner); return p ? (p.nick || p.name) : (owner || '–'); };
    view.appendChild(h('section', { class: 'stats stats--lore' },
      kpiCard('Most titles', k.mostTitles ? nickOf(k.mostTitles.owner) : '–', k.mostTitles ? `${k.mostTitles.count} championships` : ''),
      kpiCard('Reigning champ', k.reigningChamp ? nickOf(k.reigningChamp.owner) : '–', k.reigningChamp ? String(k.reigningChamp.year) : ''),
      kpiCard('Longest drought', k.longestDrought ? nickOf(k.longestDrought.owner) : '–', k.longestDrought ? `${k.longestDrought.seasons} seasons, 0 rings` : ''),
      kpiCard('Most last places', k.mostLastPlaces ? nickOf(k.mostLastPlaces.owner) : '–', k.mostLastPlaces ? `${k.mostLastPlaces.count} toilet bowls` : ''),
      kpiCard('2025 PF monster', k.pfMonster2025 ? nickOf(k.pfMonster2025.owner) : '–', k.pfMonster2025 ? `${k.pfMonster2025.pf} pts` : '')));

    const ribbon = h('div', { class: 'ribbon' });
    for (const c of lore.champions || []) {
      ribbon.appendChild(h('div', { class: 'champ' }, h('div', { class: 'champ__y' }, String(c.year)), h('div', { class: 'champ__n' }, c.owner)));
    }
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Championship lineage'), h('span', { class: 'sub' }, 'Who actually finished the job')),
      h('div', { class: 'ribbonwrap' }, ribbon)));

    view.appendChild(renderRivalriesCard());
    view.appendChild(renderLeagueTape());
    view.appendChild(renderSeasonElo());
    view.appendChild(renderKpiIdeas());

    const tbody = h('tbody');
    const current = ident.people.slice().sort((a, b) => (a.career && a.career.avgFinish || 99) - (b.career && b.career.avgFinish || 99) || a.name.localeCompare(b.name));
    current.forEach((p, i) => {
      const c = p.career || {};
      const badges = [];
      if (p.abstain) badges.push(h('span', { class: 'pill' }, 'H-Bomb sits'));
      if (p.firstYear) badges.push(h('span', { class: 'pill' }, 'First year'));
      tbody.appendChild(h('tr', { class: p.name === state.config.you ? 'me' : '', onclick: () => { ident.selectedOwner = p.name; render(); } },
        h('td', { class: 'rank' }, String(i + 1)),
        h('td', null, h('div', { class: 'who-cell' }, h('span', { style: 'font-weight:600' }, p.name), badges.length ? h('span', { class: 'pills' }, badges) : null)),
        h('td', { class: 'r num hide-m' }, String(c.seasons || 0)),
        h('td', { class: 'r num' }, String(c.titles ? c.titles.length : 0)),
        h('td', { class: 'r num' }, fmtFinish(c.avgFinish)),
        h('td', { class: 'r num hide-m' }, String(c.lastPlaceCount || 0)),
        h('td', { class: 'r num hide-m' }, `${c.wins || 0}–${c.losses || 0}`)));
    });
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'The table'), h('span', { class: 'sub' }, 'Current 12 · avg finish is all-time. Tap a name.')),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Manager'), h('th', { class: 'r hide-m' }, 'Yrs'), h('th', { class: 'r' }, 'Titles'), h('th', { class: 'r' }, 'Avg finish'), h('th', { class: 'r hide-m' }, 'Last place'), h('th', { class: 'r hide-m' }, 'W–L'))),
        tbody))));

    if (k.mostLastPlaces) {
      view.appendChild(h('p', { class: 'rules' }, `Toilet-bowl energy: ${k.mostLastPlaces.owner} has finished last ${k.mostLastPlaces.count} times (${(k.mostLastPlaces.years || []).join(', ')}). Weekly 2026 payer is still last place the week before — entered on the ticket.`));
    }

    const picker = h('div', { class: 'picker' });
    const selected = ident.selectedOwner || ident.people[0].name;
    ident.selectedOwner = selected;
    for (const p of ident.people) {
      picker.appendChild(h('button', {
        class: 'chip' + (p.name === selected ? ' on' : ''), type: 'button',
        onclick: () => { ident.selectedOwner = p.name; render(); },
      }, p.nick || p.name.split(' ')[0]));
    }
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Owner card')),
      h('div', { class: 'card__body' }, picker, renderOwnerCard(selected))));

    const hof = (lore.bestValues || []).slice(0, 6).map((v) =>
      h('tr', null, h('td', { class: 'num' }, String(v.season)), h('td', null, v.owner), h('td', null, v.player), h('td', { class: 'r num' }, '$' + v.price), h('td', { class: 'r num pos' }, String(v.ppd))));
    const shame = (lore.worstValues || []).slice(0, 6).map((v) =>
      h('tr', null, h('td', { class: 'num' }, String(v.season)), h('td', null, v.owner), h('td', null, v.player), h('td', { class: 'r num' }, '$' + v.price), h('td', { class: 'r num neg' }, String(v.ppd))));
    view.appendChild(h('div', { class: 'two' },
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h2', null, 'Best money ever spent'), h('span', { class: 'sub' }, '$20+ auction · pts per $')),
        h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Yr'), h('th', null, 'Owner'), h('th', null, 'Player'), h('th', { class: 'r' }, '$'), h('th', { class: 'r' }, 'Pts/$'))), h('tbody', null, hof)))),
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h2', null, 'Money on fire'), h('span', { class: 'sub' }, '$20+ auction · pts per $')),
        h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Yr'), h('th', null, 'Owner'), h('th', null, 'Player'), h('th', { class: 'r' }, '$'), h('th', { class: 'r' }, 'Pts/$'))), h('tbody', null, shame))))));
  }

  function kpiCard(lab, val, note) {
    return h('div', { class: 'card stat' }, h('span', { class: 'label' }, lab), h('span', { class: 'stat__value stat__value--name' }, val), h('span', { class: 'stat__delta' }, note || ''));
  }

  function renderOwnerCard(name) {
    const p = ident.person(name) || ident.people.find((x) => x.name === name);
    if (!p) return h('p', { class: 'muted' }, 'No card');
    const c = p.career || {};
    const titles = (c.titles || []).length ? (c.titles || []).join(', ') : 'no titles';
    const fins = h('div', { class: 'finrow' });
    for (const s of c.history || []) {
      const cls = s.champion ? 'fin fin--gold' : s.rank <= 4 ? 'fin fin--good' : s.rank >= 11 ? 'fin fin--bad' : 'fin';
      fins.appendChild(h('div', { class: cls }, h('div', { class: 'fin__y' }, String(s.season)), h('div', { class: 'fin__r' }, String(s.rank))));
    }
    const bits = [];
    if (p.abstain) bits.push('H-Bomb sat the ticket so Sundays can be football. Three rings still buy a seat.');
    if (p.firstYear) bits.push('New seat this year (took over for Zintak). No Holm League tape yet — he is writing it on the ticket.');
    if (!p.abstain && !p.firstYear && c.seasons) bits.push(`${c.seasons} seasons · ${c.wins}–${c.losses} · ${c.titles && c.titles.length ? c.titles.length + ' title' + (c.titles.length === 1 ? '' : 's') : 'still hunting a ring'}.`);
    return h('div', { class: 'ocard' },
      h('div', { class: 'ohead' }, h('h3', { class: 'ohead__n' }, p.name), h('span', { class: 'pill' }, titles)),
      bits.length ? h('p', { class: 'oread' }, bits.join(' ')) : null,
      c.seasons ? h('div', { class: 'stats', style: 'margin:12px 0' },
        h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Avg finish'), h('span', { class: 'stat__value' }, fmtFinish(c.avgFinish))),
        h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Last place'), h('span', { class: 'stat__value' }, String(c.lastPlaceCount || 0))),
        h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Career PF'), h('span', { class: 'stat__value' }, c.pf ? Math.round(c.pf).toLocaleString('en-US') : '–'))) : null,
      (c.history || []).length ? h('div', null, h('div', { class: 'label', style: 'margin-bottom:6px' }, 'Finishes'), fins) : h('p', { class: 'muted' }, 'No prior seasons on file.'));
  }

  function renderRivalriesCard() {
    return h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Rivalries'), h('span', { class: 'sub' }, 'Public 2010–2025 tape · overlap ranks, not weekly H2H')),
      RIVALRIES.map((r) => h('article', { class: 'rivalry' },
        h('div', { class: 'rivalry__pair' }, r.pair),
        h('div', { class: 'rivalry__title' }, r.title),
        h('p', { class: 'rivalry__why' }, r.why),
        h('p', { class: 'rivalry__stat' }, r.stat),
        h('div', { class: 'inline' },
          h('a', { class: 'btn btn--ghost btn--sm', href: '#chat?a=' + r.a + '&b=' + r.b }, 'Needle them in Chat')))));
  }

  function renderLeagueTape() {
    const current = ident.people.filter((p) => p.career && p.career.seasons);
    const pfRows = current
      .map((p) => {
        const row = (p.career.history || []).find((s) => s.season === 2025);
        return row ? { nick: p.nick || p.name, pf: row.pf, rank: row.rank } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.pf - a.pf);
    const maxPf = pfRows.length ? pfRows[0].pf : 1;
    const titleRows = current
      .map((p) => ({ nick: p.nick || p.name, n: (p.career.titles || []).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    const maxT = titleRows.length ? titleRows[0].n : 1;
    const meters = (rows, max, fmt) => rows.map((r) =>
      h('div', { class: 'meter' },
        h('div', { class: 'meter__lab' }, r.nick),
        h('div', { class: 'meter__track' }, h('div', { class: 'meter__fill', style: 'width:' + Math.max(4, Math.round((r.n != null ? r.n : r.pf) / max * 100)) + '%' })),
        h('div', { class: 'meter__val' }, fmt(r))));
    return h('div', { class: 'two' },
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h2', null, '2025 PF'), h('span', { class: 'sub' }, 'Fantasy points for · DJ has no 2025 season')),
        h('div', { class: 'card__body' }, meters(pfRows, maxPf, (r) => r.pf.toFixed(1)),
          h('p', { class: 'muted' }, 'Source: ESPN 182263 via league-lore.json. Jarn led PF; Hoss won the title.'))),
      h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h2', null, 'Titles, current 12'), h('span', { class: 'sub' }, 'Championships 2010–2025')),
        h('div', { class: 'card__body' }, meters(titleRows.map((t) => ({ nick: t.nick, n: t.n })), maxT, (r) => String(r.n)),
          h('p', { class: 'muted' }, 'Heller 3, then Jarn / Hoss / Chas with 2, Brad 1. Six more titles belong to departed owners.'))));
  }

  function calcSeasonElo() {
    const K = 8, START = 1500;
    const people = ident.people.filter((p) => seasonRows(p).length);
    const years = [];
    for (let y = 2010; y <= 2025; y++) years.push(y);
    const R = {};
    const series = {};
    const peak = {};
    const low = {};
    people.forEach((p) => { series[p.id] = years.map(() => null); });
    years.forEach((y, yi) => {
      const field = people.filter((p) => atYear(p, y));
      field.forEach((p) => { if (R[p.id] == null) R[p.id] = START; });
      const d = {};
      field.forEach((p) => { d[p.id] = 0; });
      for (let i = 0; i < field.length; i++) {
        for (let j = i + 1; j < field.length; j++) {
          const a = field[i], b = field[j];
          const ra = atYear(a, y).rank, rb = atYear(b, y).rank;
          const s = ra < rb ? 1 : ra > rb ? 0 : 0.5;
          const e = 1 / (1 + Math.pow(10, (R[b.id] - R[a.id]) / 400));
          const adj = K * (s - e) / (field.length - 1);
          d[a.id] += adj;
          d[b.id] -= adj;
        }
      }
      field.forEach((p) => {
        R[p.id] += d[p.id];
        const v = R[p.id];
        series[p.id][yi] = v;
        peak[p.id] = peak[p.id] == null ? v : Math.max(peak[p.id], v);
        low[p.id] = low[p.id] == null ? v : Math.min(low[p.id], v);
      });
    });
    const now = people.map((p) => ({
      id: p.id,
      nick: p.nick || p.name,
      name: p.name,
      rating: R[p.id],
      seasons: seasonRows(p).length,
      gaps: gapLabels(years.filter((y) => atYear(p, y))),
      peak: peak[p.id],
      low: low[p.id],
    })).sort((a, b) => b.rating - a.rating || a.nick.localeCompare(b.nick));
    return { years, series, now };
  }

  function gapLabels(played) {
    const out = [];
    for (let i = 1; i < played.length; i++) {
      const a = played[i - 1] + 1, b = played[i] - 1;
      if (b >= a) out.push(a === b ? String(a) : a + '–' + b);
    }
    return out;
  }
  function fmtElo(n) { return String(Math.round(n)); }

  function drawSeasonElo(c, elo, selectedName) {
    const W = 1000, H = 380, pad = 8, scale = 2;
    const fonts = { display: cssVar('--font-display', 'sans-serif'), sans: cssVar('--font-sans', 'sans-serif'), mono: cssVar('--font-mono', 'monospace') };
    const col = {
      bg: cssVar('--surface-0', '#0b0f14'), line: cssVar('--line', '#263241'), ink: cssVar('--ink', '#e8edf2'), muted: cssVar('--ink-muted', '#8b99a8'),
      a: cssVar('--brand', '#4d8bff'), b: cssVar('--loss', '#ff8a4c'), gold: cssVar('--pending', '#f5c542'),
    };
    const vals = elo.now.flatMap((r) => elo.series[r.id].filter((v) => v != null));
    if (!vals.length) return;
    const lo = Math.floor((Math.min.apply(null, vals) - 20) / 50) * 50;
    const hi = Math.ceil((Math.max.apply(null, vals) + 20) / 50) * 50;
    const ticks = [];
    for (let t = lo; t <= hi; t += 50) ticks.push(t);
    const focusId = (elo.now.find((r) => r.name === selectedName) || {}).id;
    const series = elo.now.map((r) => {
      const on = r.id === focusId;
      return {
        name: r.nick,
        color: on ? col.a : col.muted,
        data: elo.series[r.id],
        width: on ? 3.5 : 1.5,
        dot: on ? 5 : 2.5,
        labelPoints: on ? 'last' : 'none',
      };
    }).sort((a, b) => a.width - b.width);
    c.width = W * scale; c.height = H * scale;
    c.style.aspectRatio = W + ' / ' + H;
    const ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
    tapeLineChart(ctx, {
      x: pad, y: 4, w: W - pad * 2, h: H - 8,
      title: 'Season Elo by year',
      yLabel: 'Elo rating',
      years: elo.years, series,
      yMin: lo, yMax: hi, invert: false, ticks,
      fmt: (v) => String(Math.round(v)),
      labelPoints: 'none', legend: false, col, fonts,
    });
  }

  function renderSeasonElo() {
    const elo = calcSeasonElo();
    if (!elo.now.length) return h('section', { class: 'card' }, h('div', { class: 'empty' }, 'No seasons on file to rate.'));
    const selected = ident.selectedOwner || ident.people[0].name;
    const noSeason = ident.people.filter((p) => !seasonRows(p).length);
    const canvas = h('canvas', { class: 'elo-chart', role: 'img', 'aria-label': 'Season Elo by year, 2010 to 2025. Lower on the table is a worse rating.' });
    drawSeasonElo(canvas, elo, selected);
    const strip = h('div', { class: 'elo-now' }, elo.now.map((r, i) =>
      h('button', {
        class: 'elo-now__item' + (r.name === selected ? ' on' : ''),
        type: 'button',
        onclick: () => { ident.selectedOwner = r.name; render(); },
      }, (i + 1) + '. ' + r.nick + ' ', h('b', null, fmtElo(r.rating)))));
    const tbody = h('tbody');
    elo.now.forEach((r, i) => {
      tbody.appendChild(h('tr', {
        class: r.name === selected ? 'me' : '',
        onclick: () => { ident.selectedOwner = r.name; render(); },
      },
        h('td', { class: 'rank' }, String(i + 1)),
        h('td', null, r.nick),
        h('td', { class: 'r num' }, fmtElo(r.rating)),
        h('td', { class: 'r num hide-m' }, String(r.seasons) + (r.gaps.length ? ' · gap ' + r.gaps.join(', ') : '')),
        h('td', { class: 'r num hide-m' }, fmtElo(r.peak)),
        h('td', { class: 'r num hide-m' }, fmtElo(r.low))));
    });
    return h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Season Elo'), h('span', { class: 'sub' }, 'Final place among current managers · start 1500')),
      h('div', { class: 'card__body' },
        strip,
        canvas,
        h('p', { class: 'muted' }, 'Season Elo from final place among current managers who played that year. Start 1500, K = 8 split across the field (each pairwise update ÷ n−1), no offseason regression. Gaps = seasons sat out between a manager’s first and last year. Not weekly head-to-head. Source: league-lore.json, ESPN 182263, 2010–2025.'),
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Manager'), h('th', { class: 'r' }, 'Elo'), h('th', { class: 'r hide-m' }, 'Seasons'), h('th', { class: 'r hide-m' }, 'Peak'), h('th', { class: 'r hide-m' }, 'Low'))),
          tbody)),
        noSeason.length ? h('p', { class: 'muted' }, noSeason.map((p) => (p.nick || p.name)).join(', ') + ': no season finishes yet, so no Elo.') : null));
  }

  function renderKpiIdeas() {
    const ideas = lsGet(KPI_LS, []);
    const nameIn = h('input', { type: 'text', placeholder: 'Title rate, playoff conversion…', id: 'kpi-name' });
    const defIn = h('textarea', { placeholder: 'Formula: what you would count, over which seasons, who is eligible. We will not invent a leaderboard.', id: 'kpi-def' });
    const list = ideas.length
      ? h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Idea'), h('th', null, 'Definition (no fake result)'))),
        h('tbody', null, ideas.map((x) => h('tr', null, h('td', null, x.name), h('td', null, x.def))))))
      : h('p', { class: 'muted' }, 'Park a definition here. Known tape (titles, avg finish, last place, PF) is already on this tab — this box is for metrics we have not computed.');
    return h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Propose a KPI'), h('span', { class: 'sub' }, 'Saved on this phone · localStorage')),
      h('div', { class: 'card__body form' },
        h('p', { class: 'muted' }, 'Name it and write the formula. Values stay blank until someone can actually count them from public lore. No 2026 auction intel.'),
        h('div', { class: 'field' }, h('label', null, 'Name'), nameIn),
        h('div', { class: 'field' }, h('label', null, 'Definition'), defIn),
        h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => {
          const name = nameIn.value.trim();
          const def = defIn.value.trim();
          if (!name || !def) { toast('Need a name and a definition'); return; }
          const next = lsGet(KPI_LS, []).concat([{ name, def, at: Date.now() }]);
          lsSet(KPI_LS, next);
          toast('KPI idea saved on this device');
          render();
        } }, 'Save idea'),
        list));
  }

  function waGroupUrl() {
    return state.config.chat || 'https://chat.whatsapp.com/FtnPcXlpljH29Opvjr5Tl9?mode=gi_t';
  }

  function renderFinPair(person, years) {
    const fins = h('div', { class: 'finrow' });
    for (const y of years) {
      const s = atYear(person, y);
      if (!s) continue;
      const cls = s.champion ? 'fin fin--gold' : s.rank <= 4 ? 'fin fin--good' : s.rank >= 11 ? 'fin fin--bad' : 'fin';
      fins.appendChild(h('div', { class: cls }, h('div', { class: 'fin__y' }, String(s.season)), h('div', { class: 'fin__r' }, String(s.rank))));
    }
    return h('div', { class: 'finpair' }, h('div', { class: 'finpair__name' }, person.nick || person.name), fins);
  }

  // ---------- league tape image (canvas) ----------
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function wrapText(ctx, text, maxW) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function tapeLineChart(ctx, o) {
    const { x, y, w, h, title, yLabel, years, series, yMin, yMax, invert, ticks, fmt, labelPoints, col, fonts } = o;
    const L = 64, R = 16, T = 40, B = 40;
    const px = x + L, py = y + T, pw = w - L - R, ph = h - T - B;
    const hasVal = (v) => v != null && v === v;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = col.ink; ctx.font = '600 20px ' + fonts.display;
    ctx.fillText(title, x, y + 20);
    ctx.save();
    ctx.translate(x + 14, py + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = '600 11px ' + fonts.sans; ctx.fillStyle = col.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(yLabel.toUpperCase(), 0, 0);
    ctx.restore();
    const span = (yMax - yMin) || 1;
    const yPos = (v) => invert ? py + ((v - yMin) / span) * ph : py + ph - ((v - yMin) / span) * ph;
    const xPos = (i) => years.length === 1 ? px + pw / 2 : px + (i / (years.length - 1)) * pw;
    ctx.font = '500 12px ' + fonts.mono; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const t of ticks) {
      const yy = yPos(t);
      ctx.strokeStyle = col.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); ctx.stroke();
      ctx.fillStyle = col.muted; ctx.fillText(fmt(t), px - 10, yy);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = col.muted; ctx.font = '500 12px ' + fonts.mono;
    years.forEach((yr, i) => ctx.fillText(String(yr), xPos(i), py + ph + 10));
    series.forEach((s, si) => {
      let lastI = -1;
      for (let i = s.data.length - 1; i >= 0; i--) { if (hasVal(s.data[i])) { lastI = i; break; } }
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      let drawing = false;
      s.data.forEach((v, i) => {
        if (!hasVal(v)) { drawing = false; return; }
        const X = xPos(i), Y = yPos(v);
        if (!drawing) { ctx.moveTo(X, Y); drawing = true; } else ctx.lineTo(X, Y);
      });
      ctx.stroke();
      s.data.forEach((v, i) => {
        if (!hasVal(v)) return;
        const X = xPos(i), Y = yPos(v);
        const champ = !!(s.champ && s.champ[i]);
        const r = s.dot != null ? s.dot : (champ ? 7 : 4.5);
        ctx.fillStyle = champ ? col.gold : s.color;
        ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
        if (champ) { ctx.strokeStyle = col.bg; ctx.lineWidth = 2; ctx.stroke(); }
        const mode = s.labelPoints != null ? s.labelPoints : labelPoints;
        const showLabel = mode === 'all' || (mode === 'last' && i === lastI);
        if (showLabel) {
          ctx.font = '500 11px ' + fonts.mono; ctx.fillStyle = s.color; ctx.textAlign = 'center';
          let above = si === 0;
          if (above && Y - 22 < py - 4) above = false;
          if (!above && Y + 22 > py + ph + 4) above = true;
          ctx.textBaseline = above ? 'bottom' : 'top';
          ctx.fillText(fmt(v), X, above ? Y - 10 : Y + 10);
        }
      });
    });
    if (o.legend === false) return;
    let lx = x + w - R;
    ctx.font = '600 13px ' + fonts.sans; ctx.textBaseline = 'middle';
    for (let i = series.length - 1; i >= 0; i--) {
      const s = series[i];
      ctx.textAlign = 'right'; ctx.fillStyle = col.ink; ctx.fillText(s.name, lx, y + 14);
      lx -= ctx.measureText(s.name).width + 8;
      ctx.fillStyle = s.color; ctx.fillRect(lx - 14, y + 9, 14, 10);
      lx -= 26;
    }
  }
  function tapeCanvas(a, b, rec, target) {
    const same = rec.same;
    const years = same ? seasonRows(a).map((s) => s.season) : rec.years.slice();
    const c = target || document.createElement('canvas');
    const W = 1200, pad = 48, scale = 2;
    const fonts = { display: cssVar('--font-display', 'sans-serif'), sans: cssVar('--font-sans', 'sans-serif'), mono: cssVar('--font-mono', 'monospace') };
    const col = {
      bg: cssVar('--surface-100', '#131a22'), line: cssVar('--line', '#263241'), ink: cssVar('--ink', '#e8edf2'), muted: cssVar('--ink-muted', '#8b99a8'),
      a: cssVar('--brand', '#4d8bff'), b: cssVar('--loss', '#ff8a4c'), gold: cssVar('--pending', '#f5c542'),
    };
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '600 24px ' + fonts.sans;
    const recLines = wrapText(ctx, rec.line, W - pad * 2);
    ctx.font = '400 15px ' + fonts.sans;
    const statLines = wrapText(ctx, rec.stat, W - pad * 2);
    const hasChart = years.length > 0;
    const chart1H = 320, chart2H = 280, gap = 28;
    const headerH = 32 + 56 + recLines.length * 32 + 8 + statLines.length * 22 + 20;
    const H = pad + headerH + (hasChart ? chart1H + gap + chart2H : 48) + 64;
    c.width = W * scale; c.height = H * scale;
    c.style.aspectRatio = W + ' / ' + H;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = col.a; ctx.fillRect(0, 0, W, 6);
    let y = pad;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = col.muted; ctx.font = '600 13px ' + fonts.sans;
    ctx.fillText('HOLM LEAGUE TAPE · 2010–2025 · FINAL PLACE AND POINTS FOR', pad, y + 13); y += 32;
    ctx.fillStyle = col.ink; ctx.font = '700 44px ' + fonts.display;
    ctx.fillText((same ? a.nick : a.nick + ' vs ' + b.nick).toUpperCase(), pad, y + 40); y += 56;
    ctx.font = '600 24px ' + fonts.sans;
    for (const l of recLines) { ctx.fillText(l, pad, y + 24); y += 32; }
    y += 8;
    ctx.fillStyle = col.muted; ctx.font = '400 15px ' + fonts.sans;
    for (const l of statLines) { ctx.fillText(l, pad, y + 15); y += 22; }
    y += 20;
    if (hasChart) {
      const rankSeries = [{ name: a.nick, color: col.a, data: years.map((yr) => atYear(a, yr).rank), champ: years.map((yr) => atYear(a, yr).champion) }];
      const pfSeries = [{ name: a.nick, color: col.a, data: years.map((yr) => atYear(a, yr).pf), champ: years.map((yr) => atYear(a, yr).champion) }];
      if (!same) {
        rankSeries.push({ name: b.nick, color: col.b, data: years.map((yr) => atYear(b, yr).rank), champ: years.map((yr) => atYear(b, yr).champion) });
        pfSeries.push({ name: b.nick, color: col.b, data: years.map((yr) => atYear(b, yr).pf), champ: years.map((yr) => atYear(b, yr).champion) });
      }
      tapeLineChart(ctx, {
        x: pad, y, w: W - pad * 2, h: chart1H,
        title: same ? 'Final place by year' : 'Final place by year, shared seasons',
        yLabel: 'Final place (1 = champion)', years, series: rankSeries,
        yMin: 1, yMax: 12, invert: true, ticks: [1, 3, 6, 9, 12], fmt: (v) => String(v), labelPoints: 'all', col, fonts,
      });
      y += chart1H + gap;
      const all = pfSeries.flatMap((s) => s.data);
      const lo = Math.floor((Math.min(...all) - 60) / 100) * 100;
      const hi = Math.ceil((Math.max(...all) + 60) / 100) * 100;
      const step = (hi - lo) / 4;
      tapeLineChart(ctx, {
        x: pad, y, w: W - pad * 2, h: chart2H,
        title: 'Season points for',
        yLabel: 'Points for', years, series: pfSeries,
        yMin: lo, yMax: hi, invert: false, ticks: [0, 1, 2, 3, 4].map((k) => lo + k * step),
        fmt: (v) => Math.round(v).toLocaleString('en-US'), labelPoints: 'last', col, fonts,
      });
      y += chart2H;
    } else {
      ctx.fillStyle = col.muted; ctx.font = '400 16px ' + fonts.sans;
      ctx.fillText('No season on file to chart.', pad, y + 20); y += 48;
    }
    ctx.strokeStyle = col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y + 16); ctx.lineTo(W - pad, y + 16); ctx.stroke();
    ctx.fillStyle = col.muted; ctx.font = '400 12px ' + fonts.sans; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Source: ESPN league 182263 via league-lore.json. Final place is season standings, not weekly head-to-head. Gold dot = champion.', pad, y + 40);
    ctx.textAlign = 'right'; ctx.fillText(/localhost|127\.0\.0\.1/.test(location.hostname) ? 'holm-parlay.vercel.app' : location.host, W - pad, y + 40);
    return c;
  }
  function canvasBlob(c, type, quality) {
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render image'))), type, quality));
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function jpegPdf(jpegBytes, wPx, hPx, wPt, hPt) {
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let len = 0;
    const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
    const obj = (n, body) => {
      offsets[n] = len;
      push(n + ' 0 obj\n');
      if (typeof body === 'string') push(body);
      else { push(body.head); push(body.bytes); push('\nendstream'); }
      push('\nendobj\n');
    };
    push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt + ' ' + hPt + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    obj(4, { head: '<< /Type /XObject /Subtype /Image /Width ' + wPx + ' /Height ' + hPx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegBytes.length + ' >>\nstream\n', bytes: jpegBytes });
    const content = 'q ' + wPt + ' 0 0 ' + hPt + ' 0 0 cm /Im0 Do Q';
    obj(5, { head: '<< /Length ' + content.length + ' >>\nstream\n', bytes: enc.encode(content) });
    const xref = len;
    let tail = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) tail += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    tail += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    push(tail);
    return new Blob(parts, { type: 'application/pdf' });
  }
  function tapeFileBase(a, b) {
    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return 'holm-tape-' + (a.id === b.id ? slug(a.nick) : slug(a.nick) + '-vs-' + slug(b.nick)) + '-2010-2025';
  }
  async function saveTape(c, a, b, kind) {
    const base = tapeFileBase(a, b);
    try {
      if (kind === 'png') { downloadBlob(await canvasBlob(c, 'image/png'), base + '.png'); toast('PNG saved'); return; }
      if (kind === 'jpeg') { downloadBlob(await canvasBlob(c, 'image/jpeg', 0.92), base + '.jpg'); toast('JPEG saved'); return; }
      const jpeg = await canvasBlob(c, 'image/jpeg', 0.92);
      const bytes = new Uint8Array(await jpeg.arrayBuffer());
      downloadBlob(jpegPdf(bytes, c.width, c.height, Math.round(c.width / 2), Math.round(c.height / 2)), base + '.pdf');
      toast('PDF saved');
    } catch (e) { toast('Could not save: ' + e.message); }
  }
  async function shareTape(c, a, b, text) {
    const base = tapeFileBase(a, b);
    let blob;
    try { blob = await canvasBlob(c, 'image/png'); } catch (e) { toast('Could not render image'); return; }
    const file = new File([blob], base + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    downloadBlob(blob, base + '.png');
    toast('Image saved to this device. Attach it in WhatsApp — the text is opening now.');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
  function renderTape(a, b, rec) {
    const c = tapeCanvas(a, b, rec);
    c.className = 'tape__img';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'League tape: ' + rec.line);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (c.isConnected) tapeCanvas(a, b, rec, c); });
    return c;
  }

  function renderChat() {
    const view = $('#view'); view.innerHTML = '';
    renderHeader('Chat', 'Needles from real tape. Drafts stay on this phone — share to WhatsApp when you want the group.');
    if (!ident.lore) {
      view.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' }, 'League history did not load. Refresh and try again.')));
      return;
    }
    const drafts = lsGet(CHAT_LS, []);
    const pair = chatPair();
    const rec = buildReceipt(pair.a, pair.b);
    const named = RIVALRIES.find((r) => r.a === pair.a.id && r.b === pair.b.id);
    const whoSel = h('select', { id: 'chat-who' },
      ident.people.map((p) => h('option', { value: p.nick || p.name, selected: (state.config.you && ident.nick(state.config.you) === (p.nick || p.name)) ? 'selected' : false }, p.nick || p.name)));
    const box = h('textarea', { placeholder: 'Keep it about titles, finishes, PF — not 2026 auction.', id: 'chat-box' });
    if (pendingChatDraft) {
      box.value = pendingChatDraft;
      pendingChatDraft = '';
      setTimeout(() => box.focus(), 0);
    }
    const share = (text, who) => {
      const line = (who ? who + ': ' : '') + text;
      window.open('https://wa.me/?text=' + encodeURIComponent(line + '\n\nHolm chat: ' + waGroupUrl()), '_blank');
    };
    const receiptText = (r) => (whoSel.value ? whoSel.value + ': ' : '') + r.line + '\n' + r.stat + '\n\nHolm chat: ' + waGroupUrl();
    const shareReceipt = (r) => share(r.line + '\n' + r.stat, whoSel.value);
    const shareBoth = (pa, pb, r) => shareTape(tapeCanvas(pa, pb, r), pa, pb, receiptText(r));
    const pairSelect = (which, current, otherId) => h('select', {
      onchange: (e) => {
        const id = e.target.value;
        const a = which === 'a' ? id : otherId;
        const b = which === 'b' ? id : otherId;
        openChatPair(a, b);
      },
    }, ident.people.map((p) => h('option', { value: p.id, selected: p.id === current ? 'selected' : false }, p.nick || p.name)));
    const tape = renderTape(pair.a, pair.b, rec);
    view.appendChild(h('p', { class: 'rules rules--info' }, 'WhatsApp is still the league thread (paste picks on the Pick tab). This board is local-only — no Meta bot, no extra Supabase table on the shared bake-pool project.'));
    view.appendChild(h('section', { class: 'card', id: 'chat-receipt' },
      h('div', { class: 'card__head' }, h('h2', null, 'Receipt and tape'), h('span', { class: 'sub' }, named ? named.title : 'Shared seasons only')),
      h('div', { class: 'card__body' },
        h('div', { class: 'prompt-row' }, RIVALRIES.map((r) => h('button', {
          class: 'chip' + (r.a === pair.a.id && r.b === pair.b.id ? ' on' : ''),
          type: 'button',
          onclick: () => openChatPair(r.a, r.b),
        }, r.pair))),
        h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', null, 'You'), pairSelect('a', pair.a.id, pair.b.id)),
          h('div', { class: 'field' }, h('label', null, 'Them'), pairSelect('b', pair.b.id, pair.a.id))),
        h('p', { class: 'receipt' }, rec.line),
        h('p', { class: 'rivalry__stat' }, rec.stat),
        h('div', { class: 'tape' }, tape),
        h('p', { class: 'muted', style: 'margin:8px 0 0' }, 'The image carries the receipt, final place by year, and season points for. Share sends the image and the text together where the phone allows it; otherwise it saves the PNG and opens the text in WhatsApp.'),
        h('div', { class: 'inline', style: 'margin-top:12px' },
          h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => shareTape(tape, pair.a, pair.b, receiptText(rec)) }, 'Share tape + receipt'),
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => shareReceipt(rec) }, 'Text only to WhatsApp'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => saveTape(tape, pair.a, pair.b, 'png') }, 'Save PNG'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => saveTape(tape, pair.a, pair.b, 'jpeg') }, 'Save JPEG'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => saveTape(tape, pair.a, pair.b, 'pdf') }, 'Save PDF')))));
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Receipts'), h('span', { class: 'sub' }, 'Counted from 2010–2025 final place')),
      ...RIVALRIES.map((r) => {
        const pa = lorePerson(r.a);
        const pb = lorePerson(r.b);
        if (!pa || !pb) return null;
        const card = buildReceipt(pa, pb);
        const on = r.a === pair.a.id && r.b === pair.b.id;
        return h('article', { class: 'rivalry' + (on ? ' on' : '') },
          h('div', { class: 'rivalry__pair' }, r.pair),
          h('div', { class: 'rivalry__title' }, r.title),
          h('p', { class: 'rivalry__why' }, card.line),
          h('p', { class: 'rivalry__stat' }, card.stat),
          h('div', { class: 'inline' },
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => openChatPair(r.a, r.b, card.line + '\n' + card.stat) }, 'Use as draft'),
            h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => shareBoth(pa, pb, card) }, 'Share tape + receipt'),
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => shareReceipt(card) }, 'Text only')));
      })));
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Write a line'), h('span', { class: 'sub' }, 'Pinned on this device')),
      h('div', { class: 'card__body form' },
        h('div', { class: 'field' }, h('label', null, 'I am'), whoSel),
        h('div', { class: 'field' }, h('label', null, 'Draft'), box),
        h('div', { class: 'inline' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
            const text = box.value.trim();
            const who = whoSel.value;
            if (!text) { toast('Write something first'); return; }
            const next = [{ who, text, at: Date.now() }].concat(lsGet(CHAT_LS, []));
            lsSet(CHAT_LS, next.slice(0, 40));
            box.value = '';
            toast('Pinned locally');
            render();
          } }, 'Pin on this phone'),
          h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => {
            const text = box.value.trim();
            if (!text) { toast('Write something first'); return; }
            share(text, whoSel.value);
          } }, 'Share to WhatsApp'),
          state.config.chat ? h('a', { class: 'btn btn--ghost', href: state.config.chat, target: '_blank', rel: 'noopener' }, 'Open group') : null))));
    if (drafts.length) {
      view.appendChild(h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('h2', null, 'Pinned on this phone'), h('span', { class: 'sub' }, 'Not synced')),
        h('div', { class: 'chatlog' }, drafts.map((d) =>
          h('div', { class: 'chatline' },
            h('div', { class: 'chatline__who' }, d.who),
            h('p', { class: 'chatline__text' }, d.text))))));
    }
  }

  // ---------- commissioner ----------
  const STAT_OPTS = [['passYds', 'Passing yards'], ['recYds', 'Receiving yards'], ['rushYds', 'Rushing yards'], ['passTD', 'Passing TD'], ['passINT', 'Interceptions thrown'], ['receptions', 'Receptions'], ['anyTD', 'Anytime TD (rush or rec)']];

  function blankLeg() { return { id: 'l' + Math.random().toString(36).slice(2, 8), who: '', label: '', type: 'ml', team: '', game: ['', ''], side: 'over', line: '', player: '', stat: 'passYds', odds: '', group: '' }; }

  function renderAdmin() {
    const view = $('#view'); view.innerHTML = '';
    renderHeader('Commissioner', 'Enter the week’s ticket, fix a grade, lock a settled week.');
    if (!state.admin.pass) {
      const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passphrase' });
      view.appendChild(h('section', { class: 'card' }, h('div', { class: 'card__body form' },
        h('div', { class: 'field' }, h('label', { for: 'pass' }, 'Commissioner passphrase'), input),
        h('div', null, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
          try {
            const ok = await sb.rpc('holm_parlay_check_pass', { p_pass: input.value });
            if (!ok) { toast('Wrong passphrase'); return; }
            state.admin.pass = input.value; sessionStorage.setItem('hp_pass', input.value); render();
          } catch (e) { toast('Could not check: ' + e.message); }
        } }, 'Unlock')))));
      return;
    }
    // week picker + new week
    const defaultNew = (state.nfl && state.nfl.active) || (state.weeks.length ? Math.max(...state.weeks.map((w) => w.week)) + 1 : 1);
    const fillAutoPayer = (ticket) => {
      const lp = lastPlaceFor(Number(ticket.week) - 1);
      if (lp && lp.who && !ticket.payer) {
        ticket.payer = lp.who;
        ticket.payerNote = weekPayerNote({ week: ticket.week, payer: '', payerNote: '' });
      }
      return ticket;
    };
    const wk = state.admin.editing || (state.weeks.length ? JSON.parse(JSON.stringify(state.weeks[state.weeks.length - 1])) : fillAutoPayer(newWeek(defaultNew)));
    state.admin.editing = wk;
    const picker = h('select', { onchange: (e) => {
      const v = e.target.value;
      if (v === 'new') state.admin.editing = fillAutoPayer(newWeek(defaultNew));
      else state.admin.editing = JSON.parse(JSON.stringify(state.weeks.find((w) => w.week === Number(v))));
      render();
    } });
    for (const w of state.weeks) picker.appendChild(h('option', { value: w.week, selected: w.week === wk.week ? 'selected' : false }, 'Week ' + w.week));
    picker.appendChild(h('option', { value: 'new', selected: !state.weeks.find((w) => w.week === wk.week) ? 'selected' : false }, '+ New week'));

    const roster = ident.parlayRoster();
    const payers = payerRoster();
    const field = (label, key, type, opts) => {
      const inp = type === 'select' ? h('select', { onchange: (e) => { wk[key] = e.target.value; } }, opts.map((o) => h('option', { value: o, selected: String(wk[key]) === String(o) ? 'selected' : false }, o)))
        : h('input', { type: type || 'text', value: wk[key] == null ? '' : wk[key], oninput: (e) => { wk[key] = type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value; } });
      return h('div', { class: 'field' }, h('label', null, label), inp);
    };
    const lp = lastPlaceFor(Number(wk.week) - 1);
    const payerHint = lp && lp.who
      ? `ESPN last place Week ${lp.week}: ${ident.nick(lp.who)}${lp.points != null ? ' · ' + Number(lp.points).toFixed(1) + ' PF' : ''}. Heller still pays if he finished last.`
      : (state.lastPlace && state.lastPlace.unauthorized
        ? 'Private ESPN league — add ESPN_S2 and ESPN_SWID on Vercel to auto-fill last place.'
        : 'Payer is last place the week before. Auto-fills from ESPN when the league is readable.');
    const top = h('div', { class: 'card__body form' },
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', null, 'Week'), picker), field('Week number', 'week', 'number'), field('Payer (last place prior week)', 'payer', 'select', [''].concat(payers)), field('Placed by', 'placedBy', 'select', [''].concat(roster))),
      h('p', { class: 'muted', style: 'margin:0' }, payerHint),
      lp && lp.who ? h('div', { class: 'inline' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => {
        wk.payer = lp.who;
        wk.payerNote = weekPayerNote({ week: wk.week, payer: '', payerNote: '' });
        render();
      } }, 'Use ESPN last place')) : null,
      h('div', { class: 'row' }, field('Stake $', 'stake', 'number'), field('Parlay odds (e.g. 22840)', 'odds', 'number'), field('To pay $', 'toPay', 'number'), field('Book', 'book')),
      field('Note (shown under the legs)', 'note'));

    // legs editor
    const legsWrap = h('div');
    const groups = wk.groups || (wk.groups = {});
    const renderLegs = () => {
      legsWrap.innerHTML = '';
      (wk.legs || (wk.legs = [])).forEach((leg, idx) => {
        const sel = (key, options, onch) => h('select', { onchange: (e) => { leg[key] = e.target.value; if (onch) onch(); } }, options.map(([v, t]) => h('option', { value: v, selected: String(leg[key]) === String(v) ? 'selected' : false }, t)));
        const txt = (key, ph, num) => h('input', { type: num ? 'number' : 'text', step: num ? 'any' : null, placeholder: ph, value: leg[key] == null ? '' : leg[key], oninput: (e) => { leg[key] = num ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value; } });
        const gameInputs = h('div', { class: 'inline' },
          h('input', { type: 'text', placeholder: 'Away (NE)', value: (leg.game || [])[0] || '', style: 'width:90px', oninput: (e) => { leg.game = [e.target.value.toUpperCase(), (leg.game || [])[1] || '']; } }),
          h('span', { class: 'muted' }, 'at'),
          h('input', { type: 'text', placeholder: 'Home (CHI)', value: (leg.game || [])[1] || '', style: 'width:90px', oninput: (e) => { leg.game = [(leg.game || [])[0] || '', e.target.value.toUpperCase()]; } }));
        const typeSpecific = h('div', { class: 'row' });
        const fillType = () => {
          typeSpecific.innerHTML = '';
          if (leg.type === 'ml' || leg.type === 'spread') typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Team (abbr)'), txt('team', 'CHI')));
          if (leg.type === 'spread') typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Line (e.g. -3.5)'), txt('line', '-3.5', true)));
          if (leg.type === 'total') { typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Side'), sel('side', [['over', 'Over'], ['under', 'Under']]))); typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Total line'), txt('line', '50.5', true))); }
          if (leg.type === 'player') {
            typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Player (as ESPN lists it)'), txt('player', 'Jordan Love')));
            typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Stat'), sel('stat', STAT_OPTS)));
            typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Side'), sel('side', [['over', 'Over'], ['under', 'Under']])));
            typeSpecific.appendChild(h('div', { class: 'field' }, h('label', null, 'Line (282+ = 281.5)'), txt('line', '281.5', true)));
          }
        };
        fillType();
        const override = sel('override', [['', 'Auto grade'], ['won', 'Force WON'], ['lost', 'Force LOST'], ['push', 'Force PUSH'], ['void', 'Force VOID']]);
        legsWrap.appendChild(h('div', { class: 'legedit' },
          h('div', { class: 'row' },
            h('div', { class: 'field' }, h('label', null, `Leg ${idx + 1} · manager`), sel('who', [['', '—']].concat(roster.map((r) => [r, r])))),
            h('div', { class: 'field' }, h('label', null, 'Label shown'), txt('label', 'Bears ML')),
            h('div', { class: 'field' }, h('label', null, 'Type'), sel('type', [['ml', 'Moneyline'], ['spread', 'Spread'], ['total', 'Total'], ['player', 'Player prop']], fillType)),
            h('div', { class: 'field' }, h('label', null, 'Game'), gameInputs)),
          typeSpecific,
          h('div', { class: 'row' },
            h('div', { class: 'field' }, h('label', null, 'Odds (blank if in SGP)'), txt('odds', '-110', true)),
            h('div', { class: 'field' }, h('label', null, 'SGP group id (e.g. sgp1)'), txt('group', '')),
            h('div', { class: 'field' }, h('label', null, 'Grade override'), override),
            h('div', { class: 'field' }, h('label', null, ' '), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { wk.legs.splice(idx, 1); renderLegs(); } }, 'Remove leg')))));
      });
      // groups editor
      const ids = Array.from(new Set((wk.legs || []).map((l) => l.group).filter(Boolean)));
      for (const id of ids) {
        groups[id] = groups[id] || { label: '', odds: '' };
        legsWrap.appendChild(h('div', { class: 'legedit' }, h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', null, `SGP ${id} · label`), h('input', { type: 'text', value: groups[id].label || '', placeholder: '3 pick SGP', oninput: (e) => { groups[id].label = e.target.value; } })),
          h('div', { class: 'field' }, h('label', null, 'SGP odds'), h('input', { type: 'number', value: groups[id].odds || '', placeholder: '525', oninput: (e) => { groups[id].odds = e.target.value === '' ? '' : Number(e.target.value); } })))));
      }
      for (const k of Object.keys(groups)) if (!ids.includes(k)) delete groups[k];
    };
    renderLegs();

    const save = async (lock) => {
      try {
        const payload = JSON.parse(JSON.stringify(wk));
        payload.payer = ident.canonical(payload.payer);
        payload.placedBy = ident.canonical(payload.placedBy);
        payload.overrides = {};
        for (const l of payload.legs || []) {
          l.who = ident.canonical(l.who);
          if (l.override) payload.overrides[l.id] = l.override;
          delete l.override;
        }
        if (lock) {
          const g = await gradeWeek(payload, { force: true });
          if (!['cashed', 'busted'].includes(g.summary.state) && !confirm('Not every leg is final. Lock anyway?')) return;
          payload.locked = { at: new Date().toISOString(), results: {} };
          for (const r of g.graded) payload.locked.results[r.leg.id] = { state: r.state, detail: r.detail, current: r.current, gameDate: r.gameDate };
        } else {
          delete payload.locked;
        }
        const week = Number(payload.week);
        delete payload.week;
        await sb.rpc('holm_parlay_save_week', { p_pass: state.admin.pass, p_season: SEASON, p_week: week, p_data: payload });
        toast(lock ? `Week ${week} locked` : `Week ${week} saved`);
        state.admin.editing = null; state.selectedWeek = week;
        await loadData(); await refreshScores(true); render();
      } catch (e) { toast('Save failed: ' + e.message); }
    };
    // restore overrides into legs for editing
    for (const l of wk.legs || []) if (wk.overrides && wk.overrides[l.id] && !l.override) l.override = wk.overrides[l.id];

    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Week ticket'), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { state.admin.pass = ''; sessionStorage.removeItem('hp_pass'); state.admin.editing = null; render(); } }, 'Lock admin')),
      h('p', { class: 'muted', style: 'margin:0 16px 8px' }, 'Add a week by editing data/bets.json. Weeks in that file stay on the board. A Supabase week shows up only when its week number is not in the file.'),
      top,
      h('div', { class: 'card__head' }, h('h2', null, 'Legs'), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => { wk.legs.push(blankLeg()); renderLegs(); } }, 'Add leg')),
      legsWrap,
      h('div', { class: 'card__body inline' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => save(false) }, 'Save week'),
        h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => save(true) }, 'Lock results'),
        wk.locked ? h('span', { class: 'muted' }, 'Locked ' + new Date(wk.locked.at).toLocaleDateString()) : h('span', { class: 'muted' }, 'Lock once every leg is final so standings stop hitting ESPN for this week.'),
        state.weeks.find((w) => w.week === wk.week) ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: async () => { if (!confirm(`Delete Week ${wk.week}?`)) return; try { await sb.rpc('holm_parlay_delete_week', { p_pass: state.admin.pass, p_season: SEASON, p_week: Number(wk.week) }); state.admin.editing = null; await loadData(); render(); } catch (e) { toast(e.message); } } }, 'Delete week') : null)));

    // league config
    const cfg = JSON.parse(JSON.stringify(state.config));
    const cfgField = (label, key, ph) => h('div', { class: 'field' }, h('label', null, label), h('input', { type: 'text', value: cfg[key] || '', placeholder: ph || '', oninput: (e) => { cfg[key] = e.target.value; } }));
    const rosterTa = h('textarea', { oninput: (e) => { cfg.roster = e.target.value.split('\n').map((s) => ident.canonical(s.trim()) || s.trim()).filter(Boolean); } }, (cfg.roster || ident.parlayRoster()).join('\n'));
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'League settings')),
      h('div', { class: 'card__body form' },
        h('div', { class: 'row' }, cfgField('League name', 'leagueName'), cfgField('Chat link', 'chat', 'https://chat.whatsapp.com/…'), cfgField('Abstains (comma separated)', 'abstainText'), cfgField('Highlight as “you”', 'you')),
        h('div', { class: 'field' }, h('label', null, 'Roster, one per line (full names; nicknames like Hoss / Jarn still map)'), rosterTa),
        h('div', null, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
          try {
            cfg.abstain = (cfg.abstainText != null ? cfg.abstainText : (cfg.abstain || []).join(', ')).split(',').map((s) => ident.canonical(s.trim()) || s.trim()).filter(Boolean);
            cfg.roster = uniq((cfg.roster || []).map((s) => ident.canonical(s)));
            cfg.you = ident.canonical(cfg.you) || cfg.you;
            delete cfg.abstainText;
            await sb.rpc('holm_parlay_save_week', { p_pass: state.admin.pass, p_season: SEASON, p_week: 0, p_data: cfg });
            toast('Settings saved'); await loadData(); render();
          } catch (e) { toast('Save failed: ' + e.message); }
        } }, 'Save settings')))));
    cfg.abstainText = (cfg.abstain || []).join(', ');
    const abstainInput = view.querySelectorAll('input')[view.querySelectorAll('input').length - 2];
    if (abstainInput && abstainInput.value === '') abstainInput.value = cfg.abstainText;
  }

  function newWeek(n) { return { week: n, payer: '', placedBy: '', stake: 10, odds: '', toPay: '', book: '', note: '', legs: [], groups: {}, overrides: {} }; }

  function openPickWeek() {
    if (state.nfl && state.nfl.active) return state.nfl.active;
    if (!state.weeks.length) return 1;
    const last = Math.max(...state.weeks.map((w) => w.week));
    const w = state.weeks.find((x) => x.week === last);
    if (!w) return last;
    const hold = w.results === 'unknown' || w.results === 'pending';
    const openLeg = (w.legs || []).some((l) => l.type === 'tbd' || l.result === 'unknown' || l.result === 'pending');
    if (w.locked) return last + 1;
    if ((w.legs || []).length >= 11 && !hold && !openLeg) return last + 1;
    return last;
  }

  function formToLeg(f) {
    const game = [String(f.gameAway || '').toUpperCase(), String(f.gameHome || '').toUpperCase()];
    const type = f.type;
    let label = f.label;
    if (!label) {
      if (type === 'ml') label = `${f.team} ML`;
      else if (type === 'spread') label = `${f.team} ${Number(f.line) > 0 ? '+' : ''}${f.line}`;
      else if (type === 'total') label = `${f.side === 'under' ? 'Under' : 'Over'} ${f.line}`;
      else label = `${f.player} ${f.side === 'under' ? 'under' : 'over'} ${f.line}`;
    }
    return {
      type, label, game,
      team: (type === 'ml' || type === 'spread') ? String(f.team || '').toUpperCase() : '',
      side: f.side || 'over',
      line: f.line === '' ? '' : Number(f.line),
      player: type === 'player' ? f.player : '',
      stat: type === 'player' ? f.stat : 'anyTD',
      odds: f.odds === '' ? '' : Number(f.odds),
    };
  }

  function waBlock(week, who, leg) {
    return [
      `HOLM PICK W${week}`,
      `Who: ${who}`,
      `Game: ${(leg.game || []).join(' at ')}`,
      `Type: ${leg.type}`,
      `Pick: ${leg.label}`,
      leg.odds ? `Odds: ${leg.odds}` : '',
    ].filter(Boolean).join('\n');
  }

  async function loadPicks(week) {
    const r = await fetch(`${PICK_API}?week=${week}`);
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      state.pick.setupError = '';
      state.pick.rows = [];
      return;
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      state.pick.setupError = data.error || (r.status === 412
        ? 'Picks table is not set up yet. Run supabase/picks.sql in the Supabase SQL editor once.'
        : 'Could not load picks');
      state.pick.rows = [];
      return;
    }
    state.pick.setupError = '';
    state.pick.rows = data.picks || [];
    state.pick.ticket = data.ticket || null;
    state.pick.committed = !!data.committed;
  }

  async function loadPickGames(week) {
    try {
      const board = await espn.scoreboard(week, true);
      state.pick.games = (board.events || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((ev) => {
        const comp = ev.competitions && ev.competitions[0];
        if (!comp) return null;
        const home = (comp.competitors || []).find((c) => c.homeAway === 'home');
        const away = (comp.competitors || []).find((c) => c.homeAway === 'away');
        if (!home || !away) return null;
        const st = (ev.status || comp.status || {}).type || {};
        const wd = weekdayET(ev.date);
        const kick = formatKickET(ev.date);
        return {
          away: away.team.abbreviation,
          home: home.team.abbreviation,
          label: `${away.team.abbreviation} at ${home.team.abbreviation}`,
          detail: (away.team.shortDisplayName || away.team.abbreviation) + ' at ' + (home.team.shortDisplayName || home.team.abbreviation) + (kick ? ' · ' + kick : ''),
          date: ev.date,
          wednesday: wd === 'Wed',
          pre: st.state === 'pre' && !st.completed,
        };
      }).filter(Boolean);
    } catch (e) {
      state.pick.games = [];
    }
  }

  function renderPick() {
    const view = $('#view'); view.innerHTML = '';
    const week = state.pick.week || openPickWeek();
    state.pick.week = week;
    const roster = ident.parlayRoster();
    const f = state.pick.form;
    const payer = weekPayer({ week, payer: (state.weeks.find((w) => w.week === week) || {}).payer });
    renderHeader(`Week ${week} picks`, 'One bet each');
    const kick = weekKickNote(week);
    if (kick) view.appendChild(h('p', { class: 'rules rules--warn' }, kick));

    if (state.pick.setupError) {
      view.appendChild(h('section', { class: 'card' }, h('div', { class: 'card__body' },
        h('p', { class: 'rules' }, state.pick.setupError),
        h('p', { class: 'muted' }, 'Bradley: run supabase/picks.sql once in the Supabase SQL editor, then this board goes live for the group.'))));
    }

    const submissions = (state.pick.rows || []).map((p) => ({ who: ident.canonical(p.who), source: p.source, leg: p.leg }));
    const ticket = Ticket ? Ticket.assembleTicket(submissions, roster) : { complete: false, missing: roster, issues: [], legs: [], groups: {}, count: submissions.length, need: 11, pickErrors: {} };

    view.appendChild(h('section', { class: 'stats' },
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Picks in'), h('span', { class: 'stat__value' }, `${ticket.count} / ${ticket.need}`), h('span', { class: 'stat__delta' }, ticket.complete ? 'Ticket ready' : 'Waiting on the room')),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Heller'), h('span', { class: 'stat__value stat__value--name' }, 'Sits'), h('span', { class: 'stat__delta' }, 'Does not pick')),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Book'), h('span', { class: 'stat__value stat__value--name' }, 'MI'), h('span', { class: 'stat__delta' }, 'One parlay at DK / FanDuel / BetMGM')),
      h('div', { class: 'card stat' }, h('span', { class: 'label' }, 'Stake'), h('span', { class: 'stat__value' }, '$10'), h('span', { class: 'stat__delta' }, payer ? ident.nick(payer) + ' pays' : 'Last place last week pays'))));

    if (ticket.complete) {
      view.appendChild(h('section', { class: 'card' }, h('div', { class: 'card__body' },
        h('p', { class: 'rules' }, state.pick.committed
          ? 'All 11 are in, unique, and grouped so a Michigan book can take this as one wager. Ticket is saved to the Week tab.'
          : 'All 11 are in and the ticket is legal. Copy the slip below and place $10 as one parlay. If auto-save did not fire, the commissioner can paste it from Admin.'),
        h('pre', { class: 'slip' }, Ticket ? Ticket.slipText(ticket, week) : ''),
        h('div', { class: 'inline' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
            try { await navigator.clipboard.writeText(Ticket.slipText(ticket, week)); toast('Bet slip copied'); } catch (e) { toast('Copy failed'); }
          } }, 'Copy bet slip'),
          h('a', { class: 'btn btn--secondary', href: '#week' }, 'Open week tab')))));
    }

    for (const iss of ticket.issues || []) {
      view.appendChild(h('p', { class: 'rules rules--' + iss.level }, iss.text));
    }

    const slots = h('div', { class: 'slots' });
    for (const name of roster) {
      const row = submissions.find((s) => s.who === name);
      slots.appendChild(h('div', { class: 'slot' + (row ? ' slot--in' : '') },
        h('div', { class: 'slot__who' }, name),
        h('div', { class: 'slot__pick' }, row ? (row.leg.label || 'In') : 'Waiting'),
        h('div', { class: 'muted' }, row ? (row.source === 'whatsapp' ? 'WhatsApp' : 'Website') : '—')));
    }
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'The 11'), h('span', { class: 'sub' }, 'H-Bomb sits')),
      h('div', { class: 'card__body' }, slots)));

    const setF = (key, val) => { state.pick.form[key] = val; };
    const gameSel = h('select', { onchange: (e) => {
      const [away, home] = e.target.value.split('|');
      setF('gameAway', away || ''); setF('gameHome', home || '');
    } }, [h('option', { value: '' }, 'Select NFL game')].concat(state.pick.games.map((g) => h('option', {
      value: g.away + '|' + g.home,
      selected: f.gameAway === g.away && f.gameHome === g.home ? 'selected' : false,
    }, g.detail + (g.pre ? '' : ' · started')))));
    const typeSel = h('select', { onchange: (e) => { setF('type', e.target.value); render(); } },
      [['ml', 'Moneyline'], ['spread', 'Spread'], ['total', 'Total'], ['player', 'Player prop']].map(([v, t]) => h('option', { value: v, selected: f.type === v ? 'selected' : false }, t)));
    const extra = h('div', { class: 'row' });
    if (f.type === 'ml' || f.type === 'spread') {
      extra.appendChild(h('div', { class: 'field' }, h('label', null, 'Team'), h('input', { type: 'text', placeholder: f.gameAway || 'KC', value: f.team, oninput: (e) => setF('team', e.target.value.toUpperCase()) })));
    }
    if (f.type === 'spread' || f.type === 'total' || f.type === 'player') {
      extra.appendChild(h('div', { class: 'field' }, h('label', null, 'Line'), h('input', { type: 'number', step: 'any', value: f.line, oninput: (e) => setF('line', e.target.value) })));
    }
    if (f.type === 'total' || f.type === 'player') {
      extra.appendChild(h('div', { class: 'field' }, h('label', null, 'Side'), h('select', { onchange: (e) => setF('side', e.target.value) },
        [['over', 'Over'], ['under', 'Under']].map(([v, t]) => h('option', { value: v, selected: f.side === v ? 'selected' : false }, t)))));
    }
    if (f.type === 'player') {
      extra.appendChild(h('div', { class: 'field' }, h('label', null, 'Player (ESPN spelling)'), h('input', { type: 'text', value: f.player, placeholder: 'Patrick Mahomes', oninput: (e) => setF('player', e.target.value) })));
      extra.appendChild(h('div', { class: 'field' }, h('label', null, 'Stat'), h('select', { onchange: (e) => setF('stat', e.target.value) },
        STAT_OPTS.map(([v, t]) => h('option', { value: v, selected: f.stat === v ? 'selected' : false }, t)))));
    }

    const submitPick = async (source) => {
      const who = ident.canonical(f.who);
      const leg = formToLeg(f);
      const errs = Ticket ? Ticket.validatePick(leg, who, roster) : ['Ticket helper failed to load'];
      if (errs.length) { toast(errs[0]); return; }
      try { localStorage.setItem('hp_who', who); } catch (e) { /* ignore */ }
      const r = await fetch(PICK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, who, source, leg }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast(data.error || 'Submit failed'); if (data.error) state.pick.setupError = data.error; render(); return; }
      toast(data.committed ? 'You are in — ticket saved. 11/11.' : 'Pick saved');
      state.pick.rows = data.picks || state.pick.rows;
      state.pick.ticket = data.ticket || null;
      state.pick.committed = !!data.committed;
      if (data.committed) await loadData();
      render();
    };

    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Enter your bet'), h('span', { class: 'sub' }, 'Website · remembered on this phone')),
      h('div', { class: 'card__body form' },
        h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', null, 'I am'), h('select', { onchange: (e) => setF('who', e.target.value) },
            [h('option', { value: '' }, 'Select yourself')].concat(roster.map((n) => h('option', { value: n, selected: ident.canonical(f.who) === n ? 'selected' : false }, n))))),
          h('div', { class: 'field' }, h('label', null, 'Game'), gameSel),
          h('div', { class: 'field' }, h('label', null, 'Market'), typeSel)),
        extra,
        h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', null, 'Label on the ticket'), h('input', { type: 'text', placeholder: 'Chiefs ML', value: f.label, oninput: (e) => setF('label', e.target.value) })),
          h('div', { class: 'field' }, h('label', null, 'Your price (optional)'), h('input', { type: 'number', placeholder: '-110', value: f.odds, oninput: (e) => setF('odds', e.target.value) }))),
        h('div', { class: 'inline' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => submitPick('web') }, 'Save my pick'),
          h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => {
            const who = ident.canonical(f.who);
            const leg = formToLeg(f);
            if (!who || !leg.game[0]) { toast('Fill in who + game first'); return; }
            const text = waBlock(week, who, leg);
            const url = (state.config.chat || 'https://chat.whatsapp.com/FtnPcXlpljH29Opvjr5Tl9?mode=gi_t');
            window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n\nDrop this in the Holm chat: ' + url), '_blank');
          } }, 'Share to WhatsApp')))));

    const waBox = h('textarea', { placeholder: 'Paste the group chat (or a HOLM PICK block)…', oninput: (e) => { state.pick.waText = e.target.value; } }, state.pick.waText || '');
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'From WhatsApp'), h('span', { class: 'sub' }, 'No bot required — paste the thread, we parse the 11')),
      h('div', { class: 'card__body form' },
        h('p', { class: 'muted' }, 'Best format (copy from the Share button): HOLM PICK W' + week + ' / Who / Game / Type / Pick. One-liners like “Brad | Chiefs ML | KC at LV | -130” also work.'),
        h('div', { class: 'field' }, h('label', null, 'Paste'), waBox),
        h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
          if (!Ticket) { toast('Parser not loaded'); return; }
          const parsed = Ticket.parseWhatsApp(state.pick.waText, roster);
          if (!parsed.length) { toast('No picks found in that paste'); return; }
          const r = await fetch(PICK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, import: true, picks: parsed }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) { toast(data.error || 'Import failed'); return; }
          toast(`Imported ${(data.saved || parsed).length} pick(s)` + (data.committed ? ' — ticket saved' : ''));
          state.pick.rows = data.picks || state.pick.rows;
          state.pick.committed = !!data.committed;
          if (data.committed) await loadData();
          render();
        } }, 'Import picks'))));
  }

  // ---------- parlay history (static parlay-history.json, read-only) ----------
  let parlayHistory = null;
  async function loadParlayHistory() {
    if (parlayHistory) return parlayHistory;
    try { parlayHistory = await fetch('/parlay-history.json').then((r) => r.ok ? r.json() : null); } catch (e) { parlayHistory = null; }
    return parlayHistory;
  }
  const SMALL_N = 5;
  const isPrime = (iso) => { const hr = new Date(iso).getUTCHours(); return hr >= 23 || hr < 6; };
  const hitPct = (w, n) => n ? Math.round((w / n) * 100) + '%' : '–';
  const sampleTag = (n) => n < SMALL_N ? h('span', { class: 'pill' }, 'small sample') : null;

  function calcParlayStats(data) {
    const graded = data.parlays.filter((p) => p.result !== 'pending');
    const legs = [];
    graded.forEach((p) => p.legs.forEach((l) => legs.push(Object.assign({ week: p.week, wlabel: p.label }, l))));
    const decided = legs.filter((l) => l.result === 'win' || l.result === 'loss');
    const people = {};
    const P = (name) => people[name] || (people[name] = { name, nick: whoLabel(name), w: 0, l: 0, u: 0, seq: [], pw: 0, pn: 0, types: {}, busts: 0, picks: [] });
    legs.forEach((l) => {
      const r = P(l.who);
      r.picks.push(l);
      if (l.result === 'unknown') { r.u++; return; }
      const win = l.result === 'win';
      if (win) r.w++; else { r.l++; r.busts++; }
      r.seq.push(win);
      if (isPrime(l.kickoff)) { r.pn++; if (win) r.pw++; }
      const t = r.types[l.type] || (r.types[l.type] = { w: 0, n: 0 });
      t.n++; if (win) t.w++;
    });
    Object.values(people).forEach((r) => {
      r.n = r.w + r.l;
      let best = 0, cur = 0, worst = 0, curL = 0;
      r.seq.forEach((x) => { if (x) { cur++; curL = 0; } else { curL++; cur = 0; } best = Math.max(best, cur); worst = Math.max(worst, curL); });
      r.bestStreak = best; r.coldStreak = worst;
      const last = r.seq[r.seq.length - 1];
      let k = 0; for (let i = r.seq.length - 1; i >= 0 && r.seq[i] === last; i--) k++;
      r.streak = r.seq.length ? (last ? 'W' : 'L') + k : '–';
    });
    const rows = Object.values(people).sort((a, b) => (b.w / (b.n || 1)) - (a.w / (a.n || 1)) || b.n - a.n);
    const types = {};
    decided.forEach((l) => { const t = types[l.type] || (types[l.type] = { w: 0, n: 0 }); t.n++; if (l.result === 'win') t.w++; });
    const teams = {};
    legs.forEach((l) => { const key = l.player || l.team; if (!key) return; const t = teams[key] || (teams[key] = { key, n: 0, w: 0, by: {} }); t.n++; if (l.result === 'win') t.w++; t.by[whoLabel(l.who)] = 1; });
    const favs = Object.values(teams).filter((t) => t.n >= 2).sort((a, b) => b.n - a.n || b.w - a.w);
    return { graded, legs, decided, rows, types, favs, people };
  }

  async function renderHistory() {
    const view = $('#view'); view.innerHTML = '';
    renderHeader('Parlay history', 'Weekly $10 group parlay · 11–12 leg tickets only');
    const data = await loadParlayHistory();
    if (state.route !== 'history') return;
    if (!data) { view.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Parlay history did not load.'))); return; }
    const S = calcParlayStats(data);
    const wins = S.decided.filter((l) => l.result === 'win').length;
    const closest = S.graded.slice().sort((a, b) => a.record.loss - b.record.loss)[0];
    const stake = S.graded.reduce((s, p) => s + (p.stake || 0), 0);
    view.appendChild(h('section', { class: 'stats stats--lore' },
      kpiCard('Tickets graded', String(S.graded.length), `2026 · ${S.graded.filter((p) => p.result === 'win').length} cashed`),
      kpiCard('Leg hit rate', hitPct(wins, S.decided.length), `${wins}–${S.decided.length - wins} on decided legs`),
      kpiCard('Closest call', closest ? closest.label : '–', closest ? `${closest.record.loss} legs from cashing` : ''),
      kpiCard('Money in', '$' + stake, 'Stakes on graded tickets · $0 back')));

    const elig = S.rows.filter((r) => r.n >= 4);
    const lock = elig[0];
    const cursed = elig.slice().sort((a, b) => (a.w / a.n) - (b.w / b.n) || b.l - a.l)[0];
    const reliable = S.rows.slice().sort((a, b) => b.bestStreak - a.bestStreak || (b.w / (b.n || 1)) - (a.w / (a.n || 1)))[0];
    const henry = S.legs.filter((l) => /Derrick Henry/.test(l.label));
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Awards'), h('span', { class: 'sub' }, `${S.graded.length} graded tickets · everything here is a small sample`)),
      h('div', { class: 'card__body stats' },
        kpiCard('Lock of the Year', lock ? lock.nick : '–', lock ? `${lock.w}–${lock.l} (${hitPct(lock.w, lock.n)})` : 'min 4 legs'),
        kpiCard('Cursed Leg', cursed ? cursed.nick : '–', cursed ? `${cursed.w}–${cursed.l} (${hitPct(cursed.w, cursed.n)})` : ''),
        kpiCard('Mr. Reliable', reliable ? reliable.nick : '–', reliable ? `${reliable.bestStreak} straight hits` : ''),
        kpiCard('Henry truthers', String(henry.length) + ' picks', `${henry.filter((l) => l.result === 'win').length} hit · ${[...new Set(henry.map((l) => whoLabel(l.who)))].join(', ')}`))));

    const tbody = h('tbody');
    S.rows.forEach((r, i) => tbody.appendChild(h('tr', { class: r.name === ident.selectedOwner ? 'me' : '' },
      h('td', { class: 'rank' }, String(i + 1)),
      h('td', null, r.nick, ' ', sampleTag(r.n)),
      h('td', { class: 'r num' }, `${r.w}–${r.l}` + (r.u ? ` (${r.u}?)` : '')),
      h('td', { class: 'r num' }, hitPct(r.w, r.n)),
      h('td', { class: 'r num' }, r.streak),
      h('td', { class: 'r num hide-m' }, String(r.bestStreak)),
      h('td', { class: 'r num hide-m' }, String(r.coldStreak)),
      h('td', { class: 'r num hide-m' }, String(r.busts)),
      h('td', { class: 'r num hide-m' }, r.pn ? `${r.pw}/${r.pn}` : '–'))));
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Leg hit rate'), h('span', { class: 'sub' }, 'Graded legs only · unknown in ( )')),
      h('div', { class: 'card__body' },
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Picker'), h('th', { class: 'r' }, 'W–L'), h('th', { class: 'r' }, 'Hit'), h('th', { class: 'r' }, 'Now'),
            h('th', { class: 'r hide-m' }, 'Hot'), h('th', { class: 'r hide-m' }, 'Cold'), h('th', { class: 'r hide-m' }, 'Busted'), h('th', { class: 'r hide-m' }, 'Primetime'))),
          tbody)),
        h('p', { class: 'muted' }, 'Busted = legs that lost on a ticket that lost. Every graded ticket lost, so each loss counts. Primetime = night kickoffs (TNF/SNF/MNF). Under 5 legs is flagged as a small sample.'))));

    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Who busted it'), h('span', { class: 'sub' }, 'Losing legs per ticket')),
      h('div', { class: 'card__body' }, data.parlays.map((p) => h('div', { class: 'field' },
        h('b', null, `${p.label} · ${p.legs.length} legs · `), p.result === 'pending' ? h('span', { class: 'pill' }, 'pending') : `${p.record.win}–${p.record.loss}` + (p.record.unknown ? ` · ${p.record.unknown} unknown` : ''),
        p.toPay ? h('span', { class: 'muted' }, ` · would have paid $${p.toPay.toLocaleString()}`) : null,
        h('div', { class: 'pills' }, p.legs.filter((l) => l.result === 'loss').map((l) => h('span', { class: 'chip' }, `${whoLabel(l.who)}: ${l.label}`))))))));

    const near = S.legs.filter((l) => l.missBy);
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Near misses'), h('span', { class: 'sub' }, 'Lost by a hair')),
      h('div', { class: 'card__body' }, h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Wk'), h('th', null, 'Picker'), h('th', null, 'Leg'), h('th', null, 'Actual'), h('th', null, 'Missed by'))),
        h('tbody', null, near.map((l) => h('tr', null, h('td', null, String(l.week)), h('td', null, whoLabel(l.who)), h('td', null, l.label), h('td', null, l.actual || ''), h('td', null, l.missBy)))))))));

    const tlab = { ml: 'Moneyline', spread: 'Spread', total: 'Game total', player: 'Player prop' };
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Bet-type performance'), h('span', { class: 'sub' }, 'All pickers')),
      h('div', { class: 'card__body stats' }, Object.keys(S.types).map((k) => kpiCard(tlab[k] || k, hitPct(S.types[k].w, S.types[k].n), `${S.types[k].w}–${S.types[k].n - S.types[k].w}` + (S.types[k].n < SMALL_N ? ' · small sample' : ''))))));
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Favorite teams & players'), h('span', { class: 'sub' }, 'Picked 2+ times')),
      h('div', { class: 'card__body' }, h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Team / player'), h('th', { class: 'r' }, 'Picks'), h('th', { class: 'r' }, 'Hit'), h('th', null, 'By'))),
        h('tbody', null, S.favs.map((t) => h('tr', null, h('td', null, t.key), h('td', { class: 'r num' }, String(t.n)), h('td', { class: 'r num' }, `${t.w}/${t.n}`), h('td', null, Object.keys(t.by).join(', '))))))))));

    const recOf = (id) => { const p = ident.people.find((x) => x.id === id); const r = p && S.rows.find((x) => ident.person(x.name) === p); return { nick: p ? whoLabel(p.name) : id, r }; };
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Rivalry head-to-head: parlay edition'), h('span', { class: 'sub' }, 'League-lore rivalries, scored by leg hit rate')),
      h('div', { class: 'card__body' }, RIVALRIES.map((rv) => {
        const a = recOf(rv.a), b = recOf(rv.b);
        if (rv.a === rv.b) return h('div', { class: 'field' }, h('b', null, rv.title + ' · '), `${a.nick} vs himself: ${a.r ? a.r.w + '–' + a.r.l : 'no legs'} on parlay legs`);
        const fa = a.r ? `${a.r.w}–${a.r.l}` : 'no legs', fb = b.r ? `${b.r.w}–${b.r.l}` : 'no legs';
        const ra = a.r && a.r.n ? a.r.w / a.r.n : null, rb = b.r && b.r.n ? b.r.w / b.r.n : null;
        const edge = ra == null || rb == null ? 'No contest: one side has no graded legs' : ra === rb ? 'Dead even' : `Edge: ${ra > rb ? a.nick : b.nick}`;
        return h('div', { class: 'field' }, h('b', null, rv.title + ' · '), `${a.nick} ${fa} vs ${b.nick} ${fb} · ${edge}`);
      }), h('p', { class: 'muted' }, 'No weekly fantasy matchup records exist in league-lore.json, so this compares parlay legs only. Small sample.'))));

    const elo = calcSeasonElo();
    const eloRank = {}; elo.now.forEach((r, i) => { eloRank[r.name] = i + 1; });
    const ebody = h('tbody');
    S.rows.forEach((r, i) => { const p = ident.person(r.name); const er = p ? eloRank[p.name] : null; const e = p && elo.now.find((x) => x.name === p.name);
      ebody.appendChild(h('tr', null, h('td', null, r.nick), h('td', { class: 'r num' }, e ? fmtElo(e.rating) : 'no seasons'), h('td', { class: 'r num' }, er ? '#' + er : '–'), h('td', { class: 'r num' }, '#' + (i + 1)), h('td', { class: 'r num' }, hitPct(r.w, r.n)))); });
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Elo vs betting accuracy'), h('span', { class: 'sub' }, 'Good at fantasy ≠ good at picking')),
      h('div', { class: 'card__body' }, h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Manager'), h('th', { class: 'r' }, 'Season Elo'), h('th', { class: 'r' }, 'Elo rank'), h('th', { class: 'r' }, 'Pick rank'), h('th', { class: 'r' }, 'Hit'))), ebody)))));

    const dec110 = 1 + 100 / 110;
    view.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, 'Hypothetical payouts'), h('span', { class: 'sub' }, 'What one cash would have meant')),
      h('div', { class: 'card__body' },
        h('p', null, data.parlays.filter((p) => p.toPay).map((p) => `${p.label}: $${p.toPay.toLocaleString()} on $${p.stake}. `).join('')),
        h('p', null, `A straight 11-leg ticket at -110 every leg pays about $${Math.round(10 * Math.pow(dec110, 11)).toLocaleString()} on $10. 12 legs pays about $${Math.round(10 * Math.pow(dec110, 12)).toLocaleString()}. Those are assumed prices, not slip odds.`),
        h('p', { class: 'muted' }, 'Sources: ' + Object.values(data.sources).join(' · ')),
        h('p', { class: 'muted' }, 'Excluded: ' + data.excluded.map((x) => `${x.what} (${x.why})`).join('; ')))));
  }

  // ---------- routing / refresh ----------
  function render() {
    state.route = hashRoute().path;
    if (state.route === 'week') renderWeek();
    else if (state.route === 'pick') renderPick();
    else if (state.route === 'standings') renderStandings();
    else if (state.route === 'league') renderLeague();
    else if (state.route === 'history') renderHistory();
    else if (state.route === 'chat') renderChat();
    else renderAdmin();
  }

  let refreshing = false;
  async function refreshScores(force) {
    if (refreshing) return; refreshing = true;
    try {
      const prevPick = state.pick.week;
      await syncNflClock(force);
      const nextPick = openPickWeek();
      if (nextPick !== prevPick) {
        state.pick.week = nextPick;
        await loadPicks(nextPick);
        await loadPickGames(nextPick);
      }
      // grade the selected week first, then the rest (for standings)
      const order = state.weeks.slice().sort((a, b) => (a.week === state.selectedWeek ? -1 : b.week === state.selectedWeek ? 1 : b.week - a.week));
      for (const w of order) {
        const prev = state.graded[w.week];
        if (prev && prev.fromLock) continue;
        if (prev && !force && w.week !== state.selectedWeek && Date.now() - prev.fetchedAt < 5 * 60 * 1000) continue;
        state.graded[w.week] = await gradeWeek(w, { force: !!force });
        if (state.route !== 'admin' && state.route !== 'pick') render();
      }
      if (state.route === 'pick' && nextPick !== prevPick) render();
    } finally { refreshing = false; }
    scheduleRefresh();
  }

  function scheduleRefresh() {
    clearTimeout(state.timer);
    const clock = state.nfl;
    const g = state.selectedWeek != null ? state.graded[state.selectedWeek] : null;
    const anyLive = (g && g.summary && (g.summary.live > 0)) || (clock && clock.snapshot && clock.snapshot.anyLive);
    const soon = g && g.graded && g.graded.some((x) => x.state === 'pending' && x.gameDate && new Date(x.gameDate).getTime() - Date.now() < 15 * 60 * 1000);
    const waitingFlip = clock && clock.snapshot && clock.snapshot.count && !clock.snapshot.allFinal && !clock.snapshot.anyLive;
    const ms = anyLive || soon ? 45000 : waitingFlip ? 2 * 60 * 1000 : 5 * 60 * 1000;
    state.timer = setTimeout(() => refreshScores(false), ms);
  }

  // theme
  const themeBtn = $('#themeBtn');
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; themeBtn.textContent = t === 'light' ? 'Dark' : 'Light'; };
  try { applyTheme(localStorage.getItem('hp_theme') || 'dark'); } catch (e) { applyTheme('dark'); }
  themeBtn.addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; try { localStorage.setItem('hp_theme', t); } catch (e) { /* ignore */ } applyTheme(t); });

  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshScores(true); });

  (async function boot() {
    try { Weeks = await import('/lib/weeks.mjs'); } catch (e) { $('#pageSub').textContent = 'Could not load week data'; return; }
    try { Ticket = await import('/lib/ticket.mjs'); } catch (e) { Ticket = null; }
    try {
      const lore = await fetch('/league-lore.json').then((r) => r.ok ? r.json() : null);
      if (lore) ident.load(lore);
    } catch (e) { /* lore is optional */ }
    try { await loadData(); } catch (e) { $('#pageSub').textContent = e.message; return; }
    try { await syncNflClock(true); } catch (e) { /* NFL clock is optional; tickets still load */ }
    state.pick.week = openPickWeek();
    render();
    try { await loadPicks(state.pick.week); } catch (e) { state.pick.setupError = e.message || 'Could not load picks'; }
    try { await loadPickGames(state.pick.week); } catch (e) { state.pick.games = []; }
    render();
    refreshScores(true);
  })();

  window.__hp = { state, ident, gradeLeg, playerStat, findEvent, gameState, resolveNflWeek, boardSnapshot, weekPayer, selectWeek };
})();
