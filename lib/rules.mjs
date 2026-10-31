/** League rules the site has NOT been told. Each is a placeholder: `null` means undecided, and the
 *  UI says "Commissioner hasn't decided" instead of guessing. The commissioner can set values in the
 *  league config (week 0 → `rules`) once they are agreed. Nothing in the app hardcodes these.
 *
 *  Stated rules the site already follows (from league chat and lore, not placeholders):
 *    - each parlay member submits one pick; Kyle Heller sits the ticket
 *    - $10 stake per week; last place in the prior fantasy week pays it
 *    - one parlay placed at a Michigan book (DraftKings / FanDuel / BetMGM) */

export const OPEN_RULES = [
  { key: 'payoutSplit', question: 'How is a cashed payout split: evenly among the 11 pickers, all to the payer, or something else?' },
  { key: 'lastPlaceTie', question: 'Who pays if two managers tie for last place in the prior fantasy week?' },
  { key: 'splitStake', question: 'Can a week\'s stake be split between payers (Week 4 shows "Joseph McKeon + Kyle Heller")? If so, how is it recorded?' },
  { key: 'rollover', question: 'When a ticket is not placed, does the stake roll over (Week 3 → Week 4 at $20)? Always, or only by vote?' },
  { key: 'pickDeadline', question: 'When are picks due: first kickoff of the week, first kickoff of the picked game, or a fixed time?' },
  { key: 'editsAndLocks', question: 'Can a manager change a pick after saving it? Until when? Who can unlock?' },
  { key: 'pushHandling', question: 'If a leg pushes, does it drop from the parlay (odds recalculated) or count as a loss for attribution?' },
  { key: 'voidHandling', question: 'If a leg is voided (player inactive, game postponed), is it dropped, replaced, or does the manager owe a new pick?' },
  { key: 'missingPicks', question: 'If fewer than 11 picks are in by the deadline, is the ticket placed short, held, or does someone pick for the missing manager?' },
  { key: 'eligibility', question: 'Who may opt out of a week or the season, and does opting out change who pays?' },
  { key: 'disputes', question: 'How is a disputed grade or pick settled, and who has the final say?' },
  { key: 'placementProof', question: 'Who places the ticket, and what counts as proof it was placed (slip photo, book screenshot)?' },
  { key: 'books', question: 'Which books are allowed, who chooses, and do boosts or promos count toward the payout?' },
  { key: 'contributionTiming', question: 'When is the stake due from the payer, and how is it marked as paid?' },
  { key: 'importConflict', question: 'When an imported pick conflicts with a saved one, which wins: the saved pick, the newest message, or neither until the commissioner decides?' },
];

/** Default when a rule is undecided. Only `importConflict` has a behavior default, and it is the
 *  conservative one: flag the conflict and change nothing. */
const SAFE_DEFAULTS = { importConflict: 'flag' };

export const RULE_KEYS = OPEN_RULES.map((r) => r.key);

/** @returns {{key: string, value: any, decided: boolean, question: string}} */
export function rule(config, key) {
  const def = OPEN_RULES.find((r) => r.key === key);
  if (!def) throw new Error('Unknown rule: ' + key);
  const set = config && config.rules && Object.prototype.hasOwnProperty.call(config.rules, key) ? config.rules[key] : null;
  const decided = set != null && set !== '';
  return { key, value: decided ? set : (SAFE_DEFAULTS[key] ?? null), decided, question: def.question };
}

export function undecidedRules(config) {
  return OPEN_RULES.filter((r) => !rule(config, r.key).decided);
}

export const IMPORT_CONFLICT_POLICIES = ['flag', 'keep-saved', 'latest'];
