-- Recurring tasks dashboard support
--
-- 1. recurring_tasks : table des tâches automatiques (si pas déjà créée)
-- 2. recurring_tasks.last_run_at / run_count : suivi des exécutions (KPI dashboard)
-- 3. scheduled_posts.task_id : lie une exécution (post enfant) à sa tâche parente
--    → alimente l'onglet « Historique » du tableau de bord des tâches.

-- ── Table recurring_tasks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  org_id        uuid,
  name          text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  phones        jsonb NOT NULL DEFAULT '[]',
  videos        jsonb NOT NULL DEFAULT '[]',
  caption       text NOT NULL DEFAULT '',
  mode          text NOT NULL DEFAULT 'seq' CHECK (mode IN ('seq','random')),
  delay_minutes integer NOT NULL DEFAULT 0,
  recur_hours   numeric NOT NULL DEFAULT 24,
  next_run_at   timestamptz NOT NULL DEFAULT now(),
  reels_trial   boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tasks_own" ON recurring_tasks FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Suivi des exécutions (KPI) ─────────────────────────────────────────────────
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS last_run_at timestamptz;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS run_count   integer NOT NULL DEFAULT 0;

-- Index pour la requête du cron (tâches dues)
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_due
  ON recurring_tasks (status, next_run_at);

-- ── Lien post enfant → tâche parente ──────────────────────────────────────────
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS task_id uuid;
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_task_id
  ON scheduled_posts (task_id) WHERE task_id IS NOT NULL;

-- ── Options de la tâche ────────────────────────────────────────────────────────
-- auto_remove_videos : supprime les vidéos de la pool après chaque exécution
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS auto_remove_videos boolean NOT NULL DEFAULT false;

-- recur_hours doit être numeric (pas integer) pour supporter les intervalles en minutes (ex: 0.25 = 15 min)
ALTER TABLE recurring_tasks ALTER COLUMN recur_hours TYPE numeric USING recur_hours::numeric;

-- ── Arrêt différé des téléphones ───────────────────────────────────────────────
-- Quand un post part avec un délai entre comptes, les tâches RPA sont planifiées
-- chez GeeLark et les téléphones doivent rester allumés. On enregistre quand les
-- arrêter (stop_phones_at) + lesquels (stop_phone_ids) : un balayage du cron les
-- éteint dès l'échéance passée, au lieu de les laisser allumés indéfiniment.
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS stop_phones_at timestamptz;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS stop_phone_ids jsonb;
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_stop_phones
  ON scheduled_posts (stop_phones_at) WHERE stop_phones_at IS NOT NULL;
