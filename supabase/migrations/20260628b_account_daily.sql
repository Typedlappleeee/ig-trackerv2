-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Dashboard journalier par client : suivi quotidien des comptes ║
-- ╚══════════════════════════════════════════════════════════════╝
-- Remplace l'approche "tracking_reports" par une table par compte/jour.
-- Le serveur synchronise 1×/jour (par lots, à l'heure configurée) :
--   - a posté aujourd'hui ? (gratuit : via l'historique de posting ScaleFlow)
--   - + la vidéo, vues, likes, commentaires (si une clé API Instagram est mise)
-- Le dashboard "Aujourd'hui" lit cette table, scopé par client.

drop table if exists public.tracking_reports;   -- jamais déployé en prod, remplacé ici

create table if not exists public.account_daily (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id)           on delete cascade,
  org_id      uuid references public.organizations(id) on delete cascade,
  phone_id    uuid,
  ig_username text not null,
  va          text,                       -- groupe du téléphone (= "client" / VA)
  day         date not null,              -- jour (Europe/Paris)
  posted      boolean not null default false,
  posted_via  text,                       -- 'scaleflow' | 'instagram' | null
  posted_at   timestamptz,
  reel_url    text,
  reel_thumb  text,
  views       integer,
  likes       integer,
  comments    integer,
  synced_at   timestamptz,                -- null = pas encore traité aujourd'hui
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists account_daily_uniq
  on public.account_daily (coalesce(org_id::text, user_id::text), phone_id, day);
create index if not exists account_daily_owner_day on public.account_daily (user_id, day desc);
create index if not exists account_daily_org_day   on public.account_daily (org_id,  day desc);

alter table public.account_daily enable row level security;
drop policy if exists ad_select on public.account_daily;
create policy ad_select on public.account_daily for select using (
  user_id = auth.uid() or (org_id is not null and public.is_org_member(org_id))
);
-- Les écritures viennent du service_role (cron) qui contourne les RLS.

-- Config (déjà ajoutée par 20260628 si appliqué ; idempotent).
alter table public.app_config add column if not exists tracking_config jsonb default '{}'::jsonb;
alter table public.org_config add column if not exists tracking_config jsonb default '{}'::jsonb;
-- Forme : { enabled, sync_time:"12:00", window_hours, rapidapi_key, rapidapi_url }

notify pgrst, 'reload schema';
