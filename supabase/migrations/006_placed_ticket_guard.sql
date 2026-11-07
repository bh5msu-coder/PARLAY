-- 006: The auto-commit never rewrites a placed or settled ticket.
-- Touches only public.holm_parlay_upsert_week_open.
--
-- Before: the function refused only a locked week. Once a slip was placed (ticket.state 'placed' or
-- 'settled'), any later pick save could still rebuild the week's legs, so the board stopped matching the
-- ticket the book took. /api/pick has refused this since PR #62 (lib/commit.mjs frozenWeek); this puts
-- the same rule in the database, so no caller can get past it.
-- After: a placed, settled or locked week raises, and the upsert's conflict clause skips such a row too
-- (covers a ticket placed between the read and the write).
-- Execute grants are not changed here (CREATE OR REPLACE keeps them); see 004 for who may call it.
-- Safe to re-run.

create or replace function public.holm_parlay_upsert_week_open(p_season integer, p_week integer, p_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cur jsonb;
begin
  -- Week 0 is commissioner-only league configuration, not an auto-built ticket.
  if p_week <= 0 then
    raise exception 'Auto-commit requires a positive week';
  end if;
  select data into cur from holm_parlay_weeks where season = p_season and week = p_week;
  if cur is not null and cur->'locked' is not null and cur->'locked' != 'null'::jsonb then
    raise exception 'Week % is locked', p_week;
  end if;
  -- A placed or settled ticket's legs are what the book took; picks no longer change them.
  if cur is not null and coalesce(cur->'ticket'->>'state', '') in ('placed', 'settled') then
    raise exception 'Week % ticket is %', p_week, cur->'ticket'->>'state';
  end if;
  insert into holm_parlay_weeks as w (season, week, data, updated_at)
  values (p_season, p_week, p_data, now())
  on conflict (season, week) do update
    set data = excluded.data, updated_at = now()
    where (w.data->'locked' is null or w.data->'locked' = 'null'::jsonb)
      and coalesce(w.data->'ticket'->>'state', '') not in ('placed', 'settled');
end;
$function$;
