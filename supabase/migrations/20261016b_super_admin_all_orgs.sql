-- ════════════════════════════════════════════════════════════════════════════
--  SUPER ADMIN : tous les droits sur TOUTES les organisations
--  (même celles dont il n'est pas membre). Super admin = profiles.is_super_admin
--  OU l'email du fondateur — la même règle que partout ailleurs (sf_is_super_admin).
--  À coller dans Supabase → SQL Editor → Run. Ré-exécutable ; n'enlève AUCUN droit
--  aux autres utilisateurs (on ajoute seulement « ou super admin »).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. Helper unique ────────────────────────────────────────────────────────
create or replace function public.sf_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and (coalesce(p.is_super_admin, false) or p.email = 'tintin.aunea@gmail.com'))
$$;
grant execute on function public.sf_is_super_admin() to authenticated;

-- ── 1. Helpers d'accès utilisés par les policies / RPC → « ou super admin » ──
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.sf_is_super_admin() or exists (
    select 1 from public.organization_members where org_id = p_org and user_id = auth.uid()
    union all
    select 1 from public.organizations where id = p_org and owner_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.sf_is_super_admin() or exists (
    select 1 from public.organization_members where org_id = p_org and user_id = auth.uid() and role in ('owner','admin')
    union all
    select 1 from public.organizations where id = p_org and owner_id = auth.uid()
  );
$$;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid)  to authenticated;

create or replace function public.sf_in_space(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_org is null then auth.uid() is not null else
    public.sf_is_super_admin()
    or exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
    or exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid())
  end
$$;

create or replace function public.sf_can_manage_space(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_org is null then auth.uid() is not null else
    public.sf_is_super_admin()
    or exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
    or exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  end
$$;

CREATE OR REPLACE FUNCTION public.member_can_action(p_org uuid, p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_role     text;
  v_over     jsonb;
  v_explicit jsonb;
BEGIN
  -- super admin : tout autorisé, dans toutes les organisations
  IF public.sf_is_super_admin() THEN RETURN true; END IF;

  SELECT role, perm_overrides INTO v_role, v_over
    FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid();

  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role IN ('owner','admin') THEN RETURN true; END IF;

  v_explicit := v_over -> 'actions' -> p_action;
  IF v_explicit IS NOT NULL THEN
    RETURN (v_explicit::text)::boolean;
  END IF;

  IF v_role = 'member' THEN
    RETURN CASE p_action
      WHEN 'bank_upload'        THEN true
      WHEN 'bank_delete'        THEN false
      WHEN 'bank_move'          THEN false
      WHEN 'bank_folder_create' THEN false
      WHEN 'phone_add'          THEN false
      WHEN 'phone_delete'       THEN false
      WHEN 'phone_edit'         THEN true
      WHEN 'posting_launch'     THEN true
      WHEN 'scheduler_write'    THEN true
      ELSE false
    END;
  END IF;

  RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.member_can_action(uuid, text) TO authenticated;

-- Solde de crédits de l'orga : visible aussi par le super admin.
CREATE OR REPLACE FUNCTION public.get_org_credit_balance(p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_id  uuid;
  v_balance   numeric(12,2);
  v_is_member boolean;
BEGIN
  SELECT public.sf_is_super_admin() OR EXISTS(
    SELECT 1 FROM public.organization_members WHERE org_id = p_org_id AND user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND owner_id = auth.uid()
  ) INTO v_is_member;
  IF NOT v_is_member THEN RETURN 0; END IF;
  SELECT owner_id INTO v_owner_id FROM public.organizations WHERE id = p_org_id;
  SELECT COALESCE(balance, 0) INTO v_balance
  FROM public.user_credits WHERE user_id = v_owner_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

-- Licence de l'orga (accès hérité de l'owner) : le super admin passe aussi.
CREATE OR REPLACE FUNCTION public.org_owner_plan(p_org uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_super boolean;
  v_plan  text;
  v_exp   timestamptz;
BEGIN
  SELECT owner_id INTO v_owner FROM public.organizations WHERE id = p_org;
  IF v_owner IS NULL THEN RETURN NULL; END IF;

  IF NOT public.sf_is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT is_super_admin INTO v_super FROM public.profiles WHERE id = v_owner;
  IF v_super THEN RETURN 'pro'; END IF;

  SELECT plan, expires_at INTO v_plan, v_exp
    FROM public.license_keys
    WHERE user_id = v_owner AND is_active = true
    ORDER BY expires_at DESC NULLS FIRST
    LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_exp IS NOT NULL AND v_exp <= now() THEN RETURN NULL; END IF;
  RETURN COALESCE(v_plan, 'standard');
END;
$$;
GRANT EXECUTE ON FUNCTION public.org_owner_plan(uuid) TO authenticated;

-- Corbeille de la banque : le super admin peut y mettre les médias de n'importe qui.
create or replace function public.bank_guard_trash()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ok boolean := false;
begin
  if auth.uid() is null then return new; end if;                       -- service (cron, edge)
  if new.deleted_at is not distinct from old.deleted_at then return new; end if;
  if old.org_id is null or old.user_id = auth.uid() then return new; end if;
  if public.sf_is_super_admin() then return new; end if;
  select exists (select 1 from public.organizations o where o.id = old.org_id and o.owner_id = auth.uid())
      or exists (select 1 from public.organization_members m where m.org_id = old.org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
    into v_ok;
  if not v_ok then
    raise exception 'Tu n''as pas le droit de supprimer les médias des autres membres.';
  end if;
  return new;
end $$;

-- ── 2. Liste des organisations : TOUTES pour le super admin, rôle « owner » ──
--    Ses vraies adhésions gardent leur ligne (rôle forcé à owner) ; les autres orgas
--    arrivent avec une ligne synthétique (id null, guest = true).
create or replace function public.get_my_orgs()
returns table (org jsonb, member jsonb)
language sql security definer stable set search_path = public as $$
  select to_jsonb(o.*) as org,
         case when public.sf_is_super_admin()
              then to_jsonb(m.*) || jsonb_build_object('role', 'owner', 'perm_overrides', '{}'::jsonb)
              else to_jsonb(m.*) end as member
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
  union all
  select to_jsonb(o.*) as org,
         jsonb_build_object('id', null, 'org_id', o.id, 'user_id', auth.uid(), 'role', 'owner',
                            'perm_overrides', '{}'::jsonb, 'guest', true) as member
  from public.organizations o
  where public.sf_is_super_admin()
    and not exists (select 1 from public.organization_members m2 where m2.org_id = o.id and m2.user_id = auth.uid())
$$;
grant execute on function public.get_my_orgs() to authenticated;

-- ── 3. Filet de sécurité : policy « super admin » sur chaque table d'organisation ──
--    Couvre les policies écrites en dur (sans les helpers ci-dessus). Les policies RLS
--    s'additionnent : on donne l'accès au super admin sans rien retirer aux autres.
--    Les tables SANS aucune policy (clés API, secrets…) restent verrouillées : on ne
--    les touche pas.
do $$
declare t record;
begin
  for t in
    select distinct c.relname as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
    where c.relkind = 'r' and c.relrowsecurity
      and c.relname not in ('api_keys', 'sf_secrets', 'license_keys')
      and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
  loop
    execute format('drop policy if exists sa_all_orgs on public.%I', t.tbl);
    execute format('create policy sa_all_orgs on public.%I for all to authenticated using (public.sf_is_super_admin()) with check (public.sf_is_super_admin())', t.tbl);
  end loop;
end $$;

drop policy if exists sa_all_orgs on public.organizations;
create policy sa_all_orgs on public.organizations for all to authenticated
  using (public.sf_is_super_admin()) with check (public.sf_is_super_admin());

-- ── 4. Stockage (vidéos / images de la banque, toutes organisations) ───────
drop policy if exists "content_sa_all" on storage.objects;
create policy "content_sa_all" on storage.objects for all to authenticated
  using (bucket_id = 'content' and public.sf_is_super_admin())
  with check (bucket_id = 'content' and public.sf_is_super_admin());

-- Recharge le cache PostgREST.
notify pgrst, 'reload schema';

-- Vérification (connecté en super admin dans l'app) : doit lister toutes les orgas.
-- select count(*) from public.get_my_orgs();
