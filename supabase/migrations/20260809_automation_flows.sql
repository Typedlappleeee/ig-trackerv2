-- Automatisations (workshop) : flows créés par les utilisateurs, stockés en base
-- au même format que les flows officiels (steps JSON), joués par le même
-- interpréteur. Visibilité : privé / agence (org) / communauté (partagé à tous).
create table if not exists public.automation_flows (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  org_id      uuid,
  name        text not null,
  description text,
  app         text,
  steps       jsonb not null default '[]'::jsonb,
  inputs      jsonb not null default '[]'::jsonb,
  visibility  text  not null default 'private' check (visibility in ('private','org','community')),
  official    boolean not null default false,
  installs    int   not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists automation_flows_user_idx       on public.automation_flows(user_id);
create index if not exists automation_flows_visibility_idx  on public.automation_flows(visibility);
create index if not exists automation_flows_org_idx         on public.automation_flows(org_id);

alter table public.automation_flows enable row level security;

-- Lecture : mes flows + la communauté (community/officiel) + ceux partagés à mon agence.
drop policy if exists automation_flows_select on public.automation_flows;
create policy automation_flows_select on public.automation_flows for select using (
  user_id = auth.uid()
  or visibility = 'community'
  or official = true
  or (visibility = 'org' and org_id is not null and public.is_org_member(org_id))
);

-- Écriture : chacun ne crée/modifie/supprime que SES propres flows.
drop policy if exists automation_flows_insert on public.automation_flows;
create policy automation_flows_insert on public.automation_flows for insert with check (user_id = auth.uid());

drop policy if exists automation_flows_update on public.automation_flows;
create policy automation_flows_update on public.automation_flows for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists automation_flows_delete on public.automation_flows;
create policy automation_flows_delete on public.automation_flows for delete using (user_id = auth.uid());

-- Compteur d'installs incrémentable par tous (pour classer la communauté) sans
-- exposer l'écriture de la ligne entière.
create or replace function public.bump_flow_installs(flow_id text)
returns void language sql security definer set search_path = public as $$
  update public.automation_flows set installs = installs + 1 where id = flow_id and visibility = 'community';
$$;
