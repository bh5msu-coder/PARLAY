# Holm League Parlay — Claude Code context

Weekly parlay tracker for Our Holm League (Brad Holm, commissioner). Live at https://holm-parlay.vercel.app.
Read `README.md` for deploys, environment variables, the code layout and the dashboards.

## Stack

- Next.js 16 App Router, React 19, plain JavaScript. No TypeScript, no CSS framework, no other runtime packages.
- Pages in `app/<page>/page.js`, each rendering a client view from `components/*View.js`. Shared logic lives in `lib/*.mjs`,
  which stays pure so the tests import it directly.
- API routes in `pages/api/` (`espn`, `pick`, `health`). Supabase holds picks and weeks (`supabase/picks.sql` matches live).
- Styles in `app/globals.css` with tokens on `:root`. Phone breakpoint is 719px, wide desktop 1200px.
- Vercel project `holm-parlay` (region cle1). A merge to `main` deploys to production; every PR gets a preview.

## Commands

```
npm test           # node:test over test/*.test.mjs
npm run build      # must pass before a PR
npm run check      # syntax checks plus next build
npx next start -p 3125   # check a build locally (pkill -f next-server first)
```

## How work ships (Brad)

1. A branch and one PR per round of changes. Tests and the build pass before the PR is opened.
2. Check the page at 375px and 1440px: no sideways scroll, nothing cut off.
3. Never merge until Brad says "merge it". Then `gh pr merge <n> --merge` and poll `/api/health` until it reports the
   merge commit.

## League rules the code must keep

- No sign-in for managers. Identity ("you") is a device choice in localStorage `hp_who`, set with `store.setYou`.
- Heller's payment date (10/3) stays in the records but is never shown anywhere in the app. Search the rendered page for
  "Oct 3" after any change to payments or dates.
- Payments and splits show what was recorded. Heller does not owe Brad back for Week 4. Everyone is paid to date.
- Results come from recorded data or ESPN grades, never invented. A placed ticket's legs are the picks for that week.
- Keep the Standings stake vs return chart as it is.
- Never put a secret or the commissioner passphrase in the repo. ESPN cookies live only in Vercel environment variables.

## Phone layout conventions

- Long card bodies go in `components/Fold.js` (cut on phones, Show all; `max` sets the height). Desktop never folds.
- `hide-m` hides a table column under 720px. Smallest text on phones is 12px; tap targets at least 40px.
