function allowBrowser(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
  let url;
  if (path === 'scoreboard') {
    const params = new URLSearchParams({ seasontype: '2', dates: String(season) });
    if (week) params.set('week', String(week));
    url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?' + params;
  } else if (path === 'summary' && event) {
    url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=' + encodeURIComponent(event);
  } else {
    res.status(400).json({ error: 'Need path=scoreboard|summary' });
    return;
  }
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'HolmLeagueParlay/1.0', Accept: 'application/json' },
    });
    const text = await r.text();
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    res.setHeader('Content-Type', 'application/json');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'ESPN proxy failed' });
  }
}
