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

**Supabase.** `supabase/picks.sql` documents the two tables and the auto-commit RPC used by `pages/api/pick.js`. It was rebuilt from the code and checked against the live tables. Read its header before running it. The commissioner RPCs (`holm_parlay_check_pass`, `holm_parlay_save_week`, `holm_parlay_delete_week`) exist only in the live database.

**Local dev.**
1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Run `npm run dev` and open http://localhost:3000. It serves the pages and `/api/*`.
4. Run `npm test` for the unit tests, and `npm run check` for the syntax checks plus `next build`.

## Code layout

The site is a Next.js App Router app written in JavaScript, with no TypeScript and no extra frameworks.

| Path | What it holds |
|---|---|
| `app/<page>/page.js` | One route per tab: `/week`, `/pick`, `/standings`, `/league`, `/bets`, `/chat`, `/commissioner`. `/` redirects to `/week` and maps old `#hash` links (`#history` → `/bets`, `#admin` → `/commissioner`). |
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

## Weekly tape (`data/bets.json`)

Wins and losses live only in `data/bets.json`. That file is the only place a week is added or graded. Set a week's results to `unknown` when the slate is not graded yet. Do not invent a result. Do not copy grades from `parlay-history.json` into this file.

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
