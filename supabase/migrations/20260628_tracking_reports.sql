-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Tracking « VA posting » : rapports automatiques 2×/jour       ║
-- ╚══════════════════════════════════════════════════════════════╝
-- Le cron (run-scheduled-posts, toutes les minutes) génère un rapport groupé
-- aux heures configurées : pour chaque compte, a-t-il posté un Reel dans le
-- créneau + vues/likes/commentaires (via une API Instagram type RapidAPI).
-- Le rapport est stocké ici et affiché dans l'app (onglet Rapports).

-- Config par utilisateur / par organisation (clé RapidAPI = secret, lisible
-- seulement par le propriétaire via les RLS de app_config/org_config).
alter table public.app_config add column if not exists tracking_config jsonb default '{}'::jsonb;
alter table public.org_config add column if not exists tracking_config jsonb default '{}'::jsonb;
-- Forme : {
--   enabled: boolean,
--   times: ["09:30","20:00"],            -- heures (fuseau Europe/Paris)
--   window_hours: number,                -- ancienneté max d'un Reel pour compter "posté"
--   rapidapi_key: string,
--   rapidapi_url: "https://….p.rapidapi.com/…?username_or_id={username}"
-- }

create table if not exists public.tracking_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id)         on delete cascade,
  org_id         uuid references public.organizations(id) on delete cascade,
  slot           text not null,                 -- "09:30" (heure FR du rapport)
  label          text not null,                 -- "Matin — ven. 27 juin · 09:30"
  period_start   timestamptz,
  period_end     timestamptz,
  total_accounts integer not null default 0,
  posted         integer not null default 0,
  not_posted     integer not null default 0,
  data           jsonb   not null default '{}'::jsonb,  -- { vas: [...], totals: {...} }
  created_at     timestamptz not null default now()
);

create index if not exists tracking_reports_owner on public.tracking_reports (user_id, created_at desc);
create index if not exists tracking_reports_org   on public.tracking_reports (org_id,  created_at desc);
-- Évite les doublons : un seul rapport par (propriétaire, créneau, jour FR).
create unique index if not exists tracking_reports_uniq
  on public.tracking_reports (coalesce(org_id::text, user_id::text), slot, ((created_at at time zone 'Europe/Paris')::date));

alter table public.tracking_reports enable row level security;
drop policy if exists tr_select on public.tracking_reports;
create policy tr_select on public.tracking_reports for select using (
  user_id = auth.uid() or (org_id is not null and public.is_org_member(org_id))
);
-- Les inserts viennent du service_role (cron) qui contourne les RLS.

notify pgrst, 'reload schema';
