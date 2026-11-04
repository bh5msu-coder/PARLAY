-- 003: Commissioner passphrase hardening. Touches only holm_parlay_* / holm_* objects.
--
-- Before: the passphrase sat in plaintext in holm_parlay_admin and holm_parlay_check_pass (callable by anon)
-- answered true/false instantly with no limit, so it could be guessed as fast as the API allowed.
-- After:
--   * the passphrase is checked against a bcrypt hash (pgcrypto, already installed in `extensions`);
--   * every wrong guess costs ~0.75s and is logged by caller IP;
--   * 10 wrong guesses from one IP in 15 minutes locks that IP out for the rest of the window,
--     and 200 wrong guesses league-wide in 15 minutes locks everyone out (stops IP rotation);
--   * every passphrase-gated function goes through the same check.
-- Callers do not change: same function names, arguments and return types.
--
-- Run once in the Supabase SQL editor (or apply_migration). Safe to re-run.

begin;

create table if not exists public.holm_parlay_auth_fails (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists holm_parlay_auth_fails_ip_at on public.holm_parlay_auth_fails (ip, at);
create index if not exists holm_parlay_auth_fails_at on public.holm_parlay_auth_fails (at);
alter table public.holm_parlay_auth_fails enable row level security;  -- no policies: definer functions only
revoke all on table public.holm_parlay_auth_fails from anon, authenticated;

alter table public.holm_parlay_admin add column if not exists pass_hash text;
alter table public.holm_parlay_admin alter column passphrase drop not null;  -- set_pass clears the plaintext copy
update public.holm_parlay_admin
   set pass_hash = extensions.crypt(passphrase, extensions.gen_salt('bf', 10))
 where pass_hash is null and passphrase is not null and passphrase <> '';

-- First hop of X-Forwarded-For as PostgREST passes it in; 'unknown' when absent (SQL editor, cron).
create or replace function public.holm_parlay_client_ip()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
$$;

create or replace function public.holm_parlay_check_pass(p_pass text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_ip text := public.holm_parlay_client_ip();
  v_ok boolean;
begin
  if (select count(*) from public.holm_parlay_auth_fails where ip = v_ip and at > now() - interval '15 minutes') >= 10
     or (select count(*) from public.holm_parlay_auth_fails where at > now() - interval '15 minutes') >= 200 then
    perform pg_sleep(0.75);
    return false;
  end if;
  select exists (
    select 1 from public.holm_parlay_admin a
     where a.pass_hash is not null
       and a.pass_hash = extensions.crypt(coalesce(p_pass, ''), a.pass_hash)
  ) into v_ok;
  if not v_ok then
    -- Note: when a caller raises after this returns false, the insert rolls back with it, but the
    -- delay still applies. The login screen calls this function directly, so its misses are logged.
    insert into public.holm_parlay_auth_fails (ip) values (v_ip);
    delete from public.holm_parlay_auth_fails where at < now() - interval '1 day';
    perform pg_sleep(0.75);
  end if;
  return v_ok;
end;
$$;

-- Change the passphrase from the SQL editor or the app: select holm_parlay_set_pass('old', 'new');
create or replace function public.holm_parlay_set_pass(p_old text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(length(p_new), 0) < 8 then raise exception 'New passphrase needs at least 8 characters'; end if;
  if not public.holm_parlay_check_pass(p_old) then raise exception 'wrong passphrase' using errcode = '28000'; end if;
  update public.holm_parlay_admin set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), passphrase = null;
  return true;
end;
$$;

-- The two functions that compared the plaintext column directly now use the shared check.
create or replace function public.holm_parlay_save_week(p_pass text, p_season integer, p_week integer, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.holm_parlay_check_pass(p_pass) then
    raise exception 'bad passphrase' using errcode = '28000';
  end if;
  insert into public.holm_parlay_weeks (season, week, data, updated_at)
  values (p_season, p_week, p_data, now())
  on conflict (season, week) do update set data = excluded.data, updated_at = now();
end;
$$;

create or replace function public.holm_parlay_delete_week(p_pass text, p_season integer, p_week integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.holm_parlay_check_pass(p_pass) then return; end if;  -- same silent no-op as before
  delete from public.holm_parlay_weeks where season = p_season and week = p_week and week > 0;
end;
$$;

-- Helper is internal; the gated functions stay callable as before.
revoke execute on function public.holm_parlay_client_ip() from public, anon, authenticated;

commit;

-- Optional, after you have logged in once with the new check: drop the plaintext copy.
--   update public.holm_parlay_admin set passphrase = null;
