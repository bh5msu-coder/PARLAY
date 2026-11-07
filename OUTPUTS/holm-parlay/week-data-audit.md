# Holm Parlay: week data audit

2026-11-07 · branch `mac/epic-goodall-szpxfn` at `4e4ce85` · read-only (no code changed; the live database was read with SELECTs only)

## Short version

The repo says `data/bets.json` is the only record that adds or grades a week. That stopped being true weeks ago. The live week always sits in Supabase (`holm_parlay_weeks`, week 9 today) until someone hand-copies it into the file. After that copy, every edit made in the app is silently thrown away. Week data now lives in five places, the roster in five, and nicknames in four. The worst bugs follow from that: the server rewrites the ticket blob on every pick save, and the client merges the two sources in memory and writes the merged copy back.

**Recommendation:** make Supabase the single source of truth for weeks, using the normalized tables that migration 002 already created (`holm_tickets`, `holm_legs`, `holm_payments`). They exist in the live database and are empty. Give each leg a stable key of (season, week, manager). After a one-time backfill, `data/bets.json` becomes a frozen archive. `parlay-history.json` stays as the separate evidence record it already is; don't merge it in.

---

## 1. Riskiest bugs, worst first

### 1. A pick edit rewrites a placed ticket (and wipes the commissioner's edits)
- `pages/api/pick.js:198-217`: after every pick save, once 11 picks are in, `maybeCommit` rebuilds `legs` and `groups` from the picks and writes them over the week row. It stops only if the row is `locked` (`:201`). It keeps `prev.ticket` when the state is `placed` (`:207-209`), but still replaces the legs under it.
- `supabase/picks.sql:117-125`: `holm_parlay_upsert_week_open` likewise checks only `locked`.
- Picks stay editable until their own game kicks off (`lib/pick-lock.mjs`). A manager whose game is Sunday night can therefore change their pick on Saturday, after the slip was placed Thursday. The site's ticket then no longer matches the real slip, and the Week page grades the wrong leg. That breaks the league rule "a placed ticket's legs are the picks for that week."
- Every re-commit also replaces anything the commissioner changed in that week's legs: fixed lines, labels, SGP odds (`groups` is rebuilt with `odds: ''`, `lib/ticket.mjs:155-160`) and grade overrides (see #2).

### 2. Leg ids are re-randomized on every save after the 11th pick
- `lib/ticket.mjs:148`: `id: s.leg.id || ('l' + Math.random()...)`. Saved picks never carry an id (`lib/pick-form.mjs:51-69`). Confirmed live: none of the week-9 picks has an id, and the week-9 row was rewritten 0.24 s after Chas's 05:22:34 save with fresh ids (`lg5w2iu`, `lp3njqg`, …).
- Grade overrides are keyed by leg id (`lib/grade.mjs:174,191`; set in `components/CommissionerView.js:233-237`), and so are locked results (`lib/weeks.mjs:97`, `CommissionerView.js:243`). If a commissioner sets "Force WON" and a manager later edits any pick, the override silently stops applying. SGP group ids are renumbered the same way (`ticket.mjs:152-155`).

### 3. Commissioner saves to file weeks do nothing, and the app still says "saved"
- The Week editor always writes Supabase (`CommissionerView.js:249`). On load, a file week wins and the Supabase row only feeds a leg-signature conflict check (`lib/league-store.mjs:261-271`).
- Save, **Lock results** and **Delete week** on Weeks 2 and 4–8 change nothing on screen, yet the toast reads "Week N saved" / "locked". The only warning is the grey note at `CommissionerView.js:280`.
- Week 8 is still `results: "live"` with every leg result empty in `data/bets.json`. It can't be locked or graded from the app, and it re-grades from ESPN on every load.
- The documented process ("add a week by editing data/bets.json") means that copying week 9 into the file will freeze it. Any later override, slip or payer change made in the app is then ignored.

### 4. Recorded payments get double-counted after a commissioner save (latent, money)
- `league-store.mjs:274-277` appends `holm_payments` rows into `week.contributions` in memory.
- The Week editor clones that merged week (`CommissionerView.js:199,208`) and writes it back as the week blob (`:229,249`).
- On the next load, a Supabase-only week gets the copies from the blob plus the payments again, so the amounts double. `maybeCommit` keeps them because it spreads `prev` (`pick.js:202`).
- This hasn't fired yet: every payment on file is for a file week (2, 4–8). It fires the first time a Week 9+ payment is recorded and the week is then saved or locked. Season money (`components/SeasonMoney.js:15-16`) would show double "Paid" and phantom "Covered".

### 5. The week-0 roster in the live database is corrupted
- Live `config.roster` holds `"Ryan Hoffman; H0$$"`, `"Kevin Sack; Th£ SACK MAN"`, `"Adam Meltser; Jewla"` and so on. `ident.canonical` can't match those strings, so they stay as typed (`league-store.mjs:231`), and because the list isn't empty, the fallback roster never kicks in (`:232`).
- Effects:
  - The commissioner's Payer dropdown lists the 11 junk names next to the real ones (`league-store.mjs:158` → `CommissionerView.js:290`). Choosing one stores a payer nobody matches.
  - `WeekView.js:71` treats every manager as missing when the picks API fails.
  - The next "Save settings" writes the junk back (`CommissionerView.js:157-158,177`).
- The roster setting also has no effect on picks: `/api/pick` hard-codes `PARLAY_11` (`pick.js:137`), and `loadRoster` (`pick.js:73-79`) is dead code.

### 6. One manager, three names on screen; commissioner nicknames don't resolve as names
Checked against the live settings row:

| Manager | Tables (`whoLabel`) | Header / Pick (`ident.nick`) | Owner card (`title`) |
|---|---|---|---|
| Nick Curtis | Nick O-Town | Nick | No RaGarretts No Glory |
| Jace Clark | Jace the Bowtie | Jace | The Over Achiever |
| Adam Meltser | Meltser Truck Stick | Meltser | Beast Mode Buffering |

- These three have no commissioner nickname in `config.nicknames`, but the corrupted roster strings carry "Mustache Ride", "The Jace" and "Jewla". It looks like those were meant as nicknames and never reached the map. The roster strings and the map also disagree for others: Kevin Sack is "Th£ SACK MAN" in the roster but "Wally" in the map, Kyle McFadden "One-Eye" vs "OneEye Ging", Ryan Hoffman "H0$$" vs "Hoss", Chas "ESQ." vs "Chas".
- Commissioner nicknames go into `ident.overrides` only (`lib/ident.mjs:26-33`), never into the name lookup. So `ident.canonical('Wally')` returns `'Wally'`, and the server's `strictWho('Wally')` returns `''` (`lib/ticket.mjs:36`, used by `lib/import/whatsapp.mjs:131`). A WhatsApp line "Wally: DET ML…" is rejected.
- Claude's titles are added as aliases on the client (`lib/nicknames.mjs:79`) but not on the server (`ticket.mjs:5-17`). The same name resolves in the browser and fails in the import.
- Length caps disagree: 24 in `lib/league-config.mjs:5` and `ident.mjs:30`, 28 in `nicknames.mjs:7`.

### 7. The payer is computed four different ways
- **Week, Pick and Money pages:** `store.weekPayer/weekPayers` (`league-store.mjs:99-118`) use the recorded `payers` array, then ESPN last place, then the recorded `payer`. ESPN beats a recorded single payer (`:43-46,106`). That conflicts with "payments and splits show what was recorded."
- **Standings "Paid" column:** credits only `w.payer` (`lib/standings.mjs:122-123`). Week 4 (`"Joe Mckeon + Kyle Heller"`) credits nobody, and Supabase weeks with no `payer` credit nobody even while the Week page says someone owes.
- **"Most frequent payer":** counts raw strings, the combined one included (`components/StandingsView.js:77-79`).
- **Betting styles:** create a phantom manager row for the combined string (`standings.mjs:32`).

### 8. The weekly record and the history disagree on Week 8, and nothing reports it
`data/bets.json` Week 8 is `live` with no leg results; `parlay-history.json` grades it 8–3, busted. `lib/reconcile.mjs:71` skips live weeks, so the Data discrepancies card stays quiet. `README.md:185` still says the history has Week 8 pending.

### 9. The file vs Supabase conflict check only compares leg wording
`lib/weeks.mjs:151-168` compares (who, label, type, team, player, line, game). Differences in payer, stake, ticket state, odds/to-pay, groups and results are invisible. Today the Week 7 Supabase row has no results and no ticket state, and nothing flags it.

### 10. Dead schema that encodes the old rule
`holm_players`, `holm_tickets` and `holm_legs` are empty in the live database. `holm_legs.synced_from` has a check that only allows `'data/bets.json'` (`002_expanded_model.sql:58`), and `holm_parlay_sync_legs` is never called. Harmless now, but the plan below has to change that constraint.

---

## 2. How data moves

```
            ┌──────────── build time (bundled, ships only with a deploy) ────────────┐
data/bets.json ──► app/data/bets.json/route.js (force-static) ──► GET /data/bets.json
league-lore.json + data/nicknames.json ──► app/layout.js withNicknames() ──► <LeagueProvider lore>
parlay-history.json ──► app/parlay-history.json/route.js ──► GET /parlay-history.json
            └────────────────────────────────────────────────────────────────────────┘

Browser (lib/league-store.mjs boot → loadData, :242-284)
  GET /data/bets.json ─────────┐
  Supabase holm_parlay_weeks ──┼─► normalizeFile() → file weeks WIN for the same number;
   (all rows, publishable key) │   Supabase-only weeks appended (source:'supabase');
                               │   same-number rows → diffWeek() → state.dataConflicts
  Supabase holm_payments ──────┘   week 0 → state.config (roster, abstain, nicknames, chat)
                                   payments → appended into week.contributions (in memory)
  canonicalizeLoaded() rewrites payer / placedBy / leg.who in memory via ident
  ESPN (/api/espn): NFL clock → selected week; ffl → lastPlace (one week only)
  gradeWeek(): stored results or locked results → else live ESPN grade + week.overrides
  /api/pick?week=N → state.pick.rows / ticket (picks for the open week)

Pages read state.weeks (file + Supabase): Week, Pick, Standings, League, Money, Chat, Commissioner.
Bets / Standings / Chat / League also read parlay-history.json separately (lib/history.mjs),
and reconcile() compares the two.

Writes
  /api/pick POST ─► holm_parlay_picks (upsert who/week) ─► trigger → holm_parlay_pick_history
               └► 11 valid picks ─► maybeCommit ─► rpc holm_parlay_upsert_week_open
                                     (rewrites legs/groups/submissions in the week blob)
               └► holm_import_records (import log, one-per-week ticket alert claim)
  Commissioner ─► rpc holm_parlay_save_week (whole blob, any week incl. 0)
               ─► rpc holm_parlay_delete_week
               ─► slip import: Supabase week → blob; file week → prints JSON to paste into the file
  Payments ─► holm_payments (written outside the app; the "claude-session" source)
  data/bets.json, parlay-history.json, nicknames.json ─► git PR + deploy only
```

## 3. Where week data is duplicated

| Fact | Copies |
|---|---|
| Legs of a week | `data/bets.json` weeks[].legs · `holm_parlay_weeks.data.legs` · `holm_parlay_picks` (one per manager, the pre-ticket form) · `parlay-history.json` parlays[].legs · `holm_legs` (empty) |
| Leg result | file `leg.result` · blob `locked.results[leg.id]` · blob `overrides[leg.id]` · live ESPN grade · history `leg.result` |
| Ticket state / odds / to-pay | file `ticket`, `odds`, `toPay` · blob same keys · `deriveTicket()` fallback (`lib/model.mjs:77`) · history `odds`/`toPay`/`source` · `holm_tickets` (empty) |
| Payer | file `payer` (string, can be "A + B") · file `payers` (array) · blob `payer` · ESPN last place · history `payer` · `holm_payments.who` (who actually paid) |
| Stake | file · blob · history (Week 4: $20 in both, but the README totals disagree) |
| Contributions | file `contributions` (all empty) · `holm_payments` · in-memory merge · blob copy after a commissioner save (#4) |
| Roster | `lib/ticket.mjs:5-17` PEOPLE (server) · `lib/ident.mjs:4-17` FALLBACK_PEOPLE · `league-lore.json` people · `data/bets.json` config.roster/abstain · week-0 roster/abstain (corrupted) · `holm_players` (empty). The first three match today. |
| Nickname | lore `nick` + `aliases` · `HOUSE_HANDLE` (`ident.mjs:124`) · `data/nicknames.json` (keyed by id) · week-0 `nicknames` (keyed by full name) · junk suffixes in week-0 roster |

## 4. Every place a leg, payer or nickname can get out of sync

**Legs**
1. Pick saved after placement rewrites the ticket legs (#1).
2. Leg id regenerated → override / lock lost (#2).
3. Week copied into the file → app edits ignored (#3).
4. Pick changed into a duplicate market → ticket no longer complete → the blob keeps the old legs while the Pick page shows the new pick. The Week page then shows a ticket that no longer exists.
5. A slip import for a file week only prints JSON (`CommissionerView.js:370-373`); until someone pastes and deploys it, placement evidence exists nowhere.
6. `leg.who` spellings ("Joseph McKeon", "Jarn Sachs" in Week 7) are canonicalized in memory only (`league-store.mjs:238`), so the stored data keeps both spellings.
7. History legs vs file legs: reconcile reports label differences, but the history is never updated (by design) and file week 8 is never compared (#8).

**Payers**
8. ESPN last place overrides a recorded single payer for the current week (#7).
9. Combined payer strings aren't parsed in Standings or betting styles (#7).
10. Choosing a junk name from the corrupted dropdown stores an unmatched payer (#5).
11. `payer` (who owes) and `holm_payments.who` (who paid) are separate by design, but only `iou.mjs` reconciles them; Standings "Paid" means "was named payer," not "paid."
12. `HELLER_OUT_FROM_WEEK = 5` (`league-store.mjs:24`) and the Heller abstain flag live in code, lore, bets.json config and week-0 config; changing one doesn't change the others.

**Nicknames**
13. Commissioner map vs roster-string suffixes vs Claude titles vs house handles, all shown on different pages (#6).
14. Commissioner nicknames aren't name lookups (client or server); Claude titles are lookups on the client only.
15. Keyed by full name (week 0) vs by id (`nicknames.json`): renaming a manager orphans the week-0 entry.
16. Cap of 24 vs 28 characters.

---

## 5. One source of truth for weeks

**Proposal:** Supabase is the source of truth. Weeks live in normalized rows, and the server is the only writer.

- `holm_tickets`: one row per (season, week). Holds state, evidence, stake, odds, to-pay, book, placed by, **payers text[]**, payer source (`recorded` / `espn-last-place`), payer note, dates, results state, note, locked at, SGP groups.
- `holm_legs`: one row per (season, week, **who**). The stable id is `w{week}-{playerId}`, the shape Weeks 2 and 4–8 already use. Holds the pick fields, status, override, result detail, confidence, source.
- `holm_payments`: already the source for contributions. Stop copying payments into week data.
- Week 0 keeps league settings until settings move to their own table. Its roster stops being a free-text list.

**Why this one**
- The live week already lives in Supabase. The file only ever receives a hand copy after the fact, so "the file is the truth" is false for exactly the week people look at.
- Pick saves, the auto-commit at 11 picks, slip imports, overrides and locks all happen at runtime from a phone. A git file needs a PR and a deploy for each one.
- Normalized legs keyed by (week, who) end bugs #1, #2 and #4 structurally: no blob is rewritten, ids are stable, and payments are never copied.
- The tables, RLS read policies and passphrase checks already exist (`002`, `003`, `005`).

**What you lose, and how to keep it.** The file rule was a guardrail: grades only change through a reviewed commit, so nobody invents a result. In the database you keep that guardrail with:
1. an audit trigger on `holm_legs` and `holm_tickets`, copying `holm_parlay_pick_history`;
2. result writes allowed only from a passphrase function or the lock-from-ESPN path, always with a `detail`;
3. optionally, a weekly read-only export of the tables to a JSON snapshot PR, so the git history still shows every grade.

**Alternatives rejected**
- *Keep `data/bets.json` as the truth.* Every live-week action would need a deploy, or the Supabase copy stays as a shadow. That shadow is the problem today.
- *Keep the Supabase jsonb blob and just make it win.* This is the smallest change, but whole-blob read-modify-write is what causes #1, #2 and #4. You'd be fixing three symptoms instead of the cause.
- *Fold `parlay-history.json` in.* It's chat-derived evidence with its own confidence labels, and the README deliberately keeps it separate. Keep it as a frozen archive that reconcile checks against the source of truth.

---

## 6. Migration plan

Every step is one PR with tests and a build, per CLAUDE.md. The database steps (3, 4, 9) need Brad's go-ahead.

1. **Stop the bleeding in the current design (no schema change).** Note that both live code paths stay in use until step 7, so these fixes are not throwaway.
   - In `maybeCommit`, skip the rebuild when the stored ticket is `placed` or `settled`, and have `/api/pick` refuse pick saves for that week with a clear message.
   - Build leg ids from the manager (`w{week}-{id}`) instead of `Math.random` in `assembleTicket`.
   - Merge commissioner-owned keys (`groups[*].odds`, `overrides`, leg `line`/`label` edits) instead of replacing them.
   - Drop `source: 'supabase'` contributions before any blob save.
   - Tests: re-commit after placement is a no-op; ids are stable across two saves; an override survives a pick edit; contributions don't double.
2. **One roster module.** Create `lib/roster.mjs` from `league-lore.json` people. `ticket.mjs` PEOPLE and `ident.mjs` FALLBACK_PEOPLE import it. Index commissioner nicknames and Claude titles in one place that the server's `strictWho` also uses. One length cap. Key commissioner nicknames by player id.
3. **Repair week-0 settings (data fix, needs go-ahead).** Move the roster suffixes Brad wants kept into `nicknames` (ask him which wins: "Wally" or "Th£ SACK MAN", and so on). Reset `roster` to plain full names. Make Save settings reject a roster entry that doesn't resolve.
4. **Migration 006 (needs go-ahead).**
   - Add the ticket columns listed in section 5.
   - On `holm_legs`, add a unique key on (season, week, who), plus `override` and `detail` columns. Drop the `synced_from = 'data/bets.json'` check.
   - Add audit triggers.
   - Add service-role functions `upsert_proposed_ticket` / `upsert_legs_from_picks`, which refuse unless the ticket is `proposed`.
   - Add passphrase functions `set_ticket`, `set_leg` (override, result, line fix) and `lock_week`.
5. **Backfill script.** `scripts/backfill-weeks.mjs --dry-run` reads `data/bets.json` Weeks 2 and 4–8 plus the Supabase-only weeks (9). It prints the rows it would write and a reconcile diff, then writes on `--apply`. Keep the existing file leg ids. Week 7's `l1…l11` becomes `w7-<id>`, with a test mapping the old ids. Brad picks the Week 8 result source: ESPN grade lock, or leave it live.
6. **Read path behind a flag.** Add `/api/weeks`, returning weeks in today's exact object shape, and a pure mapper `lib/week-repo.mjs` with tests. For one week, `league-store` loads both sources and shows any difference in the Data discrepancies card, so the switch is checked against live data before anyone relies on it.
7. **Switch writes.**
   - `/api/pick` auto-commit writes legs and tickets.
   - The Week editor writes field-level through the passphrase functions; no blob.
   - Slip import attaches directly for every week; remove the "paste this into the file" branch.
   - Payer: recorded `payers[]` wins; ESPN last place is written once with `payer_source = 'espn-last-place'`, so Standings, the Week page and Money read the same stored value. Retire the four payer calculations in favour of one.
8. **Switch reads; retire the file.**
   - `league-store` reads only `/api/weeks`. `/data/bets.json` keeps serving at its old URL, generated from the database, for old links.
   - Move `data/bets.json` to `archive/bets-2026-10.json`.
   - Delete `diffWeek` / `dataConflicts`, `normalizeFile`, the file-week branches and notes in CommissionerView, and `scripts/migrate-bets-v2.mjs`.
   - Point reconcile at the source of truth vs history.
9. **Freeze the old table (needs go-ahead).** Revoke writes on `holm_parlay_weeks` for weeks above 0 and drop `holm_parlay_upsert_week_open`.
10. **Docs.** Rewrite the README "Weekly tape" section and the CLAUDE.md line "data/bets.json is the only record that adds or grades a week." That line is a league rule, so Brad signs off on the new wording.

## 7. Decisions only Brad can make

- Supabase as the source of truth replaces a rule he wrote down. Is the audit-trail substitute enough?
- Should the history archive keep feeding the Bets tab after the migration, or should Bets read the database and keep the history only as evidence?
- Week 8's grade: lock from ESPN now, or take the history's 8–3?
- Which nickname wins for each manager where the roster suffix and the nickname map disagree.
- Should pick edits after placement be refused outright, or saved but kept off the ticket and flagged?
