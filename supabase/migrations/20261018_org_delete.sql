-- ════════════════════════════════════════════════════════════════════════════
--  SUPPRIMER UNE ORGANISATION (avec tout son contenu) + VIDER UNE BANQUE
--  À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
--
--  Avant : supprimer une orga ne supprimait que la ligne « organizations » ; ses
--  vidéos, téléphones, programmés… (clé étrangère ON DELETE SET NULL) retombaient
--  dans l'espace perso de chaque membre, et les fichiers restaient dans le stockage.
--
--  Les FICHIERS sont supprimés par l'app (API Storage — Supabase interdit de les
--  effacer en SQL), AVANT les lignes : sf_org_files / sf_bank_files donnent la liste.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Fichiers d'une orga (tout son dossier …/orgs/<id>/ du bucket content) ─────
--    Sauf ceux qu'utilise encore un média d'un AUTRE espace (copie, doublon).
--    Un seul tableau (pas une ligne par fichier : l'API coupe au-delà de 1 000 lignes).
drop function if exists public.sf_org_files(uuid);
create or replace function public.sf_org_files(p_org uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.sf_is_super_admin()
          or exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())) then
    raise exception 'Seul le propriétaire de l''organisation peut la supprimer.' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(s.name::text) from storage.objects s
    where s.bucket_id = 'content'
      and (storage.foldername(s.name))[2] = 'orgs' and (storage.foldername(s.name))[3] = p_org::text
      and not exists (select 1 from public.content_bank c
                      where (c.storage_path = s.name or c.thumbnail_path = s.name)
                        and c.org_id is distinct from p_org)
  ), '{}');
end $$;
grant execute on function public.sf_org_files(uuid) to authenticated;

-- ── Supprimer une orga et TOUT ce qui lui appartient ─────────────────────────
--    Toutes les tables qui ont une colonne org_id (banque, légendes, téléphones,
--    programmés, tâches, historique…), puis l'orga (membres, config en cascade).
--    Le nom tapé doit correspondre. Tout ou rien : en cas de blocage, rien n'est supprimé.
create or replace function public.sf_delete_org(p_org uuid, p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text; v_owner uuid;
  v_left text[]; v_next text[]; v_t text; v_typ text; v_n bigint;
  v_out jsonb := '{}'::jsonb; v_pass int := 0; v_err text;
begin
  select o.name, o.owner_id into v_name, v_owner from public.organizations o where o.id = p_org;
  if not found then raise exception 'Organisation introuvable (déjà supprimée ?).'; end if;
  if not (public.sf_is_super_admin() or v_owner = auth.uid()) then
    raise exception 'Seul le propriétaire de l''organisation peut la supprimer.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_confirm, '')) is distinct from btrim(v_name) then
    raise exception 'Le nom tapé ne correspond pas : rien n''a été supprimé.';
  end if;

  select array_agg(c.relname::text order by c.relname) into v_left
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
  where c.relkind = 'r' and c.relname not in ('organizations', 'support_tickets');

  -- Plusieurs passes : une table bloquée par une clé étrangère est retentée après les autres.
  while coalesce(array_length(v_left, 1), 0) > 0 and v_pass < 6 loop
    v_pass := v_pass + 1; v_next := '{}';
    foreach v_t in array v_left loop
      select format_type(a.atttypid, a.atttypmod) into v_typ from pg_attribute a
        where a.attrelid = format('public.%I', v_t)::regclass and a.attname = 'org_id';
      begin
        execute format('delete from public.%I where %s', v_t,
          case when v_typ = 'uuid' then 'org_id = $1' else 'org_id::text = $1::text' end) using p_org;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_out := v_out || jsonb_build_object(v_t, coalesce((v_out ->> v_t)::bigint, 0) + v_n); end if;
      exception when foreign_key_violation then
        v_next := v_next || v_t; v_err := sqlerrm;
      end;
    end loop;
    v_left := v_next;
  end loop;
  if coalesce(array_length(v_left, 1), 0) > 0 then
    raise exception 'Suppression bloquée (%) : rien n''a été supprimé.', v_err;
  end if;

  delete from public.organizations o where o.id = p_org;
  return jsonb_build_object('name', v_name, 'tables', v_out);
end $$;
grant execute on function public.sf_delete_org(uuid, text) to authenticated;

-- ── Vider une banque (vidéos + images, corbeille comprise) ───────────────────
--    p_org = orga (owner / admin / super admin) ; p_org null = ma banque perso.
create or replace function public.sf_bank_scope_ok(p_org uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.' using errcode = '42501'; end if;
  if p_org is not null and not (public.sf_is_super_admin() or public.is_org_admin(p_org)) then
    raise exception 'Seuls le propriétaire et les admins peuvent vider la banque de l''organisation.' using errcode = '42501';
  end if;
  return true;
end $$;

drop function if exists public.sf_bank_files(uuid);
create or replace function public.sf_bank_files(p_org uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.sf_bank_scope_ok(p_org);
  return coalesce((
    with mine as (
      select c.id, c.storage_path, c.thumbnail_path from public.content_bank c
      where (p_org is not null and c.org_id = p_org)
         or (p_org is null and c.org_id is null and c.user_id = auth.uid())
    ), paths as (
      select distinct x.p from mine, unnest(array[mine.storage_path, mine.thumbnail_path]) as x(p)
      where x.p is not null and x.p <> ''
    )
    select array_agg(paths.p::text) from paths
    where not exists (select 1 from public.content_bank o
                      where (o.storage_path = paths.p or o.thumbnail_path = paths.p)
                        and not exists (select 1 from mine where mine.id = o.id))
  ), '{}');
end $$;
grant execute on function public.sf_bank_files(uuid) to authenticated;

create or replace function public.sf_empty_bank(p_org uuid) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare v_n integer;
begin
  perform public.sf_bank_scope_ok(p_org);
  delete from public.content_bank c
  where (p_org is not null and c.org_id = p_org)
     or (p_org is null and c.org_id is null and c.user_id = auth.uid());
  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function public.sf_empty_bank(uuid) to authenticated;

-- ── Panel Admin : toutes les orgas avec leurs chiffres (super admin seulement) ─
create or replace function public.sf_admin_orgs()
returns table (id uuid, name text, owner_email text, created_at timestamptz, members bigint, media bigint, bytes bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.sf_is_super_admin() then
    raise exception 'Réservé au super admin.' using errcode = '42501';
  end if;
  return query
    with mem as (select m.org_id, count(*) as n from public.organization_members m group by m.org_id),
         med as (select c.org_id, count(*) as n from public.content_bank c where c.org_id is not null group by c.org_id),
         siz as (select (storage.foldername(s.name))[3] as org_key, sum(coalesce((s.metadata ->> 'size')::bigint, 0)) as b
                 from storage.objects s
                 where s.bucket_id = 'content' and (storage.foldername(s.name))[2] = 'orgs'
                 group by 1)
    select o.id, o.name::text, p.email::text, o.created_at,
           coalesce(mem.n, 0)::bigint, coalesce(med.n, 0)::bigint, coalesce(siz.b, 0)::bigint
    from public.organizations o
    left join public.profiles p on p.id = o.owner_id
    left join mem on mem.org_id = o.id
    left join med on med.org_id = o.id
    left join siz on siz.org_key = o.id::text
    order by o.created_at desc nulls last;
end $$;
grant execute on function public.sf_admin_orgs() to authenticated;

notify pgrst, 'reload schema';
