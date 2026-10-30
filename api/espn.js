function allowBrowser(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function espnCookies() {
  const s2 = process.env.ESPN_S2 || process.env.espn_s2 || '';
  let swid = process.env.ESPN_SWID || process.env.SWID || '';
  if (swid && !swid.startsWith('{')) swid = `{${swid}}`;
  const parts = [];
  if (s2) parts.push('espn_s2=' + s2);
  if (swid) parts.push('SWID=' + swid);
  return parts.join('; ');
}

function configuredLeagueId() {
  const league = String(process.env.ESPN_LEAGUE_ID || '182263').trim();
  return /^[0-9]{1,10}$/.test(league) ? league : '';
}

function fantasySeason(value) {
  const season = value == null || value === '' ? '2026' : value;
  return typeof season === 'string' && /^[0-9]{4}$/.test(season) ? season : '';
}

function fantasyLeagueQueryOk(queryLeague, league) {
  if (queryLeague == null || queryLeague === '') return true;
  return typeof queryLeague === 'string' && queryLeague === league;
}

function pinnedFantasyUrl(year, league, week) {
  const expectedPath = `/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${league}`;
  const url = new URL(`https://lm-api-reads.fantasy.espn.com${expectedPath}`);
  if (url.origin !== 'https://lm-api-reads.fantasy.espn.com' || url.pathname !== expectedPath) return '';
  if (url.username || url.password || url.hash) return '';
  url.searchParams.append('view', 'mMatchupScore');
  url.searchParams.append('view', 'mTeam');
  url.searchParams.append('view', 'mSettings');
  if (week && /^[0-9]+$/.test(String(week))) url.searchParams.set('scoringPeriodId', String(week));
  if (url.pathname !== expectedPath) return '';
  return url.href;
}

function memberName(m) {
  if (!m) return '';
  return [m.firstName, m.lastName].filter(Boolean).join(' ') || m.displayName || '';
}

function slimFfl(data, scoringPeriodId) {
  const sp = Number(scoringPeriodId);
  const members = {};
  for (const m of data.members || []) members[String(m.id)] = memberName(m);
  const teams = {};
  for (const t of data.teams || []) {
    const owners = (t.owners || []).map((id) => members[String(id)]).filter(Boolean);
    const pbs = t.pointsByScoringPeriod || {};
    const fromPeriod = pbs[sp] != null ? pbs[sp] : pbs[String(sp)];
    teams[t.id] = {
      id: t.id,
      abbrev: t.abbrev || '',
      team: `${t.location || ''} ${t.nickname || ''}`.trim(),
      owner: owners[0] || '',
      points: fromPeriod == null || fromPeriod === '' ? null : Number(fromPeriod),
    };
  }
  for (const mu of data.schedule || []) {
    const period = mu.matchupPeriodId != null ? mu.matchupPeriodId : mu.scoringPeriodId;
    if (period != null && Number(period) !== sp) continue;
    for (const side of ['home', 'away']) {
      const s = mu[side];
      if (!s || s.teamId == null) continue;
      const row = teams[s.teamId] || (teams[s.teamId] = {
        id: s.teamId, abbrev: '', team: '', owner: '', points: null,
      });
      if (row.points != null && !Number.isNaN(row.points)) continue;
      const live = s.totalPointsLive;
      const tot = s.totalPoints;
      if (live != null && live !== '' && !Number.isNaN(Number(live))) row.points = Number(live);
      else if (tot != null && tot !== '' && !Number.isNaN(Number(tot))) row.points = Number(tot);
    }
  }
  const standings = Object.values(teams).sort((a, b) => {
    if (a.points == null && b.points == null) return String(a.owner).localeCompare(String(b.owner));
    if (a.points == null) return 1;
    if (b.points == null) return -1;
    return a.points - b.points || String(a.owner).localeCompare(String(b.owner));
  });
  const last = standings.find((t) => t.points != null) || null;
  return { scoringPeriodId: sp, last, standings };
}

export default async function handler(req, res) {
  allowBrowser(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const path = req.query.path;
  const season = req.query.season || '2026';
  const week = req.query.week;
  const event = req.query.event;
  const headers = { 'User-Agent': 'HolmLeagueParlay/1.0', Accept: 'application/json' };

  let url;
  let cache = 's-maxage=20, stale-while-revalidate=40';
  if (path === 'scoreboard') {
    const params = new URLSearchParams({ seasontype: '2', dates: String(season) });
    if (week && /^[0-9]+$/.test(String(week))) params.set('week', String(week));
    url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?' + params;
  } else if (path === 'summary' && event) {
    url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=' + encodeURIComponent(event);
  } else if (path === 'ffl') {
    const league = configuredLeagueId();
    const year = fantasySeason(req.query.season);
    url = league && year && fantasyLeagueQueryOk(req.query.league, league)
      ? pinnedFantasyUrl(year, league, week)
      : '';
    if (!url) {
      res.status(400).json({ error: 'Invalid fantasy league or season' });
      return;
    }
    cache = 's-maxage=30, stale-while-revalidate=60';
    const cookie = espnCookies();
    if (cookie) headers.Cookie = cookie;
  } else {
    res.status(400).json({ error: 'Need path=scoreboard|summary|ffl' });
    return;
  }

  try {
    const r = await fetch(url, { headers, redirect: path === 'ffl' ? 'manual' : 'follow' });
    if (path === 'ffl' && r.status >= 300 && r.status < 400) {
      res.status(502).json({ error: 'ESPN fantasy request failed' });
      return;
    }
    const text = await r.text();
    res.setHeader('Cache-Control', cache);
    res.setHeader('Content-Type', 'application/json');
    if (path === 'ffl') {
      if (r.status === 401 || r.status === 403) {
        res.status(401).json({
          unauthorized: true,
          error: 'ESPN fantasy league is private. Set ESPN_S2 and ESPN_SWID on the Vercel project.',
        });
        return;
      }
      let data;
      try { data = JSON.parse(text); } catch (e) {
        res.status(502).json({ error: 'ESPN fantasy payload was not JSON' });
        return;
      }
      if (!r.ok) {
        res.status(r.status).json({ error: (data && data.message) || 'ESPN fantasy request failed' });
        return;
      }
      res.status(200).json(slimFfl(data, week));
      return;
    }
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'ESPN proxy failed' });
  }
}
