-- ================================================================
-- IG Tracker v2 — Schéma complet (v1 → v8 consolidé)
-- ================================================================
-- 1 SEULE query à lancer dans Supabase → SQL Editor → New Query → Run.
-- Idempotent : safe à relancer plusieurs fois sans rien casser.
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

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

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
