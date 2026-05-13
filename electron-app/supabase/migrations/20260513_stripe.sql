-- Stripe subscription integration
-- Run this in your Supabase SQL editor AFTER 20260513_credits.sql

-- ── Schema: add Stripe columns to license_keys ────────────────────────────────

ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_status          text;

CREATE UNIQUE INDEX IF NOT EXISTS license_keys_stripe_sub_uidx
  ON public.license_keys (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── RPC: provision/update a subscription (called by Stripe webhook) ──────────
-- Idempotent: upserts by stripe_subscription_id.

CREATE OR REPLACE FUNCTION public.provision_stripe_subscription(
  p_user_id         uuid,
  p_customer_id     text,
  p_subscription_id text,
  p_plan            text,
  p_status          text,
  p_expires_at      timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_existing_id uuid;
  v_active boolean := (p_status IN ('active', 'trialing'));
BEGIN
  SELECT id INTO v_existing_id
  FROM public.license_keys
  WHERE stripe_subscription_id = p_subscription_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.license_keys SET
      plan               = p_plan,
      expires_at         = p_expires_at,
      is_active          = v_active,
      stripe_status      = p_status,
      stripe_customer_id = p_customer_id,
      user_id            = p_user_id
    WHERE id = v_existing_id;
  ELSE
    -- Deactivate any prior license_keys for this user
    UPDATE public.license_keys
    SET is_active = false
    WHERE user_id = p_user_id AND is_active = true;

    INSERT INTO public.license_keys (
      key, plan, is_active, user_id, activated_at, expires_at,
      stripe_customer_id, stripe_subscription_id, stripe_status
    ) VALUES (
      'STRIPE-' || p_subscription_id,
      p_plan, v_active, p_user_id, now(), p_expires_at,
      p_customer_id, p_subscription_id, p_status
    );
  END IF;
END;
$$;

-- ── RPC: cancel a subscription (called on customer.subscription.deleted) ──────

CREATE OR REPLACE FUNCTION public.cancel_stripe_subscription(p_subscription_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.license_keys
  SET is_active = false, stripe_status = 'canceled'
  WHERE stripe_subscription_id = p_subscription_id;
END;
$$;

-- ── RPC: grant monthly credits on successful renewal ─────────────────────────
-- Called on invoice.payment_succeeded; sets balance to plan amount (replace,
-- not add — prevents stockpiling unused credits across months).

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
      SET balance               = v_credits,
          last_monthly_grant_at = now(),
          updated_at            = now();
  END IF;
END;
$$;
