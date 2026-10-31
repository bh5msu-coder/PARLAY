/** NFL teams by ESPN abbreviation, with the city and nickname words used in chat and on slips. */
export const NFL_TEAMS = {
  ARI: ['Arizona', 'Cardinals'], ATL: ['Atlanta', 'Falcons'], BAL: ['Baltimore', 'Ravens'], BUF: ['Buffalo', 'Bills'],
  CAR: ['Carolina', 'Panthers'], CHI: ['Chicago', 'Bears'], CIN: ['Cincinnati', 'Bengals'], CLE: ['Cleveland', 'Browns'],
  DAL: ['Dallas', 'Cowboys'], DEN: ['Denver', 'Broncos'], DET: ['Detroit', 'Lions'], GB: ['Green Bay', 'Packers'],
  HOU: ['Houston', 'Texans'], IND: ['Indianapolis', 'Colts'], JAX: ['Jacksonville', 'Jaguars'], KC: ['Kansas City', 'Chiefs'],
  LV: ['Las Vegas', 'Raiders'], LAC: ['Los Angeles', 'Chargers'], LAR: ['Los Angeles', 'Rams'], MIA: ['Miami', 'Dolphins'],
  MIN: ['Minnesota', 'Vikings'], NE: ['New England', 'Patriots'], NO: ['New Orleans', 'Saints'], NYG: ['New York', 'Giants'],
  NYJ: ['New York', 'Jets'], PHI: ['Philadelphia', 'Eagles'], PIT: ['Pittsburgh', 'Steelers'], SF: ['San Francisco', '49ers'],
  SEA: ['Seattle', 'Seahawks'], TB: ['Tampa Bay', 'Buccaneers'], TEN: ['Tennessee', 'Titans'], WSH: ['Washington', 'Commanders'],
};
const ALIAS = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR', NWE: 'NE', GNB: 'GB', KAN: 'KC', SFO: 'SF', TAM: 'TB', NOR: 'NO' };

export function normalizeAbbr(a) {
  const u = String(a || '').toUpperCase();
  return NFL_TEAMS[u] ? u : ALIAS[u] || '';
}

/** Words in `text` that name this team (abbreviation, nickname, or a city that is unique in the game). */
export function mentionsTeam(text, abbr, game) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ') + ' ';
  const info = NFL_TEAMS[abbr];
  if (!info) return false;
  if (new RegExp('\\b' + abbr.toLowerCase() + '\\b').test(t)) return true;
  if (t.includes(' ' + info[1].toLowerCase() + ' ')) return true;
  const others = (game || []).filter((g) => g && g !== abbr).map((g) => NFL_TEAMS[g] && NFL_TEAMS[g][0]);
  const city = info[0].toLowerCase();
  return t.includes(' ' + city + ' ') && !others.includes(info[0]);
}

/** Which of the game's two teams the label is about. '' when neither or both are named. */
export function teamInLabel(label, game) {
  const g = (game || []).map(normalizeAbbr).filter(Boolean);
  const hits = g.filter((abbr) => mentionsTeam(label, abbr, g));
  return hits.length === 1 ? hits[0] : '';
}
