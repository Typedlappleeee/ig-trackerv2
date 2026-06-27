-- Permet au webhook GeeLark d'accélérer l'extinction des téléphones du flux
-- « Publier maintenant » (client) : on relie chaque ligne du watchdog à la
-- tâche RPA GeeLark via task_id. Quand la tâche se termine, le webhook avance
-- stop_at → le cron coupe le téléphone dans la minute (le +5 min reste le filet).
alter table if exists public.phone_power_watch
  add column if not exists task_id text;

create index if not exists phone_power_watch_task_id_idx
  on public.phone_power_watch (task_id);
