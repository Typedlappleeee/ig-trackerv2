-- ================================================================
-- IG Tracker — Supabase Schema
-- Colle ce SQL dans : Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- ── 1. Table profiles (données de profil par utilisateur) ─────────────────────
-- Créée automatiquement à chaque inscription

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 2. Table user_items (exemple de données utilisateur) ─────────────────────
-- Remplace cette table par tes vraies données (téléphones, vidéos, etc.)

create table if not exists public.user_items (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  title      text not null,
  content    text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 3. Row Level Security (RLS) ───────────────────────────────────────────────
-- Chaque utilisateur NE VOIT QUE SES données — garanti côté base de données

alter table public.profiles   enable row level security;
alter table public.user_items enable row level security;

-- Supprimer les policies existantes si besoin
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "items_all"       on public.user_items;

-- Profiles : chaque user voit/modifie uniquement son profil
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- user_items : chaque user voit/modifie uniquement ses items
create policy "items_all" on public.user_items
  for all
  using     (auth.uid() = user_id)   -- lecture : seulement ses items
  with check (auth.uid() = user_id); -- écriture : seulement ses items

-- ── 4. Index pour les performances ───────────────────────────────────────────

create index if not exists idx_user_items_user_id on public.user_items(user_id);

-- ── 5. Trigger : crée le profil automatiquement à l'inscription ──────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
