-- ================================================================
-- IG Tracker v2 — Supabase Schema (extension)
-- Colle ce SQL dans : Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- ── 1. Table phones ───────────────────────────────────────────────────────────
-- Stocke les cloud phones GéeLark synchronisés

create table if not exists public.phones (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  geelark_id  text not null,
  serial_no   text,
  phone_name  text not null,
  group_name  text,
  status      text default 'offline',
  ig_username text,
  followers   integer default 0,
  total_views bigint  default 0,
  video_count integer default 0,
  remark      text,
  synced_at   timestamptz default now(),
  created_at  timestamptz default now(),
  unique (user_id, geelark_id)
);

-- ── 2. Table content_bank ─────────────────────────────────────────────────────
-- Banque de vidéos / contenus

create table if not exists public.content_bank (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  title         text not null,
  file_url      text,
  thumbnail_url text,
  duration      integer,
  tags          text[] default '{}',
  notes         text default '',
  used_count    integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── 3. Table app_config ───────────────────────────────────────────────────────
-- Config par utilisateur (token GéeLark, thème, etc.)

create table if not exists public.app_config (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  bearer_token  text default '',
  theme         text default 'Bleu',
  lang          text default 'fr',
  updated_at    timestamptz default now()
);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

alter table public.phones        enable row level security;
alter table public.content_bank  enable row level security;
alter table public.app_config    enable row level security;

drop policy if exists "phones_all"       on public.phones;
drop policy if exists "bank_all"         on public.content_bank;
drop policy if exists "config_select"    on public.app_config;
drop policy if exists "config_insert"    on public.app_config;
drop policy if exists "config_update"    on public.app_config;

create policy "phones_all" on public.phones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bank_all" on public.content_bank
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "config_select" on public.app_config
  for select using (auth.uid() = user_id);

create policy "config_insert" on public.app_config
  for insert with check (auth.uid() = user_id);

create policy "config_update" on public.app_config
  for update using (auth.uid() = user_id);

-- ── 5. Index ──────────────────────────────────────────────────────────────────

create index if not exists idx_phones_user_id       on public.phones(user_id);
create index if not exists idx_phones_geelark_id    on public.phones(geelark_id);
create index if not exists idx_bank_user_id         on public.content_bank(user_id);
