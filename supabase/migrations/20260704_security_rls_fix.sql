-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Correctifs de sécurité RLS (2026-07-04)                      ║
-- ║  3 failles critiques exploitables par tout client authentifié ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 1. Élévation de privilège vers super admin ─────────────────
-- La policy profiles_update autorisait la modification de N'IMPORTE QUELLE
-- colonne de sa propre ligne, dont is_super_admin (pas de WITH CHECK colonne,
-- pas de trigger). On ajoute un WITH CHECK + un trigger qui bloque tout
-- changement de is_super_admin par un non-super-admin.
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- auth.uid() IS NULL = contexte service-role / migration / seed (déjà de
  -- confiance, hors RLS) : on laisse passer. On ne bloque que les utilisateurs
  -- AUTHENTIFIÉS qui ne sont pas déjà super admin.
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND is_super_admin = true
     ) THEN
    RAISE EXCEPTION 'Modification non autorisée du statut super admin';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- ── 2. Vol de clés de licence ──────────────────────────────────
-- lk_unactivated_select exposait TOUTES les clés non activées (colonne `key`
-- comprise) → n'importe qui pouvait s'auto-attribuer une licence. lk_activate
-- laissait réclamer une clé par UPDATE direct. On supprime les deux : l'activation
-- passe désormais UNIQUEMENT par la RPC activate_license_key (SECURITY DEFINER).
DROP POLICY IF EXISTS "lk_unactivated_select" ON public.license_keys;
DROP POLICY IF EXISTS "lk_activate"           ON public.license_keys;

-- RPC d'activation : réplique la logique de cumul de durée côté serveur, sans
-- jamais exposer les clés non réclamées au client.
CREATE OR REPLACE FUNCTION public.activate_license_key(p_key text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_key       record;
  v_add_days  integer;
  v_is_life   boolean := false;
  v_base      timestamptz := now();
  v_best_rank integer := 0;
  v_new_exp   timestamptz;
  v_plan      text;
  r           record;
  rank_of     jsonb := '{"standard":0,"pro":1,"organisation":2}'::jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Non autorisé');
  END IF;

  -- 1. Clé non réclamée
  SELECT id, plan, duration_days, expires_at, created_at INTO v_key
  FROM public.license_keys
  WHERE key = UPPER(REPLACE(p_key, ' ', '')) AND user_id IS NULL AND is_active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clé invalide ou déjà utilisée.');
  END IF;

  -- 2. Durée apportée par la clé (null = à vie)
  IF v_key.duration_days IS NOT NULL THEN
    v_add_days := v_key.duration_days;
  ELSIF v_key.expires_at IS NOT NULL THEN
    v_add_days := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_key.expires_at - COALESCE(v_key.created_at, now()))) / 86400.0)::int);
  ELSE
    v_add_days := NULL;
  END IF;
  v_best_rank := COALESCE((rank_of ->> v_key.plan)::int, 0);

  -- 3. Clés actives existantes : on cumule sur l'expiration la plus lointaine,
  --    on garde le meilleur plan (jamais de downgrade), on repère le "à vie".
  FOR r IN SELECT id, plan, expires_at FROM public.license_keys
           WHERE user_id = p_user_id AND is_active = true LOOP
    v_best_rank := GREATEST(v_best_rank, COALESCE((rank_of ->> r.plan)::int, 0));
    IF r.expires_at IS NULL THEN
      v_is_life := true;
    ELSIF r.expires_at > now() AND r.expires_at > v_base THEN
      v_base := r.expires_at;
    END IF;
  END LOOP;

  -- 4. Nouvelle expiration cumulée (à vie si clé ou abo existant à vie)
  IF v_add_days IS NULL OR v_is_life THEN
    v_new_exp := NULL;
  ELSE
    v_new_exp := v_base + (v_add_days || ' days')::interval;
  END IF;

  -- 5. Plan résultant = meilleur rang
  v_plan := CASE v_best_rank WHEN 2 THEN 'organisation' WHEN 1 THEN 'pro' ELSE 'standard' END;

  -- 6. Réclamer la clé (claim atomique : user_id encore NULL)
  UPDATE public.license_keys
  SET user_id = p_user_id, activated_at = now(), expires_at = v_new_exp, plan = v_plan
  WHERE id = v_key.id AND user_id IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clé déjà utilisée.');
  END IF;

  -- 7. Désactiver les anciennes clés (leur temps est replié dans la nouvelle)
  UPDATE public.license_keys SET is_active = false
  WHERE user_id = p_user_id AND is_active = true AND id <> v_key.id;

  RETURN jsonb_build_object('ok', true, 'plan', v_plan, 'expires_at', v_new_exp);
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_license_key(text, uuid) TO authenticated;

-- ── 3. Vol de codes crédits ────────────────────────────────────
-- anyone_read_active_codes exposait le `code` de tous les codes actifs, et
-- users_claim_codes laissait les consommer par UPDATE direct. On supprime les
-- deux : la redemption passe déjà par redeem_credit_code (SECURITY DEFINER),
-- qui lit le code côté serveur — aucune policy client n'est nécessaire.
DROP POLICY IF EXISTS "anyone_read_active_codes" ON public.credit_codes;
DROP POLICY IF EXISTS "users_claim_codes"        ON public.credit_codes;
