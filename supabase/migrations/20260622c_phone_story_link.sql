-- Lien OnlyFans / sticker par compte (téléphone).
-- Source de vérité utilisée par l'onglet Story et les tâches automatiques.
ALTER TABLE phones ADD COLUMN IF NOT EXISTS link text DEFAULT NULL;
