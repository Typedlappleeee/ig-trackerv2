-- Migration v6: SECURITY DEFINER RPC for org creation (fixes RLS INSERT error)
-- Run in Supabase SQL editor after schema_v5.sql

-- Creates an org as the calling user, bypassing the RLS WITH CHECK.
-- The trigger trg_add_owner_member still fires and inserts the owner as member.
CREATE OR REPLACE FUNCTION public.create_org(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF trim(p_name) = '' THEN RAISE EXCEPTION 'name_required'; END IF;

  INSERT INTO public.organizations (name, owner_id)
  VALUES (trim(p_name), v_uid)
  RETURNING id INTO v_org_id;

  RETURN v_org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_org(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
