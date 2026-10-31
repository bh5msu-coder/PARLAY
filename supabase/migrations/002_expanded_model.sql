-- Holm Parlay — expanded data model (schemaVersion 2). Run AFTER supabase/picks.sql.
-- Idempotent: safe to run more than once. Review before running; nothing here has been applied.
--
-- Separation that the schema enforces:
--   * pick saved            → holm_parlay_picks (existing)
--   * contribution recorded → holm_payments
--   * ticket placed         → holm_tickets.state in ('placed','settled') plus holm_tickets.evidence
--   * data/bets.json is the only record that adds or grades a week. holm_legs.status may only be
--     written by a one-way sync from that file (synced_from is pinned to 'data/bets.json').
--   * parlay-history.json is never written here: no table or function accepts history data.
--
-- Writes other than import records go through security-definer functions that require the
-- commissioner passphrase (checked with the existing holm_parlay_check_pass).

create table if not exists public.holm_players (
  id         text primary key,                  -- e.g. 'brad' (league-lore.json people[].id)
  name       text not null unique,
  nick       text,
  aliases    text[] not null default '{}',
  parlay     boolean not null default true,     -- submits a weekly pick
  abstain    boolean not null default false,    -- sits the ticket
  updated_at timestamptz not null default now()
);

create table if not exists public.holm_tickets (
  season     int  not null,
  week       int  not null,
  state      text not null default 'proposed' check (state in ('proposed', 'placed', 'settled')),
  evidence   text not null default '',          -- how we know (slip import, slip odds recorded, …)
  book       text,
  odds       int,
  stake      numeric(10,2),
  to_pay     numeric(12,2),                     -- slip's potential payout: hypothetical until a payout is recorded
  placed_by  text,
  updated_at timestamptz not null default now(),
  primary key (season, week),
  constraint placed_needs_evidence check (state = 'proposed' or length(trim(evidence)) > 0)
);

create table if not exists public.holm_legs (
  season      int  not null,
  week        int  not null,
  leg_id      text not null,
  who         text not null,
  label       text not null,
  type        text not null check (type in ('ml', 'spread', 'total', 'player', 'tbd')),
  game        text[] not null default '{}',
  team        text,
  side        text check (side is null or side in ('over', 'under')),
  line        numeric,
  player      text,
  stat        text,
  odds        int,
  sgp_group   text,
  status      text not null default 'open' check (status in ('open', 'won', 'lost', 'unknown', 'void', 'push')),
  confidence  text check (confidence is null or confidence in ('espn-final', 'espn-consensus-line', 'inferred-margin')),
  source      jsonb not null default '{}'::jsonb,  -- {kind, ref, author, messageAt, lineNo, rawHash}
  synced_from text not null default 'data/bets.json' check (synced_from = 'data/bets.json'),
  synced_at   timestamptz not null default now(),
  primary key (season, week, leg_id)
);

-- Contributions: money a manager actually put in. Recording one does not mean the ticket was placed.
create table if not exists public.holm_payments (
  id          bigint generated always as identity primary key,
  season      int  not null,
  week        int  not null,
  who         text not null,
  amount      numeric(10,2) not null check (amount > 0),
  recorded_at timestamptz not null default now(),
  source      jsonb not null default '{"kind":"commissioner"}'::jsonb,
  note        text
);

-- Payouts: money a sportsbook actually paid. A slip's to_pay is NOT a payout.
create table if not exists public.holm_payouts (
  id          bigint generated always as identity primary key,
  season      int  not null,
  week        int  not null,
  amount      numeric(12,2) not null check (amount >= 0),
  recorded_at timestamptz not null default now(),
  source      jsonb not null default '{"kind":"commissioner"}'::jsonb,
  note        text
);

-- Every imported record and what happened to it. One row per (kind, raw_hash, season, week).
create table if not exists public.holm_import_records (
  id         bigint generated always as identity primary key,
  season     int  not null,
  week       int  not null,
  kind       text not null check (kind in ('whatsapp', 'slip', 'web')),
  raw_hash   text not null,
  author     text,
  message_at text,                               -- as written in the export (phone local time)
  line_no    int,
  who        text,
  outcome    text not null check (outcome in ('saved', 'duplicate', 'conflict', 'error', 'unmatched', 'matched')),
  reason     text,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (kind, raw_hash, season, week)
);

create index if not exists holm_import_records_week on public.holm_import_records (season, week);
create index if not exists holm_payments_week on public.holm_payments (season, week);

alter table public.holm_players        enable row level security;
alter table public.holm_tickets        enable row level security;
alter table public.holm_legs           enable row level security;
alter table public.holm_payments       enable row level security;
alter table public.holm_payouts        enable row level security;
alter table public.holm_import_records enable row level security;

do $$ begin create policy holm_players_read  on public.holm_players        for select to anon using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy holm_tickets_read  on public.holm_tickets        for select to anon using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy holm_legs_read     on public.holm_legs           for select to anon using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy holm_payments_read on public.holm_payments       for select to anon using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy holm_payouts_read  on public.holm_payouts        for select to anon using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy holm_imports_read  on public.holm_import_records for select to anon using (true); exception when duplicate_object then null; end $$;
-- api/pick.js logs imports with the publishable key (no auth exists yet — see README).
do $$ begin create policy holm_imports_insert on public.holm_import_records for insert to anon with check (true); exception when duplicate_object then null; end $$;

-- Commissioner-only writes ---------------------------------------------------------------------

create or replace function public.holm_parlay_set_ticket(p_pass text, p_season int, p_week int, p_state text, p_evidence text,
                                                         p_book text default null, p_odds int default null, p_stake numeric default null,
                                                         p_to_pay numeric default null, p_placed_by text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not holm_parlay_check_pass(p_pass) then raise exception 'wrong passphrase'; end if;
  insert into holm_tickets (season, week, state, evidence, book, odds, stake, to_pay, placed_by, updated_at)
  values (p_season, p_week, p_state, coalesce(p_evidence, ''), p_book, p_odds, p_stake, p_to_pay, p_placed_by, now())
  on conflict (season, week) do update set state = excluded.state, evidence = excluded.evidence, book = excluded.book,
    odds = excluded.odds, stake = excluded.stake, to_pay = excluded.to_pay, placed_by = excluded.placed_by, updated_at = now();
end; $$;

create or replace function public.holm_parlay_record_payment(p_pass text, p_season int, p_week int, p_who text, p_amount numeric, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if not holm_parlay_check_pass(p_pass) then raise exception 'wrong passphrase'; end if;
  insert into holm_payments (season, week, who, amount, note) values (p_season, p_week, p_who, p_amount, p_note) returning id into new_id;
  return new_id;
end; $$;

create or replace function public.holm_parlay_record_payout(p_pass text, p_season int, p_week int, p_amount numeric, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if not holm_parlay_check_pass(p_pass) then raise exception 'wrong passphrase'; end if;
  insert into holm_payouts (season, week, amount, note) values (p_season, p_week, p_amount, p_note) returning id into new_id;
  return new_id;
end; $$;

-- One-way sync of a week's legs FROM data/bets.json. Replaces that week's rows. p_legs is the file's
-- legs array with a `status` per leg computed by lib/model.mjs legStatus().
create or replace function public.holm_parlay_sync_legs(p_pass text, p_season int, p_week int, p_legs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not holm_parlay_check_pass(p_pass) then raise exception 'wrong passphrase'; end if;
  delete from holm_legs where season = p_season and week = p_week;
  insert into holm_legs (season, week, leg_id, who, label, type, game, team, side, line, player, stat, odds, sgp_group, status, confidence, source)
  select p_season, p_week, l->>'id', l->>'who', l->>'label', l->>'type',
         coalesce(array(select jsonb_array_elements_text(l->'game')), '{}'),
         nullif(l->>'team', ''), nullif(l->>'side', ''), nullif(l->>'line', '')::numeric, nullif(l->>'player', ''),
         nullif(l->>'stat', ''), nullif(l->>'odds', '')::int, nullif(l->>'group', ''),
         coalesce(l->>'status', 'open'), nullif(l->>'confidence', ''), coalesce(l->'source', '{"kind":"bets.json"}'::jsonb)
  from jsonb_array_elements(p_legs) as l;
  get diagnostics n = row_count;
  return n;
end; $$;

grant execute on function public.holm_parlay_set_ticket(text, int, int, text, text, text, int, numeric, numeric, text) to anon;
grant execute on function public.holm_parlay_record_payment(text, int, int, text, numeric, text) to anon;
grant execute on function public.holm_parlay_record_payout(text, int, int, numeric, text) to anon;
grant execute on function public.holm_parlay_sync_legs(text, int, int, jsonb) to anon;
