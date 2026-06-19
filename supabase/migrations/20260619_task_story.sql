-- Tâches automatiques : support du type « Story » (en plus de « Publication »)
--
-- task_type   : 'publication' (Reels, défaut) ou 'story' (Story avec lien par compte)
-- story_texts : pool de textes du sticker, distribués par compte (séquentiel/aléatoire)
-- Le lien par compte est stocké dans phones[].link (colonne jsonb existante).

ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'publication';

DO $$ BEGIN
  ALTER TABLE recurring_tasks
    ADD CONSTRAINT recurring_tasks_task_type_chk CHECK (task_type IN ('publication','story'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS story_texts jsonb NOT NULL DEFAULT '[]';
