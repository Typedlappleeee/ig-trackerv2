-- Fix: create_org was not inserting the creator into organization_members,
-- so after reload myOrgs was always empty and the user stayed stuck on the
-- "create or join org" screen forever.
CREATE OR REPLACE FUNCTION public.create_org(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org_id uuid;
  v_count  int;
BEGIN
  IF v_uid IS NULL           THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF trim(p_name) = ''       THEN RAISE EXCEPTION 'name_required';     END IF;
  SELECT COUNT(*) INTO v_count FROM public.organizations WHERE owner_id = v_uid;
  IF v_count >= 1            THEN RAISE EXCEPTION 'org_limit_reached'; END IF;

  INSERT INTO public.organizations (name, owner_id)
  VALUES (trim(p_name), v_uid)
  RETURNING id INTO v_org_id;

  -- Add the creator as owner member (was missing — caused infinite "create org" loop)
  INSERT INTO public.organization_members (org_id, user_id, role, perm_overrides)
  VALUES (v_org_id, v_uid, 'owner', '{}')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN v_org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_org(text) TO authenticated;
