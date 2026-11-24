-- Genjutsu : liste des rendus PARTAGÉE dans l'espace (agence ou perso), sur le serveur.
-- (Nom genjutsu_renders : la table genjutsu_jobs existe déjà pour l'ancien Genjutsu IA et la programmation serveur.)
-- Avant, chaque navigateur gardait sa propre liste (stockage du navigateur, plein → derniers rendus perdus) :
-- un collègue ne voyait pas les rendus lancés par un autre. Une ligne par rendu ; seul le navigateur qui l'a lancé
-- le fait avancer (champ data.by), les autres le voient se mettre à jour.
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable. Utilise public.sf_in_space (20261015_genjutsu.sql).

create table if not exists public.genjutsu_renders (
  id uuid primary key,
  org_id uuid references public.organizations(id) on delete cascade,     -- null = espace perso
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space text generated always as (coalesce(org_id::text, 'u:' || user_id::text)) stored,
  data jsonb not null,                      -- le rendu (statut, modèle, source, résultat, spoof…)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists genjutsu_renders_space_created on public.genjutsu_renders (space, created_at desc);
create index if not exists genjutsu_renders_org on public.genjutsu_renders (org_id);

alter table public.genjutsu_renders enable row level security;
drop policy if exists genjutsu_renders_rw on public.genjutsu_renders;
create policy genjutsu_renders_rw on public.genjutsu_renders for all
  using ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)))
  with check ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)));
grant select, insert, update, delete on public.genjutsu_renders to authenticated;
