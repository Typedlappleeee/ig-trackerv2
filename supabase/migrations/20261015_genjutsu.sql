-- Genjutsu IA pour tous : clé API par espace (perso ou organisation), Modèles (images de
-- référence réutilisables) et file de générations côté serveur (avance même app fermée).
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable.

-- ── Helpers d'espace ────────────────────────────────────────────────────────────────
-- Membre de l'organisation (ou son propriétaire).
create or replace function public.sf_in_space(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_org is null then auth.uid() is not null else
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
    or exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid())
  end
$$;
-- Peut gérer l'espace (perso : soi-même ; organisation : propriétaire ou admin).
create or replace function public.sf_can_manage_space(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_org is null then auth.uid() is not null else
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
    or exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  end
$$;

-- ── Clés API par espace : AUCUNE policy (illisible depuis le navigateur) ─────────────
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  owner_id uuid not null,
  org_id uuid,
  value text not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists api_keys_scope on public.api_keys (provider, coalesce(org_id::text, 'u:' || owner_id::text));
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;

create or replace function public.sf_set_api_key(p_provider text, p_value text, p_org uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_provider not in ('higgsfield') then raise exception 'Fournisseur inconnu'; end if;
  if not public.sf_can_manage_space(p_org) then raise exception 'Seuls le propriétaire et les admins de l''organisation peuvent changer la clé.'; end if;
  delete from public.api_keys where provider = p_provider
    and (case when p_org is null then org_id is null and owner_id = auth.uid() else org_id = p_org end);
  if coalesce(trim(p_value), '') <> '' then
    insert into public.api_keys(provider, owner_id, org_id, value) values (p_provider, auth.uid(), p_org, trim(p_value));
  end if;
end $$;

create or replace function public.sf_api_key_status(p_provider text, p_org uuid default null)
returns table(is_set boolean, hint text, updated_at timestamptz, can_edit boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sf_in_space(p_org) then raise exception 'Espace non autorisé'; end if;
  return query select true, right(k.value, 4), k.updated_at, public.sf_can_manage_space(p_org)
    from public.api_keys k where k.provider = p_provider
     and (case when p_org is null then k.org_id is null and k.owner_id = auth.uid() else k.org_id = p_org end)
    limit 1;
  if not found then return query select false, null::text, null::timestamptz, public.sf_can_manage_space(p_org); end if;
end $$;
grant execute on function public.sf_set_api_key(text, text, uuid) to authenticated;
grant execute on function public.sf_api_key_status(text, uuid) to authenticated;

-- ── Modèles : un nom + 1 à 8 images de référence (ids de la Banque) ─────────────────
create table if not exists public.genjutsu_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  org_id uuid,
  name text not null,
  image_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.genjutsu_models enable row level security;
drop policy if exists genjutsu_models_rw on public.genjutsu_models;
create policy genjutsu_models_rw on public.genjutsu_models for all
  using ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)))
  with check ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)));

-- ── File de générations (écrite par l'edge function, lue par l'espace) ──────────────
create table if not exists public.genjutsu_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org_id uuid,
  status text not null default 'waiting',      -- waiting · queued · in_progress · completed · failed
  source jsonb not null,                       -- { reel_code } ou { bank_id }
  title text,
  thumb text,
  image_ids jsonb not null default '[]'::jsonb,
  model_id uuid,
  resolution text not null default '720p',
  prompt text not null default '',
  request_id text,
  status_url text,
  video_url text,
  bank_id uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists genjutsu_jobs_active on public.genjutsu_jobs (status) where status in ('waiting', 'queued', 'in_progress');
create index if not exists genjutsu_jobs_space on public.genjutsu_jobs (org_id, user_id, created_at desc);
alter table public.genjutsu_jobs enable row level security;
drop policy if exists genjutsu_jobs_read on public.genjutsu_jobs;
create policy genjutsu_jobs_read on public.genjutsu_jobs for select
  using ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)));
