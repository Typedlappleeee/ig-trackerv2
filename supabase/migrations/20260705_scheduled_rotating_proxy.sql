-- Proxy rotatif par post programmé.
-- Quand true, l'exécution (client ET edge function) déclenche une rotation d'IP
-- via les « Change IP URL » de l'org avant de démarrer/poster — comme le toggle
-- « Proxy rotatif » du Posting immédiat. Défaut false → comportement legacy.
alter table if exists public.scheduled_posts
  add column if not exists rotating_proxy boolean not null default false;

notify pgrst, 'reload schema';
