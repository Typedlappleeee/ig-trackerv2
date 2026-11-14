-- Genjutsu : rangement des modèles PARTAGÉ dans l'espace (agence ou perso).
-- Avant, les mini-dossiers (« Kenza · 5 », « Zoe · 19 ») et les modèles masquées étaient gardés
-- sur le navigateur de chacun : deux collègues de la même agence ne voyaient pas le même rangement.
-- Une ligne par modèle et par espace : glisser une modèle ne touche que sa ligne (pas d'écrasement
-- entre deux personnes qui rangent en même temps).
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable. Utilise public.sf_in_space (20261015_genjutsu.sql).

create table if not exists public.genjutsu_model_layout (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,     -- null = espace perso
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space text generated always as (coalesce(org_id::text, 'u:' || user_id::text)) stored,
  model_id text not null,                  -- id de l'Element Higgsfield
  grp text,                                -- mini-dossier (null = rangement automatique par le nom)
  hidden boolean not null default false,   -- masquée dans ScaleFlow
  updated_at timestamptz not null default now()
);
create unique index if not exists genjutsu_model_layout_space_model on public.genjutsu_model_layout (space, model_id);
create index if not exists genjutsu_model_layout_org on public.genjutsu_model_layout (org_id);

alter table public.genjutsu_model_layout enable row level security;
drop policy if exists genjutsu_model_layout_rw on public.genjutsu_model_layout;
create policy genjutsu_model_layout_rw on public.genjutsu_model_layout for all
  using ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)))
  with check ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)));
grant select, insert, update, delete on public.genjutsu_model_layout to authenticated;
