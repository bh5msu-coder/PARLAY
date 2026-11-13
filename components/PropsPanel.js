'use client';
import { useEffect, useState } from 'react';
import { whoLabel } from '../lib/ident.mjs';
import { filterPlayers, firstScoreToForm, formPropKey, propToForm, SKILL_POSITIONS } from '../lib/props.mjs';

const TABS = [['anyTD', 'Anytime TD'], ['firstTD', 'First TD'], ['first', 'Scores first']];

/** One game's props: tap a player for Anytime TD or First TD, or a team for which side scores first.
 *  Players come from ESPN's team rosters; if they don't load, the typed form below still works. */
export default function PropsPanel({ game, espn, form, you, takenProps, onTap, onManual }) {
  const [tab, setTab] = useState('anyTD');
  const [pos, setPos] = useState('');
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState(null);

  useEffect(() => {
    let live = true;
    const load = (id) => (id && espn && espn.roster ? espn.roster(id).catch(() => []) : Promise.resolve([]));
    Promise.all([load(game.awayId), load(game.homeId)]).then(([away, home]) => { if (live) setTeams({ away, home }); });
    return () => { live = false; };
  }, [game.awayId, game.homeId, espn]);

  const current = formPropKey(form);
  const prefix = `${game.away}|${game.home}|`;
  const button = (key, text, sub, next) => {
    const full = prefix + key;
    const owner = takenProps[full];
    const mine = owner && owner === you;
    const cls = 'pbtn' + (current === full ? ' pbtn--on' : '') + (mine ? ' pbtn--mine' : owner ? ' pbtn--taken' : '');
    return (
      <button key={key} type="button" className={cls} aria-pressed={current === full}
        title={owner && !mine ? `${whoLabel(owner)} already has this` : undefined}
        onClick={() => { if (next) onTap(next); }}>
        <span className="pbtn__name">{text}</span>
        <span className="pbtn__sub">{owner && !mine ? whoLabel(owner).split(' ')[0] : mine ? 'Your pick' : sub}</span>
      </button>
    );
  };

  const group = (abbr, list) => {
    const shown = filterPlayers(list, pos, query);
    return (
      <div className="props__team" key={abbr}>
        <span className="label">{abbr}</span>
        {shown.length
          ? <div className="props__grid">{shown.map((p) => button(tab + '-' + p.name.toLowerCase(), p.name, p.pos, propToForm(game, p.name, tab, you)))}</div>
          : <p className="muted props__none">{list.length ? 'No players match.' : 'Players did not load for this team.'}</p>}
      </div>
    );
  };

  const empty = teams && !teams.away.length && !teams.home.length;
  return (
    <div className="props">
      <div className="props__tabs" role="group" aria-label="Prop type">
        {TABS.map(([v, t]) => <button key={v} type="button" className="seg__btn" aria-pressed={tab === v} onClick={() => setTab(v)}>{t}</button>)}
      </div>
      {tab === 'first' ? (
        <div className="props__grid props__grid--two">
          {button('first-' + game.away, game.away, 'scores first', firstScoreToForm(game, 'away', you))}
          {button('first-' + game.home, game.home, 'scores first', firstScoreToForm(game, 'home', you))}
        </div>
      ) : !teams ? <p className="muted props__none" role="status">Loading players…</p> : empty ? (
        <p className="muted props__none">Players did not load. Use the typed form instead.</p>
      ) : (
        <>
          <div className="props__filter">
            <div className="props__pos" role="group" aria-label="Position">
              {[''].concat(SKILL_POSITIONS).map((p) => <button key={p || 'all'} type="button" className={'chip' + (pos === p ? ' on' : '')} onClick={() => setPos(p)}>{p || 'All'}</button>)}
            </div>
            <input type="search" aria-label="Find a player" placeholder="Find a player" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {group(game.away, teams.away)}
          {group(game.home, teams.home)}
        </>
      )}
      <button type="button" className="btn btn--ghost btn--sm props__more" onClick={() => onManual(game)}>More props: yards, receptions, custom line</button>
    </div>
  );
}
