-- Task credit tracking
--
-- credits_charged_date : dernière date (UTC) où les 50 crédits/jour ont été débités
--   NULL  → tâche jamais encore chargée (premier posting = premier débit)
--   date  → déjà chargée ce jour-là (ne pas re-débiter)

ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS credits_charged_date date;
