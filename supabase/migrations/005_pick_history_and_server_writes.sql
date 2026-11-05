-- 005: Every saved pick is kept (history), and only the site's server can write picks.
-- Touches only holm_parlay_* / holm_* objects in the shared project.
--
-- Run ONLY after GET https://holm-parlay.vercel.app/api/pick?health=1 returns
-- {"serviceKey":"ok","writesWith":"server key"}. Before that, the server still writes with the
-- public key, and this migration would stop picks from saving.
--
-- Before: anyone with the public key could insert or overwrite any row in holm_parlay_picks directly,
-- skipping the API's kickoff lock and validation, and an edited pick replaced the old one with no trace.
-- After:  the browser can still read picks; writes go through /api/pick (service role); every insert and
-- update is copied to holm_parlay_pick_history, which only the service role can read.

begin;

create table if not exists public.holm_parlay_pick_history (
  id bigserial primary key,
  season integer not null,
  week integer not null,
  who text not null,
  source text,
  leg jsonb,
  op text not null,               -- 'insert' | 'update'
  saved_at timestamptz not null default now()
);
create index if not exists holm_parlay_pick_history_week on public.holm_parlay_pick_history (season, week, who, saved_at desc);
alter table public.holm_parlay_pick_history enable row level security;
revoke all on public.holm_parlay_pick_history from anon, authenticated;
grant select, insert on public.holm_parlay_pick_history to service_role;
grant usage on sequence public.holm_parlay_pick_history_id_seq to service_role;

create or replace function public.holm_parlay_pick_history_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.leg is not distinct from old.leg and new.source is not distinct from old.source then
    return new; -- a no-op re-save is not a new version
  end if;
  insert into public.holm_parlay_pick_history (season, week, who, source, leg, op)
  values (new.season, new.week, new.who, new.source, new.leg, lower(tg_op));
  return new;
end $$;
revoke all on function public.holm_parlay_pick_history_log() from public, anon, authenticated;

drop trigger if exists holm_parlay_pick_history on public.holm_parlay_picks;
create trigger holm_parlay_pick_history after insert or update on public.holm_parlay_picks
  for each row execute function public.holm_parlay_pick_history_log();

-- seed history with what is stored today, so nothing saved before this migration is missing
insert into public.holm_parlay_pick_history (season, week, who, source, leg, op, saved_at)
select season, week, who, source, leg, 'insert', coalesce(updated_at, now()) from public.holm_parlay_picks p
where not exists (select 1 from public.holm_parlay_pick_history h where h.season = p.season and h.week = p.week and h.who = p.who);

-- close direct writes from the browser; reads stay public
drop policy if exists holm_parlay_picks_insert on public.holm_parlay_picks;
drop policy if exists holm_parlay_picks_update on public.holm_parlay_picks;
revoke insert, update, delete, truncate on public.holm_parlay_picks from anon, authenticated;

drop policy if exists holm_imports_insert on public.holm_import_records;
revoke insert, update, delete, truncate on public.holm_import_records from anon, authenticated;

commit;
