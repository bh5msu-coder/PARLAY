/** What Claude gets to know about each manager when it writes the weekly recap and suggests nicknames:
 *  league history (league-lore.json), the nickname they carry now and the ones they've had
 *  (data/nicknames.json), and any nickname the commissioner set by hand (league settings), which is
 *  locked. Pure, so the recap API and the tests build the same thing. Only recorded facts go in. */

/** @returns {Array<object>} one entry per manager in the lore, parlay players first */
export function managerContext(lore, nicknamesFile, commishNicks) {
  const people = (lore && lore.people) || [];
  const current = (nicknamesFile && nicknamesFile.people) || {};
  const locked = commishNicks || {};
  return people
    .slice()
    .sort((a, b) => Number(!!b.parlay) - Number(!!a.parlay))
    .map((p) => {
      const c = p.career || {};
      const seasons = (c.history || []).filter((s) => s && s.rank);
      const nick = current[p.id] || null;
      const out = {
        who: p.name,
        handle: p.nick || '',
        aliases: (p.aliases || []).slice(0, 6),
        inWeeklyParlay: !!p.parlay && !p.abstain,
      };
      if (locked[p.name]) out.lockedNickname = String(locked[p.name]);
      if (nick) {
        out.currentNickname = nick.nickname;
        if (nick.why) out.currentNicknameWhy = nick.why;
        if ((nick.past || []).length) out.pastNicknames = nick.past.slice(-6);
      }
      if (p.firstYear) out.firstSeason = true;
      if (c.seasons) {
        out.career = {
          seasons: c.seasons,
          record: `${c.wins}-${c.losses}`,
          titles: c.titles || [],
          lastPlaceFinishes: c.lastPlaceCount || 0,
          avgFinish: c.avgFinish,
        };
      }
      if (seasons.length) {
        out.recentSeasons = seasons.slice(-3).map((s) => ({ season: s.season, finish: s.rank, record: `${s.wins}-${s.losses}`, team: s.team, champion: !!s.champion }));
      }
      return out;
    });
}
