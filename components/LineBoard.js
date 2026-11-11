'use client';
import { whoLabel } from '../lib/ident.mjs';
import { fmtLine, fmtPrice, legMarket, tapToForm } from '../lib/pick-lines.mjs';
import { formToLeg } from '../lib/pick-form.mjs';

/** Tap-a-line pick board: every game this week with its spread, total and moneyline from the
 *  ESPN odds feed. One tap fills the pick form; a sticky bar confirms and saves. */
export default function LineBoard({ games, form, submissions, you, onTap, onSave, onClear }) {
  const withLines = (games || []).filter((g) => g.lines);
  // Started games cannot be picked; keep them out of the way.
  const list = withLines.filter((g) => g.pre);
  const started = withLines.length - list.length;
  const mine = (submissions || []).find((s) => s.who === you);
  const current = form && form.gameAway ? legMarket(formToLeg(form), { away: form.gameAway, home: form.gameHome }) : '';
  const formKey = current ? `${form.gameAway}|${form.gameHome}|${current}` : '';
  const takenBy = {};
  (submissions || []).forEach((s) => {
    if (!s.leg || !s.leg.game) return;
    const g = { away: String(s.leg.game[0] || '').toUpperCase(), home: String(s.leg.game[1] || '').toUpperCase() };
    const m = legMarket(s.leg, g);
    if (m) takenBy[`${g.away}|${g.home}|${m}`] = s.who;
  });

  if (!list.length) {
    return <p className="muted">{started ? 'Every game with lines has kicked off.' : 'Lines show up here once the books post them.'} You can still enter a pick by hand below.</p>;
  }
  const book = (list.find((g) => g.lines.book) || {}).lines?.book;

  const cell = (g, market, top, bottom) => {
    const key = `${g.away}|${g.home}|${market}`;
    const owner = takenBy[key];
    const isMine = owner && owner === you;
    const selected = formKey === key;
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
        <span className="label">Tap a line</span>
        <span className="muted">{(book ? book + ' lines via ESPN' : 'Lines via ESPN') + ' · your book may differ'}</span>
      </div>
      {mine ? <p className="lineboard__mine">{`Your pick: ${mine.leg.label || 'In'}. Tap another line to change it.`}</p> : null}
      <div className="lineboard__grid">
        {list.map((g) => {
          const L = g.lines;
          return (
            <div key={g.away + g.home} className={'lgame' + (g.pre ? '' : ' lgame--locked')}>
              <div className="lgame__head">
                <span className="lgame__kick">{g.pre ? (g.kick || '') : 'Kicked off · locked'}</span>
                <span className="lgame__cols" aria-hidden="true"><span>Spread</span><span>Total</span><span>ML</span></span>
              </div>
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
            </div>
          );
        })}
      </div>
      {started ? <p className="muted lineboard__started">{`${started} game${started === 1 ? '' : 's'} already kicked off. A late pick can still go in by hand below; the book may not take it pre-game.`}</p> : null}
      {formKey ? (
        <div className="pickbar" role="region" aria-label="Confirm your pick">
          <div className="pickbar__text">
            <span className="label">{you ? whoLabel(you) : 'Pick your name above'}</span>
            <strong>{form.label}{form.odds ? ' (' + fmtPrice(Number(form.odds)) + ')' : ''}</strong>
          </div>
          <button type="button" className="btn btn--secondary" onClick={onClear}>Clear</button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={!you}>Save pick</button>
        </div>
      ) : null}
    </div>
  );
}
