-- Suppression fiable de médias de la banque (page Banque).
-- Problème : la RLS `bank_delete` (user_id = auth.uid() OR org-admin) peut ne
-- supprimer AUCUNE ligne sans lever d'erreur → l'app croit avoir supprimé alors
-- que rien ne part (« ça supprime rien »). Cette RPC SECURITY DEFINER supprime les
-- lignes que l'appelant a le DROIT de supprimer et renvoie le VRAI nombre supprimé
-- + les chemins fichiers à purger du bucket, pour un compte-rendu honnête.
-- À exécuter une fois dans Supabase → SQL Editor. Idempotent.
CREATE OR REPLACE FUNCTION public.delete_bank_items(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_super   boolean := false;
  v_deleted integer := 0;
  v_paths   jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'paths', '[]'::jsonb, 'eligible', 0);
  END IF;
  SELECT COALESCE(is_super_admin, false) INTO v_super FROM public.profiles WHERE id = v_uid;

  WITH elig AS (
    SELECT cb.id, cb.storage_path, cb.thumbnail_path
    FROM public.content_bank cb
    WHERE cb.id = ANY(p_ids)
      AND (
        v_super
        OR cb.user_id = v_uid
        OR (cb.org_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.organization_members om
              WHERE om.org_id = cb.org_id AND om.user_id = v_uid
                AND om.role IN ('owner', 'admin')))
      )
  ),
  paths AS (
    SELECT storage_path AS p FROM elig WHERE storage_path IS NOT NULL
    UNION ALL
    SELECT thumbnail_path FROM elig WHERE thumbnail_path IS NOT NULL
  ),
  del AS (
    DELETE FROM public.content_bank c WHERE c.id IN (SELECT id FROM elig) RETURNING c.id
  )
  SELECT
    (SELECT count(*) FROM del),
    (SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) FROM paths)
  INTO v_deleted, v_paths;

  RETURN jsonb_build_object('deleted', COALESCE(v_deleted, 0), 'paths', v_paths);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_bank_items(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
