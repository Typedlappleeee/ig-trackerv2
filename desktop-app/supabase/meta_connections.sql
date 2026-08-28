-- ============================================================================
-- « Mode Metricool » — connexion officielle Instagram (Meta Graph API).
-- À appliquer dans Supabase (SQL editor) QUAND tu es prêt à brancher ton App Meta.
-- Purement additif : ne touche à rien de l'existant.
-- ============================================================================

-- 1) Config de l'App Meta (App ID + redirect ne sont PAS secrets → stockables ici).
--    Le App SECRET, lui, ne vit JAMAIS en base : uniquement en variable d'env Vercel.
alter table if exists public.app_config add column if not exists meta_app_id text;
alter table if exists public.app_config add column if not exists meta_redirect_uri text;
alter table if exists public.org_config add column if not exists meta_app_id text;
alter table if exists public.org_config add column if not exists meta_redirect_uri text;

-- 2) Comptes Instagram connectés officiellement (un par compte IG Business autorisé).
create table if not exists public.meta_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  org_id            uuid,
  ig_user_id        text not null,          -- id du compte IG Business
  ig_username       text,
  page_id           text,                   -- Page Facebook reliée
  page_access_token text not null,          -- token de Page (longue durée) pour lire les insights
  token_expires_at  timestamptz,            -- null = n'expire pas (token de Page)
  phone_id          uuid,                   -- rattachement optionnel à phones (match par username)
  connected_at      timestamptz not null default now(),
  last_synced_at    timestamptz,
  unique (user_id, ig_user_id)
);

create index if not exists meta_connections_user_idx on public.meta_connections (user_id);
create index if not exists meta_connections_org_idx  on public.meta_connections (org_id);

-- 3) RLS : chacun ne voit que ses connexions (perso) ou celles de son orga.
alter table public.meta_connections enable row level security;

drop policy if exists meta_conn_select on public.meta_connections;
create policy meta_conn_select on public.meta_connections for select
  using (
    auth.uid() = user_id
    or (org_id is not null and exists (
      select 1 from public.organization_members m
      where m.org_id = meta_connections.org_id and m.user_id = auth.uid()
    ))
  );

-- Écriture réservée au service role (le callback serverless). Le client ne fait que lire.
drop policy if exists meta_conn_write on public.meta_connections;
create policy meta_conn_write on public.meta_connections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
