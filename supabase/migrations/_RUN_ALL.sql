-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  À EXÉCUTER UNE FOIS dans Supabase → SQL Editor (copie-colle tout) ║
-- ║  Tout est idempotent (IF NOT EXISTS / OR REPLACE) → sans risque.   ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ════════════════ 1. RAPPORTS (dashboard journalier) ════════════════
alter table public.app_config add column if not exists tracking_config jsonb default '{}'::jsonb;
alter table public.org_config add column if not exists tracking_config jsonb default '{}'::jsonb;

create table if not exists public.account_daily (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id)           on delete cascade,
  org_id      uuid references public.organizations(id) on delete cascade,
  phone_id    uuid,
  ig_username text not null,
  va          text,
  day         date not null,
  posted      boolean not null default false,
  posted_via  text,
  posted_at   timestamptz,
  reel_url    text,
  reel_thumb  text,
  views       integer,
  likes       integer,
  comments    integer,
  synced_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists account_daily_uniq
  on public.account_daily (coalesce(org_id::text, user_id::text), phone_id, day);
create index if not exists account_daily_owner_day on public.account_daily (user_id, day desc);
create index if not exists account_daily_org_day   on public.account_daily (org_id,  day desc);
alter table public.account_daily enable row level security;
drop policy if exists ad_select on public.account_daily;
create policy ad_select on public.account_daily for select using (
  user_id = auth.uid() or (org_id is not null and public.is_org_member(org_id))
);

-- ════════════════ 2. STATS DE POSTING (Hub / Historique) ════════════
CREATE TABLE IF NOT EXISTS post_runs (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users NOT NULL,
  org_id     uuid,
  type       text NOT NULL CHECK (type IN ('posting', 'mass_posting', 'story')),
  ok_count   integer NOT NULL DEFAULT 0,
  err_count  integer NOT NULL DEFAULT 0,
  total      integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE post_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_runs_own" ON post_runs;
CREATE POLICY "post_runs_own" ON post_runs FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "post_runs_org" ON post_runs;
CREATE POLICY "post_runs_org" ON post_runs FOR SELECT
  USING (org_id IS NOT NULL AND is_org_member(org_id));
CREATE INDEX IF NOT EXISTS post_runs_user_created ON post_runs (user_id, created_at DESC);

-- ════════════════ 3. LICENCE ORGA (enlève le 404 org_owner_plan) ════
CREATE OR REPLACE FUNCTION public.org_owner_plan(p_org uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_owner uuid; v_super boolean; v_plan text; v_exp timestamptz;
BEGIN
  SELECT owner_id INTO v_owner FROM public.organizations WHERE id = p_org;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE org_id = p_org AND user_id = auth.uid()) THEN
    RETURN NULL;
  END IF;
  SELECT is_super_admin INTO v_super FROM public.profiles WHERE id = v_owner;
  IF v_super THEN RETURN 'pro'; END IF;
  SELECT plan, expires_at INTO v_plan, v_exp FROM public.license_keys
    WHERE user_id = v_owner AND is_active = true ORDER BY expires_at DESC NULLS FIRST LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_exp IS NOT NULL AND v_exp <= now() THEN RETURN NULL; END IF;
  RETURN COALESCE(v_plan, 'standard');
END;
$$;
GRANT EXECUTE ON FUNCTION public.org_owner_plan(uuid) TO authenticated;

-- Recharge le cache PostgREST pour que les nouvelles tables/fonctions soient vues.
notify pgrst, 'reload schema';
