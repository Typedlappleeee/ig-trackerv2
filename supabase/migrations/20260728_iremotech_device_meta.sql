-- Notes + comptes (login/mdp/id auth) mémorisés PAR TÉLÉPHONE iRemoTech.
-- Visibles par TOUTE L'AGENCE (org) — ou perso si pas d'org.
-- scope_id = org_id (agence) OU user_id (perso) ; is_org distingue les deux.
drop table if exists public.iremotech_device_meta cascade;

create table public.iremotech_device_meta (
  id         uuid primary key default gen_random_uuid(),
  scope_id   text not null,                 -- org_id (agence) OU user_id (perso)
  is_org     boolean not null default false,
  device_id  text not null,                 -- public_id iRemoTech
  notes      text not null default '',
  accounts   jsonb not null default '[]',   -- [{ username, password, auth_id }]
  updated_at timestamptz not null default now(),
  unique (scope_id, device_id)
);

alter table public.iremotech_device_meta enable row level security;

drop policy if exists "irt_meta_access" on public.iremotech_device_meta;
create policy "irt_meta_access" on public.iremotech_device_meta
  for all
  using (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  )
  with check (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  );
