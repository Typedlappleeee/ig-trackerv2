-- ================================================================
-- ScaleFlow — Schéma complet consolidé (version finale)
-- Idempotent : safe à relancer plusieurs fois sans rien casser.
-- 1 seule query à lancer dans Supabase → SQL Editor → Run.
-- ================================================================


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  1. TABLES CORE                                              ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          text NOT NULL,
  full_name      text,
  display_name   text,
  is_super_admin boolean DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Backfill profiles manquants
INSERT INTO public.profiles (id, email)
SELECT u.id, u.email FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- ── user_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  content    text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── phones ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.phones (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid, -- FK ajoutée après organizations
  geelark_id  text NOT NULL,
  serial_no   text,
  phone_name  text NOT NULL,
  group_name  text,
  status      text DEFAULT 'offline',
  ig_username text,
  followers   integer DEFAULT 0,
  following   integer DEFAULT 0,
  total_views bigint  DEFAULT 0,
  video_count integer DEFAULT 0,
  bio         text,
  remark      text,
  ig_sessionid text,
  ig_status    text,
  synced_at   timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, geelark_id)
);

UPDATE public.phones SET ig_sessionid = NULL WHERE ig_sessionid = '';
UPDATE public.phones SET ig_status    = NULL WHERE ig_status    = 'unknown';

-- ── content_bank ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_bank (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id         uuid, -- FK ajoutée après organizations
  title          text NOT NULL,
  file_url       text,
  storage_path   text,
  thumbnail_path text,
  thumbnail_url  text,
  folder         text,
  duration       integer,
  tags           text[] DEFAULT '{}',
  notes          text DEFAULT '',
  used_count     integer DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ── app_config ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bearer_token      text DEFAULT '',
  theme             text DEFAULT 'Bleu',
  lang              text DEFAULT 'fr',
  groq_api_key      text DEFAULT '',
  anthropic_api_key text DEFAULT '',
  profile_name      text DEFAULT '',
  profile_niche     text DEFAULT '',
  profile_email     text,
  export_dir        text,
  proxy             text,
  ig_sessionid      text,
  push_port         integer DEFAULT 8765,
  notify_popup      boolean DEFAULT true,
  notify_sound      boolean DEFAULT true,
  onboarded_at      timestamptz,
  updated_at        timestamptz DEFAULT now()
);

-- ── views_history ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.views_history (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_id    uuid NOT NULL REFERENCES public.phones(id) ON DELETE CASCADE,
  views       bigint NOT NULL,
  recorded_at timestamptz DEFAULT now()
);

-- ── organizations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name_updated_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Ajouter les FK org_id sur phones / content_bank maintenant que organizations existe
DO $func$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'phones_org_id_fkey'
  ) THEN
    ALTER TABLE public.phones
      ADD CONSTRAINT phones_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_bank_org_id_fkey'
  ) THEN
    ALTER TABLE public.content_bank
      ADD CONSTRAINT content_bank_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END
$func$;

-- ── org_role_templates ─────────────────────────────────────────
-- Créé AVANT organization_members pour que la FK custom_role_id fonctionne
CREATE TABLE IF NOT EXISTS public.org_role_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  color          text NOT NULL DEFAULT '#7c3aed',
  perm_overrides jsonb NOT NULL DEFAULT '{}',
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);

-- ── organization_members ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  perm_overrides jsonb NOT NULL DEFAULT '{}',
  custom_role_id uuid REFERENCES public.org_role_templates(id) ON DELETE SET NULL,
  invited_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- ── org_config ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_config (
  org_id            uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  bearer_token      text DEFAULT '',
  groq_api_key      text DEFAULT '',
  anthropic_api_key text DEFAULT '',
  ig_sessionid      text,
  proxy             text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── organization_invites ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email          text NOT NULL,
  token          text NOT NULL UNIQUE,
  role           text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  perm_overrides jsonb NOT NULL DEFAULT '{}',
  custom_role_id uuid REFERENCES public.org_role_templates(id) ON DELETE SET NULL,
  invited_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── activity_logs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  user_email text,
  action     text NOT NULL,
  details    jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── license_keys ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.license_keys (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  key                    text        UNIQUE NOT NULL,
  user_id                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  plan                   text        DEFAULT 'standard',
  is_active              boolean     DEFAULT true,
  notes                  text,
  activated_at           timestamptz,
  expires_at             timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_status          text,
  created_at             timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS license_keys_stripe_sub_uidx
  ON public.license_keys (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── user_credits ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance               numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_monthly_grant_at timestamptz,
  updated_at            timestamptz DEFAULT now()
);
-- Migrate existing integer balance to numeric if needed
DO $func$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_credits' AND column_name='balance'
    AND data_type='integer'
  ) THEN
    ALTER TABLE public.user_credits ALTER COLUMN balance TYPE numeric(12,2) USING balance::numeric;
  END IF;
END
$func$;

-- ── credit_codes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  amount     integer NOT NULL CHECK (amount > 0),
  created_by uuid REFERENCES auth.users(id),
  used_by    uuid REFERENCES auth.users(id),
  used_at    timestamptz,
  is_active  boolean NOT NULL DEFAULT true,
  notes      text,
  created_at timestamptz DEFAULT now()
);

-- ── support_tickets ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_email  text NOT NULL,
  org_name    text,
  subject     text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  status      text NOT NULL DEFAULT 'open',
  priority    text NOT NULL DEFAULT 'normal',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ticket_messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  is_admin     boolean NOT NULL DEFAULT false,
  message      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── scheduled_posts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  type            text NOT NULL DEFAULT 'posting',
  status          text NOT NULL DEFAULT 'pending',
  scheduled_at    timestamptz NOT NULL,
  phones          jsonb NOT NULL DEFAULT '[]',
  videos          jsonb NOT NULL DEFAULT '[]',
  caption         text NOT NULL DEFAULT '',
  delay_minutes   integer NOT NULL DEFAULT 0,
  mode            text NOT NULL DEFAULT 'seq',
  bearer_token    text NOT NULL DEFAULT '',
  reels_trial     boolean NOT NULL DEFAULT false,
  result          jsonb,
  error_msg       text,
  executed_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  2. TABLES COMMUNITY                                         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── platform_admins ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users
);

-- ── user_profiles (community) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text NOT NULL DEFAULT '',
  avatar_url      text,
  name_updated_at timestamptz,
  updated_at      timestamptz DEFAULT now()
);

-- ── community_messages ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_messages (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content        text NOT NULL CHECK (char_length(content) <= 2000),
  display_name   text NOT NULL DEFAULT '',
  avatar_url     text,
  org_name       text,
  channel        text NOT NULL DEFAULT 'chat',
  title          text,
  is_admin       boolean NOT NULL DEFAULT false,
  thread_user_id uuid,
  video_url      text,
  created_at     timestamptz DEFAULT now()
);

-- ── community_reactions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_reactions (
  user_id    uuid NOT NULL REFERENCES auth.users,
  message_id uuid NOT NULL REFERENCES public.community_messages ON DELETE CASCADE,
  PRIMARY KEY (user_id, message_id)
);

-- ── community_mutes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_mutes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users,
  muted_by    uuid NOT NULL REFERENCES auth.users,
  muted_until timestamptz NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ── community_topics ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_topics (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) <= 40),
  description text CHECK (description IS NULL OR char_length(description) <= 140),
  emoji       text NOT NULL DEFAULT '💬',
  created_by  uuid NOT NULL REFERENCES auth.users,
  is_private  boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- ── community_topic_members ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_topic_members (
  topic_id  uuid NOT NULL REFERENCES public.community_topics ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)
);

-- ── topic_messages ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.topic_messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id     uuid NOT NULL REFERENCES public.community_topics ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users,
  content      text NOT NULL CHECK (char_length(content) <= 2000),
  display_name text NOT NULL DEFAULT '',
  avatar_url   text,
  org_name     text,
  is_admin     boolean NOT NULL DEFAULT false,
  video_url    text,
  created_at   timestamptz DEFAULT now()
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  3. INDEX                                                    ║
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
CREATE INDEX IF NOT EXISTS idx_activity_logs_org      ON public.activity_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_keys_user      ON public.license_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user   ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org    ON public.support_tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user   ON public.scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_org    ON public.scheduled_posts(org_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON public.scheduled_posts(status);

-- Dédup phones d'orga (garde la plus ancienne par org_id + geelark_id)
DELETE FROM public.phones a
USING public.phones b
WHERE a.org_id IS NOT NULL
  AND a.org_id = b.org_id
  AND a.geelark_id = b.geelark_id
  AND a.id != b.id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS phones_org_geelark_uniq
  ON public.phones(org_id, geelark_id) WHERE org_id IS NOT NULL;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  4. ACTIVER RLS                                              ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_bank          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.views_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_role_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_mutes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_topics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_topic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_messages        ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  5. FONCTIONS HELPER (SECURITY DEFINER — utilisées par RLS)  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- IMPORTANT : LANGUAGE plpgsql SECURITY DEFINER évite la récursion infinie
-- dans les policies RLS ("infinite recursion detected in policy...").

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org AND user_id = auth.uid() AND role IN ('owner','admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.shares_org_with(p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members other ON me.org_id = other.org_id
    WHERE me.user_id = auth.uid() AND other.user_id = p_user
  );
END;
$$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  6. POLICIES RLS                                             ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── profiles ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  auth.uid() = id OR public.shares_org_with(id)
);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ── user_items ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "items_all" ON public.user_items;
CREATE POLICY "items_all" ON public.user_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── app_config ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "config_select" ON public.app_config;
DROP POLICY IF EXISTS "config_insert" ON public.app_config;
DROP POLICY IF EXISTS "config_update" ON public.app_config;
CREATE POLICY "config_select" ON public.app_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "config_insert" ON public.app_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "config_update" ON public.app_config FOR UPDATE USING (auth.uid() = user_id);

-- ── views_history ──────────────────────────────────────────────
DROP POLICY IF EXISTS "views_history_all" ON public.views_history;
CREATE POLICY "views_history_all" ON public.views_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── phones ─────────────────────────────────────────────────────
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

-- ── content_bank ───────────────────────────────────────────────
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

-- ── organizations ──────────────────────────────────────────────
DROP POLICY IF EXISTS "org_select" ON public.organizations;
DROP POLICY IF EXISTS "org_insert" ON public.organizations;
DROP POLICY IF EXISTS "org_update" ON public.organizations;
DROP POLICY IF EXISTS "org_delete" ON public.organizations;
CREATE POLICY "org_select" ON public.organizations FOR SELECT USING (public.is_org_member(id));
CREATE POLICY "org_insert" ON public.organizations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "org_update" ON public.organizations FOR UPDATE USING (public.is_org_admin(id));
CREATE POLICY "org_delete" ON public.organizations FOR DELETE USING (owner_id = auth.uid());

-- ── organization_members ───────────────────────────────────────
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

-- ── org_role_templates ─────────────────────────────────────────
DROP POLICY IF EXISTS "ort_select" ON public.org_role_templates;
DROP POLICY IF EXISTS "ort_all"    ON public.org_role_templates;
CREATE POLICY "ort_select" ON public.org_role_templates FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "ort_all"    ON public.org_role_templates FOR ALL   USING (public.is_org_admin(org_id));

-- ── org_config ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "oc_select" ON public.org_config;
DROP POLICY IF EXISTS "oc_insert" ON public.org_config;
DROP POLICY IF EXISTS "oc_update" ON public.org_config;
DROP POLICY IF EXISTS "oc_delete" ON public.org_config;
CREATE POLICY "oc_select" ON public.org_config FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "oc_insert" ON public.org_config FOR INSERT WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY "oc_update" ON public.org_config FOR UPDATE USING (public.is_org_admin(org_id));
CREATE POLICY "oc_delete" ON public.org_config FOR DELETE USING (public.is_org_admin(org_id));

-- ── organization_invites ───────────────────────────────────────
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

-- ── activity_logs ──────────────────────────────────────────────
DROP POLICY IF EXISTS "al_select" ON public.activity_logs;
DROP POLICY IF EXISTS "al_insert" ON public.activity_logs;
CREATE POLICY "al_select" ON public.activity_logs FOR SELECT USING (public.is_org_admin(org_id));
CREATE POLICY "al_insert" ON public.activity_logs FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.is_org_member(org_id)
);

-- ── license_keys ───────────────────────────────────────────────
DROP POLICY IF EXISTS "lk_super_admin"        ON public.license_keys;
DROP POLICY IF EXISTS "lk_owner_select"       ON public.license_keys;
DROP POLICY IF EXISTS "lk_org_owner_select"   ON public.license_keys;
DROP POLICY IF EXISTS "lk_unactivated_select" ON public.license_keys;
DROP POLICY IF EXISTS "lk_activate"           ON public.license_keys;
CREATE POLICY "lk_super_admin" ON public.license_keys FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));
CREATE POLICY "lk_owner_select" ON public.license_keys FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "lk_org_owner_select" ON public.license_keys FOR SELECT
  USING (
    user_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.org_id
      WHERE om.user_id = auth.uid() AND o.owner_id = license_keys.user_id
    )
  );
CREATE POLICY "lk_unactivated_select" ON public.license_keys FOR SELECT
  USING (user_id IS NULL AND is_active = true);
CREATE POLICY "lk_activate" ON public.license_keys FOR UPDATE
  USING (user_id IS NULL AND is_active = true)
  WITH CHECK (user_id = auth.uid());

-- ── user_credits ───────────────────────────────────────────────
DROP POLICY IF EXISTS "users_read_own_credits" ON public.user_credits;
DROP POLICY IF EXISTS "superadmin_all_credits" ON public.user_credits;
CREATE POLICY "users_read_own_credits" ON public.user_credits
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "superadmin_all_credits" ON public.user_credits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- ── credit_codes ───────────────────────────────────────────────
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

-- ── support_tickets ────────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_user_select" ON public.support_tickets;
DROP POLICY IF EXISTS "tickets_user_insert" ON public.support_tickets;
DROP POLICY IF EXISTS "tickets_user_update" ON public.support_tickets;
CREATE POLICY "tickets_user_select" ON public.support_tickets
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tickets_user_insert" ON public.support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tickets_user_update" ON public.support_tickets
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── ticket_messages ────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_user_select" ON public.ticket_messages;
DROP POLICY IF EXISTS "messages_user_insert" ON public.ticket_messages;
CREATE POLICY "messages_user_select" ON public.ticket_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    OR sender_id = auth.uid()
  );
CREATE POLICY "messages_user_insert" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND NOT is_admin
    AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );

-- ── scheduled_posts ────────────────────────────────────────────
DROP POLICY IF EXISTS "sched_own"    ON public.scheduled_posts;
DROP POLICY IF EXISTS "sched_read"   ON public.scheduled_posts;
DROP POLICY IF EXISTS "sched_insert" ON public.scheduled_posts;
DROP POLICY IF EXISTS "sched_update" ON public.scheduled_posts;
CREATE POLICY "sched_read" ON public.scheduled_posts FOR SELECT USING (
  auth.uid() = user_id
  OR (org_id IS NOT NULL AND public.is_org_member(org_id))
);
CREATE POLICY "sched_insert" ON public.scheduled_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sched_update" ON public.scheduled_posts FOR UPDATE USING (
  auth.uid() = user_id
  OR (org_id IS NOT NULL AND public.is_org_admin(org_id))
);

-- ── platform_admins ────────────────────────────────────────────
DROP POLICY IF EXISTS "platform_admins_read" ON public.platform_admins;
CREATE POLICY "platform_admins_read" ON public.platform_admins
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── user_profiles (community) ──────────────────────────────────
DROP POLICY IF EXISTS "profiles_read" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_own"  ON public.user_profiles;
CREATE POLICY "profiles_read" ON public.user_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_own"  ON public.user_profiles FOR ALL   USING (auth.uid() = user_id);

-- ── community_messages ─────────────────────────────────────────
DROP POLICY IF EXISTS "community_read"   ON public.community_messages;
DROP POLICY IF EXISTS "community_insert" ON public.community_messages;
DROP POLICY IF EXISTS "community_delete" ON public.community_messages;
CREATE POLICY "community_read"   ON public.community_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "community_insert" ON public.community_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_delete" ON public.community_messages FOR DELETE USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
);

-- ── community_reactions ────────────────────────────────────────
DROP POLICY IF EXISTS "reactions_read"   ON public.community_reactions;
DROP POLICY IF EXISTS "reactions_insert" ON public.community_reactions;
DROP POLICY IF EXISTS "reactions_delete" ON public.community_reactions;
CREATE POLICY "reactions_read"   ON public.community_reactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "reactions_insert" ON public.community_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions_delete" ON public.community_reactions FOR DELETE USING (auth.uid() = user_id);

-- ── community_mutes ────────────────────────────────────────────
DROP POLICY IF EXISTS "mutes_read"   ON public.community_mutes;
DROP POLICY IF EXISTS "mutes_insert" ON public.community_mutes;
CREATE POLICY "mutes_read"   ON public.community_mutes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "mutes_insert" ON public.community_mutes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
);

-- ── community_topics ───────────────────────────────────────────
DROP POLICY IF EXISTS "topics_read"   ON public.community_topics;
DROP POLICY IF EXISTS "topics_insert" ON public.community_topics;
DROP POLICY IF EXISTS "topics_delete" ON public.community_topics;
CREATE POLICY "topics_read"   ON public.community_topics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "topics_insert" ON public.community_topics FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "topics_delete" ON public.community_topics FOR DELETE USING (
  auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
);

-- ── community_topic_members ────────────────────────────────────
DROP POLICY IF EXISTS "topic_members_read"   ON public.community_topic_members;
DROP POLICY IF EXISTS "topic_members_insert" ON public.community_topic_members;
DROP POLICY IF EXISTS "topic_members_delete" ON public.community_topic_members;
CREATE POLICY "topic_members_read"   ON public.community_topic_members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "topic_members_insert" ON public.community_topic_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "topic_members_delete" ON public.community_topic_members FOR DELETE USING (auth.uid() = user_id);

-- ── topic_messages ─────────────────────────────────────────────
DROP POLICY IF EXISTS "topic_messages_read"   ON public.topic_messages;
DROP POLICY IF EXISTS "topic_messages_insert" ON public.topic_messages;
DROP POLICY IF EXISTS "topic_messages_delete" ON public.topic_messages;
CREATE POLICY "topic_messages_read"   ON public.topic_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "topic_messages_insert" ON public.topic_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "topic_messages_delete" ON public.topic_messages FOR DELETE USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  7. TRIGGERS + RPCs                                          ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Auto-créer le profil à l'inscription ──────────────────────
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

-- ── Auto-ajouter l'owner comme membre d'orga ──────────────────
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

-- ── Auto-updated_at sur support_tickets ───────────────────────
CREATE OR REPLACE FUNCTION public.update_ticket_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_updated_at ON public.support_tickets;
CREATE TRIGGER trg_ticket_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_ticket_updated_at();

CREATE OR REPLACE FUNCTION public.bump_ticket_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bump_ticket_on_message ON public.ticket_messages;
CREATE TRIGGER trg_bump_ticket_on_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_ticket_on_message();

-- ── RPC : créer une organisation ──────────────────────────────
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
  RETURN v_org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_org(text) TO authenticated;

-- ── RPC : accepter une invitation ─────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_org_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite public.organization_invites%ROWTYPE;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_invite FROM public.organization_invites WHERE token = p_token FOR UPDATE;
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

-- ── RPC : déduire des crédits (atomique) ──────────────────────
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

-- ── RPC : utiliser un code crédit (compte perso) ──────────────
CREATE OR REPLACE FUNCTION public.redeem_credit_code(p_code text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code_id     uuid;
  v_amount      integer;
  v_new_balance integer;
BEGIN
  SELECT id, amount INTO v_code_id, v_amount
  FROM public.credit_codes
  WHERE code = UPPER(p_code) AND is_active = true AND used_by IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code invalide ou déjà utilisé');
  END IF;
  UPDATE public.credit_codes SET used_by = p_user_id, used_at = now()
  WHERE id = v_code_id AND used_by IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code déjà utilisé');
  END IF;
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, v_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_credits.balance + v_amount, updated_at = now()
  RETURNING balance INTO v_new_balance;
  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'balance', v_new_balance);
END;
$$;

-- ── RPC : utiliser un code crédit (compte orga) ───────────────
CREATE OR REPLACE FUNCTION public.redeem_credit_code_for_org(p_code text, p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code_id     uuid;
  v_amount      integer;
  v_owner_id    uuid;
  v_new_balance integer;
  v_is_member   boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members WHERE org_id = p_org_id AND user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND owner_id = auth.uid()
  ) INTO v_is_member;
  IF NOT v_is_member THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Non autorisé');
  END IF;
  SELECT id, amount INTO v_code_id, v_amount
  FROM public.credit_codes
  WHERE code = UPPER(p_code) AND is_active = true AND used_by IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code invalide ou déjà utilisé');
  END IF;
  UPDATE public.credit_codes SET used_by = auth.uid(), used_at = now()
  WHERE id = v_code_id AND used_by IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code déjà utilisé');
  END IF;
  SELECT owner_id INTO v_owner_id FROM public.organizations WHERE id = p_org_id;
  INSERT INTO public.user_credits (user_id, balance) VALUES (v_owner_id, v_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_credits.balance + v_amount, updated_at = now()
  RETURNING balance INTO v_new_balance;
  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'balance', v_new_balance);
END;
$$;

-- ── RPC : crédits mensuels (idempotent) ───────────────────────
CREATE OR REPLACE FUNCTION public.maybe_grant_monthly_credits(p_user_id uuid, p_plan_credits integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_last_grant timestamptz;
BEGIN
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT last_monthly_grant_at INTO v_last_grant
  FROM public.user_credits WHERE user_id = p_user_id;
  IF v_last_grant IS NULL OR
     date_trunc('month', v_last_grant AT TIME ZONE 'UTC') < date_trunc('month', now() AT TIME ZONE 'UTC') THEN
    UPDATE public.user_credits
    SET balance = balance + p_plan_credits, last_monthly_grant_at = now(), updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- ── RPC : solde crédits de l'orga (visible aux membres) ───────
CREATE OR REPLACE FUNCTION public.get_org_credit_balance(p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_id  uuid;
  v_balance   numeric(12,2);
  v_is_member boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members WHERE org_id = p_org_id AND user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND owner_id = auth.uid()
  ) INTO v_is_member;
  IF NOT v_is_member THEN RETURN 0; END IF;
  SELECT owner_id INTO v_owner_id FROM public.organizations WHERE id = p_org_id;
  SELECT COALESCE(balance, 0) INTO v_balance
  FROM public.user_credits WHERE user_id = v_owner_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

-- ── RPC Stripe : provisionner/mettre à jour un abonnement ─────
CREATE OR REPLACE FUNCTION public.provision_stripe_subscription(
  p_user_id         uuid,
  p_customer_id     text,
  p_subscription_id text,
  p_plan            text,
  p_status          text,
  p_expires_at      timestamptz
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing_id uuid;
  v_active      boolean := (p_status IN ('active', 'trialing'));
BEGIN
  SELECT id INTO v_existing_id FROM public.license_keys
  WHERE stripe_subscription_id = p_subscription_id;
  IF v_existing_id IS NOT NULL THEN
    UPDATE public.license_keys SET
      plan = p_plan, expires_at = p_expires_at, is_active = v_active,
      stripe_status = p_status, stripe_customer_id = p_customer_id, user_id = p_user_id
    WHERE id = v_existing_id;
  ELSE
    UPDATE public.license_keys SET is_active = false
    WHERE user_id = p_user_id AND is_active = true;
    INSERT INTO public.license_keys (
      key, plan, is_active, user_id, activated_at, expires_at,
      stripe_customer_id, stripe_subscription_id, stripe_status
    ) VALUES (
      'STRIPE-' || p_subscription_id, p_plan, v_active, p_user_id, now(), p_expires_at,
      p_customer_id, p_subscription_id, p_status
    );
  END IF;
END;
$$;

-- ── RPC Stripe : annuler un abonnement ────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_stripe_subscription(p_subscription_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.license_keys
  SET is_active = false, stripe_status = 'canceled'
  WHERE stripe_subscription_id = p_subscription_id;
END;
$$;

-- ── RPC Stripe : renouveler les crédits (ajoute, n'écrase pas) ─
CREATE OR REPLACE FUNCTION public.renew_credits_from_subscription(p_subscription_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_plan    text;
  v_credits int;
BEGIN
  SELECT user_id, plan INTO v_user_id, v_plan
  FROM public.license_keys WHERE stripe_subscription_id = p_subscription_id;
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_credits := CASE v_plan WHEN 'standard' THEN 2000 WHEN 'pro' THEN 5500 ELSE 0 END;
  IF v_credits > 0 THEN
    INSERT INTO public.user_credits (user_id, balance, last_monthly_grant_at)
    VALUES (v_user_id, v_credits, now())
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_credits.balance + v_credits,
        last_monthly_grant_at = now(), updated_at = now();
  END IF;
END;
$$;

-- ── RPCs admin support ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_support_tickets()
RETURNS TABLE (
  id uuid, user_id uuid, org_id uuid, user_email text, org_name text,
  subject text, description text, category text, status text, priority text,
  created_at timestamptz, updated_at timestamptz, message_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT t.id, t.user_id, t.org_id, t.user_email, t.org_name,
           t.subject, t.description, t.category, t.status, t.priority,
           t.created_at, t.updated_at, count(m.id)::bigint
    FROM public.support_tickets t
    LEFT JOIN public.ticket_messages m ON m.ticket_id = t.id
    GROUP BY t.id ORDER BY t.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ticket_messages_admin(p_ticket_id uuid)
RETURNS TABLE (
  id uuid, ticket_id uuid, sender_id uuid, sender_email text,
  is_admin boolean, message text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT m.id, m.ticket_id, m.sender_id, m.sender_email, m.is_admin, m.message, m.created_at
    FROM public.ticket_messages m WHERE m.ticket_id = p_ticket_id ORDER BY m.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reply_ticket(p_ticket_id uuid, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_email, is_admin, message)
  VALUES (p_ticket_id, auth.uid(), COALESCE(v_email, 'admin'), true, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_ticket(
  p_ticket_id uuid, p_status text DEFAULT NULL, p_priority text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  UPDATE public.support_tickets
  SET status = COALESCE(p_status, status), priority = COALESCE(p_priority, priority), updated_at = now()
  WHERE id = p_ticket_id;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  8. STORAGE                                                  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Bucket "content" — privé, 50 MB max (vidéos + thumbnails)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('content', 'content', false, 52428800)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 52428800, public = false;

DROP POLICY IF EXISTS "content_select" ON storage.objects;
DROP POLICY IF EXISTS "content_insert" ON storage.objects;
DROP POLICY IF EXISTS "content_update" ON storage.objects;
DROP POLICY IF EXISTS "content_delete" ON storage.objects;

-- Arborescence : videos/users/{uid}/ ou videos/orgs/{org_id}/
-- foldername(name)[2] = 'users'|'orgs', foldername(name)[3] = id
CREATE POLICY "content_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_member((storage.foldername(name))[3]::uuid))
  )
);
CREATE POLICY "content_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_member((storage.foldername(name))[3]::uuid))
  )
);
CREATE POLICY "content_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_admin((storage.foldername(name))[3]::uuid))
  )
);
CREATE POLICY "content_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'content' AND (
    ((storage.foldername(name))[2] = 'users' AND (storage.foldername(name))[3]::uuid = auth.uid())
    OR ((storage.foldername(name))[2] = 'orgs'  AND public.is_org_admin((storage.foldername(name))[3]::uuid))
  )
);

-- Bucket "avatars" — public
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
CREATE POLICY "avatars_select" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND auth.role() = 'authenticated'
);
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Bucket "community" — vidéos publiques de la communauté
DROP POLICY IF EXISTS "community_select" ON storage.objects;
DROP POLICY IF EXISTS "community_insert" ON storage.objects;
DROP POLICY IF EXISTS "community_delete" ON storage.objects;
CREATE POLICY "community_select" ON storage.objects FOR SELECT USING (bucket_id = 'community');
CREATE POLICY "community_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'community' AND auth.role() = 'authenticated'
);
CREATE POLICY "community_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'community' AND auth.uid()::text = (storage.foldername(name))[1]
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  9. DONNÉES INITIALES                                        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Super admins
UPDATE public.profiles SET is_super_admin = true
WHERE email IN ('quentin.auneau1@gmail.com', 'tintin.aunea@gmail.com');

-- Platform admin communauté
INSERT INTO public.platform_admins (user_id)
VALUES ('e741158b-4cb3-4e19-bff0-8c7f963bc3ba')
ON CONFLICT DO NOTHING;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  10. RELOAD CACHE POSTGREST                                  ║
-- ╚══════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';
