-- Sous-tâches / séquences dans recurring_tasks
--
-- steps : tableau ordonné d'étapes (jsonb).
-- Chaque étape a la structure :
--   { id, type, videos?, caption?, reels_trial?, auto_remove_videos?,
--     images?, story_texts?, phone_links?,
--     mode?, delay_minutes?, delay_after_minutes? }
-- type ∈ 'publication' | 'story' | 'warmup'
--
-- Quand steps = [] (défaut), la tâche utilise les colonnes plates legacy
-- (task_type, videos, caption…) pour la rétrocompatibilité.

ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]';
