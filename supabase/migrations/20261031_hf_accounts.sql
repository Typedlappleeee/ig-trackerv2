-- ════════════════════════════════════════════════════════════════════════════
--  Genjutsu dans ScaleFlow, sans site extérieur : les comptes Higgsfield de l'espace
--  (organisation, ou espace perso). Lus et écrits UNIQUEMENT par le relais /api/higgsfield
--  (clé service-role) : aucune politique RLS → jamais lisibles depuis le navigateur.
--  À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.sf_hf_accounts (
  id            uuid primary key default gen_random_uuid(),
  space_org     uuid,                       -- organisation ; null = espace perso de owner_id
  owner_id      uuid not null,              -- qui a connecté le compte
  name          text not null,
  client_id     text not null,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  credits       numeric,
  plan          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists sf_hf_accounts_space_name
  on public.sf_hf_accounts (coalesce(space_org::text, 'u:' || owner_id::text), name);
alter table public.sf_hf_accounts enable row level security;
revoke all on public.sf_hf_accounts from anon, authenticated;

notify pgrst, 'reload schema';
