-- Fix: is_org_member and is_org_admin did not include org owners.
-- Org owners are in organizations.owner_id, NOT in organization_members.
-- This caused bank INSERT / UPDATE / DELETE to fail for org owners
-- because the bank_insert policy calls is_org_member(org_id) which returned false.

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.organizations
    WHERE id = p_org AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid() AND role IN ('owner','admin')
    UNION ALL
    SELECT 1 FROM public.organizations
    WHERE id = p_org AND owner_id = auth.uid()
  );
$$;
