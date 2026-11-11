-- 011: Retire the old weeks table's write path (after 010 and the code that saves settings with
-- holm_settings_save are live).
--
--   * holm_parlay_save_week, holm_parlay_delete_week and holm_parlay_upsert_week_open are dropped.
--   * holm_parlay_weeks becomes a read-only archive: the freeze trigger (009) now covers week 0 too,
--     anon and authenticated lose every write grant, and the 010 bridge trigger is dropped.
-- The table and its rows stay (read-only) as the record of what was saved there before 2026-11-07.
-- Undo: re-create the functions from supabase/picks.sql history and drop holm_parlay_weeks_frozen.

begin;

drop trigger if exists holm_settings_from_week0 on public.holm_parlay_weeks;
drop function if exists public.holm_settings_from_week0();

drop function if exists public.holm_parlay_save_week(text, integer, integer, jsonb);
drop function if exists public.holm_parlay_delete_week(text, integer, integer);
drop function if exists public.holm_parlay_upsert_week_open(integer, integer, jsonb);

create or replace function public.holm_parlay_weeks_frozen()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'holm_parlay_weeks is a read-only archive: weeks live in holm_tickets + holm_legs, settings in holm_settings'
    using errcode = '42501';
end $$;
revoke all on function public.holm_parlay_weeks_frozen() from public, anon, authenticated;

revoke insert, update, delete, truncate, references, trigger on public.holm_parlay_weeks from anon, authenticated;

commit;
