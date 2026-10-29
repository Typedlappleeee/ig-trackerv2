-- ════════════════════════════════════════════════════════════════════════════
--  API ScaleFlow (« ScaleFlow Link ») : clés API personnelles + site partenaire.
--  À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
--
--  • sf_api_tokens   : clés de TON API ScaleFlow (/api/v1). Seule l'empreinte SHA-256
--                      est stockée : la clé en clair n'est montrée qu'une fois, à la création.
--  • sf_link_partners: le site partenaire (ex. le site du staff) — adresse de SON API et
--                      SA clé, utilisées uniquement côté serveur (/api/link).
--  Les deux tables n'ont AUCUNE policy : illisibles depuis le navigateur (y compris super
--  admin) ; on passe par les fonctions ci-dessous. Les colonnes d'espace s'appellent
--  space_org (et pas org_id) pour rester hors des policies « toutes organisations ».
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.sf_api_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  space_org    uuid references public.organizations(id) on delete cascade,   -- null = espace perso
  name         text not null default 'Clé API',
  prefix       text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
alter table public.sf_api_tokens enable row level security;
revoke all on public.sf_api_tokens from anon, authenticated;

create table if not exists public.sf_link_partners (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  space_org   uuid references public.organizations(id) on delete cascade,
  name        text not null,
  base_url    text not null,
  api_key     text not null,
  updated_at  timestamptz not null default now()
);
create unique index if not exists sf_link_partners_space on public.sf_link_partners (coalesce(space_org::text, 'u:' || owner_id::text));
alter table public.sf_link_partners enable row level security;
revoke all on public.sf_link_partners from anon, authenticated;

-- ── Droits sur l'espace (perso = soi ; organisation = membre / propriétaire-admin) ──
create or replace function public.sf_link_in_space(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_org is null then auth.uid() is not null else
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
    or exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid())
  end
$$;
create or replace function public.sf_link_can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_org is null then auth.uid() is not null else
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
    or exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  end
$$;

-- ── Clés API ─────────────────────────────────────────────────────────────────────
-- Crée une clé et la renvoie EN CLAIR (une seule fois). Format : sf_<48 hex>.
create or replace function public.sf_api_token_create(p_org uuid, p_name text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_token text;
begin
  if not public.sf_link_can_manage(p_org) then raise exception 'Seuls le propriétaire et les admins peuvent créer une clé API.'; end if;
  if (select count(*) from public.sf_api_tokens where revoked_at is null
      and (case when p_org is null then space_org is null and owner_id = auth.uid() else space_org = p_org end)) >= 10 then
    raise exception 'Maximum 10 clés actives : révoque une clé inutilisée.';
  end if;
  v_token := 'sf_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sf_api_tokens(owner_id, space_org, name, prefix, token_hash)
  values (auth.uid(), p_org, coalesce(nullif(left(trim(p_name), 60), ''), 'Clé API'), left(v_token, 9),
          encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end $$;

create or replace function public.sf_api_token_list(p_org uuid)
returns table(id uuid, name text, prefix text, created_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sf_link_can_manage(p_org) then return; end if;
  return query select t.id, t.name, t.prefix, t.created_at, t.last_used_at from public.sf_api_tokens t
   where t.revoked_at is null
     and (case when p_org is null then t.space_org is null and t.owner_id = auth.uid() else t.space_org = p_org end)
   order by t.created_at desc;
end $$;

create or replace function public.sf_api_token_revoke(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid; v_owner uuid;
begin
  select space_org, owner_id into v_org, v_owner from public.sf_api_tokens where id = p_id;
  if not found then return; end if;
  if v_org is null and v_owner <> auth.uid() then raise exception 'Clé introuvable.'; end if;
  if not public.sf_link_can_manage(v_org) then raise exception 'Seuls le propriétaire et les admins peuvent révoquer une clé.'; end if;
  update public.sf_api_tokens set revoked_at = now() where id = p_id;
end $$;

-- ── Site partenaire (un par espace) ──────────────────────────────────────────────
-- p_key vide = garder la clé déjà enregistrée ; p_base_url vide = supprimer la liaison.
create or replace function public.sf_link_partner_set(p_org uuid, p_name text, p_base_url text, p_key text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.sf_link_can_manage(p_org) then raise exception 'Seuls le propriétaire et les admins peuvent configurer la liaison.'; end if;
  select id into v_id from public.sf_link_partners
   where (case when p_org is null then space_org is null and owner_id = auth.uid() else space_org = p_org end);
  if coalesce(trim(p_base_url), '') = '' then
    delete from public.sf_link_partners where id = v_id; return;
  end if;
  if trim(p_base_url) !~ '^https://[^/\s]+' then raise exception 'L''adresse de l''API doit commencer par https://'; end if;
  if v_id is null then
    if coalesce(trim(p_key), '') = '' then raise exception 'Colle la clé API du site partenaire.'; end if;
    insert into public.sf_link_partners(owner_id, space_org, name, base_url, api_key)
    values (auth.uid(), p_org, coalesce(nullif(left(trim(p_name), 40), ''), 'Partenaire'), rtrim(trim(p_base_url), '/'), trim(p_key));
  else
    update public.sf_link_partners set
      name = coalesce(nullif(left(trim(p_name), 40), ''), name),
      base_url = rtrim(trim(p_base_url), '/'),
      api_key = coalesce(nullif(trim(p_key), ''), api_key),
      updated_at = now()
    where id = v_id;
  end if;
end $$;

-- Ce que le navigateur peut voir de la liaison : jamais la clé, seulement ses 4 derniers caractères.
create or replace function public.sf_link_partner_get(p_org uuid)
returns table(name text, base_url text, key_hint text, updated_at timestamptz, can_edit boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sf_link_in_space(p_org) then return; end if;
  return query select p.name, p.base_url, right(p.api_key, 4), p.updated_at, public.sf_link_can_manage(p_org)
    from public.sf_link_partners p
   where (case when p_org is null then p.space_org is null and p.owner_id = auth.uid() else p.space_org = p_org end);
end $$;

revoke all on function public.sf_api_token_create(uuid, text) from public, anon;
revoke all on function public.sf_api_token_list(uuid) from public, anon;
revoke all on function public.sf_api_token_revoke(uuid) from public, anon;
revoke all on function public.sf_link_partner_set(uuid, text, text, text) from public, anon;
revoke all on function public.sf_link_partner_get(uuid) from public, anon;
grant execute on function public.sf_api_token_create(uuid, text) to authenticated;
grant execute on function public.sf_api_token_list(uuid) to authenticated;
grant execute on function public.sf_api_token_revoke(uuid) to authenticated;
grant execute on function public.sf_link_partner_set(uuid, text, text, text) to authenticated;
grant execute on function public.sf_link_partner_get(uuid) to authenticated;

notify pgrst, 'reload schema';
