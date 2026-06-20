-- Assure que toutes les colonnes nécessaires existent.
-- À exécuter dans Supabase → SQL Editor si certaines migrations n'ont pas été appliquées.
-- Toutes les commandes sont idempotentes (IF NOT EXISTS / IF EXISTS).

-- ── recurring_tasks ────────────────────────────────────────────────────────────
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS last_run_at        timestamptz;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS run_count          integer      NOT NULL DEFAULT 0;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS auto_remove_videos boolean      NOT NULL DEFAULT false;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS credits_charged_date date;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS task_type          text         NOT NULL DEFAULT 'publication';
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS story_texts        jsonb        NOT NULL DEFAULT '[]';
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS steps              jsonb        NOT NULL DEFAULT '[]';

-- recur_hours doit être numeric pour supporter des fractions d'heure
DO $$ BEGIN
  ALTER TABLE recurring_tasks ALTER COLUMN recur_hours TYPE numeric USING recur_hours::numeric;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── scheduled_posts ────────────────────────────────────────────────────────────
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS task_id       uuid;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS stop_phones_at timestamptz;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS stop_phone_ids jsonb;

-- Index de performance pour le cron (tâches dues)
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_due
  ON recurring_tasks (status, next_run_at);

SELECT 'OK — toutes les colonnes sont présentes.' AS result;
