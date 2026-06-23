-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Permissions granulaires (perm_overrides) + licence orga      ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- 1) member_can_action() : la RLS de suppression (bank/phones) n'autorisait
--    QUE owner/admin. Du coup, un membre invité avec « autoriser tout »
--    (perm_overrides.actions.bank_delete = true) ne pouvait PAS supprimer.
--    Cette fonction respecte les overrides par membre + les défauts de rôle.
--
-- 2) org_owner_plan() : permet à un membre de valider son accès via la licence
--    de l'OWNER de l'orga, en SECURITY DEFINER (robuste même si la policy
--    lk_org_owner_select n'est pas déployée). Pas besoin de licence perso
--    pour rejoindre une orga, tant que l'orga (son owner) en a une.

-- ── 1. member_can_action ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_can_action(p_org uuid, p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_role     text;
  v_over     jsonb;
  v_explicit jsonb;
BEGIN
  SELECT role, perm_overrides INTO v_role, v_over
    FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid();

  IF v_role IS NULL THEN RETURN false; END IF;
  -- owner / admin : tout autorisé
  IF v_role IN ('owner','admin') THEN RETURN true; END IF;

  -- override explicite par membre (perm_overrides.actions.<action>)
  v_explicit := v_over -> 'actions' -> p_action;
  IF v_explicit IS NOT NULL THEN
    RETURN (v_explicit::text)::boolean;
  END IF;

  -- défauts de rôle (miroir de ROLE_ACTIONS dans permissions.ts)
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

  -- viewer : tout bloqué par défaut
  RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.member_can_action(uuid, text) TO authenticated;

-- ── 2. org_owner_plan ────────────────────────────────────────────
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

  -- l'appelant doit être membre de l'orga
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  -- owner super-admin → plan pro
  SELECT is_super_admin INTO v_super FROM public.profiles WHERE id = v_owner;
  IF v_super THEN RETURN 'pro'; END IF;

  -- clé active de l'owner
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

-- ── 3. RLS de suppression respectant les permissions par membre ──
DROP POLICY IF EXISTS "bank_delete" ON public.content_bank;
CREATE POLICY "bank_delete" ON public.content_bank FOR DELETE USING (
  user_id = auth.uid()
  OR (org_id IS NOT NULL AND public.member_can_action(org_id, 'bank_delete'))
);

DROP POLICY IF EXISTS "phones_delete" ON public.phones;
CREATE POLICY "phones_delete" ON public.phones FOR DELETE USING (
  user_id = auth.uid()
  OR (org_id IS NOT NULL AND public.member_can_action(org_id, 'phone_delete'))
);
