-- Holm Parlay — Supabase schema used by api/pick.js and app.js.
--
-- RECONSTRUCTED, NOT EXPORTED. The original picks.sql was never committed. This file was rebuilt
-- from how the code calls Supabase, then checked against the live project with read-only REST
-- selects (2026-10-30): both tables exist with the columns below. Column types, constraints, RLS
-- policies and function bodies could NOT be read with the publishable key — compare against the
-- live database (Table editor / `pg_dump --schema-only`) before running anything here.
-- Every statement is idempotent (`if not exists` / `create or replace`).

-- Weekly ticket data. Week 0 holds league config (roster, abstain, chat link).
create table if not exists public.holm_parlay_weeks (
  season     int         not null,
  week       int         not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (season, week)
);

-- One saved pick per manager per week. api/pick.js upserts with on_conflict=season,week,who.
-- A saved pick is NOT a placed wager.
create table if not exists public.holm_parlay_picks (
  season     int         not null,
  week       int         not null,
  who        text        not null,
  source     text        not null default 'web',   -- 'web' | 'whatsapp'
  leg        jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (season, week, who)
);

alter table public.holm_parlay_weeks enable row level security;
alter table public.holm_parlay_picks enable row level security;

-- The browser and api/pick.js use the publishable (anon) key.
do $$ begin
  create policy holm_weeks_read on public.holm_parlay_weeks for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy holm_picks_read on public.holm_parlay_picks for select to anon using (true);
exception when duplicate_object then null; end $$;
-- api/pick.js inserts/updates picks directly with the anon key (no auth today — see README).
do $$ begin
  create policy holm_picks_write on public.holm_parlay_picks for insert to anon with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy holm_picks_update on public.holm_parlay_picks for update to anon using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Called by api/pick.js when 11 valid picks are in. Must never overwrite a locked week.
-- The live function already exists; `create or replace` will REPLACE it. Run this block only on a
-- fresh project, or after confirming the live body matches.
create or replace function public.holm_parlay_upsert_week_open(p_season int, p_week int, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into holm_parlay_weeks (season, week, data, updated_at)
  values (p_season, p_week, p_data, now())
  on conflict (season, week) do update
    set data = excluded.data, updated_at = now()
    where holm_parlay_weeks.data->'locked' is null;
end;
$$;
grant execute on function public.holm_parlay_upsert_week_open(int, int, jsonb) to anon;

-- Commissioner RPCs called from the Commissioner page. Their bodies live only in the live database
-- and could not be read; signatures below are inferred from app.js calls. Do not recreate them from
-- this file — export them from the live project instead.
--   holm_parlay_check_pass(p_pass text) returns boolean
--   holm_parlay_save_week(p_pass text, p_season int, p_week int, p_data jsonb)
--   holm_parlay_delete_week(p_pass text, p_season int, p_week int)
