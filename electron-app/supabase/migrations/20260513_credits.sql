-- Credits system migration
-- Run this in your Supabase SQL editor

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance                integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_monthly_grant_at  timestamptz,
  updated_at             timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  amount      integer NOT NULL CHECK (amount > 0),
  created_by  uuid REFERENCES auth.users(id),
  used_by     uuid REFERENCES auth.users(id),
  used_at     timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_credits" ON public.user_credits;
DROP POLICY IF EXISTS "superadmin_all_credits" ON public.user_credits;

CREATE POLICY "users_read_own_credits" ON public.user_credits
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "superadmin_all_credits" ON public.user_credits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

ALTER TABLE public.credit_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_manage_credit_codes" ON public.credit_codes;
DROP POLICY IF EXISTS "anyone_read_active_codes"       ON public.credit_codes;
DROP POLICY IF EXISTS "users_claim_codes"              ON public.credit_codes;

CREATE POLICY "superadmin_manage_credit_codes" ON public.credit_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "anyone_read_active_codes" ON public.credit_codes
  FOR SELECT USING (is_active = true AND used_by IS NULL);

CREATE POLICY "users_claim_codes" ON public.credit_codes
  FOR UPDATE USING (is_active = true AND used_by IS NULL)
  WITH CHECK (used_by = auth.uid());

-- ── Functions ─────────────────────────────────────────────────────────────────

-- Atomically deduct credits; returns {ok, balance} or {ok:false, error, balance}
CREATE OR REPLACE FUNCTION public.deduct_user_credits(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_balance integer;
BEGIN
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_credits
  SET balance    = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Crédits insuffisants', 'balance', COALESCE(v_balance, 0));
  END IF;

  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;

-- Redeem a credit code; returns {ok, amount, balance} or {ok:false, error}
CREATE OR REPLACE FUNCTION public.redeem_credit_code(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_code_id    uuid;
  v_amount     integer;
  v_new_balance integer;
BEGIN
  SELECT id, amount INTO v_code_id, v_amount
  FROM public.credit_codes
  WHERE code = UPPER(p_code) AND is_active = true AND used_by IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code invalide ou déjà utilisé');
  END IF;

  UPDATE public.credit_codes
  SET used_by = p_user_id, used_at = now()
  WHERE id = v_code_id AND used_by IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code déjà utilisé');
  END IF;

  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, v_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance    = public.user_credits.balance + v_amount,
      updated_at = now()
  RETURNING balance INTO v_new_balance;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'balance', v_new_balance);
END;
$$;

-- Grant monthly plan credits (idempotent: once per calendar month)
CREATE OR REPLACE FUNCTION public.maybe_grant_monthly_credits(p_user_id uuid, p_plan_credits integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_last_grant timestamptz;
BEGIN
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_monthly_grant_at INTO v_last_grant
  FROM public.user_credits WHERE user_id = p_user_id;

  IF v_last_grant IS NULL OR
     date_trunc('month', v_last_grant AT TIME ZONE 'UTC') < date_trunc('month', now() AT TIME ZONE 'UTC') THEN
    UPDATE public.user_credits
    SET balance               = balance + p_plan_credits,
        last_monthly_grant_at = now(),
        updated_at            = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;
