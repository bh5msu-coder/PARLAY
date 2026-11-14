/** Client-side league store: loads the season's weeks (/api/weeks), settings and payments plus the ESPN clock, grades weeks and
 *  refreshes on a timer. Ported from the legacy app.js state/boot/refresh code. React components
 *  subscribe with useSyncExternalStore; every mutation calls emit() (the old render()). */
import { ident } from './ident.mjs';
import { uniq, formatKickET, weekdayET } from './format.mjs';
import { gradeWeek } from './grade.mjs';
import { loadNflClock } from './nfl-clock.mjs';
import { blankPickForm, openPickWeek, placeholderWeek } from './pick-form.mjs';
import { normalizePayments, paymentsByWeek, withoutMergedPayments } from './payments.mjs';
import { createEspn, createSupabase, PICK_API, toast } from './clients.mjs';
import { gameLines } from './pick-lines.mjs';
import { clearPending, keepPending, readPending, shouldKeep } from './pick-share.mjs';
import { payerShare, splitPayers } from './iou.mjs';
import { browserStorage, readSnapshot, writeSnapshot } from './offline-cache.mjs';
import { gradeChanged } from './push-events.mjs';

export { payerShare };

function storedWho() {
  try { return localStorage.getItem('hp_who') || ''; } catch (e) { return ''; }
}

/** Kyle Heller dropped out of the $10 bet on Oct 3, 2026, so from the Week 5 ticket on he never pays. The payer
 *  is the lowest-scoring manager who is not Heller: when he is last, the next lowest pays. Tickets for Week 4
 *  and earlier keep what was recorded (Heller paid, alone or split, before he left). `rows` run lowest score
 *  first (as ESPN's league standings come back); `ticketWeek` is the week whose stake is being paid.
 *  Returns { last, skipped, tied }: `skipped` is Heller's row when he was the lowest; `tied` is everyone level
 *  with the payer (including the payer), so more than one means the stake is split. */
export const HELLER_OUT_FROM_WEEK = 5;
export function pickPayerRow(rows, ticketWeek) {
  const scored = (rows || []).filter((r) => r.points != null);
  const hellerOut = Number(ticketWeek) >= HELLER_OUT_FROM_WEEK;
  const isHeller = (r) => hellerOut && ident.canonical(r.who) === 'Kyle Heller';
  const last = scored.find((r) => !isHeller(r)) || null;
  const skipped = scored.length && isHeller(scored[0]) ? scored[0] : null;
  // Managers tied with the lowest scorer (to the cent) split the stake. Rare, but the league has a rule for it.
  const cents = (r) => Math.round(Number(r.points) * 100);
  const tied = last ? scored.filter((r) => !isHeller(r) && cents(r) === cents(last)) : [];
  return { last, skipped, tied };
}

export function payerFor(lastPlace, recorded) {
  if (lastPlace && lastPlace.who) return lastPlace.who; // pickPayerRow already skipped Heller where he is out
  return recorded || '';
}

export function createLeagueStore(opts) {
  opts = opts || {};
  const f = opts.fetch || ((...a) => fetch(...a));
  const storage = Object.prototype.hasOwnProperty.call(opts, 'storage') ? opts.storage : browserStorage();
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
    weeksError: '', // set when a reload of the weeks failed; the weeks already on screen stay
    offline: false, // true when the weeks on screen came from this phone's last saved copy
    route: 'week',
    selectedWeek: null,
    weekFollowClock: true,
    nfl: null,
    lastPlace: null,
    payments: [], // recorded contributions (holm_payments), oldest first
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

  /** A week can record its own split (`payers`, e.g. Week 4's make-up stake). That record wins over
   *  ESPN's last place, which names only one manager. */
  function recordedPayers(week) {
    return week && Array.isArray(week.payers) && week.payers.length ? week.payers.slice() : null;
  }

  function weekPayer(week) {
    const rec = recordedPayers(week);
    if (rec) return rec[0];
    return payerFor(lastPlaceFor(week && week.week ? week.week - 1 : 0), week && week.payer);
  }

  /** Everyone who owes part of the week's stake: the recorded split, the tied last-place managers,
   *  else the one payer. */
  function weekPayers(week) {
    const rec = recordedPayers(week);
    if (rec) return rec;
    const lp = lastPlaceFor(week && week.week ? week.week - 1 : 0);
    if (lp && lp.tied && lp.tied.length > 1) return lp.tied.slice();
    if (lp && lp.who) return [lp.who];
    // No ESPN last place for this week: what was written, with "A + B" split into both names.
    return splitPayers(week && week.payer);
  }

  function weekPayerNote(week) {
    if (week && week.payerNote) return week.payerNote;
    const prior = week && week.week ? week.week - 1 : (state.nfl && state.nfl.payerWeek);
    const lp = lastPlaceFor(prior);
    if (lp && lp.who) {
      const pts = lp.points != null ? `${Number(lp.points).toFixed(1)} PF` : '';
      if (lp.tied && lp.tied.length > 1) return `Tied for last in Week ${lp.week} fantasy · ${lp.points != null ? Number(lp.points).toFixed(1) + ' PF · ' : ''}stake split`;
      return `${lp.skippedHeller ? 'Heller was last, so next lowest pays · ' : ''}Last in Week ${lp.week} fantasy${pts ? ' · ' + pts : ''}${lp.team ? ' · ' + lp.team : ''}`;
    }
    if (lp && lp.unauthorized) return `Last place in Week ${prior} matchups · ESPN league is private`;
    return prior ? `Last place in Week ${prior} matchups` : 'Last place last week';
  }

  function weekKickNote(n) {
    const clock = state.nfl;
    if (!clock || clock.active !== n) return '';
    // Once the first game has kicked off, the note is old news.
    if (clock.firstKick && Date.parse(clock.firstKick) <= Date.now()) return '';
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
      const { last, skipped, tied } = pickPayerRow(rows, Number(scoringPeriodId) + 1);
      state.lastPlace = {
        week: Number(data.scoringPeriodId || scoringPeriodId),
        who: last ? last.who : '',
        points: last ? last.points : null,
        team: last ? last.team : '',
        rows,
        skippedHeller: !!skipped,
        tied: tied.map((r) => r.who),
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
    // Who you are lives on this phone (set on the Pick page or the header picker), never on the server.
    cfg.you = ident.canonical(storedWho()) || '';
    // Only lines that name a manager count. Anything else (e.g. "Kevin Sack; Th£ SACK MAN") is kept in
    // rosterProblems so the settings card can show it, and never reaches a dropdown or a payer.
    const sorted = (list) => {
      const names = [];
      const problems = [];
      for (const n of list || []) {
        const p = ident.person(n);
        if (p) names.push(p.name); else if (String(n || '').trim()) problems.push(String(n).trim());
      }
      return { names: uniq(names), problems };
    };
    const roster = sorted(cfg.roster);
    cfg.roster = roster.names.length ? roster.names : ident.parlayRoster();
    cfg.rosterProblems = roster.problems;
    const abstain = sorted(cfg.abstain);
    cfg.abstain = abstain.names.length ? abstain.names : ident.abstainNames();
    cfg.abstainProblems = abstain.problems;
    for (const w of state.weeks) {
      w.payer = ident.canonical(w.payer);
      w.placedBy = ident.canonical(w.placedBy);
      for (const leg of w.legs || []) leg.who = ident.canonical(leg.who);
    }
  }

  /** Load the season: weeks from the database (/api/weeks: holm_tickets + holm_legs), league settings
   *  (holm_settings) and recorded payments, all at once. There is no second copy to fall back to: if the
   *  weeks can't be read on first load the page says so (bootError); on a later reload the weeks already
   *  on screen stay and `weeksError` says the refresh failed. data/bets.json is only the season archive. */
  async function loadData() {
    const [weeksRes, settings, paymentRows] = await Promise.all([
      fetchDbWeeks().then((weeks) => ({ weeks }), (e) => ({ error: e })),
      sb.config().catch(() => null),
      sb.payments().catch(() => null),
    ]);
    if (weeksRes.error) {
      const msg = (weeksRes.error && weeksRes.error.message) || 'weeks unavailable';
      if (!state.weeks.length) {
        const snap = readSnapshot(storage);
        if (snap && snap.weeks.length) {
          state.weeks = snap.weeks;
          state.offline = true;
          state.weeksError = 'You’re offline. Showing the last weeks saved on this phone.';
          return;
        }
        throw new Error(msg);
      }
      state.weeksError = msg;
      return;
    }
    state.weeksError = '';
    state.offline = false;
    if (settings) state.config = Object.assign(state.config, settings);
    try { state.payments = paymentRows ? normalizePayments(paymentRows) : []; } catch (e) { state.payments = []; }
    ident.setNicknames(state.config.nicknames);
    state.weeks = weeksRes.weeks.map((w) => Object.assign({}, w, { week: Number(w.week) })).sort((a, b) => a.week - b.week);
    canonicalizeLoaded();
    // A week's recorded contributions: what the week lists plus the payments written to the database.
    // Copies saved into a week by older code are dropped first, so a payment is never counted twice.
    for (const w of state.weeks) {
      const paid = state.payments.filter((p) => p.week === w.week);
      const own = withoutMergedPayments(w.contributions);
      if (paid.length || own.length !== (w.contributions || []).length) w.contributions = own.concat(paid.map((p) => ({ who: p.who, amount: p.amount, at: p.at, note: p.note, source: 'supabase' })));
    }
    const onClock = state.nfl && state.nfl.active === state.selectedWeek;
    const inWeeks = state.weeks.find((w) => w.week === state.selectedWeek);
    if (!state.selectedWeek || (!inWeeks && !onClock)) {
      state.selectedWeek = (state.nfl && state.nfl.active)
        || (state.weeks.length ? state.weeks[state.weeks.length - 1].week : null);
    }
    writeSnapshot(storage, { weeks: state.weeks });
  }

  async function fetchDbWeeks() {
    const r = await f('/api/weeks', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(d.weeks)) throw new Error(d.error || 'Could not load the weeks (' + r.status + ')');
    return d.weeks;
  }

  async function loadPicks(week) {
    let r;
    try {
      r = await f(`${PICK_API}?week=${week}`);
    } catch (e) {
      const snap = readSnapshot(storage);
      const cached = snap && snap.picks && snap.picks[String(week)];
      if (cached) {
        state.pick.rows = cached.rows || [];
        state.pick.ticket = cached.ticket || null;
        state.pick.committed = !!cached.committed;
        state.pick.setupError = '';
        state.offline = true;
        return;
      }
      state.pick.setupError = 'Could not load picks';
      state.pick.rows = [];
      return;
    }
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
    writeSnapshot(storage, { picks: { [String(week)]: { rows: state.pick.rows, ticket: state.pick.ticket, committed: state.pick.committed } } });
  }

  async function loadPickGames(week, force = true) {
    try {
      const board = await espn.scoreboard(week, force);
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
          awayId: away.team.id || '',
          homeId: home.team.id || '',
          label: `${away.team.abbreviation} at ${home.team.abbreviation}`,
          detail: (away.team.shortDisplayName || away.team.abbreviation) + ' at ' + (home.team.shortDisplayName || home.team.abbreviation) + (kick ? ' · ' + kick : ''),
          date: ev.date,
          wednesday: wd === 'Wed',
          pre: st.state === 'pre' && !st.completed,
          kick,
          lines: gameLines(comp),
        };
      }).filter(Boolean);
    } catch (e) {
      state.pick.games = [];
    }
  }

  /** Save one pick to the board. Used by the Pick page and by Sarge, so both follow the same rules.
   *  On a network or server failure the pick is kept on the phone for retry; on a rule rejection
   *  (bad pick, placed week) it is not, since a retry would fail the same way.
   *  @returns {Promise<{ok: boolean, status: number, data: object}>} */
  async function savePick({ week, who, leg, source, quiet }) {
    let storage = null;
    try { storage = typeof window !== 'undefined' ? window.localStorage : null; } catch (e) { storage = null; }
    let r = null;
    let data = {};
    try {
      r = await f(PICK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, who, source: source || 'web', leg }) });
      data = await r.json().catch(() => ({}));
    } catch (e) { r = null; }
    if (!r || !r.ok) {
      const status = r ? r.status : 0;
      if (storage && shouldKeep(status)) {
        keepPending(storage, { week, who, leg, source: source || 'web' });
        state.pick.pending = readPending(storage, week);
        if (!quiet) toast('No connection to the board. Your pick is kept on this phone and will retry');
      } else {
        if (storage) clearPending(storage);
        state.pick.pending = null;
        toast(data.error || 'Submit failed');
        if (data.error && status === 412) state.pick.setupError = data.error;
      }
      emit();
      return { ok: false, status, data };
    }
    if (storage) clearPending(storage);
    state.pick.pending = null;
    toast(data.warning ? data.warning : data.committed ? 'You are in. All 11 saved, ticket built' : 'Pick saved to the board');
    state.pick.rows = data.picks || state.pick.rows;
    state.pick.ticket = data.ticket || null;
    state.pick.committed = !!data.committed;
    resetPickForm();
    state.pick.form.who = who;
    if (data.committed) await loadData();
    emit();
    return { ok: true, status: r.status, data };
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
        const nextGrade = await grade(w, { force: !!force });
        if (typeof window !== 'undefined' && w.week === state.selectedWeek && !nextGrade.fromLock && gradeChanged(prev, nextGrade)) {
          // The server re-grades and dedupes. This only wakes it while someone has the app open.
          f('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'sweep', week: w.week }) }).catch(() => {});
        }
        state.graded[w.week] = nextGrade;
        if (state.route !== 'admin' && state.route !== 'pick') emit();
      }
      if (typeof document !== 'undefined' && state.pick.week && (state.route === 'week' || state.route === 'pick' || state.route === 'standings' || state.route === 'stats')) {
        await loadPicks(state.pick.week).catch(() => {});
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
      // Everything that does not depend on something else starts at once. The NFL clock's ESPN
      // reads warm the client cache, so syncNflClock below and the first refresh reuse them.
      const loreP = ident.lore ? Promise.resolve() : f('/league-lore.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((lore) => { if (lore) ident.load(lore); })
        .catch(() => { /* lore is optional */ });
      const clockP = loadNflClock(espn, false).catch(() => null);
      await loreP;
      try { await loadData(); } catch (e) { state.bootError = e.message; emit(); return; }
      await clockP;
      try { await syncNflClock(false); } catch (e) { /* NFL clock is optional; tickets still load */ }
      state.pick.week = openPickWeek(state.weeks, state.nfl);
      state.ready = true;
      emit();
      await Promise.all([
        loadPicks(state.pick.week).catch((e) => { state.pick.setupError = e.message || 'Could not load picks'; }),
        loadPickGames(state.pick.week, false).catch(() => { state.pick.games = []; }),
      ]);
      emit();
      // Not forced: the clock and scoreboards were just read, so grading reuses them.
      refreshScores(false);
    })();
    return booted;
  }

  /** Set who is using this phone. Empty clears it. Stored only in this browser. */
  function setYou(name) {
    const who = ident.canonical(name) || '';
    try { if (who) localStorage.setItem('hp_who', who); else localStorage.removeItem('hp_who'); } catch (e) { /* ignore */ }
    state.config.you = who;
    if (state.pick && state.pick.form) state.pick.form.who = who;
    emit();
  }

  return {
    state, sb, espn, emit, setYou, subscribe, getVersion, boot,
    loadData, loadPicks, loadPickGames, refreshScores, resetPickForm, savePick, selectWeek, grade,
    lastPlaceFor, weekPayer, weekPayers, weekPayerNote, weekKickNote, weekRecord, weekTabNumbers, payerRoster,
  };
}
