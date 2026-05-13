-- ================================================================
-- IG Tracker v2 — Schéma complet (v1 → v7 consolidé)
-- ================================================================
-- 1 SEULE query à lancer dans Supabase → SQL Editor → New Query → Run.
-- Idempotent : safe à relancer plusieurs fois sans rien casser.
-- Remplace schema.sql, schema_v2.sql, schema_v3.sql, schema_v4.sql,
--          schema_v5.sql, schema_v6.sql et schema_v7.sql.
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

-- Display name visible to other org members (prénom / pseudo)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;

-- Backfill profiles for users who signed up before the trigger existed
INSERT INTO public.profiles (id, email)
SELECT u.id, u.email FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

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

-- Cloud storage paths (Supabase Storage). file_url reste pour les chemins locaux legacy.
ALTER TABLE public.content_bank ADD COLUMN IF NOT EXISTS storage_path   text;
ALTER TABLE public.content_bank ADD COLUMN IF NOT EXISTS thumbnail_path text;

-- file_url devient optionnel (peut être NULL pour les vidéos cloud-only).
ALTER TABLE public.content_bank ALTER COLUMN file_url DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.app_config (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bearer_token  text DEFAULT '',
  theme         text DEFAULT 'Bleu',
  lang          text DEFAULT 'fr',
  updated_at    timestamptz DEFAULT now()
);

-- Colonnes additionnelles utilisées par Settings
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS groq_api_key      text DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS anthropic_api_key text DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS profile_name      text DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS profile_niche     text DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS profile_email     text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS export_dir        text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS proxy             text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS ig_sessionid      text;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS push_port         integer DEFAULT 8765;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS notify_popup      boolean DEFAULT true;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS notify_sound      boolean DEFAULT true;
-- Marqueur "onboarding terminé"
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS onboarded_at      timestamptz;


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

-- Connexions partagées au niveau organisation (token GéeLark, Groq, Anthropic, proxy, sessionid IG).
-- Quand l'utilisateur travaille dans une orga, l'app lit ces valeurs au lieu de app_config.
CREATE TABLE IF NOT EXISTS public.org_config (
  org_id        uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  bearer_token  text DEFAULT '',
  groq_api_key  text DEFAULT '',
  ig_sessionid  text,
  proxy         text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Clé Anthropic au niveau orga (partagée entre tous les membres)
ALTER TABLE public.org_config ADD COLUMN IF NOT EXISTS anthropic_api_key text DEFAULT '';

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
-- ║  5. ACTIVITY LOGS (admin-only, org-scoped)                   ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  user_email text,
  action     text NOT NULL,
  details    jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  6. INDEX                                                    ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_user_items_user_id     ON public.user_items(user_id);
CREATE INDEX IF NOT EXISTS idx_phones_user_id         ON public.phones(user_id);
CREATE INDEX IF NOT EXISTS idx_phones_geelark_id      ON public.phones(geelark_id);
CREATE INDEX IF NOT EXISTS idx_phones_org_id          ON public.phones(org_id);

-- Dédup une fois les phones d'orga : garde la ligne la plus ancienne par
-- (org_id, geelark_id). Évite les doublons quand plusieurs membres ont sync.
DELETE FROM public.phones a
USING public.phones b
WHERE a.org_id IS NOT NULL
  AND a.org_id = b.org_id
  AND a.geelark_id = b.geelark_id
  AND a.id != b.id
  AND a.created_at > b.created_at;

-- Index unique partiel pour les phones d'orga : (org_id, geelark_id) doit être unique
-- quand on est en mode orga, indépendamment du user qui a sync. Solo mode garde
-- la contrainte UNIQUE(user_id, geelark_id) au niveau de la table.
CREATE UNIQUE INDEX IF NOT EXISTS phones_org_geelark_uniq
  ON public.phones(org_id, geelark_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_user_id           ON public.content_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_org_id            ON public.content_bank(org_id);
CREATE INDEX IF NOT EXISTS idx_views_history_phone    ON public.views_history(phone_id);
CREATE INDEX IF NOT EXISTS idx_views_history_ts       ON public.views_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_org_members_user       ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org        ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token      ON public.organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_org_invites_email      ON public.organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_activity_logs_org      ON public.activity_logs(org_id, created_at DESC);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  7. RLS — Activer sur toutes les tables                      ║
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
ALTER TABLE public.org_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs         ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  8. HELPERS pour les RLS d'organisation                      ║
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

-- True if the calling user shares at least one organisation with p_user.
-- Used by the profiles RLS to let org members see each other's email + display_name.
CREATE OR REPLACE FUNCTION public.shares_org_with(p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members other ON me.org_id = other.org_id
    WHERE me.user_id = auth.uid() AND other.user_id = p_user
  );
$$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  9. POLICIES                                                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
-- Un user voit son propre profil + les profils des membres de ses orgas.
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  auth.uid() = id OR public.shares_org_with(id)
);
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

-- org_config (connexions partagées par orga)
DROP POLICY IF EXISTS "oc_select" ON public.org_config;
DROP POLICY IF EXISTS "oc_insert" ON public.org_config;
DROP POLICY IF EXISTS "oc_update" ON public.org_config;
DROP POLICY IF EXISTS "oc_delete" ON public.org_config;
-- Tous les membres lisent (l'app a besoin des clés pour fonctionner)
CREATE POLICY "oc_select" ON public.org_config FOR SELECT USING (public.is_org_member(org_id));
-- Seuls owner/admin écrivent
CREATE POLICY "oc_insert" ON public.org_config FOR INSERT WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY "oc_update" ON public.org_config FOR UPDATE USING (public.is_org_admin(org_id));
CREATE POLICY "oc_delete" ON public.org_config FOR DELETE USING (public.is_org_admin(org_id));

-- organization_invites
DROP POLICY IF EXISTS "oi_select" ON public.organization_invites;
DROP POLICY IF EXISTS "oi_insert" ON public.organization_invites;
DROP POLICY IF EXISTS "oi_update" ON public.organization_invites;
DROP POLICY IF EXISTS "oi_delete" ON public.organization_invites;
CREATE POLICY "oi_select" ON public.organization_invites FOR SELECT USING (
  public.is_org_admin(org_id) OR email = auth.email()
);
CREATE POLICY "oi_insert" ON public.organization_invites FOR INSERT WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY "oi_update" ON public.organization_invites FOR UPDATE USING (
  public.is_org_admin(org_id) OR email = auth.email()
);
CREATE POLICY "oi_delete" ON public.organization_invites FOR DELETE USING (public.is_org_admin(org_id));

-- activity_logs
-- Tous les membres peuvent insérer (logguer leurs actions)
-- Seuls les admins/owner peuvent lire
DROP POLICY IF EXISTS "al_select" ON public.activity_logs;
DROP POLICY IF EXISTS "al_insert" ON public.activity_logs;
CREATE POLICY "al_select" ON public.activity_logs FOR SELECT USING (public.is_org_admin(org_id));
CREATE POLICY "al_insert" ON public.activity_logs FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.is_org_member(org_id)
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  10. RPCs + TRIGGERS                                         ║
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
  v_count  int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF trim(p_name) = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.organizations WHERE owner_id = v_uid;
  IF v_count >= 1 THEN RAISE EXCEPTION 'org_limit_reached'; END IF;
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
-- ║  11. STORAGE — bucket "content" (vidéos + thumbnails)        ║
-- ╚══════════════════════════════════════════════════════════════╝
-- Arborescence :
--   videos/users/{user_id}/{uuid}.{ext}    ← solo mode
--   videos/orgs/{org_id}/{uuid}.{ext}      ← org mode
--   thumbs/users/{user_id}/{uuid}.jpg
--   thumbs/orgs/{org_id}/{uuid}.jpg

-- Bucket privé, 50 MB max par fichier (compatible free tier Supabase)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('content', 'content', false, 52428800)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 52428800, public = false;

-- RLS policies sur storage.objects
DROP POLICY IF EXISTS "content_select" ON storage.objects;
DROP POLICY IF EXISTS "content_insert" ON storage.objects;
DROP POLICY IF EXISTS "content_update" ON storage.objects;
DROP POLICY IF EXISTS "content_delete" ON storage.objects;

-- foldername(name) split le path en segments. Pour 'videos/users/abc-123/file.mp4'
-- ça retourne ['videos', 'users', 'abc-123']. Donc [2] = scope, [3] = id.
CREATE POLICY "content_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR
    ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_member((storage.foldername(name))[3]::uuid))
  )
);

CREATE POLICY "content_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR
    ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_member((storage.foldername(name))[3]::uuid))
  )
);

CREATE POLICY "content_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR
    ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_admin((storage.foldername(name))[3]::uuid))
  )
);

CREATE POLICY "content_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR
    ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_admin((storage.foldername(name))[3]::uuid))
  )
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  12. LICENSE KEYS                                            ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Super admin flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.license_keys (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  key          text        UNIQUE NOT NULL,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  activated_at timestamptz,
  expires_at   timestamptz,   -- NULL = lifetime
  is_active    boolean     DEFAULT true,
  plan         text        DEFAULT 'standard',
  notes        text
);

CREATE INDEX IF NOT EXISTS idx_license_keys_user ON public.license_keys(user_id);

ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

-- Super admin sees / manages everything
DROP POLICY IF EXISTS "lk_super_admin" ON public.license_keys;
CREATE POLICY "lk_super_admin" ON public.license_keys FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));

-- User can see their own activated key
DROP POLICY IF EXISTS "lk_owner_select" ON public.license_keys;
CREATE POLICY "lk_owner_select" ON public.license_keys FOR SELECT
  USING (user_id = auth.uid());

-- Org members can read the owner's key to validate org access
DROP POLICY IF EXISTS "lk_org_owner_select" ON public.license_keys;
CREATE POLICY "lk_org_owner_select" ON public.license_keys FOR SELECT
  USING (
    user_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.org_id
      WHERE om.user_id = auth.uid()
        AND o.owner_id = license_keys.user_id
    )
  );

-- Any authenticated user can see unclaimed keys (needed to validate before activating)
DROP POLICY IF EXISTS "lk_unactivated_select" ON public.license_keys;
CREATE POLICY "lk_unactivated_select" ON public.license_keys FOR SELECT
  USING (user_id IS NULL AND is_active = true);

-- Any authenticated user can activate an unclaimed key
DROP POLICY IF EXISTS "lk_activate" ON public.license_keys;
CREATE POLICY "lk_activate" ON public.license_keys FOR UPDATE
  USING (user_id IS NULL AND is_active = true)
  WITH CHECK (user_id = auth.uid());


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  13. Reload PostgREST schema cache                           ║
-- ╚══════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  14. CRÉDITS (user_credits + credit_codes)                   ║
-- ╚══════════════════════════════════════════════════════════════╝

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

CREATE POLICY "users_read_own_credits" ON public.user_credits
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "superadmin_all_credits" ON public.user_credits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

ALTER TABLE public.credit_codes ENABLE ROW LEVEL SECURITY;

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


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  15. STRIPE (abonnements auto)                               ║
-- ╚══════════════════════════════════════════════════════════════╝

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
