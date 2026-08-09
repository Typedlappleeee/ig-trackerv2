-- ════════════════════════════════════════════════════════════════════════════
--  ScaleFlow — TOUTES les migrations récentes en un seul bloc.
--  À coller dans Supabase → SQL Editor → Run. Idempotent (relançable sans risque).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Add-on Blowsome sur les clés de licence ─────────────────────────────────
alter table if exists public.license_keys
  add column if not exists blowsome boolean not null default false;

-- 2) Clé API iRemoTech par agence (org_config) ou perso (app_config) ─────────
alter table if exists public.org_config
  add column if not exists iremotech_config jsonb;
alter table if exists public.app_config
  add column if not exists iremotech_config jsonb;

-- 3) Limite d'upload de la banque : 50 → 100 Mo (bucket "content") ───────────
--    ⚠️ La limite GLOBALE du projet (Storage → Settings) doit AUSSI être ≥ 100 Mo.
update storage.buckets set file_size_limit = 104857600 where id = 'content';

-- 4) Notes + comptes par téléphone iRemoTech (visibles par toute l'agence) ────
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

-- 5) Médias partagés : un membre peut télécharger/prévisualiser un fichier créé
--    par un AUTRE membre de son agence (overlays/spoofs sous videos/users/…) ──
create index if not exists content_bank_storage_path_idx   on public.content_bank (storage_path);
create index if not exists content_bank_thumbnail_path_idx on public.content_bank (thumbnail_path);
drop policy if exists "content_select" on storage.objects;
create policy "content_select" on storage.objects for select using (
  bucket_id = 'content' and (
    ((storage.foldername(name))[2] = 'users' and (storage.foldername(name))[3]::uuid = auth.uid())
    or ((storage.foldername(name))[2] = 'orgs' and public.is_org_member((storage.foldername(name))[3]::uuid))
    or exists (
      select 1 from public.content_bank cb
      where (cb.storage_path = storage.objects.name or cb.thumbnail_path = storage.objects.name)
        and cb.org_id is not null
        and public.is_org_member(cb.org_id)
    )
  )
);

-- 6) Blowsome hérité par les MEMBRES d'une agence dont l'owner l'a ────────────
create or replace function public.org_owner_blowsome(p_org uuid)
returns boolean language sql security definer stable as $$
  select coalesce(bool_or(lk.blowsome), false)
  from public.organizations o
  join public.license_keys lk
    on lk.user_id = o.owner_id
   and lk.is_active = true
   and (lk.expires_at is null or lk.expires_at > now())
  where o.id = p_org;
$$;
grant execute on function public.org_owner_blowsome(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  Fin. Après ça : remonte aussi la limite d'upload GLOBALE à 100 Mo dans
--  Storage → Settings (sinon le bucket à 100 Mo reste plafonné par le global).
-- ════════════════════════════════════════════════════════════════════════════
