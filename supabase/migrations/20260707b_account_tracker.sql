-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Suivi des comptes (tableau partagé équipe) — page Rapports.        ║
-- ║  Chaque ligne = un compte suivi à la main : nom, modèle, marché,    ║
-- ║  dossier, pseudo, mail + statut par plateforme (Insta/TikTok/…).    ║
-- ║  Partagé org (org_members) OU perso (user_id). Édition à plusieurs   ║
-- ║  propre : 1 case = 1 update de ligne, pas d'écrasement.             ║
-- ║  À exécuter une fois dans Supabase → SQL Editor. Idempotent.        ║
-- ╚══════════════════════════════════════════════════════════════════╝

create table if not exists public.account_tracker (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid,
  user_id    uuid not null,
  name       text,     -- nom du compte (ex. « insta perle… »)
  model      text,     -- modèle
  market     text,     -- marché (FR / US / …)
  folder     text,     -- dossier
  pseudo     text,     -- @pseudo
  mail       text,
  insta      text,     -- statut : Bon / Warm-up / Shadowban / Banni / …
  tiktok     text,
  threads    text,
  youtube    text,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_acct_tracker_scope on public.account_tracker (org_id, user_id);

alter table public.account_tracker enable row level security;

create policy "acct_tracker_select" on public.account_tracker for select using (
  auth.uid() = user_id
  or (org_id is not null and exists (select 1 from org_members m where m.org_id = account_tracker.org_id and m.user_id = auth.uid()))
);
create policy "acct_tracker_insert" on public.account_tracker for insert with check (
  auth.uid() = user_id
  or (org_id is not null and exists (select 1 from org_members m where m.org_id = account_tracker.org_id and m.user_id = auth.uid()))
);
create policy "acct_tracker_update" on public.account_tracker for update using (
  auth.uid() = user_id
  or (org_id is not null and exists (select 1 from org_members m where m.org_id = account_tracker.org_id and m.user_id = auth.uid()))
);
create policy "acct_tracker_delete" on public.account_tracker for delete using (
  auth.uid() = user_id
  or (org_id is not null and exists (select 1 from org_members m where m.org_id = account_tracker.org_id and m.user_id = auth.uid()))
);

notify pgrst, 'reload schema';
