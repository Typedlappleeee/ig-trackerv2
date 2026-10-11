-- Veille des Reels viraux (admin) : comptes surveillés + leurs derniers Reels avec
-- un score « au-dessus de la normale » (vues / médiane du compte).
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
create table if not exists public.viral_watch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  org_id uuid,
  username text not null,
  niche text not null default '',
  fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create table if not exists public.viral_reels (
  watch_id uuid not null references public.viral_watch(id) on delete cascade,
  code text not null,
  username text not null,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  taken_at timestamptz,
  thumb text,
  url text,
  baseline bigint not null default 0,
  score real not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (watch_id, code)
);
create index if not exists viral_reels_taken on public.viral_reels (taken_at desc);
alter table public.viral_watch enable row level security;
alter table public.viral_reels enable row level security;
drop policy if exists viral_watch_rw on public.viral_watch;
create policy viral_watch_rw on public.viral_watch for all
  using (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = viral_watch.org_id and m.user_id = auth.uid())))
  with check (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = viral_watch.org_id and m.user_id = auth.uid())));
drop policy if exists viral_reels_read on public.viral_reels;
create policy viral_reels_read on public.viral_reels for select using (exists (select 1 from public.viral_watch w where w.id = viral_reels.watch_id));
