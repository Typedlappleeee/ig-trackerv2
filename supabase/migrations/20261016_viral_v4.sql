-- Veille Reels v4 : vidéo / légende stockées au relevé (fiche instantanée), feed Instagram,
-- comptes sans doublons, favoris par agence, et « Mes comptes » sur demande.
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable.

-- ── Helpers (recréés au cas où les SQL précédents ne sont pas passés) ────────────────
create or replace function public.sf_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and (coalesce(p.is_super_admin, false) or p.email = 'tintin.aunea@gmail.com'))
$$;
create or replace function public.sf_in_space(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_org is null then auth.uid() is not null else
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
    or exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid())
  end
$$;

-- ── Reels / posts : contenu stocké au relevé ─────────────────────────────────────────
alter table public.viral_reels add column if not exists kind text not null default 'reel';   -- 'reel' | 'feed'
alter table public.viral_reels add column if not exists video_url text;
alter table public.viral_reels add column if not exists caption text;
alter table public.viral_reels add column if not exists duration real;
alter table public.viral_reels add column if not exists images jsonb;
create index if not exists viral_reels_kind on public.viral_reels (kind, taken_at desc);

-- ── Comptes suivis : plus aucun doublon ──────────────────────────────────────────────
alter table public.viral_watch add column if not exists scope text not null default 'public';
alter table public.viral_watch add column if not exists region text not null default 'fr';
update public.viral_watch set username = lower(btrim(username, '@ '))
  where username <> lower(btrim(username, '@ '));
-- Garde la plus ancienne ligne par (sélection publique, @) ou (espace privé, @).
delete from public.viral_watch w using public.viral_watch k
 where w.id <> k.id and w.scope = k.scope and w.username = k.username
   and (w.scope = 'public' or coalesce(w.org_id::text, w.user_id::text) = coalesce(k.org_id::text, k.user_id::text))
   and (k.created_at < w.created_at or (k.created_at = w.created_at and k.id < w.id));
create unique index if not exists viral_watch_public_uniq on public.viral_watch (username) where scope = 'public';
create unique index if not exists viral_watch_private_uniq on public.viral_watch (coalesce(org_id::text, user_id::text), username) where scope = 'private';

-- « Mes comptes » sur demande : seul le super-admin ajoute / modifie ; l'agence peut retirer un compte.
drop policy if exists viral_watch_own on public.viral_watch;
drop policy if exists viral_watch_own_delete on public.viral_watch;
create policy viral_watch_own_delete on public.viral_watch for delete to authenticated
  using (scope = 'private' and ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id))));

-- ── Favoris (par espace : perso ou organisation), avec un instantané du Reel ─────────
create table if not exists public.viral_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  org_id uuid,
  code text not null,
  kind text not null default 'reel',
  watch_id uuid,
  username text,
  thumb text,
  views bigint not null default 0,
  likes bigint not null default 0,
  score real not null default 0,
  url text,
  created_at timestamptz not null default now()
);
create unique index if not exists viral_favorites_uniq on public.viral_favorites (coalesce(org_id::text, user_id::text), code);
alter table public.viral_favorites enable row level security;
drop policy if exists viral_favorites_rw on public.viral_favorites;
create policy viral_favorites_rw on public.viral_favorites for all to authenticated
  using ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)))
  with check ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)));

-- ── Demandes de suivi de comptes (agence → super-admin) ──────────────────────────────
create table if not exists public.viral_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  org_id uuid,
  requester text,
  usernames text[] not null,
  region text not null default 'fr',
  note text not null default '',
  status text not null default 'pending',     -- pending · done · refused
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
alter table public.viral_requests enable row level security;
drop policy if exists viral_requests_read on public.viral_requests;
drop policy if exists viral_requests_insert on public.viral_requests;
drop policy if exists viral_requests_admin on public.viral_requests;
create policy viral_requests_read on public.viral_requests for select to authenticated
  using (user_id = auth.uid() or (org_id is not null and public.sf_in_space(org_id)) or public.sf_is_super_admin());
create policy viral_requests_insert on public.viral_requests for insert to authenticated
  with check (user_id = auth.uid() and (org_id is null or public.sf_in_space(org_id)) and status = 'pending');
create policy viral_requests_admin on public.viral_requests for update to authenticated
  using (public.sf_is_super_admin()) with check (public.sf_is_super_admin());
