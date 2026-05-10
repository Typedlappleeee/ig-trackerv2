-- ================================================================
-- IG Tracker v2 — Schéma complet (v1 → v6 consolidé)
-- ================================================================
-- 1 SEULE query à lancer dans Supabase → SQL Editor → New Query → Run.
-- Idempotent : safe à relancer plusieurs fois sans rien casser.
-- Remplace schema.sql, schema_v2.sql, schema_v3.sql, schema_v4.sql,
--          schema_v5.sql et schema_v6.sql.
-- ================================================================


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  1. PROFILES + USER_ITEMS                                    ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  full_name  text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  content    text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  2. PHONES + CONTENT_BANK + APP_CONFIG                       ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.phones (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  geelark_id  text NOT NULL,
  serial_no   text,
  phone_name  text NOT NULL,
  group_name  text,
  status      text DEFAULT 'offline',
  ig_username text,
  followers   integer DEFAULT 0,
  total_views bigint  DEFAULT 0,
  video_count integer DEFAULT 0,
  remark      text,
  synced_at   timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, geelark_id)
);

-- Colonnes ajoutées en v3 / v4
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS following    integer DEFAULT 0;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS bio          text;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS ig_sessionid text;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS ig_status    text;
UPDATE public.phones SET ig_sessionid = NULL WHERE ig_sessionid = '';
UPDATE public.phones SET ig_status    = NULL WHERE ig_status    = 'unknown';

CREATE TABLE IF NOT EXISTS public.content_bank (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  file_url      text,
  thumbnail_url text,
  duration      integer,
  tags          text[] DEFAULT '{}',
  notes         text DEFAULT '',
  used_count    integer DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Colonne folder utilisée par l'app pour organiser la banque
ALTER TABLE public.content_bank ADD COLUMN IF NOT EXISTS folder text;

CREATE TABLE IF NOT EXISTS public.app_config (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bearer_token  text DEFAULT '',
  theme         text DEFAULT 'Bleu',
  lang          text DEFAULT 'fr',
  updated_at    timestamptz DEFAULT now()
);

-- Colonnes additionnelles utilisées par Settings (v3 + ajouts)
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS groq_api_key  text DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS profile_name  text DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS profile_niche text DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS profile_email text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS export_dir    text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS proxy         text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS ig_sessionid  text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS push_port     integer DEFAULT 8765;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS notify_popup  boolean DEFAULT true;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS notify_sound  boolean DEFAULT true;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  3. VIEWS_HISTORY (chart dashboard)                          ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.views_history (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_id    uuid NOT NULL REFERENCES public.phones(id) ON DELETE CASCADE,
  views       bigint NOT NULL,
  recorded_at timestamptz DEFAULT now()
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  4. ORGANIZATIONS (multi-tenant)                             ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  perm_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email          text NOT NULL,
  token          text NOT NULL UNIQUE,
  role           text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  perm_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Liens optionnels phones / banque ↔ organisation
ALTER TABLE public.phones       ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.content_bank ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  5. INDEX                                                    ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_user_items_user_id     ON public.user_items(user_id);
CREATE INDEX IF NOT EXISTS idx_phones_user_id         ON public.phones(user_id);
CREATE INDEX IF NOT EXISTS idx_phones_geelark_id      ON public.phones(geelark_id);
CREATE INDEX IF NOT EXISTS idx_phones_org_id          ON public.phones(org_id);
CREATE INDEX IF NOT EXISTS idx_bank_user_id           ON public.content_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_org_id            ON public.content_bank(org_id);
CREATE INDEX IF NOT EXISTS idx_views_history_phone    ON public.views_history(phone_id);
CREATE INDEX IF NOT EXISTS idx_views_history_ts       ON public.views_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_org_members_user       ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org        ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token      ON public.organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_org_invites_email      ON public.organization_invites(email);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  6. RLS — Activer sur toutes les tables                      ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_bank          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.views_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites  ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  7. HELPERS pour les RLS d'organisation                      ║
-- ╚══════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  8. POLICIES                                                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- user_items
DROP POLICY IF EXISTS "items_all" ON public.user_items;
CREATE POLICY "items_all" ON public.user_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- app_config
DROP POLICY IF EXISTS "config_select" ON public.app_config;
DROP POLICY IF EXISTS "config_insert" ON public.app_config;
DROP POLICY IF EXISTS "config_update" ON public.app_config;
CREATE POLICY "config_select" ON public.app_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "config_insert" ON public.app_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "config_update" ON public.app_config FOR UPDATE USING (auth.uid() = user_id);

-- views_history
DROP POLICY IF EXISTS "views_history_all" ON public.views_history;
CREATE POLICY "views_history_all" ON public.views_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- phones (avec support orga)
DROP POLICY IF EXISTS "phones_all"    ON public.phones;
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

-- content_bank (avec support orga)
DROP POLICY IF EXISTS "bank_all"    ON public.content_bank;
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

-- organizations
DROP POLICY IF EXISTS "org_select" ON public.organizations;
DROP POLICY IF EXISTS "org_insert" ON public.organizations;
DROP POLICY IF EXISTS "org_update" ON public.organizations;
DROP POLICY IF EXISTS "org_delete" ON public.organizations;
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


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  9. RPCs + TRIGGERS                                          ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Crée le profil automatiquement à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Crée une organisation (bypass RLS via SECURITY DEFINER)
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

-- Accepte une invitation par token (single-use)
CREATE OR REPLACE FUNCTION public.accept_org_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite public.organization_invites%ROWTYPE;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_invite FROM public.organization_invites
  WHERE token = p_token FOR UPDATE;

  IF NOT FOUND                        THEN RAISE EXCEPTION 'invite_not_found';    END IF;
  IF v_invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  IF v_invite.expires_at < now()      THEN RAISE EXCEPTION 'invite_expired';      END IF;

  INSERT INTO public.organization_members (org_id, user_id, role, perm_overrides, invited_by)
  VALUES (v_invite.org_id, v_uid, v_invite.role, v_invite.perm_overrides, v_invite.invited_by)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  UPDATE public.organization_invites SET accepted_at = now() WHERE id = v_invite.id;
  RETURN v_invite.org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(text) TO authenticated;

-- Auto-ajoute l'owner comme membre quand une orga est créée
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.organization_members (org_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id)
  ON CONFLICT (org_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_add_owner_member ON public.organizations;
CREATE TRIGGER trg_add_owner_member
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  10. Reload PostgREST schema cache                           ║
-- ╚══════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';
