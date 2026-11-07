/** The league roster: one list for the server (lib/ticket.mjs: pick checks, WhatsApp import) and the
 *  client before league-lore.json loads (lib/ident.mjs). test/roster.test.mjs checks it matches the
 *  people in league-lore.json, so the two can't drift apart. Change a manager here and in the lore together.
 *  `parlay` means they submit a weekly pick; `abstain` means they sit the ticket. */
export const PEOPLE = [
  { id: 'brad', name: 'Brad Holm', nick: 'Brad', aliases: ['Brad', 'BARD', 'Brlaude', 'Low Man Brad'], parlay: true, abstain: false, firstYear: false },
  { id: 'sachs', name: 'John Sachs', nick: 'Jarn', aliases: ['Jarn', 'Jarn Sachs', 'Jarn the Action', 'Jarn Home Depot', 'Jarn the Ticket'], parlay: true, abstain: false, firstYear: false },
  { id: 'hoffman', name: 'Ryan Hoffman', nick: 'Hoss', aliases: ['Hoss', 'Hoss the Three-Peat', 'Hoss Greatness'], parlay: true, abstain: false, firstYear: false },
  { id: 'sack', name: 'Kevin Sack', nick: 'Kev', aliases: ['Kev', 'Kev the Belt', 'Kev Nice Thought'], parlay: true, abstain: false, firstYear: false },
  { id: 'mckeon', name: 'Joe Mckeon', nick: 'Joey', aliases: ['Joey', 'Joseph McKeon', 'Joe McKeon', 'Joey Dawg Pound', 'Joey Auto-Draft'], parlay: true, abstain: false, firstYear: false },
  { id: 'curtis', name: 'Nick Curtis', nick: 'Nick', aliases: ['Nick', 'Nick O-Town', 'Nick Barely Tracks'], parlay: true, abstain: false, firstYear: false },
  { id: 'chas', name: 'Chas Rossman', nick: 'Chas', aliases: ['Chas', 'Charles Q', 'Charles Q on Tab'], parlay: true, abstain: false, firstYear: false },
  { id: 'mcfadden', name: 'Kyle McFadden', nick: 'Kyle', aliases: ['Kyle Mcfadden', 'Kyle', 'Worst Team Kyle', 'One-Eyed Bandit', 'Kyle-on-Kyle'], parlay: true, abstain: false, firstYear: false },
  { id: 'heller', name: 'Kyle Heller', nick: 'Heller', aliases: ['Heller', 'H-Bomb', 'H 💣'], parlay: false, abstain: true, firstYear: false },
  { id: 'jace', name: 'Jace Clark', nick: 'Jace', aliases: ['Jace', 'Jace the Bowtie', 'Jace Last-Place Hill'], parlay: true, abstain: false, firstYear: false },
  { id: 'meltser', name: 'Adam Meltser', nick: 'Meltser', aliases: ['Meltser', 'Meltser Truck Stick', 'Bloomfield Meltser'], parlay: true, abstain: false, firstYear: false },
  { id: 'dj', name: 'DJ Dangerous', nick: 'DJ', aliases: ['DJ', 'DJ Cricket', 'Rickety Cricket', 'DJ the Trap'], parlay: true, abstain: false, firstYear: true },
];
