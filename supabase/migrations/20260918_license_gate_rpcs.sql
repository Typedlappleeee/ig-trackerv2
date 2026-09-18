-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Porte de licence fiable : lecture + activation en SECURITY DEFINER ║
-- ║  À exécuter une fois dans Supabase → SQL Editor. Idempotent.        ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Contexte : la porte de licence côté web lisait `license_keys` directement
-- (RLS `lk_owner_select`). Si cette policy n'est pas déployée, la lecture renvoie
-- 0 ligne → un compte AVEC une licence valide était renvoyé sur l'écran
-- d'activation. Et l'activation via `activate_license_key(p_key, p_user_id)`
-- renvoyait « Non autorisé » dès que auth.uid() ≠ p_user_id.
--
-- Solution : deux RPC SECURITY DEFINER qui bypass la RLS et se basent sur
-- auth.uid() (jamais sur un id passé par le client) :
--   • my_license()            → statut de licence de l'appelant (fiable).
--   • claim_license_key(p_key) → réclame une clé pour l'appelant (auth.uid()).

-- ── 1. my_license() : statut de licence de l'appelant ──────────────
-- Retourne { valid, expired, blowsome, plan, super, authless }.
--   valid    : a le droit d'utiliser l'app (clé perso active non expirée,
--              OU membre d'une org dont l'owner a une clé, OU superadmin).
--   expired  : avait une clé mais elle est expirée (≠ n'a jamais eu de clé).
--   authless : pas de session (auth.uid() null) → le client fait fail-open.
CREATE OR REPLACE FUNCTION public.my_license()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_email        text;
  v_super        boolean;
  v_now          timestamptz := now();
  v_valid_own    boolean := false;
  v_blow_own     boolean := false;
  v_had_key      boolean := false;
  v_plan         text := null;
  v_org_valid    boolean := false;
  v_org_blow     boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'expired', false, 'blowsome', false,
                              'plan', null, 'super', false, 'authless', true);
  END IF;

  SELECT email, is_super_admin INTO v_email, v_super FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_super, false) OR v_email = 'tintin.aunea@gmail.com' THEN
    RETURN jsonb_build_object('valid', true, 'expired', false, 'blowsome', true,
                              'plan', 'organisation', 'super', true);
  END IF;

  -- Clés perso actives.
  SELECT
    bool_or(expires_at IS NULL OR expires_at > v_now),
    bool_or((expires_at IS NULL OR expires_at > v_now) AND COALESCE(blowsome, false)),
    count(*) > 0
  INTO v_valid_own, v_blow_own, v_had_key
  FROM public.license_keys
  WHERE user_id = v_uid AND is_active = true;

  IF COALESCE(v_valid_own, false) THEN
    -- Meilleur plan parmi les clés valides. 'business' = 'organisation' (top-tier) ;
    -- on renvoie le libellé stocké tel quel (les crédits mensuels gèrent les deux).
    SELECT plan INTO v_plan FROM public.license_keys
     WHERE user_id = v_uid AND is_active = true AND (expires_at IS NULL OR expires_at > v_now)
     ORDER BY CASE plan WHEN 'organisation' THEN 2 WHEN 'business' THEN 2 WHEN 'pro' THEN 1 ELSE 0 END DESC
     LIMIT 1;
    RETURN jsonb_build_object('valid', true, 'expired', false, 'own', true,
                              'blowsome', COALESCE(v_blow_own, false),
                              'plan', COALESCE(v_plan, 'standard'), 'super', false);
  END IF;

  -- Accès hérité : membre d'une org dont l'OWNER a une clé active (ou est super).
  SELECT bool_or(ok.valid), bool_or(ok.blow)
  INTO v_org_valid, v_org_blow
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.org_id
  JOIN LATERAL (
    SELECT
      (COALESCE(po.is_super_admin, false)
        OR EXISTS (SELECT 1 FROM public.license_keys lk
                    WHERE lk.user_id = o.owner_id AND lk.is_active = true
                      AND (lk.expires_at IS NULL OR lk.expires_at > v_now))) AS valid,
      (COALESCE(po.is_super_admin, false)
        OR EXISTS (SELECT 1 FROM public.license_keys lk
                    WHERE lk.user_id = o.owner_id AND lk.is_active = true AND COALESCE(lk.blowsome, false)
                      AND (lk.expires_at IS NULL OR lk.expires_at > v_now))) AS blow
    FROM public.profiles po WHERE po.id = o.owner_id
  ) ok ON true
  WHERE om.user_id = v_uid AND o.owner_id <> v_uid;

  IF COALESCE(v_org_valid, false) THEN
    RETURN jsonb_build_object('valid', true, 'expired', false,
                              'blowsome', COALESCE(v_org_blow, false),
                              'plan', 'standard', 'super', false);
  END IF;

  -- Rien de valide : distingue « clé expirée » de « jamais eu de clé ».
  RETURN jsonb_build_object('valid', false, 'expired', COALESCE(v_had_key, false),
                            'blowsome', false, 'plan', null, 'super', false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_license() TO authenticated, anon;

-- ── 2. claim_license_key(p_key) : activation basée sur auth.uid() ──
-- Même logique de cumul que activate_license_key, mais réclame la clé pour
-- l'APPELANT (auth.uid()) — plus de « Non autorisé » par mismatch d'id client.
CREATE OR REPLACE FUNCTION public.claim_license_key(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_key       record;
  v_add_days  integer;
  v_is_life   boolean := false;
  v_base      timestamptz := now();
  v_best_rank integer := 0;
  v_new_exp   timestamptz;
  v_plan      text;
  r           record;
  -- 'business' = 'organisation' (top-tier). On garde le LIBELLÉ de la clé la mieux
  -- classée (pas de réécriture) pour rester cohérent avec l'admin (standard/pro/business).
  rank_of     jsonb := '{"standard":0,"pro":1,"organisation":2,"business":2}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session expirée — reconnecte-toi.');
  END IF;

  -- 1. Clé non réclamée (insensible à la casse / aux espaces).
  SELECT id, plan, duration_days, expires_at, created_at INTO v_key
  FROM public.license_keys
  WHERE key = UPPER(REPLACE(p_key, ' ', '')) AND user_id IS NULL AND is_active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clé invalide ou déjà utilisée.');
  END IF;

  -- 2. Durée apportée par la clé (null = à vie).
  IF v_key.duration_days IS NOT NULL THEN
    v_add_days := v_key.duration_days;
  ELSIF v_key.expires_at IS NOT NULL THEN
    v_add_days := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_key.expires_at - COALESCE(v_key.created_at, now()))) / 86400.0)::int);
  ELSE
    v_add_days := NULL;
  END IF;
  v_best_rank := COALESCE((rank_of ->> v_key.plan)::int, 0);
  v_plan := COALESCE(v_key.plan, 'standard');

  -- 3. Cumul sur les clés actives existantes (meilleure expiration + meilleur plan,
  --    en conservant le libellé de la clé la mieux classée).
  FOR r IN SELECT id, plan, expires_at FROM public.license_keys
           WHERE user_id = v_uid AND is_active = true LOOP
    IF COALESCE((rank_of ->> r.plan)::int, 0) > v_best_rank THEN
      v_best_rank := COALESCE((rank_of ->> r.plan)::int, 0);
      v_plan := COALESCE(r.plan, v_plan);
    END IF;
    IF r.expires_at IS NULL THEN
      v_is_life := true;
    ELSIF r.expires_at > now() AND r.expires_at > v_base THEN
      v_base := r.expires_at;
    END IF;
  END LOOP;

  IF v_add_days IS NULL OR v_is_life THEN
    v_new_exp := NULL;
  ELSE
    v_new_exp := v_base + (v_add_days || ' days')::interval;
  END IF;

  -- 4. Claim atomique (user_id encore NULL).
  UPDATE public.license_keys
  SET user_id = v_uid, activated_at = now(), expires_at = v_new_exp, plan = v_plan
  WHERE id = v_key.id AND user_id IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clé déjà utilisée.');
  END IF;

  -- 5. Désactiver les anciennes clés (leur temps est replié dans la nouvelle).
  UPDATE public.license_keys SET is_active = false
  WHERE user_id = v_uid AND is_active = true AND id <> v_key.id;

  RETURN jsonb_build_object('ok', true, 'plan', v_plan, 'expires_at', v_new_exp);
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_license_key(text) TO authenticated;

-- ── 3. my_credit_balance() : solde perso fiable (bypass RLS) ───────
-- La lecture directe de `user_credits` dépend de la policy `users_read_own_credits`.
-- Si elle n'est pas déployée, le solde perso s'affiche à 0 alors que les crédits
-- SONT bien débités/ajoutés (redeem/deduct sont SECURITY DEFINER). Cette RPC lit
-- le solde de l'appelant côté serveur → affichage fiable.
CREATE OR REPLACE FUNCTION public.my_credit_balance()
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE v_bal numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT balance INTO v_bal FROM public.user_credits WHERE user_id = auth.uid();
  RETURN COALESCE(v_bal, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_credit_balance() TO authenticated;

-- Recharge le cache PostgREST pour exposer les nouvelles fonctions.
NOTIFY pgrst, 'reload schema';
