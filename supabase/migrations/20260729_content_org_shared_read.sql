-- Fix : impossible de télécharger / prévisualiser un média créé par un AUTRE
-- membre de l'agence (ex. overlays #overlay, spoofs…).
--
-- Cause : les outils (incrustation, spoof…) enregistrent le fichier sous
--   videos/users/{créateur}/…  → la RLS storage « content_select » ne l'autorise
--   qu'au créateur, alors que la ligne content_bank est partagée à toute l'org.
--   Résultat : les autres membres voient la ligne mais pas le fichier (createSignedUrl échoue).
--
-- Correctif : on ajoute une règle SELECT « consciente de l'org » — un membre peut
--   lire un objet storage s'il existe une ligne content_bank qui le référence
--   (storage_path OU thumbnail_path) et dont il est membre de l'org. Ça répare
--   les fichiers existants ET futurs, SANS avoir à déplacer quoi que ce soit.

-- Index pour que le sous-select de la policy reste rapide.
create index if not exists content_bank_storage_path_idx   on public.content_bank (storage_path);
create index if not exists content_bank_thumbnail_path_idx on public.content_bank (thumbnail_path);

drop policy if exists "content_select" on storage.objects;
create policy "content_select" on storage.objects for select using (
  bucket_id = 'content' and (
    -- fichier perso : videos/users/{uid}/
    ((storage.foldername(name))[2] = 'users' and (storage.foldername(name))[3]::uuid = auth.uid())
    -- fichier d'agence : videos/orgs/{org_id}/
    or ((storage.foldername(name))[2] = 'orgs' and public.is_org_member((storage.foldername(name))[3]::uuid))
    -- fichier référencé par une ligne content_bank partagée à mon agence
    -- (couvre les overlays/spoofs enregistrés sous videos/users/{autre_membre}/)
    or exists (
      select 1 from public.content_bank cb
      where (cb.storage_path = storage.objects.name or cb.thumbnail_path = storage.objects.name)
        and cb.org_id is not null
        and public.is_org_member(cb.org_id)
    )
  )
);
