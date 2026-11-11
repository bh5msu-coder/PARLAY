-- 010: League settings get their own table (step 10 of OUTPUTS/holm-parlay/week-data-audit.md).
-- Until now the settings (league name, chat link, roster, abstain list, nicknames) lived in
-- holm_parlay_weeks as "week 0". Weeks moved to holm_tickets + holm_legs on 2026-11-07, so week 0 was the
-- last thing that table still took writes for.
--
--   holm_settings                         one row per season; anyone can read it.
--   holm_settings_save(pass, season, data) commissioner passphrase; replaces the season's settings.
--
-- Additive and safe to apply before the code that uses it: until 011, a week-0 save through the old
-- holm_parlay_save_week is copied here by a trigger, so nothing saved in between is lost. Safe to re-run.

begin;

create table if not exists public.holm_settings (
  season int primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.holm_settings enable row level security;
revoke all on public.holm_settings from anon, authenticated;
grant select on public.holm_settings to anon, authenticated;
drop policy if exists holm_settings_read on public.holm_settings;
create policy holm_settings_read on public.holm_settings for select to anon, authenticated using (true);

insert into public.holm_settings (season, data, updated_at)
  select season, data, updated_at from public.holm_parlay_weeks where week = 0
on conflict (season) do update set data = excluded.data, updated_at = excluded.updated_at;

create or replace function public.holm_settings_save(p_pass text, p_season int, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.holm_parlay_check_pass(p_pass) then raise exception 'bad passphrase' using errcode = '28000'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Settings must be an object'; end if;
  insert into holm_settings (season, data, updated_at) values (p_season, p_data, now())
  on conflict (season) do update set data = excluded.data, updated_at = now();
end $$;
revoke all on function public.holm_settings_save(text, int, jsonb) from public;
grant execute on function public.holm_settings_save(text, int, jsonb) to anon, authenticated, service_role;

-- Bridge until 011: a week-0 save to the old table lands here too.
create or replace function public.holm_settings_from_week0()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.week = 0 then
    insert into holm_settings (season, data, updated_at) values (new.season, new.data, now())
    on conflict (season) do update set data = excluded.data, updated_at = now();
  end if;
  return new;
end $$;
revoke all on function public.holm_settings_from_week0() from public, anon, authenticated;
drop trigger if exists holm_settings_from_week0 on public.holm_parlay_weeks;
create trigger holm_settings_from_week0 after insert or update on public.holm_parlay_weeks
  for each row execute function public.holm_settings_from_week0();

commit;
