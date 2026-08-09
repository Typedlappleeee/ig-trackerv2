-- Correctif du cron serveur "run-scheduled-posts".
--
-- Symptôme : dans les logs Supabase, un job pg_cron tourne chaque minute et
-- renvoie « XX000 Quote command returned error » (le job échoue en boucle).
-- Cause : l'ancien job (20260611_scheduler_cron.sql) utilisait du dollar-quoting
-- $$ ... $$ ; si le <CRON_SECRET> collé contenait un caractère spécial, ou si les
-- placeholders <PROJECT-REF>/<CRON_SECRET> n'ont pas été remplacés, la commande
-- pg_cron est mal formée → erreur à chaque tick.
--
-- ⚠️ Depuis la refonte, le déclencheur principal est le CRON VERCEL (api/cron.js,
-- voir vercel.json → "crons"). Dès que le web est déployé sur Vercel, le scheduler
-- + le watchdog tournent SANS pg_cron. Ce fichier pg_cron n'est utile QUE si tu ne
-- déploies pas sur Vercel (ou en secours). Sinon, contente-toi de la PARTIE 1
-- (supprimer le job cassé) pour arrêter les erreurs dans les logs.
--
-- ────────────────────────────────────────────────────────────────────────────
-- PARTIE 1 — SUPPRIMER le(s) job(s) cassé(s)  (à exécuter dans SQL Editor)
-- ────────────────────────────────────────────────────────────────────────────
-- Supprime par nom (job créé par l'ancienne migration) …
select cron.unschedule('run-scheduled-posts')
where exists (select 1 from cron.job where jobname = 'run-scheduled-posts');

-- … et si tu as un job anonyme cassé (ex. jobid 6) repéré dans les logs, vérifie
-- puis supprime-le explicitement :
--    select jobid, jobname, schedule, command from cron.job order by jobid;
--    select cron.unschedule(6);   -- remplace 6 par le jobid réel

-- ────────────────────────────────────────────────────────────────────────────
-- PARTIE 2 — (OPTIONNEL) recréer un job pg_cron PROPRE
-- Nécessaire seulement si tu N'utilises PAS le cron Vercel.
--
-- 1) Déploie d'abord la fonction :
--       supabase functions deploy run-scheduled-posts --no-verify-jwt
-- 2) Remplace PROJECT_REF et CRON_SECRET ci-dessous par tes valeurs réelles.
--    (CRON_SECRET doit correspondre au secret Supabase : supabase secrets set CRON_SECRET=…)
-- 3) Exécute ce bloc. On passe par format() + un paramètre lié pour éviter tout
--    problème de quoting, quel que soit le contenu du secret.
-- ────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $fix$
declare
  v_project_ref text := 'PROJECT_REF';   -- ← ex. abcdefgh (sous-domaine .supabase.co)
  v_cron_secret text := 'CRON_SECRET';   -- ← ton secret CRON_SECRET
  v_command     text;
begin
  if v_project_ref = 'PROJECT_REF' or v_cron_secret = 'CRON_SECRET' then
    raise notice 'PARTIE 2 ignorée : remplace PROJECT_REF / CRON_SECRET avant d''exécuter.';
    return;
  end if;

  -- Construit la commande sans dollar-quoting fragile : les valeurs passent par
  -- des littéraux correctement échappés (quote_literal via %L).
  v_command := format(
    'select net.http_post('
      || 'url := %L, '
      || 'headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-cron-secret'', %L), '
      || 'body := ''{}''::jsonb, '
      || 'timeout_milliseconds := 55000);',
    'https://' || v_project_ref || '.supabase.co/functions/v1/run-scheduled-posts',
    v_cron_secret
  );

  perform cron.schedule('run-scheduled-posts', '* * * * *', v_command);
  raise notice 'Job pg_cron "run-scheduled-posts" (re)créé.';
end
$fix$;
