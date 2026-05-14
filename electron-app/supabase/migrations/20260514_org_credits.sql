-- Allow org members to read the org owner's credit balance via SECURITY DEFINER
-- (bypasses the "users_read_own_credits" RLS policy which only allows self-reads)

CREATE OR REPLACE FUNCTION public.get_org_credit_balance(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_owner_id  uuid;
  v_balance   integer;
  v_is_member boolean;
BEGIN
  -- Caller must be a member of the org
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN 0;
  END IF;

  SELECT owner_id INTO v_owner_id FROM public.organizations WHERE id = p_org_id;

  SELECT COALESCE(balance, 0) INTO v_balance
  FROM public.user_credits WHERE user_id = v_owner_id;

  RETURN COALESCE(v_balance, 0);
END;
$$;
