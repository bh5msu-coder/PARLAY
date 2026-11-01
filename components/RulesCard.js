'use client';
import { allRules } from '../lib/rules.mjs';

const RULE_NAMES = {
  payoutSplit: 'Winnings', lastPlaceTie: 'Tie for last', splitStake: 'Split stake', rollover: 'Unplaced week',
  pickDeadline: 'Deadline', editsAndLocks: 'Edits', pushHandling: 'Pushes', voidHandling: 'Voids & postponements',
  missingPicks: 'Missing picks', eligibility: 'Opting out', disputes: 'Disputes', placementProof: 'Who places it',
  books: 'Books', contributionTiming: 'Paying in', importConflict: 'Conflicting picks',
};

export default function RulesCard({ config }) {
  return (
    <section className="card">
      <div className="card__head"><h2>House rules</h2><span className="sub">Set by the league</span></div>
      <dl className="rulelist">{allRules(config).map((r) => (
        <div key={r.key}><dt>{RULE_NAMES[r.key] || r.key}</dt><dd>{r.text}</dd></div>))}</dl>
    </section>
  );
}
