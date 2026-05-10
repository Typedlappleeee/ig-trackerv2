-- Migration v5: Multi-tenant organizations
-- Adds organizations, organization_members, organization_invites
-- Adds nullable org_id to phones and content_bank for shared access
-- Run in Supabase SQL editor

-- ── Tables ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  -- per-member overrides on top of role defaults: { "tabs": {"phones": false}, "bank_folders": {"mode":"all"} | {"mode":"allow","list":["folder1"]} | {"mode":"deny","list":[]} }
  perm_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email       text NOT NULL,
  token       text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  perm_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_members_user   ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org    ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token  ON public.organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_org_invites_email  ON public.organization_invites(email);

-- ── Add org_id to shareable tables (nullable for solo mode) ──────────────────
ALTER TABLE public.phones        ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.content_bank  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_phones_org_id  ON public.phones(org_id);
CREATE INDEX IF NOT EXISTS idx_bank_org_id    ON public.content_bank(org_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites  ENABLE ROW LEVEL SECURITY;

-- Helper: am I a member of this org?
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid() AND role IN ('owner','admin')
  );
$$;

-- organizations
DROP POLICY IF EXISTS "org_select"  ON public.organizations;
DROP POLICY IF EXISTS "org_insert"  ON public.organizations;
DROP POLICY IF EXISTS "org_update"  ON public.organizations;
DROP POLICY IF EXISTS "org_delete"  ON public.organizations;
CREATE POLICY "org_select" ON public.organizations FOR SELECT USING (public.is_org_member(id));
CREATE POLICY "org_insert" ON public.organizations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "org_update" ON public.organizations FOR UPDATE USING (public.is_org_admin(id));
CREATE POLICY "org_delete" ON public.organizations FOR DELETE USING (owner_id = auth.uid());

-- organization_members
DROP POLICY IF EXISTS "om_select" ON public.organization_members;
DROP POLICY IF EXISTS "om_insert" ON public.organization_members;
DROP POLICY IF EXISTS "om_update" ON public.organization_members;
DROP POLICY IF EXISTS "om_delete" ON public.organization_members;
CREATE POLICY "om_select" ON public.organization_members FOR SELECT USING (public.is_org_member(org_id));
-- self-insert only via accepting an invite (or the owner-creation trigger below)
CREATE POLICY "om_insert" ON public.organization_members FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.is_org_admin(org_id)
);
CREATE POLICY "om_update" ON public.organization_members FOR UPDATE USING (public.is_org_admin(org_id));
CREATE POLICY "om_delete" ON public.organization_members FOR DELETE USING (
  user_id = auth.uid() OR public.is_org_admin(org_id)
);

-- organization_invites
DROP POLICY IF EXISTS "oi_select" ON public.organization_invites;
DROP POLICY IF EXISTS "oi_insert" ON public.organization_invites;
DROP POLICY IF EXISTS "oi_update" ON public.organization_invites;
DROP POLICY IF EXISTS "oi_delete" ON public.organization_invites;
CREATE POLICY "oi_select" ON public.organization_invites FOR SELECT USING (
  public.is_org_admin(org_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
CREATE POLICY "oi_insert" ON public.organization_invites FOR INSERT WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY "oi_update" ON public.organization_invites FOR UPDATE USING (
  public.is_org_admin(org_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
CREATE POLICY "oi_delete" ON public.organization_invites FOR DELETE USING (public.is_org_admin(org_id));

-- Auto-create owner membership when org is created
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.organization_members (org_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_add_owner_member ON public.organizations;
CREATE TRIGGER trg_add_owner_member
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();

-- ── Update RLS on phones + content_bank to allow org members ────────────────
DROP POLICY IF EXISTS "phones_select" ON public.phones;
DROP POLICY IF EXISTS "phones_insert" ON public.phones;
DROP POLICY IF EXISTS "phones_update" ON public.phones;
DROP POLICY IF EXISTS "phones_delete" ON public.phones;
CREATE POLICY "phones_select" ON public.phones FOR SELECT USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_member(org_id))
);
CREATE POLICY "phones_insert" ON public.phones FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (org_id IS NULL OR public.is_org_member(org_id))
);
CREATE POLICY "phones_update" ON public.phones FOR UPDATE USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_member(org_id))
);
CREATE POLICY "phones_delete" ON public.phones FOR DELETE USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_admin(org_id))
);

DROP POLICY IF EXISTS "bank_select" ON public.content_bank;
DROP POLICY IF EXISTS "bank_insert" ON public.content_bank;
DROP POLICY IF EXISTS "bank_update" ON public.content_bank;
DROP POLICY IF EXISTS "bank_delete" ON public.content_bank;
CREATE POLICY "bank_select" ON public.content_bank FOR SELECT USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_member(org_id))
);
CREATE POLICY "bank_insert" ON public.content_bank FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (org_id IS NULL OR public.is_org_member(org_id))
);
CREATE POLICY "bank_update" ON public.content_bank FOR UPDATE USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_member(org_id))
);
CREATE POLICY "bank_delete" ON public.content_bank FOR DELETE USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_admin(org_id))
);
