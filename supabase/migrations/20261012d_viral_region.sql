-- Veille Reels : pays du compte surveillé (filtre FR / US). Comptes existants = FR.
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
alter table public.viral_watch add column if not exists region text not null default 'fr';
