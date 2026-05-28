-- Redeem a credit code and apply the credits to an org's owner account.
-- The caller (auth.uid()) is recorded as used_by so the code can't be reused,
-- even if the caller is not the org owner.
CREATE OR REPLACE FUNCTION public.redeem_credit_code_for_org(
  p_code   text,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_code_id     uuid;
  v_amount      integer;
  v_owner_id    uuid;
  v_new_balance integer;
  v_is_member   boolean;
BEGIN
  -- Caller must be a member or the owner of the org
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND owner_id = auth.uid()
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Non autorisé');
  END IF;

  -- Validate and lock the code
  SELECT id, amount INTO v_code_id, v_amount
  FROM public.credit_codes
  WHERE code = UPPER(p_code) AND is_active = true AND used_by IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code invalide ou déjà utilisé');
  END IF;

  -- Mark used by the caller (not the org owner)
  UPDATE public.credit_codes
  SET used_by = auth.uid(), used_at = now()
  WHERE id = v_code_id AND used_by IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code déjà utilisé');
  END IF;

  -- Resolve org owner
  SELECT owner_id INTO v_owner_id FROM public.organizations WHERE id = p_org_id;

  -- Credit the org owner's account
  INSERT INTO public.user_credits (user_id, balance) VALUES (v_owner_id, v_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance    = public.user_credits.balance + v_amount,
      updated_at = now()
  RETURNING balance INTO v_new_balance;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'balance', v_new_balance);
END;
$$;
