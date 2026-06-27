-- ════════════════════════════════════════════════════════════════════════════
-- ScaleFlow — migrations en attente (à coller dans Supabase → SQL Editor → Run)
-- Toutes idempotentes (IF NOT EXISTS) : sûres et ré-exécutables sans risque.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Notifications externes (Telegram / Discord / email)
alter table if exists public.app_config
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;
alter table if exists public.org_config
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

-- 2) Webhook ↔ watchdog : relie une ligne du watchdog à sa tâche RPA GeeLark
--    pour éteindre le téléphone plus vite (le +5 min reste le filet de sécurité).
alter table if exists public.phone_power_watch
  add column if not exists task_id text;
create index if not exists phone_power_watch_task_id_idx
  on public.phone_power_watch (task_id);

-- 3) Plateforme cible des posts programmés (instagram par défaut, ou tiktok)
alter table if exists public.scheduled_posts
  add column if not exists platform text not null default 'instagram';

-- 4) Plateforme cible des tâches automatiques (instagram par défaut, ou tiktok)
alter table if exists public.recurring_tasks
  add column if not exists platform text not null default 'instagram';

-- ✅ Terminé. Pense aussi à redéployer l'edge function :
--    supabase functions deploy run-scheduled-posts --no-verify-jwt
