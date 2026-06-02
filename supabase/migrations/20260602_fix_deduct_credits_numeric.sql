-- Fix deduct_user_credits to accept numeric amounts (supports 0.5-credit costs)
DROP FUNCTION IF EXISTS public.deduct_user_credits(uuid, integer);
DROP FUNCTION IF EXISTS public.deduct_user_credits(uuid, numeric);
CREATE OR REPLACE FUNCTION public.deduct_user_credits(p_user_id uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance numeric(12,2);
BEGIN
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_credits
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_balance;
  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Crédits insuffisants', 'balance', COALESCE(v_balance, 0));
  END IF;
  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
