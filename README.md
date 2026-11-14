# Holm Parlay

Live weekly parlay tracker for Our Holm League.

## Deploy & integrations

**Pipeline.** GitHub `bh5msu-coder/PARLAY` is connected to the Vercel project `holm-parlay` (team `bh5msu-coders-projects`) through the Vercel GitHub App:
- A push to `main` deploys to production at https://holm-parlay.vercel.app.
- Every PR gets a preview deployment, and the Vercel bot comments the link on the PR.
- Vercel reports each deploy back as a **commit status** named `Vercel`. The repo's GitHub "Deployments" panel stays empty because this project doesn't create GitHub Deployment objects. That's expected and doesn't mean the link is broken.
- `vercel.json` sets the framework to Next.js and runs the functions in `cle1`.

**Environment variables.** Set these in Vercel → Project → Settings → Environment Variables. `.env.example` lists them with placeholder values. Never commit real values.

| Variable | Required | Read in | What breaks without it |
|---|---|---|---|
| `ESPN_S2` | yes | `pages/api/espn.js` | The private fantasy league can't load: no last-place payer and no ESPN standings. `/api/espn?path=ffl` returns 401. |
| `ESPN_SWID` | yes | `pages/api/espn.js` | Same as `ESPN_S2`. Both are cookies from a logged-in espn.com session. |
| `ESPN_LEAGUE_ID` | no | `pages/api/espn.js` | Nothing. It defaults to `182263`. |
| `SUPABASE_URL` | no | `pages/api/pick.js` | Nothing. It falls back to the project URL hardcoded in `pages/api/pick.js` and `lib/clients.mjs`. |
| `SUPABASE_ANON_KEY` (or `SUPABASE_KEY`) | no | `pages/api/pick.js` | Nothing. It falls back to the publishable key hardcoded in the same files. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | `lib/clients.mjs` (browser) | Nothing. They override the browser's Supabase project. Set them only if you move projects. |

**Health check.** `GET /api/health` returns which of the variables above are set, as booleans only, never their values. It also returns the deployed commit and a list of problems. `"ok": true` means ESPN is configured.

**Supabase.** `supabase/picks.sql` documents (as of 2026-10-31; see `supabase/migrations/` 004–011 for what changed since) the picks and weeks tables, the commissioner passphrase table, the policies and all four `holm_parlay_*` functions. It was exported from the live database on 2026-10-31 and matches it, apart from the `p_week <= 0` guard that was added to live the same day.

## Phone app and alerts

The site is an installable home-screen app. The phone has four tabs: **This Week** (your pick, the ticket, the live sweat tracker), **Standings**, **Stats** (awards, Elo, history, fun tables), and **More** (league, chat, money, the full pick form, commissioner, theme, install, alerts). The old URLs (`/pick`, `/league`, `/bets`, `/chat`, `/commissioner`) still open.

**Install.** On Android, Chrome offers Install. On iPhone, open the site in Safari, tap Share, then Add to Home Screen, and open the new icon. Alerts on iPhone only work from that icon, and only on iOS 16.4 or newer. The More tab has the same steps.

**Offline.** The service worker (`public/sw.js`) keeps the last successful `/api/weeks`, `/api/pick`, lore, and history responses. The page also saves that payload in this phone's storage, so a refresh with no signal still shows the last weeks.

**Push.** Alerts are Web Push: a leg hits, the ticket busts, the ticket cashes, and a Thursday-afternoon reminder when picks are still out. Turning them on (More → Alerts) stores the browser subscription. The endpoint has to be a real browser push service (Apple, Google, Mozilla, or Windows). The server will not call any other address. Nothing sends until the migration below has been run and the env vars are set. The reminder uses the week picks are open for, including a week that does not have a ticket row yet. Two phones sweeping at once share one send: the cursor has a `version`, and only the request that still owns that version sends.

1. In the Supabase SQL editor, run `supabase/migrations/012_web_push.sql`. It creates `holm_push_subscriptions` and `holm_push_state`. It does not touch `holm_parlay_weeks`.
2. Generate a key pair: `npx web-push generate-vapid-keys`.
3. Set these on the Vercel project for **Preview** (so a preview deploy can be tested) and, when you are ready, Production. Do not commit the values.

| Variable | Required for alerts | What it is |
|---|---|---|
| `VAPID_PUBLIC_KEY` | yes | Public key. The app reads it from `GET /api/push`. Safe to expose. |
| `VAPID_PRIVATE_KEY` | yes | Private key. Server only. |
| `VAPID_SUBJECT` | yes | A `mailto:` address, required by the Web Push spec. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Already used by `/api/pick`. The server uses it to store subscriptions and the alert cursor. |
| `CRON_SECRET` | yes, for sending | Vercel Cron sends `Authorization: Bearer …`. Sweeps refuse to run without it. The open app cannot start one. `/api/health` reports whether it is set, never the value. |

4. Redeploy after the variables are saved. Open More → Alerts on the installed app and turn them on.
5. `GET /api/health` includes a `push` object of booleans only. `ready` on `GET /api/push` is true when the four required values are set.

**When alerts fire.** Only a request that carries `Authorization: Bearer $CRON_SECRET` can run a sweep (`GET /api/push?job=grade` or `?job=missing`). A plain link or another website cannot. The server grades, compares the result to `holm_push_state`, and sends only if it still holds the version it read. The first look at a week is a baseline, so turning alerts on mid-season does not replay old hits. Turning alerts off requires that phone’s auth key, not just the endpoint. New phones stop being accepted after 40 subscriptions. A Vercel cron hits `GET /api/push?job=missing` Thursdays at 21:00 UTC (4pm ET in November) for the "picks still out" reminder. That schedule is once a week so it fits a daily cron limit. Live leg alerts need a tighter cron, which Vercel allows on Pro: add `{ "path": "/api/push?job=grade", "schedule": "*/5 * * * *" }` to `vercel.json`. Cron runs on production, not on preview.

**Stack.** This stays the existing Next.js App Router app in JavaScript, with the CSS already in `app/globals.css`. A TypeScript or Tailwind rewrite would touch every page for no change in the data path. Live scores keep the existing grade timer (about 45 seconds while a game is on) and that same timer reloads picks. Supabase Realtime was not added: it needs a publication change on the production picks table, and the timer already covers the board.

**Local dev.**
1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Run `npm run dev` and open http://localhost:3000. It serves the pages and `/api/*`.
4. Run `npm test` for the unit tests, and `npm run check` for the syntax checks plus `next build`.

## Code layout

The site is a Next.js App Router app written in JavaScript, with no TypeScript and no extra frameworks.

| Path | What it holds |
|---|---|
| `app/<page>/page.js` | Phone tabs: `/week` (home), `/standings`, `/stats`, `/more`. Older pages stay: `/pick`, `/league`, `/bets`, `/chat`, `/commissioner`. `/` opens This Week and still maps old `#hash` links (`#history` → `/bets`, `#admin` → `/commissioner`). |
| `components/*View.js` | The client component for each page. `LeagueProvider` and `Topbar` are shared by every page. |
| `lib/*.mjs` | Pure logic shared by the pages, the API routes and the tests: grading, standings, Elo, history stats, the NFL clock, the pick form and the league store. |
| `pages/api/*.js` | Serverless API routes: `espn`, `pick` and `health`. |
| `app/data/bets.json`, `app/league-lore.json`, `app/parlay-history.json` | GET-only routes that serve the JSON files at their old URLs. They are read-only and bundled at build time, so data edits ship with the next deploy. |
| `public/` | Icons and the PWA manifest. |

### Integration audit (2026-10-30)
- **GitHub ↔ Vercel: working.** Every recent commit on `main` has a successful `Vercel` status, and production serves the current `main` build.
- **ESPN: broken in production.** `ESPN_S2` and `ESPN_SWID` are not set on the Vercel project, so `/api/espn?path=ffl` fails. **Fix:** add both variables in Vercel, redeploy, and confirm that `/api/health` reports `"ok": true`. This needs the account owner, because secrets can't be set from the repo.
- **"Claude" connection: not confirmed.** Nothing in this repo or its git history calls Claude or Anthropic, and the repo has no Claude config. The AI tool that has worked on the code is Cursor (commit authors, Bugbot reviews). If a Claude GitHub App or connector is expected, check GitHub → Repo Settings → GitHub Apps and Vercel → Project → Settings → Git. Neither can be inspected from the codebase.
- **"Origin": not confirmed.** PR #5 says its code was copied "from Origin", but no file, branch, remote or Vercel project by that name is referenced anywhere. The git remote `origin` correctly points at `github.com/bh5msu-coder/PARLAY`. If Origin is a separate site or folder, it isn't connected to this pipeline.
- **Known gaps, not fixed here:**
  - `/api/pick` has no auth, so anyone can submit or overwrite a manager's pick.
  - The publishable Supabase key is hardcoded as a fallback. Publishable keys are designed to be public, but they still allow whatever RLS permits.

## Dashboards

Standings reads the **weekly record** (the Supabase weeks plus live grades). Bets reads the **history** (parlay-history.json, loaded read-only through `lib/history.mjs`, which makes one GET and deep-freezes the result). The two sources are never merged, and each card says which one it uses. `lib/stats.mjs` computes both levels:

- **Selections** (one manager's picks):
  - hit rate, record, current and best streak
  - bet-type breakdown, with a manager × type matrix
  - night/day split (7 PM ET or later)
  - bust attribution (losing picks on busted tickets)
  - charts for hit rate over time and hit rate by bet type
- **Tickets** (the week's parlay):
  - result and ticket state (proposed, placed or settled, with the evidence on hover)
  - payer
  - stake listed, contributions recorded, payout recorded, and hypothetical payout
  - a stake-vs-return chart. Solid bars are recorded money, and the hatched bar is the hypothetical payout, labeled as such.

**Rules every dashboard follows:**
- Rates count decided picks only: wins ÷ (wins + losses). Open and unknown picks are shown separately.
- Any metric with fewer than 5 decided picks gets a **small sample** badge.
- Every metric has a plain-language **?** tooltip. The text is in `METRIC_HELP` in `lib/stats.mjs`.
- Every payout that was not actually paid is labeled **hypothetical**.
- "Won share" shows "not decided" until the commissioner sets the `payoutSplit` rule. The site does not assume an even split.
- The **Data discrepancies** card, on both Standings and Bets, lists the output of `lib/reconcile.mjs`.

## League features

These are built only from recorded results, with no new rules:

- **Achievements** (League tab, `lib/achievements.mjs`):
  - There are eight badges: hot hand, lock, clean sheet, ticket killer, night owl, specialist, ever-present and cold streak.
  - Each badge comes from decided picks and names its source and the fields it reads. Hover a badge to see them.
  - Badges with fewer than 5 decided picks behind them get the small-sample flag.
  - History and weekly badges are shown separately.
- **Smack feed** (Chat tab, `lib/smack.mjs`): needles built from settled tickets (recap or lone buster), decided-pick streaks of 3 or more, and rivalry pick records. Each item can become a draft or a WhatsApp share link. Nothing posts by itself, and Chat has no backend.
- **Weekly recap** (Week tab for busted or cashed weeks, `lib/recap.mjs`):
  - Written only from settled results. Open or unrecorded weeks get no recap.
  - Unknown picks are named and left out of the count.
  - Payouts are labeled hypothetical unless one was recorded.
  - It notes when nothing shows the ticket was placed.

## Data model (schemaVersion 2)

`lib/model.mjs` defines the model, and the same shapes exist as tables in `supabase/migrations/002_expanded_model.sql`.

| Record | Where it lives | Notes |
|---|---|---|
| Player | `league-lore.json` people → `holm_players` | id, name, nick, aliases, parlay, abstain |
| Week | Supabase `holm_tickets` + `holm_legs` (since 2026-11-07) | The record that adds or grades a week. `data/bets.json` is the archive it was copied from. |
| Leg | `week.legs` (synced one way to `holm_legs`) | Status is `open`, `won`, `lost`, `unknown`, `void` or `push`. Each leg also has a confidence label (`espn-final`, `espn-consensus-line` or `inferred-margin`, history only) and a source. |
| Pick (saved) | `holm_parlay_picks` | A saved selection. **It is not a placed bet.** |
| Contribution (recorded) | `week.contributions` / `holm_payments` | Money someone put in. **It does not mean the ticket was placed.** |
| Ticket | `week.ticket` / `holm_tickets` | State is `proposed`, `placed` or `settled`, plus an `evidence` string saying how we know |
| Payout | `week.payouts` / `holm_payouts` | Money a book actually paid. A slip's `toPay` is always hypothetical. |

**Ticket state comes from evidence only.**
- A full set of saved picks is `proposed`.
- `placed` needs slip odds plus a to-pay amount, or a fully matched slip import.
- `settled` means placed and every leg decided.
- Graded legs alone never mark a ticket placed. That's why Week 5 is `proposed`: its results are recorded, but there's no slip data.

**Migration.** Run `node scripts/migrate-bets-v2.mjs` (or `--check` in CI). It's idempotent and only adds fields: `schemaVersion`, `ticket`, and empty `contributions` and `payouts` arrays. It never changes a leg, result, stake or payer, and it never reads `parlay-history.json`. For Supabase, run `supabase/picks.sql` and then `supabase/migrations/002_expanded_model.sql`. Both files were applied to the live database on 2026-10-31 (002 as written; `picks.sql` as the guard fix only, since the rest already existed).

**Weeks moved to Supabase (2026-11-07).** The plan is in `OUTPUTS/holm-parlay/week-data-audit.md`.
- **Tables:** migration 007 lets `holm_tickets` and `holm_legs` hold a whole week. Writes are limited to the server key and the passphrase functions, and every change is logged in `holm_week_audit`.
- **Mapping:** `lib/week-rows.mjs` maps a week to rows and back. A test round-trips every week in `data/bets.json`.
- **Backfill:** `scripts/backfill-weeks.mjs` copied the weeks in once, and all 79 legs and 7 tickets were checked against the source. **Don't re-run it.** It would overwrite the record with the archive, so it now refuses unless you pass `--overwrite-db`.
- **Writes:** migration 008. Each auto-commit at 11 picks (`holm_week_put_auto`, server key) and each commissioner Save, Lock or Delete (`holm_week_put_commish` / `holm_week_delete_commish`, passphrase) writes the week here.
- **Settings:** league settings (name, chat link, roster, abstain list, nicknames) live in `holm_settings` (migration 010), saved with `holm_settings_save` (passphrase).
- **Old table:** `holm_parlay_weeks` is a read-only archive (migrations 009 and 011). The functions that wrote it are gone.
- **Reads:** every page reads its weeks from `GET /api/weeks` (`lib/league-store.mjs`). There is no second copy to fall back to: if the first read fails the page says the data didn't load; if a later refresh fails, the weeks already on screen stay and the Week page says the refresh failed. The Week page share image reads the database too, rebuilt every 5 minutes.

**Discrepancies.** `lib/reconcile.mjs` lists every place the two sources disagree (stakes, payers, results, picks). It reports the differences without fixing them. Today the list starts with the stakes: Standings shows **$40** (data/bets.json, Weeks 5–8, including open Week 8) and Bets shows **$60** (parlay-history.json, graded Weeks 2 and 4–7, with Week 4 at $20).

## Importing picks and slips

**WhatsApp** (Pick tab → From WhatsApp). Paste an export (Export chat → Without media) or a few lines. `/api/pick` parses it with `lib/import/whatsapp.mjs`.
- **Formats:** iOS and Android export lines, HOLM PICK blocks, and pipe or `Name: pick` one-liners.
- **Names:** must be an exact name, nickname or alias. Close spellings are not matched.
- **Games:** a pick needs a game written as `AWAY at HOME`. A moneyline or spread must name one of the two teams.
- **Week numbers:** a HOLM PICK block marked for another week is rejected.
- **Unreadable lines:** these, and unknown names, come back with line numbers and are not saved.
- **Source:** every saved pick records author, message time, line number and a hash of the message.

**Dedupe** (`lib/import/dedupe.mjs`). Picks are keyed on (season, week, manager).
- **Duplicates:** the same message twice, or the same market, are dropped.
- **Conflicts:** a different pick from the same manager is a conflict. The `importConflict` rule decides what happens. Its default is `flag`: nothing is overwritten.
- **Import log:** every outcome is written to `holm_import_records` once migration 002 has been run.

**Sportsbook slips** (Commissioner → Sportsbook slip). Paste slip text or JSON. `lib/import/slip.mjs` matches each slip leg to one pick by team, player, side and line.
- **Unmatched or ambiguous legs** are listed, never guessed.
- **Placement evidence:** only a slip where every leg and every pick matched counts. Attach it to the week and save; the week is stored in Supabase.

## House rules

These were decided by the league (commissioner answers, 2026-10-31) and recorded in `lib/rules.mjs`. The commissioner can override any of them by setting `rules.<key>` in the league config (week 0).

| Rule | Decision |
|---|---|
| `payoutSplit` | Winnings are split and settled among the group in cash or in person. The site does not compute shares. |
| `lastPlaceTie` | Tied last-place managers split the stake. |
| `splitStake` | Yes, a stake can be split between payers. |
| `rollover` | A stake that is not placed rolls over to the next week. |
| `pickDeadline` | No hard deadline. Push to have picks in by Thursday. |
| `editsAndLocks` | A pick can be changed until the ticket is placed. A pick saved after its game kicks off still saves, with a warning. |
| `pushHandling` | The House decides. |
| `voidHandling` | The House decides, including postponed games (TBD by the House). |
| `missingPicks` | Go with what is in: the ticket is placed with the picks submitted. |
| `eligibility` | No one opts out. |
| `disputes` | Ridicule, verbal abuse and arguments. |
| `placementProof` | Placed by someone in Michigan or Ohio (mostly Chas, John, Ryan or Joe); a screenshot of the slip is the proof. |
| `books` | Any book is allowed; boosts are encouraged. |
| `contributionTiming` | The $10 stake is due by kickoff. Just send it; a payment checkmark is optional. |
| `importConflict` | The pick that is on the placed sportsbook ticket wins. Until a slip settles it, conflicting imports are flagged, not overwritten. |

**Rules the site enforces:**
- **Kickoff warning** (`lib/pick-lock.mjs`). The league bets together, so what matters is getting the ticket to the book in time, not when a pick reached the sheet. `/api/pick` never refuses a pick for kickoff: a save after the game started (ESPN shows it live, or its scheduled kickoff has passed) goes through with a warning that the book may not take that leg pre-game. A placed, settled or locked week is still frozen. If ESPN can't be reached, the check is skipped and the response says so.
- **Going with what's in.** The Pick tab shows the slip so far before all 11 picks are in. Auto-save still waits for 11.
- **Import conflicts.** These are flagged and never overwritten. The pick on the placed slip decides.
- **Payouts.** Winnings are settled in person, so the site shows no per-person share.

**Recorded, but not automated yet:**
- Split payers and tied last places: the payer field still holds one name.
- Rollovers.
- A paid checkmark for the stake: Venmo has no public payments API for this. The planned path is the commissioner-only `holm_parlay_record_payment` in migration 002.
- No one opts out, except Kyle Heller, who left the $10 bet on Oct 3, 2026: from Week 5 he does not pay (the next lowest scorer does) and forfeits his share of winnings. The roster already has him sitting.

## Weekly tape (Supabase weeks)

Since 2026-11-07, weeks live in Supabase: one `holm_tickets` row and its `holm_legs` per week. They are added and graded from the Commissioner page (Save, Lock, slip import) and by the 11-pick auto-commit, and every change is logged in `holm_week_audit`. Set a week's results to `unknown` when the slate is not graded yet. Do not invent a result. Do not copy grades from `parlay-history.json` into a week.

`data/bets.json` is the archive the weeks were copied from. **Editing it does not change the site**, and no page reads it.

## Parlay history (`parlay-history.json`)

`parlay-history.json` is a static, read-only record of the weekly $10 group parlay. The **Bets** tab (`/bets`) builds its stats from that file. Nothing is written to Supabase.

**How it was built**
- Source: the "Our Holm League" WhatsApp export (7/31/26 to 10/29/26). Each parlay has a `source` field with line refs (`L###`).
- Included: only 11- or 12-leg weekly group tickets whose legs match picks posted in the chat. Leg lines come from DraftKings slip photos where available. Week 2 is from slip `e168a70f…`: $10 wager, $4,349 to pay.
- Week 7 mirrors the live Supabase ticket (read-only) so it shows up in season stats.
- Week 8 is recorded with all legs `pending`.
- Results come from one of two places:
  - Finals the chat states (Week of Oct 12), or
  - ESPN final scores and box scores (`site.api.espn.com` scoreboard/summary).
- Every leg has a `confidence` field:
  - `espn-final`: graded against the slip or chat line.
  - `espn-consensus-line`: the slip line isn't readable, so it's graded against ESPN's consensus total. Every margin is 4.5+ points.
  - `inferred-margin`: Goff's 412 pass yards clears any realistic line.
- Anything else is `unknown`, e.g. Ja'Marr Chase in Week 4: he left injured and the chat doesn't say how the book settled it.

**Excluded** (also listed in the file's `excluded` array)
- Week 3: picks were posted but the ticket was never placed, so the stake rolled into Week 4 at $20.
- Week 1: no pick list or slip in the export.
- Side and college bets.
- Joey's AI "best 11" list.
- Side ideas.
- Heller's protest pick after he opted out.
- 2025 and earlier seasons: the export doesn't include them, and nothing is invented.

Side bets and singles are never attributed to anyone.

**Season Elo change:** each pairwise update is now divided by `n − 1`, so field size doesn't inflate swings. The table also labels gap years, and managers with no season finishes yet (DJ) get a note.

## Nicknames (commissioner first; Claude on request)

Commish → Nicknames saves to league settings; those show everywhere and never rotate. Claude's job
runs only from Actions → nicknames → Run workflow and skips anyone with a commissioner nickname.

`.github/workflows/nicknames.yml` runs only from Actions → nicknames → Run workflow.
`scripts/nickname-facts.mjs` gathers facts from `league-lore.json` and `parlay-history.json`; Claude Code edits only
`data/nicknames.json`; `scripts/check-nicknames.mjs` enforces the rules (real manager ids, 3–28 characters, family-friendly,
no clash with anyone else's name or alias); tests and the build run; then the job opens a `nicknames/<date>` PR. Nothing
ships until it is merged. The nickname shows on the League page Owner card and joins the roster lookup; the short handle
(`nick`) the tables use never changes. Runs on Claude Fable 5.2 (`--model claude-fable-5-2`). Needs the repo secret `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`.

The Commissioner page's **Claude recap** (`pages/api/recap.js`) also runs on Claude Fable 5.2. It gets the week's results plus a profile for every manager (`lib/recap-context.mjs`: league history, titles, last-place finishes, team names, current and past nicknames, commissioner locks) and returns the recap and nickname ideas as JSON. Locked managers and repeated nicknames are dropped, and nothing saves until the commissioner ticks it. If Claude declines, the API retries on a fallback model; if that declines too, the page keeps the template recap.

## "Ticket's full" push

When the save that completes the 11-pick ticket lands (web pick or WhatsApp import), `/api/pick` sends one push
through [ntfy](https://ntfy.sh) (`lib/ticket-alert.mjs`). Tapping it opens WhatsApp with the whole ticket written
out; pick the group and press send. Edits after the ticket is full don't ping again. The send gives up after 4
seconds and never fails a save. Set `NTFY_TOPIC` (a long random name, treat it like a password) in Vercel →
holm-parlay → Settings → Environment Variables, then subscribe to the same topic in the ntfy app.
Optional: `NTFY_SERVER`, `NTFY_TOKEN` for a private ntfy server.
