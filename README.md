# Holm Parlay

Live weekly parlay tracker for Our Holm League.

## Weekly tape (`data/bets.json`)

Wins and losses live only in `data/bets.json`. That file is the only place a week is added or graded. Set a week's results to `unknown` when the slate is not graded yet. Do not invent a result. Do not copy grades from `parlay-history.json` into this file.

## Parlay history (`parlay-history.json`)

`parlay-history.json` is a static, read-only record of the weekly $10 group parlay. The **Bets** tab (`#history`) builds its stats from that file. Nothing is written to Supabase.

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
