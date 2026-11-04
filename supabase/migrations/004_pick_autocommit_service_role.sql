-- 004: Close the open write on holm_parlay_upsert_week_open.
--
-- Before: anyone holding the public (publishable) key could call this function directly and overwrite
-- the current, unlocked week's ticket with any JSON. Only /api/pick is meant to call it.
-- After: only the service role can execute it. /api/pick uses SUPABASE_SERVICE_ROLE_KEY for this one call.
--
-- ORDER MATTERS: add SUPABASE_SERVICE_ROLE_KEY to the Vercel project (Production + Preview) and deploy
-- the matching pages/api/pick.js first. If this runs before that, auto-commit at 11/11 stops working
-- (picks still save; the commissioner can still paste the ticket from Admin).

begin;
revoke execute on function public.holm_parlay_upsert_week_open(integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.holm_parlay_upsert_week_open(integer, integer, jsonb) to service_role;
commit;
