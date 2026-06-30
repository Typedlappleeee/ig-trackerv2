-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Infos compte enrichies : photo de profil, dernier post, statut.   ║
-- ║  À exécuter une fois dans Supabase → SQL Editor. Idempotent.       ║
-- ╚══════════════════════════════════════════════════════════════════╝

alter table public.phones add column if not exists pp_url       text;
alter table public.phones add column if not exists last_post_at  timestamptz;
-- account_state : 'ok' | 'banned' (non joignable) | 'shadow' (portée faible, indicatif)
alter table public.phones add column if not exists account_state text;

notify pgrst, 'reload schema';
