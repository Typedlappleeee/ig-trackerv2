-- Cron serveur pour la synchro Google Drive → banque.
-- Appelle l'edge function sync-drive toutes les heures, même app fermée.
--
-- AVANT d'exécuter ce fichier dans Supabase → SQL Editor :
--   1. Déployer la fonction :  supabase functions deploy sync-drive --no-verify-jwt
--   2. Secret compte service :  supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<contenu du .json>'
--   3. (déjà fait pour le scheduler) supabase secrets set CRON_SECRET=<uuid-aléatoire>
--   4. Remplacer ci-dessous <PROJECT-REF> et <CRON_SECRET> par tes valeurs.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('sync-drive')
where exists (select 1 from cron.job where jobname = 'sync-drive');

select cron.schedule(
  'sync-drive',
  '0 * * * *',   -- toutes les heures (à la minute 0)
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-drive',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5 * 60 * 1000
  );
  $$
);
