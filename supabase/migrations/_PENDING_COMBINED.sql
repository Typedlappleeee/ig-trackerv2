-- ════════════════════════════════════════════════════════════════════════════
-- ScaleFlow — migrations en attente (Supabase → SQL Editor → Run)
-- Idempotent + ré-exécutable. Crée phone_power_watch si absente.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Notifications externes (Telegram / Discord / email)
alter table if exists public.app_config
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;
alter table if exists public.org_config
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

-- 2) Watchdog anti-coût (téléphones démarrés par l'automation) + lien webhook
create table if not exists public.phone_power_watch (
  geelark_id text primary key,
  org_id     uuid,
  user_id    uuid,
  reason     text,
  task_id    text,
  stop_at    timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.phone_power_watch
  add column if not exists task_id text;
create index if not exists idx_ppw_stop_at          on public.phone_power_watch (stop_at);
create index if not exists phone_power_watch_task_id_idx on public.phone_power_watch (task_id);

alter table public.phone_power_watch enable row level security;

-- Politiques RLS : le client peut gérer les lignes de ses téléphones (solo ou org).
drop policy if exists "ppw_select" on public.phone_power_watch;
drop policy if exists "ppw_insert" on public.phone_power_watch;
drop policy if exists "ppw_update" on public.phone_power_watch;
drop policy if exists "ppw_delete" on public.phone_power_watch;

create policy "ppw_select" on public.phone_power_watch for select using (
  auth.uid() = user_id
  or (org_id is not null and exists (
    select 1 from public.organization_members m
    where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()))
);
create policy "ppw_insert" on public.phone_power_watch for insert with check (
  auth.uid() = user_id
  or (org_id is not null and exists (
    select 1 from public.organization_members m
    where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()))
);
create policy "ppw_update" on public.phone_power_watch for update using (
  auth.uid() = user_id
  or (org_id is not null and exists (
    select 1 from public.organization_members m
    where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()))
);
create policy "ppw_delete" on public.phone_power_watch for delete using (
  auth.uid() = user_id
  or (org_id is not null and exists (
    select 1 from public.organization_members m
    where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()))
);

-- 3) Plateforme des posts programmés (instagram | tiktok)
alter table if exists public.scheduled_posts
  add column if not exists platform text not null default 'instagram';

-- 4) Plateforme des tâches automatiques (instagram | tiktok)
alter table if exists public.recurring_tasks
  add column if not exists platform text not null default 'instagram';

-- ✅ Terminé. Redéploie aussi l'edge function :
--    supabase functions deploy run-scheduled-posts --no-verify-jwt
