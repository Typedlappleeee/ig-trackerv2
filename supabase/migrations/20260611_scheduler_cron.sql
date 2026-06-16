-- Cron serveur pour les posts programmés.
-- Appelle l'edge function run-scheduled-posts toutes les minutes, pour que les
-- posts partent même quand l'application est fermée.
--
-- AVANT d'exécuter ce fichier dans Supabase → SQL Editor :
--   1. Déployer la fonction :  supabase functions deploy run-scheduled-posts --no-verify-jwt
--   2. Créer le secret :        supabase secrets set CRON_SECRET=<uuid-aléatoire>
--   3. Remplacer ci-dessous <PROJECT-REF> et <CRON_SECRET> par tes valeurs.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Supprime un éventuel job précédent du même nom
select cron.unschedule('run-scheduled-posts')
where exists (select 1 from cron.job where jobname = 'run-scheduled-posts');

select cron.schedule(
  'run-scheduled-posts',
  '* * * * *',   -- toutes les minutes
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/run-scheduled-posts',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5 * 60 * 1000
  );
  $$
);
