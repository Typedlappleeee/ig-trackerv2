-- Migration: plans v2
-- - Remove 'lifetime' plan, add 'organisation' plan
-- - Update monthly credit amounts (standard: 2000→2500, organisation: 11000)
-- - Drop & recreate renew_credits_from_subscription to handle new plan names

-- 1. Relax the plan check constraint to allow 'organisation' (keep 'lifetime' temporarily
--    so existing keys don't break on startup — admin will migrate them manually).
ALTER TABLE license_keys
  DROP CONSTRAINT IF EXISTS license_keys_plan_check;

ALTER TABLE license_keys
  ADD CONSTRAINT license_keys_plan_check
  CHECK (plan IN ('standard', 'pro', 'organisation', 'lifetime'));

-- 2. Replace renew_credits_from_subscription with updated credit amounts.
CREATE OR REPLACE FUNCTION renew_credits_from_subscription(
  p_user_id uuid,
  p_plan    text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits integer;
BEGIN
  v_credits := CASE p_plan
    WHEN 'organisation' THEN 11000
    WHEN 'pro'          THEN 5500
    WHEN 'lifetime'     THEN 5500   -- legacy keys keep pro-level credits
    WHEN 'standard'     THEN 2500
    ELSE 0
  END;

  IF v_credits = 0 THEN RETURN; END IF;

  INSERT INTO user_credits (user_id, balance, last_monthly_grant_at)
    VALUES (p_user_id, v_credits, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance               = user_credits.balance + v_credits,
        last_monthly_grant_at = now();
END;
$$;

-- 3. Replace maybe_grant_monthly_credits to match new amounts.
CREATE OR REPLACE FUNCTION maybe_grant_monthly_credits(
  p_user_id      uuid,
  p_plan_credits integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_credits (user_id, balance, last_monthly_grant_at)
    VALUES (p_user_id, p_plan_credits, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance               = user_credits.balance + p_plan_credits,
        last_monthly_grant_at = now()
  WHERE user_credits.last_monthly_grant_at IS NULL
     OR user_credits.last_monthly_grant_at < date_trunc('month', now());
END;
$$;
