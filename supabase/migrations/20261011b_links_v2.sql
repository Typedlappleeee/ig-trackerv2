-- Liens v2 (façon GetMySocial) : groupes, liens « landing » (page) et « direct » (OF / MYM…),
-- notes, remplacement des boutons par compte, et suivi visite → clic (taux de clic).
-- À coller dans Supabase → SQL Editor → Run, APRÈS 20261011_links.sql. Ré-exécutable.

create table if not exists public.link_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  org_id uuid,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.link_groups enable row level security;
drop policy if exists link_groups_rw on public.link_groups;
create policy link_groups_rw on public.link_groups for all
  using (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = link_groups.org_id and m.user_id = auth.uid())))
  with check (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = link_groups.org_id and m.user_id = auth.uid())));

alter table public.tracked_links add column if not exists kind text not null default 'landing';   -- landing | direct
alter table public.tracked_links add column if not exists group_id uuid references public.link_groups(id) on delete set null;
alter table public.tracked_links add column if not exists notes text not null default '';
alter table public.tracked_links add column if not exists overrides jsonb not null default '{}'::jsonb;  -- { "0": "https://…" } : bouton n → autre URL pour CE compte

-- Visite → clic : chaque affichage de page reçoit un visit_id, repris par le clic sur un bouton.
alter table public.link_clicks add column if not exists visit_id uuid;
create index if not exists link_clicks_ts on public.link_clicks (created_at desc);

-- Design complet de la page (fond dégradé / couleur / image, effets, police, badge, boutons…).
alter table public.link_pages add column if not exists design jsonb not null default '{}'::jsonb;
