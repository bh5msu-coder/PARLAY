'use client';
import { useState } from 'react';
import { whoLabel } from '../lib/ident.mjs';
import { fmtLine, fmtPrice, legMarket, tapToForm } from '../lib/pick-lines.mjs';
import { formToLeg } from '../lib/pick-form.mjs';
import { formPropKey, legPropKey } from '../lib/props.mjs';
import PropsPanel from './PropsPanel';

/** Tap-a-line pick board: every game this week with its spread, total and moneyline from the
 *  ESPN odds feed, plus a Props button per game (Anytime TD, First TD, which team scores first).
 *  One tap fills the pick form; a sticky bar confirms and saves. */
export default function LineBoard({ games, form, submissions, you, espn, onTap, onSave, onClear, onManual }) {
  const [openGame, setOpenGame] = useState('');
  // Started games cannot be picked; keep them out of the way.
  const all = games || [];
  const list = all.filter((g) => g.pre);
  const started = all.length - list.length;
  const mine = (submissions || []).find((s) => s.who === you);
  const current = form && form.gameAway ? legMarket(formToLeg(form), { away: form.gameAway, home: form.gameHome }) : '';
  const lineKey = current && !current.startsWith('first-') ? `${form.gameAway}|${form.gameHome}|${current}` : '';
  const propKey = formPropKey(form);
  const takenBy = {};
  const takenProps = {};
  (submissions || []).forEach((s) => {
    if (!s.leg || !s.leg.game) return;
    const g = { away: String(s.leg.game[0] || '').toUpperCase(), home: String(s.leg.game[1] || '').toUpperCase() };
    const m = legMarket(s.leg, g);
    if (m) takenBy[`${g.away}|${g.home}|${m}`] = s.who;
    const p = legPropKey(s.leg);
    if (p) takenProps[p] = s.who;
  });

  if (!list.length) {
    return <p className="muted">{started ? 'Every game this week has kicked off.' : 'Games show up here once the schedule loads.'} You can still enter a pick by hand below.</p>;
  }
  const book = (list.find((g) => g.lines && g.lines.book) || {}).lines?.book;

  const cell = (g, market, top, bottom) => {
    const key = `${g.away}|${g.home}|${market}`;
    const owner = takenBy[key];
    const isMine = owner && owner === you;
    const selected = lineKey === key;
    const disabled = !g.pre || !top;
    const cls = 'line' + (selected ? ' line--on' : '') + (isMine ? ' line--mine' : owner ? ' line--taken' : '');
    return (
      <button type="button" className={cls} disabled={disabled} aria-pressed={selected}
        title={owner && !isMine ? `${whoLabel(owner)} already has this` : undefined}
        onClick={() => { const next = tapToForm(g, market, you); if (next) onTap(next); }}>
        <span className="line__top">{top || '—'}</span>
        <span className="line__odds">{owner && !isMine ? whoLabel(owner).split(' ')[0] : isMine ? 'Your pick' : bottom}</span>
      </button>
    );
  };

  return (
    <div className="lineboard">
      <div className="lineboard__head">
        <span className="label">Tap a line or a prop</span>
        <span className="muted">{(book ? book + ' lines via ESPN' : 'Lines via ESPN') + ' · your book may differ'}</span>
      </div>
      {mine ? <p className="lineboard__mine">{`Your pick: ${mine.leg.label || 'In'}. Tap another to change it.`}</p> : null}
      <div className="lineboard__grid">
        {list.map((g) => {
          const L = g.lines;
          const gk = g.away + '|' + g.home;
          const open = openGame === gk;
          return (
            <div key={gk} className={'lgame' + (open ? ' lgame--open' : '')}>
              <div className="lgame__head">
                <span className="lgame__kick">{g.kick || ''}</span>
                {L ? <span className="lgame__cols" aria-hidden="true"><span>Spread</span><span>Total</span><span>ML</span></span> : null}
              </div>
              {L ? (
                <>
                  <div className="lgame__row">
                    <span className="lgame__team">{g.away}</span>
                    {cell(g, 'spread-away', fmtLine(L.spread.away.line), fmtPrice(L.spread.away.odds))}
                    {cell(g, 'total-over', L.total.over.line != null ? 'O ' + L.total.over.line : '', fmtPrice(L.total.over.odds))}
                    {cell(g, 'ml-away', fmtPrice(L.ml.away.odds), 'ML')}
                  </div>
                  <div className="lgame__row">
                    <span className="lgame__team">{'@ ' + g.home}</span>
                    {cell(g, 'spread-home', fmtLine(L.spread.home.line), fmtPrice(L.spread.home.odds))}
                    {cell(g, 'total-under', L.total.under.line != null ? 'U ' + L.total.under.line : '', fmtPrice(L.total.under.odds))}
                    {cell(g, 'ml-home', fmtPrice(L.ml.home.odds), 'ML')}
                  </div>
                </>
              ) : <p className="lgame__nolines">{`${g.away} @ ${g.home} · lines not posted yet`}</p>}
              <button type="button" className="lgame__props" aria-expanded={open} onClick={() => setOpenGame(open ? '' : gk)}>
                {open ? 'Close props' : 'Props: Anytime TD · First TD · Scores first'}
              </button>
              {open ? <PropsPanel game={g} espn={espn} form={form} you={you} takenProps={takenProps} onTap={onTap} onManual={onManual} /> : null}
            </div>
          );
        })}
      </div>
      {started ? <p className="muted lineboard__started">{`${started} game${started === 1 ? '' : 's'} already kicked off. A late pick can still go in by hand below; the book may not take it pre-game.`}</p> : null}
      {lineKey || propKey ? (
        <div className="pickbar" role="region" aria-label="Confirm your pick">
          <div className="pickbar__text">
            <span className="label">{you ? whoLabel(you) : 'Choose your name above'}</span>
            <strong>{form.label}{form.odds ? ' (' + fmtPrice(Number(form.odds)) + ')' : ''}</strong>
          </div>
          <button type="button" className="btn btn--secondary" onClick={onClear}>Clear</button>
          <button type="button" className="btn btn--cta" onClick={onSave} disabled={!you}>Save pick</button>
        </div>
      ) : null}
    </div>
  );
}
