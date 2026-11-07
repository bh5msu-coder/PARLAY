-- 008: Writes to holm_tickets + holm_legs (step 7 of OUTPUTS/holm-parlay/week-data-audit.md).
-- While the site still reads data/bets.json + holm_parlay_weeks, every save there is mirrored here, so
-- the database copy stays current. Each call replaces one week (its ticket row and all its legs) in one
-- transaction. Row shapes are lib/week-rows.mjs weekToRows(); season and week always come from the
-- arguments, never from the rows. Safe to re-run.
--
--   holm_week_put_auto(season, week, ticket, legs)          server key only (/api/pick auto-commit).
--                                                           Refuses a placed, settled or locked week,
--                                                           like holm_parlay_upsert_week_open (006).
--   holm_week_put_commish(pass, season, week, ticket, legs) commissioner passphrase (Week editor).
--   holm_week_delete_commish(pass, season, week)            commissioner passphrase; never week 0.

begin;

-- Internal: replace one week. Not callable by anyone but the owner.
create or replace function public.holm_week_put_rows(p_season int, p_week int, p_ticket jsonb, p_legs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  t jsonb := coalesce(p_ticket, '{}'::jsonb) || jsonb_build_object('season', p_season, 'week', p_week);
  l jsonb := coalesce((select jsonb_agg(x || jsonb_build_object('season', p_season, 'week', p_week)) from jsonb_array_elements(coalesce(p_legs, '[]'::jsonb)) x), '[]'::jsonb);
  n int;
begin
  if p_week is null or p_week <= 0 then raise exception 'A week must be a positive number'; end if;
  insert into holm_tickets (season, week, state, evidence, stake, odds, to_pay, book, placed_by, payer, payers, payer_note, results, dates, note, groups, overrides, locked, submissions, extra)
    select season, week, state, coalesce(evidence, ''), stake, odds, to_pay, book, placed_by, payer, payers, payer_note, results, dates, note, groups, overrides, locked, submissions, coalesce(extra, '{}'::jsonb)
    from jsonb_populate_record(null::holm_tickets, t)
  on conflict (season, week) do update set state = excluded.state, evidence = excluded.evidence, stake = excluded.stake, odds = excluded.odds,
    to_pay = excluded.to_pay, book = excluded.book, placed_by = excluded.placed_by, payer = excluded.payer, payers = excluded.payers,
    payer_note = excluded.payer_note, results = excluded.results, dates = excluded.dates, note = excluded.note, groups = excluded.groups,
    overrides = excluded.overrides, locked = excluded.locked, submissions = excluded.submissions, extra = excluded.extra, updated_at = now();
  delete from holm_legs g where g.season = p_season and g.week = p_week
    and not exists (select 1 from jsonb_array_elements(l) x where x->>'leg_id' = g.leg_id);
  insert into holm_legs (season, week, leg_id, pos, who, label, type, game, team, side, line, player, stat, odds, sgp_group, status, confidence, source, detail, game_date, period, note, extra)
    select season, week, leg_id, coalesce(pos, 0), who, label, type, coalesce(game, '{}'), team, side, line, player, stat, odds, sgp_group, coalesce(status, 'open'),
           confidence, coalesce(source, '{}'::jsonb), detail, game_date, period, note, coalesce(extra, '{}'::jsonb)
    from jsonb_populate_recordset(null::holm_legs, l)
  on conflict (season, week, leg_id) do update set pos = excluded.pos, who = excluded.who, label = excluded.label, type = excluded.type, game = excluded.game,
    team = excluded.team, side = excluded.side, line = excluded.line, player = excluded.player, stat = excluded.stat, odds = excluded.odds,
    sgp_group = excluded.sgp_group, status = excluded.status, confidence = excluded.confidence, source = excluded.source, detail = excluded.detail,
    game_date = excluded.game_date, period = excluded.period, note = excluded.note, extra = excluded.extra, synced_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.holm_week_put_rows(int, int, jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.holm_week_put_auto(p_season int, p_week int, p_ticket jsonb, p_legs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare cur holm_tickets;
begin
  select * into cur from holm_tickets where season = p_season and week = p_week;
  if found and cur.locked is not null and cur.locked <> 'null'::jsonb then raise exception 'Week % is locked', p_week; end if;
  if found and coalesce(cur.state, '') in ('placed', 'settled') then raise exception 'Week % ticket is %', p_week, cur.state; end if;
  return holm_week_put_rows(p_season, p_week, p_ticket, p_legs);
end $$;
revoke all on function public.holm_week_put_auto(int, int, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.holm_week_put_auto(int, int, jsonb, jsonb) to service_role;

create or replace function public.holm_week_put_commish(p_pass text, p_season int, p_week int, p_ticket jsonb, p_legs jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.holm_parlay_check_pass(p_pass) then raise exception 'bad passphrase' using errcode = '28000'; end if;
  return holm_week_put_rows(p_season, p_week, p_ticket, p_legs);
end $$;
grant execute on function public.holm_week_put_commish(text, int, int, jsonb, jsonb) to anon, authenticated, service_role;

create or replace function public.holm_week_delete_commish(p_pass text, p_season int, p_week int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.holm_parlay_check_pass(p_pass) then raise exception 'bad passphrase' using errcode = '28000'; end if;
  if p_week is null or p_week <= 0 then raise exception 'A week must be a positive number'; end if;
  delete from holm_legs where season = p_season and week = p_week;
  delete from holm_tickets where season = p_season and week = p_week;
end $$;
grant execute on function public.holm_week_delete_commish(text, int, int) to anon, authenticated, service_role;

commit;
