-- 012: Web Push subscriptions and the alert cursor.
--
-- Apply this yourself in the Supabase SQL editor (project bake-pool). The app does not run it.
-- It does not read or write holm_parlay_weeks. That table stays a frozen archive.
--
-- holm_push_subscriptions: one row per browser (the push endpoint). The anon key cannot read it.
--   The site's server (SUPABASE_SERVICE_ROLE_KEY) inserts from /api/push and reads when sending.
-- holm_push_state: one row per season week. snapshot remembers which legs already notified,
--   so a deploy mid-season does not replay old hits. Only the service role can touch it.
--
-- Undo: drop table public.holm_push_subscriptions; drop table public.holm_push_state;

begin;

create table if not exists public.holm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  who text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.holm_push_subscriptions enable row level security;
revoke all on public.holm_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.holm_push_subscriptions to service_role;

create table if not exists public.holm_push_state (
  season integer not null,
  week integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (season, week)
);

alter table public.holm_push_state enable row level security;
revoke all on public.holm_push_state from public, anon, authenticated;
grant select, insert, update, delete on public.holm_push_state to service_role;

commit;
