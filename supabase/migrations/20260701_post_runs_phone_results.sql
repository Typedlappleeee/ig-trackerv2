-- Détail par compte des runs directs (Mass Posting / Posting) pour l'historique
-- cliquable : quels comptes ont réussi / échoué, avec la raison.
alter table public.post_runs add column if not exists phone_results jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
