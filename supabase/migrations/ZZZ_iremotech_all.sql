-- ════════════════════════════════════════════════════════════════════════════
--  iRemoTech — TOUTES les migrations en un bloc.
--  Supabase → SQL Editor → colle tout → Run. Idempotent (relançable sans risque).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Clé API iRemoTech par agence (org_config) ou perso (app_config) ──────────
--    Sans ça : impossible d'enregistrer ta clé API (Phone Farm reste vide).
alter table if exists public.org_config
  add column if not exists iremotech_config jsonb;
alter table if exists public.app_config
  add column if not exists iremotech_config jsonb;

-- 2) Notes + comptes par téléphone (visibles par toute l'agence) ──────────────
--    Sans ça : les notes/comptes des tels ne se sauvegardent pas.
create table if not exists public.iremotech_device_meta (
  id         uuid primary key default gen_random_uuid(),
  scope_id   text not null,                 -- org_id (agence) OU user_id (perso)
  is_org     boolean not null default false,
  device_id  text not null,                 -- public_id iRemoTech
  notes      text not null default '',
  accounts   jsonb not null default '[]',    -- [{ ig_base, ig_modified, password, a2f }]
  updated_at timestamptz not null default now(),
  unique (scope_id, device_id)
);
alter table public.iremotech_device_meta enable row level security;
drop policy if exists "irt_meta_access" on public.iremotech_device_meta;
create policy "irt_meta_access" on public.iremotech_device_meta for all
  using (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  )
  with check (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  );

-- 3) Séquences / RPA maison (enregistrer un flow, le rejouer sur tous les tels) ─
--    Sans ça : les séquences enregistrées ne se sauvegardent pas.
create table if not exists public.iremotech_sequences (
  id         uuid primary key default gen_random_uuid(),
  scope_id   text not null,                 -- org_id (agence) OU user_id (perso)
  is_org     boolean not null default false,
  name       text not null,
  steps      jsonb not null default '[]',    -- [{ delay, action?, upload?, captionVar? }]
  created_at timestamptz not null default now()
);
alter table public.iremotech_sequences enable row level security;
drop policy if exists "irt_seq_access" on public.iremotech_sequences;
create policy "irt_seq_access" on public.iremotech_sequences for all
  using (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  )
  with check (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  );
