-- Détail par compte des runs de publication (page Activité) : qui a posté, qui a
-- échoué et pourquoi. Jusqu'ici post_runs ne stockait que des compteurs (ok/err/total).
-- À exécuter une fois dans Supabase → SQL Editor. Idempotent.
alter table if exists public.post_runs
  add column if not exists details jsonb;

comment on column public.post_runs.details is
  'Détail par compte : [{ name, ok, error? }] — affiché dans Activité (comptes échoués).';

notify pgrst, 'reload schema';
