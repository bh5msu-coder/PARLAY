-- 007: holm_tickets + holm_legs can hold a whole week (step 4 of OUTPUTS/holm-parlay/week-data-audit.md).
-- Touches only holm_tickets, holm_legs and the new holm_week_audit. Both tables were empty and unread
-- when this was written; nothing on the site reads them yet. lib/week-rows.mjs maps a week to these
-- rows and back.
--
--   holm_tickets  one row per (season, week): ticket state and evidence, money, payers, results state,
--                 groups, overrides, lock, submissions; any other week key goes to `extra`.
--   holm_legs     one row per leg, in `pos` order; any other leg key goes to `extra`.
--   holm_week_audit  every insert, update and delete on both, with the old and new row.
--
-- Writes: only the service role (the site's server key) and the database owner. The browser keeps
-- read access through the existing RLS policies. Safe to re-run.

begin;

-- Tickets ----------------------------------------------------------------------------------------
alter table public.holm_tickets alter column state drop not null;   -- null: no ticket record yet
alter table public.holm_tickets alter column state drop default;
alter table public.holm_tickets add column if not exists payer       text;
alter table public.holm_tickets add column if not exists payers      text[];
alter table public.holm_tickets add column if not exists payer_note  text;
alter table public.holm_tickets add column if not exists results     text;   -- recorded | live | unknown | pending
alter table public.holm_tickets add column if not exists dates       text;
alter table public.holm_tickets add column if not exists note        text;
alter table public.holm_tickets add column if not exists groups      jsonb;
alter table public.holm_tickets add column if not exists overrides   jsonb;
alter table public.holm_tickets add column if not exists locked      jsonb;
alter table public.holm_tickets add column if not exists submissions jsonb;
alter table public.holm_tickets add column if not exists extra       jsonb not null default '{}'::jsonb;
alter table public.holm_tickets alter column odds type numeric using odds::numeric;  -- slip odds can exceed int range only in theory; keeps decimals

-- Legs -------------------------------------------------------------------------------------------
alter table public.holm_legs drop constraint if exists holm_legs_synced_from_check;  -- legs no longer come only from data/bets.json
alter table public.holm_legs drop column if exists synced_from;
alter table public.holm_legs add column if not exists pos       int  not null default 0;
alter table public.holm_legs add column if not exists detail    text;
alter table public.holm_legs add column if not exists game_date text;   -- as written (ISO or partial)
alter table public.holm_legs add column if not exists period    text;
alter table public.holm_legs add column if not exists note      text;
alter table public.holm_legs add column if not exists extra     jsonb not null default '{}'::jsonb;
alter table public.holm_legs alter column odds type numeric using odds::numeric;
create index if not exists holm_legs_week on public.holm_legs (season, week, pos);

-- Writes: server key only ------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.holm_tickets, public.holm_legs from anon, authenticated;
grant select, insert, update, delete on public.holm_tickets, public.holm_legs to service_role;

-- Audit ------------------------------------------------------------------------------------------
create table if not exists public.holm_week_audit (
  id      bigserial primary key,
  tbl     text not null,
  season  int  not null,
  week    int  not null,
  leg_id  text,
  op      text not null,                  -- insert | update | delete
  old_row jsonb,
  new_row jsonb,
  by_role text not null default current_user,
  at      timestamptz not null default now()
);
create index if not exists holm_week_audit_week on public.holm_week_audit (season, week, at desc);
alter table public.holm_week_audit enable row level security;   -- no policy: server key and owner only
revoke all on public.holm_week_audit from anon, authenticated;
grant select on public.holm_week_audit to service_role;

create or replace function public.holm_week_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - 'updated_at' - 'synced_at' = to_jsonb(old) - 'updated_at' - 'synced_at' then
    return new;  -- a re-save with nothing changed is not a new version
  end if;
  insert into public.holm_week_audit (tbl, season, week, leg_id, op, old_row, new_row, by_role)
  values (tg_table_name, (r->>'season')::int, (r->>'week')::int, r->>'leg_id', lower(tg_op),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          session_user);
  return coalesce(new, old);
end $$;
revoke all on function public.holm_week_audit_log() from public, anon, authenticated;

drop trigger if exists holm_tickets_audit on public.holm_tickets;
create trigger holm_tickets_audit after insert or update or delete on public.holm_tickets
  for each row execute function public.holm_week_audit_log();
drop trigger if exists holm_legs_audit on public.holm_legs;
create trigger holm_legs_audit after insert or update or delete on public.holm_legs
  for each row execute function public.holm_week_audit_log();

-- The passphrase sync from 002 wrote synced_from, which no longer exists; it is replaced in a later
-- step by server-side writes, so drop it now rather than leave a broken function callable.
drop function if exists public.holm_parlay_sync_legs(text, int, int, jsonb);

commit;
