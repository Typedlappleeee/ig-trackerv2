-- Genjutsu : presets de prompt enregistrés par l'équipe, partagés dans l'espace (agence ou perso).
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable. Utilise public.sf_in_space (20261015_genjutsu.sql).
create table if not exists public.genjutsu_prompt_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,     -- null = espace perso
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space text generated always as (coalesce(org_id::text, 'u:' || user_id::text)) stored,
  name text not null check (length(trim(name)) between 1 and 60),
  prompt text not null check (length(prompt) between 1 and 8000),
  updated_at timestamptz not null default now()
);
create unique index if not exists genjutsu_prompt_presets_space_name on public.genjutsu_prompt_presets (space, name);
alter table public.genjutsu_prompt_presets enable row level security;
drop policy if exists genjutsu_prompt_presets_rw on public.genjutsu_prompt_presets;
create policy genjutsu_prompt_presets_rw on public.genjutsu_prompt_presets for all
  using ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)))
  with check ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)));
grant select, insert, update, delete on public.genjutsu_prompt_presets to authenticated;
