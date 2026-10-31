/** League rules. Each starts as an open question; `answer` records what the league decided
 *  (commissioner answers, 2026-10-31). A value in the league config (week 0 → `rules`) overrides
 *  an answer. A rule with no answer and no config value stays undecided, and the UI says so.
 *
 *  Stated rules the site already follows (from league chat and lore, not placeholders):
 *    - each parlay member submits one pick; Kyle Heller sits the ticket
 *    - $10 stake per week; last place in the prior fantasy week pays it
 *    - one parlay per week, placed by someone in Michigan or Ohio */

export const OPEN_RULES = [
  { key: 'payoutSplit', question: 'How is a cashed payout split: evenly among the 11 pickers, all to the payer, or something else?', answer: { value: 'in-person', text: 'Winnings are split and settled among the group in cash or in person. The site does not compute shares.' } },
  { key: 'lastPlaceTie', question: 'Who pays if two managers tie for last place in the prior fantasy week?', answer: { value: 'split', text: 'Tied last-place managers split the stake.' } },
  { key: 'splitStake', question: 'Can a week\'s stake be split between payers (Week 4 shows "Joseph McKeon + Kyle Heller")? If so, how is it recorded?', answer: { value: 'yes', text: 'Yes, a stake can be split between payers.' } },
  { key: 'rollover', question: 'When a ticket is not placed, does the stake roll over (Week 3 → Week 4 at $20)? Always, or only by vote?', answer: { value: 'roll', text: 'A stake that is not placed rolls over to the next week.' } },
  { key: 'pickDeadline', question: 'When are picks due: first kickoff of the week, first kickoff of the picked game, or a fixed time?', answer: { value: 'none-thursday', text: 'No hard deadline. Push to have picks in by Thursday.' } },
  { key: 'editsAndLocks', question: 'Can a manager change a pick after saving it? Until when? Who can unlock?', answer: { value: 'until-kickoff', text: 'A pick can be changed until its game kicks off; then it is locked.' } },
  { key: 'pushHandling', question: 'If a leg pushes, does it drop from the parlay (odds recalculated) or count as a loss for attribution?', answer: { value: 'house', text: 'The House decides.' } },
  { key: 'voidHandling', question: 'If a leg is voided (player inactive, game postponed), is it dropped, replaced, or does the manager owe a new pick?', answer: { value: 'house', text: 'The House decides, including postponed games (TBD by the House).' } },
  { key: 'missingPicks', question: 'If fewer than 11 picks are in by the deadline, is the ticket placed short, held, or does someone pick for the missing manager?', answer: { value: 'go-with-what-is-in', text: 'Go with what is in: the ticket is placed with the picks submitted.' } },
  { key: 'eligibility', question: 'Who may opt out of a week or the season, and does opting out change who pays?', answer: { value: 'no-opt-outs', text: 'No one opts out.' } },
  { key: 'disputes', question: 'How is a disputed grade or pick settled, and who has the final say?', answer: { value: 'ridicule', text: 'Ridicule, verbal abuse and arguments.' } },
  { key: 'placementProof', question: 'Who places the ticket, and what counts as proof it was placed (slip photo, book screenshot)?', answer: { value: 'mi-oh-screenshot', text: 'Placed by someone in Michigan or Ohio (mostly Chas, John, Ryan or Joe); a screenshot of the slip is the proof.' } },
  { key: 'books', question: 'Which books are allowed, who chooses, and do boosts or promos count toward the payout?', answer: { value: 'any', text: 'Any book is allowed; boosts are encouraged.' } },
  { key: 'contributionTiming', question: 'When is the stake due from the payer, and how is it marked as paid?', answer: { value: 'by-kickoff', text: 'The $10 stake is due by kickoff. Just send it; a payment checkmark is optional.' } },
  { key: 'importConflict', question: 'When an imported pick conflicts with a saved one, which wins: the saved pick, the newest message, or neither until the commissioner decides?', answer: { value: 'slip', text: 'The pick that is on the placed sportsbook ticket wins. Until a slip settles it, conflicting imports are flagged, not overwritten.' } },
];

/** Fallback when a rule has neither an answer nor a config value. Only `importConflict` has one,
 *  and it is the conservative one: flag the conflict and change nothing. */
const SAFE_DEFAULTS = { importConflict: 'flag' };

export const RULE_KEYS = OPEN_RULES.map((r) => r.key);

/** @returns {{key: string, value: any, decided: boolean, text: string, source: 'config'|'answer'|'none', question: string}} */
export function rule(config, key) {
  const def = OPEN_RULES.find((r) => r.key === key);
  if (!def) throw new Error('Unknown rule: ' + key);
  const set = config && config.rules && Object.prototype.hasOwnProperty.call(config.rules, key) ? config.rules[key] : null;
  if (set != null && set !== '') return { key, value: set, decided: true, text: String(set), source: 'config', question: def.question };
  if (def.answer) return { key, value: def.answer.value, decided: true, text: def.answer.text, source: 'answer', question: def.question };
  return { key, value: SAFE_DEFAULTS[key] ?? null, decided: false, text: "Commissioner hasn't decided", source: 'none', question: def.question };
}

/** Every rule with its current status, for the rules card and README. */
export function allRules(config) {
  return OPEN_RULES.map((r) => rule(config, r.key));
}

export function undecidedRules(config) {
  return OPEN_RULES.filter((r) => !rule(config, r.key).decided);
}

export const IMPORT_CONFLICT_POLICIES = ['flag', 'keep-saved', 'latest', 'slip'];
