-- 009: Freeze holm_parlay_weeks for weeks (step 9 of OUTPUTS/holm-parlay/week-data-audit.md).
-- Since 2026-11-07 weeks live in holm_tickets + holm_legs (007, 008) and the site reads them from there.
-- holm_parlay_weeks keeps two jobs: league settings (week 0, still saved from the Commissioner page)
-- and the old rows for weeks 7 and 9, read only as the fallback when the new tables can't be read.
--
-- Apply ONLY after the code that writes weeks to the new tables is live (PR "freeze the old weeks
-- table"): before that, the 11-pick auto-commit and commissioner saves still write here and would fail.
--
--   * A trigger refuses every insert, update and delete of a week above 0, whoever tries (definer
--     functions included). Week 0 is untouched.
--   * holm_parlay_upsert_week_open (the old auto-commit) can no longer be called, even by the server key.
-- Undo: drop trigger holm_parlay_weeks_frozen on public.holm_parlay_weeks; and re-grant the function to
-- service_role. Safe to re-run.

begin;

create or replace function public.holm_parlay_weeks_frozen()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.week, old.week) > 0 then
    raise exception 'holm_parlay_weeks is frozen for weeks: week % lives in holm_tickets + holm_legs', coalesce(new.week, old.week)
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.holm_parlay_weeks_frozen() from public, anon, authenticated;

drop trigger if exists holm_parlay_weeks_frozen on public.holm_parlay_weeks;
create trigger holm_parlay_weeks_frozen before insert or update or delete on public.holm_parlay_weeks
  for each row execute function public.holm_parlay_weeks_frozen();

revoke execute on function public.holm_parlay_upsert_week_open(integer, integer, jsonb) from public, anon, authenticated, service_role;

commit;
