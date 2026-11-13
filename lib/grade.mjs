/** Live grading against ESPN scoreboards and box scores. Extracted from the legacy app.js.
 *  gradeWeek takes the ESPN client as an argument so it can run in tests without the network. */
import { gradeStoredWeek, summarizeParlay, terminalState } from './weeks.mjs';
import { fmtKick, norm } from './format.mjs';

export function findEvent(scoreboard, legGame) {
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

export function gameState(comp, ev) {
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

export function playerStat(summary, playerName, stat) {
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

const isTouchdown = (sp) => /touchdown/i.test((sp && sp.type && sp.type.text) || '');

/** The game's first touchdown and whether this player scored it. ESPN's play text leads with the scorer
 *  ("Travis Kelce 12 Yd pass from Patrick Mahomes"), so the name must start the text: the passer is not credited. */
export function firstTouchdown(summary, playerName) {
  const play = ((summary && summary.scoringPlays) || []).find(isTouchdown);
  if (!play) return { scored: false, mine: false, text: '' };
  const txt = norm(play.text || '');
  const full = norm(playerName);
  const last = norm(String(playerName || '').trim().split(' ').slice(-1)[0]);
  const mine = !!full && (txt.startsWith(full) || (last.length > 3 && txt.startsWith(last)));
  return { scored: true, mine, text: String(play.text || '').replace(/\s*\(.*$/, '') };
}

/** Which team put up the game's first points (any score), as an abbreviation. '' until someone scores. */
export function firstScoringTeam(summary) {
  const play = ((summary && summary.scoringPlays) || [])[0];
  if (!play || !play.team) return '';
  if (play.team.abbreviation) return String(play.team.abbreviation).toUpperCase();
  const id = String(play.team.id || '');
  const comps = (((summary.header || {}).competitions || [])[0] || {}).competitors || [];
  const fromHeader = comps.find((c) => c.team && String(c.team.id) === id);
  if (fromHeader && fromHeader.team.abbreviation) return String(fromHeader.team.abbreviation).toUpperCase();
  const box = ((summary.boxscore || {}).teams || []).find((t) => t.team && String(t.team.id) === id);
  return box && box.team.abbreviation ? String(box.team.abbreviation).toUpperCase() : '';
}

export function gradeLeg(leg, ctx) {
  // ctx: {game (gameState) | null, summary | null, override}
  const res = { leg, state: 'pending', detail: '', current: null, final: false };
  if (ctx.override && ['won', 'lost', 'push', 'void'].includes(ctx.override)) {
    res.state = ctx.override; res.final = true; res.detail = 'Set by commissioner';
    return res;
  }
  if (leg.type === 'tbd') {
    res.state = 'unknown'; res.detail = 'Pick not in yet'; return res;
  }
  const recorded = terminalState(leg.result);
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
  const tdProp = leg.type === 'player' && (leg.stat === 'anyTD' || leg.stat === 'firstTD');
  const hasLine = leg.line != null && leg.line !== '' && !Number.isNaN(Number(leg.line));
  // A touchdown prop with no number is yes or no: over 0.5.
  const lineOk = hasLine || tdProp;
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
    if (leg.stat === 'firstTD') {
      res.detail = `${clock} · ${scoreTxt}`;
      if (!ctx.summary) { res.detail += ' · box score pending'; res.state = live ? 'live' : 'pending'; res.final = false; return res; }
      const f = firstTouchdown(ctx.summary, leg.player);
      if (f.scored) { res.state = f.mine ? 'won' : 'lost'; res.final = true; res.current = f.mine ? 'scored first' : 'first TD: ' + f.text; return res; }
      res.current = 'no TD yet';
      settle(false, false);
      return res;
    }
    const line = hasLine ? Number(leg.line) : 0.5;
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
  } else if (leg.type === 'first') {
    res.detail = `${clock} · ${scoreTxt}`;
    if (!ctx.summary) { res.detail += ' · scoring plays pending'; res.state = live ? 'live' : 'pending'; res.final = false; return res; }
    const first = firstScoringTeam(ctx.summary);
    if (first) { res.state = first === String(leg.team).toUpperCase() ? 'won' : 'lost'; res.final = true; res.current = first + ' scored first'; return res; }
    res.current = 'no score yet';
    settle(false, total === 0);
  } else {
    res.detail = 'Unknown leg type';
  }
  return res;
}

/** Grade one week. Stored results (data/bets.json or a locked week) win; otherwise grade live.
 *  @param {object} week
 *  @param {{force?: boolean, espn: {scoreboard: Function, summary: Function}}} opts */
export async function gradeWeek(week, opts) {
  opts = opts || {};
  const legs = week.legs || [];
  const stored = gradeStoredWeek(week);
  if (stored) {
    return { graded: stored.graded, summary: summarizeParlay(stored.graded), fromLock: true, fetchedAt: null };
  }
  if (week.locked && week.locked.results && !opts.force) {
    // settled week: use stored results, no network
    const graded = legs.map((leg) => {
      const r = week.locked.results[leg.id] || {};
      return { leg, state: r.state || 'pending', detail: r.detail || 'Locked', current: r.current || null, final: true, gameDate: r.gameDate || null };
    });
    return { graded, summary: summarizeParlay(graded), fromLock: true, fetchedAt: null };
  }
  const espn = opts.espn;
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
        if ((leg.type === 'player' || leg.type === 'first') && game.state !== 'pre' && !overrides[leg.id]) {
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
  return { graded, summary: summarizeParlay(graded), fromLock: false, fetchedAt: Date.now(), error: err };
}
