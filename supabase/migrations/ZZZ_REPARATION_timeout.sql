-- ════════════════════════════════════════════════════════════════════════════
--  RÉPARATION — « [orgContext] load error: timeout » / app bloquée sur Loading
--  Supabase → SQL Editor → colle tout → Run. Sans risque (idempotent).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Fonctions SECURITY DEFINER (contournent les RLS → PAS de récursion) ──────
--    Sans get_my_orgs, l'app tombe sur la jointure directe organization_members
--    ↔ organizations, qui récursionne et finit en TIMEOUT.
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.organization_members where org_id = p_org and user_id = auth.uid()
    union all
    select 1 from public.organizations where id = p_org and owner_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.organization_members where org_id = p_org and user_id = auth.uid() and role in ('owner','admin')
    union all
    select 1 from public.organizations where id = p_org and owner_id = auth.uid()
  );
$$;

create or replace function public.get_my_orgs()
returns table (org jsonb, member jsonb)
language sql security definer stable
set search_path = public
as $$
  select to_jsonb(o.*) as org, to_jsonb(m.*) as member
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid)  to authenticated;
grant execute on function public.get_my_orgs()       to authenticated;

-- 2) Politique de stockage RAPIDE (remplace la version lente) ────────────────
--    L'ancienne version utilisait `(storage_path = X OR thumbnail_path = X)`, ce
--    qui EMPÊCHE l'usage des index → balayage complet de content_bank pour CHAQUE
--    fichier lu → base saturée → timeouts partout. On sépare en deux EXISTS, chacun
--    pouvant utiliser son index.
create index if not exists content_bank_storage_path_idx   on public.content_bank (storage_path);
create index if not exists content_bank_thumbnail_path_idx on public.content_bank (thumbnail_path);

drop policy if exists "content_select" on storage.objects;
create policy "content_select" on storage.objects for select using (
  bucket_id = 'content' and (
    ((storage.foldername(name))[2] = 'users' and (storage.foldername(name))[3]::uuid = auth.uid())
    or ((storage.foldername(name))[2] = 'orgs' and public.is_org_member((storage.foldername(name))[3]::uuid))
    or exists (
      select 1 from public.content_bank cb
      where cb.storage_path = storage.objects.name
        and cb.org_id is not null and public.is_org_member(cb.org_id)
    )
    or exists (
      select 1 from public.content_bank cb
      where cb.thumbnail_path = storage.objects.name
        and cb.org_id is not null and public.is_org_member(cb.org_id)
    )
  )
);

-- 3) Vérification : ces 3 lignes doivent renvoyer un résultat sans erreur ─────
select public.get_my_orgs();
