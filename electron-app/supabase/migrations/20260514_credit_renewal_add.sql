-- Change renewal credit behavior: ADD plan credits to existing balance
-- instead of replacing. Lets users stockpile unused credits across months.

CREATE OR REPLACE FUNCTION public.renew_credits_from_subscription(p_subscription_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_plan    text;
  v_credits int;
BEGIN
  SELECT user_id, plan INTO v_user_id, v_plan
  FROM public.license_keys
  WHERE stripe_subscription_id = p_subscription_id;

  IF v_user_id IS NULL THEN RETURN; END IF;

  v_credits := CASE v_plan
    WHEN 'standard' THEN 2000
    WHEN 'pro'      THEN 5500
    ELSE 0
  END;

  IF v_credits > 0 THEN
    INSERT INTO public.user_credits (user_id, balance, last_monthly_grant_at)
    VALUES (v_user_id, v_credits, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance               = public.user_credits.balance + v_credits,
          last_monthly_grant_at = now(),
          updated_at            = now();
  END IF;
END;
$$;
