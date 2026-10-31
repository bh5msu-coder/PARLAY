-- Holm Parlay — Supabase schema used by pages/api/pick.js and the commissioner page.
--
-- EXPORTED FROM THE LIVE DATABASE (project ivucfpduvaiyxjcqbsqa, 2026-10-31): table columns, keys,
-- row security, policies and every function body below were read from pg_catalog, not inferred.
-- The one change from live is the `p_week <= 0` guard in holm_parlay_upsert_week_open, applied to
-- live on 2026-10-31 (migration holm_parlay_upsert_week_open_positive_week).
-- Every statement is idempotent. Run supabase/migrations/002_expanded_model.sql after this file.
--
-- holm_parlay_admin holds the commissioner passphrase. It has row security on and no policy, so
-- only the security-definer functions below can read it. Never add a policy to it, and never put
-- its contents in this repo.

create table if not exists public.holm_parlay_admin (
  id         integer primary key default 1,
  passphrase text    not null
);

-- Weekly ticket data. Week 0 holds league config (roster, abstain, chat link).
create table if not exists public.holm_parlay_weeks (
  season     integer     not null,
  week       integer     not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (season, week)
);

-- One saved pick per manager per week. pages/api/pick.js upserts with on_conflict=season,week,who.
-- A saved pick is NOT a placed wager.
create table if not exists public.holm_parlay_picks (
  season     integer     not null,
  week       integer     not null,
  who        text        not null,
  source     text        not null default 'web',   -- 'web' | 'whatsapp'
  leg        jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (season, week, who)
);

alter table public.holm_parlay_admin enable row level security;
alter table public.holm_parlay_weeks enable row level security;
alter table public.holm_parlay_picks enable row level security;

-- Weeks are public to read. Writes go only through the functions below.
do $$ begin
  create policy holm_parlay_weeks_public_read on public.holm_parlay_weeks
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

-- Picks are read and written directly with the publishable key (no auth yet — see README).
do $$ begin
  create policy holm_parlay_picks_read on public.holm_parlay_picks
    for select to public using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy holm_parlay_picks_insert on public.holm_parlay_picks
    for insert to public with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy holm_parlay_picks_update on public.holm_parlay_picks
    for update to public using (true);
exception when duplicate_object then null; end $$;

-- Commissioner passphrase check.
create or replace function public.holm_parlay_check_pass(p_pass text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.holm_parlay_admin where passphrase = p_pass);
$function$;

-- Commissioner save (used by the Commissioner page, including week 0 league config).
create or replace function public.holm_parlay_save_week(p_pass text, p_season integer, p_week integer, p_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.holm_parlay_admin where passphrase = p_pass) then
    raise exception 'bad passphrase' using errcode = '28000';
  end if;
  insert into public.holm_parlay_weeks (season, week, data, updated_at)
  values (p_season, p_week, p_data, now())
  on conflict (season, week) do update set data = excluded.data, updated_at = now();
end;
$function$;

-- Commissioner delete. Never deletes week 0 (league config).
create or replace function public.holm_parlay_delete_week(p_pass text, p_season integer, p_week integer)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  delete from public.holm_parlay_weeks
  where season = p_season and week = p_week and week > 0
    and exists (select 1 from public.holm_parlay_admin where passphrase = p_pass);
$function$;

-- Called by pages/api/pick.js when 11 valid picks are in. Anon can call it, so it must never touch
-- week 0 (commissioner-only league config) and never overwrite a locked week.
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
  insert into holm_parlay_weeks as w (season, week, data, updated_at)
  values (p_season, p_week, p_data, now())
  on conflict (season, week) do update
    set data = excluded.data, updated_at = now()
    where w.data->'locked' is null or w.data->'locked' = 'null'::jsonb;
end;
$function$;

grant execute on function public.holm_parlay_check_pass(text) to anon;
grant execute on function public.holm_parlay_save_week(text, integer, integer, jsonb) to anon;
grant execute on function public.holm_parlay_delete_week(text, integer, integer) to anon;
grant execute on function public.holm_parlay_upsert_week_open(integer, integer, jsonb) to anon;
