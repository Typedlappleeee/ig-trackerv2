-- ================================================================
-- IG Tracker v2 — Schema extension v3
-- ================================================================

-- ── 1. Historique des vues (pour le chart dashboard) ─────────────────────────
create table if not exists public.views_history (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  phone_id   uuid references public.phones(id) on delete cascade not null,
  views      bigint not null,
  recorded_at timestamptz default now()
);

alter table public.views_history enable row level security;
drop policy if exists "views_history_all" on public.views_history;
create policy "views_history_all" on public.views_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_views_history_phone on public.views_history(phone_id);
create index if not exists idx_views_history_ts    on public.views_history(recorded_at);

-- ── 2. Ajouter groq_api_key à app_config ─────────────────────────────────────
alter table public.app_config
  add column if not exists groq_api_key text default '',
  add column if not exists profile_name text default '',
  add column if not exists profile_niche text default '';

-- ── 3. Ajouter les champs manquants à phones ──────────────────────────────────
alter table public.phones
  add column if not exists following   integer default 0,
  add column if not exists bio         text default '';

-- ── 4. Ajouter posted_count à content_bank ────────────────────────────────────
-- (already has used_count, rename semantics: used_count = nb de fois postée)
