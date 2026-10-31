/** Client-side league store: loads data/bets.json + Supabase weeks + ESPN clock, grades weeks and
 *  refreshes on a timer. Ported from the legacy app.js state/boot/refresh code. React components
 *  subscribe with useSyncExternalStore; every mutation calls emit() (the old render()). */
import { diffWeek, normalizeFile } from './weeks.mjs';
import { ident } from './ident.mjs';
import { uniq, formatKickET, weekdayET } from './format.mjs';
import { gradeWeek } from './grade.mjs';
import { loadNflClock } from './nfl-clock.mjs';
import { blankPickForm, openPickWeek, placeholderWeek } from './pick-form.mjs';
import { createEspn, createSupabase, PICK_API, toast } from './clients.mjs';

function storedWho() {
  try { return localStorage.getItem('hp_who') || ''; } catch (e) { return ''; }
}

/** Kyle Heller sits the ticket, so he never pays. The payer is the lowest-scoring manager who is not Heller:
 *  when he is last, the next lowest pays. `rows` run lowest score first (as ESPN's league standings come back).
 *  Returns { last, skipped }: `skipped` is Heller's row when he was the lowest. */
export function pickPayerRow(rows) {
  const scored = (rows || []).filter((r) => r.points != null);
  const isHeller = (r) => ident.canonical(r.who) === 'Kyle Heller';
  const last = scored.find((r) => !isHeller(r)) || null;
  const skipped = scored.length && isHeller(scored[0]) ? scored[0] : null;
  return { last, skipped };
}

export function payerFor(lastPlace, recorded) {
  if (lastPlace && lastPlace.who && ident.canonical(lastPlace.who) !== 'Kyle Heller') return lastPlace.who;
  return recorded || '';
}

export function createLeagueStore(opts) {
  opts = opts || {};
  const f = opts.fetch || ((...a) => fetch(...a));
  const sb = createSupabase(f);
  const espn = createEspn(() => ident.lore && ident.lore.espnLeagueId, f);
  const listeners = new Set();
  let version = 0;
  let refreshing = false;

  const state = {
    ready: false,
    bootError: '',
    config: { leagueName: 'Our Holm League', chat: '', roster: [], abstain: [], you: '' },
    weeks: [],
    dataConflicts: [],
    route: 'week',
    selectedWeek: null,
    weekFollowClock: true,
    nfl: null,
    lastPlace: null,
    graded: {}, // week -> gradeWeek result
    admin: { pass: '', editing: null },
    timer: null,
    selectedOwner: null,
    pendingChatDraft: '',
    pick: {
      week: null,
      rows: [],
      games: [],
      setupError: '',
      committed: false,
      ticket: null,
      waText: '',
      importReport: null,
      form: blankPickForm(''),
    },
  };

  const emit = () => { version++; for (const l of listeners) l(); };
  const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
  const getVersion = () => version;

  function lastPlaceFor(priorWeek) {
    const lp = state.lastPlace;
    if (!lp || !priorWeek || lp.week !== priorWeek) return null;
    return lp;
  }

  function weekPayer(week) {
    return payerFor(lastPlaceFor(week && week.week ? week.week - 1 : 0), week && week.payer);
  }

  function weekPayerNote(week) {
    if (week && week.payerNote) return week.payerNote;
    const prior = week && week.week ? week.week - 1 : (state.nfl && state.nfl.payerWeek);
    const lp = lastPlaceFor(prior);
    if (lp && lp.who) {
      const pts = lp.points != null ? `${Number(lp.points).toFixed(1)} PF` : '';
      return `${lp.skippedHeller ? 'Heller was last, so next lowest pays · ' : ''}Last in Week ${lp.week} fantasy${pts ? ' · ' + pts : ''}${lp.team ? ' · ' + lp.team : ''}`;
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

  function payerRoster() {
    return uniq((state.config.roster || ident.parlayRoster()).concat(state.config.abstain || ident.abstainNames()).concat(ident.people.map((p) => p.name)));
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
      const { last, skipped } = pickPayerRow(rows);
      state.lastPlace = {
        week: Number(data.scoringPeriodId || scoringPeriodId),
        who: last ? last.who : '',
        points: last ? last.points : null,
        team: last ? last.team : '',
        rows,
        skippedHeller: !!skipped,
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

  async function syncNflClock(force) {
    const prevActive = state.nfl && state.nfl.active;
    try { state.nfl = await loadNflClock(espn, force); } catch (e) { if (!state.nfl) return null; }
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
    const fileRes = await f('/data/bets.json', { cache: 'no-store' });
    if (!fileRes.ok) throw new Error('Could not load data/bets.json (' + fileRes.status + ')');
    const file = await fileRes.json();
    const normalized = normalizeFile(file);
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
        const diff = diffWeek(normalized.weeks.find((w) => w.week === r.week), r.data);
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

  async function loadPicks(week) {
    const r = await f(`${PICK_API}?week=${week}`);
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

  function resetPickForm() {
    const who = (state.pick.form && state.pick.form.who) || '';
    state.pick.form = blankPickForm(storedWho());
    if (who) state.pick.form.who = who;
  }

  function selectWeek(n) {
    state.selectedWeek = Number(n);
    state.weekFollowClock = !!(state.nfl && state.selectedWeek === state.nfl.active);
    emit();
  }

  const grade = (week, o) => gradeWeek(week, Object.assign({ espn }, o || {}));

  async function refreshScores(force) {
    if (refreshing) return; refreshing = true;
    try {
      const prevPick = state.pick.week;
      await syncNflClock(force);
      const nextPick = openPickWeek(state.weeks, state.nfl);
      if (nextPick !== prevPick) {
        state.pick.week = nextPick;
        resetPickForm();
        await loadPicks(nextPick);
        await loadPickGames(nextPick);
        if (state.route === 'pick') {
          toast(`Week ${nextPick} is open — last week’s slip was cleared`);
          emit();
        }
      }
      // grade the selected week first, then the rest (for standings)
      const order = state.weeks.slice().sort((a, b) => (a.week === state.selectedWeek ? -1 : b.week === state.selectedWeek ? 1 : b.week - a.week));
      for (const w of order) {
        const prev = state.graded[w.week];
        if (prev && prev.fromLock) continue;
        if (prev && !force && w.week !== state.selectedWeek && Date.now() - prev.fetchedAt < 5 * 60 * 1000) continue;
        state.graded[w.week] = await grade(w, { force: !!force });
        if (state.route !== 'admin' && state.route !== 'pick') emit();
      }
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

  let booted = null;
  function boot() {
    if (booted) return booted;
    booted = (async () => {
      try { state.admin.pass = sessionStorage.getItem('hp_pass') || ''; } catch (e) { /* ignore */ }
      state.pick.form = blankPickForm(storedWho());
      try {
        const lore = await f('/league-lore.json').then((r) => r.ok ? r.json() : null);
        if (lore) ident.load(lore);
      } catch (e) { /* lore is optional */ }
      try { await loadData(); } catch (e) { state.bootError = e.message; emit(); return; }
      try { await syncNflClock(true); } catch (e) { /* NFL clock is optional; tickets still load */ }
      state.pick.week = openPickWeek(state.weeks, state.nfl);
      state.ready = true;
      emit();
      try { await loadPicks(state.pick.week); } catch (e) { state.pick.setupError = e.message || 'Could not load picks'; }
      try { await loadPickGames(state.pick.week); } catch (e) { state.pick.games = []; }
      emit();
      refreshScores(true);
    })();
    return booted;
  }

  return {
    state, sb, espn, emit, subscribe, getVersion, boot,
    loadData, loadPicks, loadPickGames, refreshScores, resetPickForm, selectWeek, grade,
    lastPlaceFor, weekPayer, weekPayerNote, weekKickNote, weekRecord, weekTabNumbers, payerRoster,
  };
}
