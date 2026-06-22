-- Add story link field to phones (OnlyFans / custom link per phone for story posting)
ALTER TABLE phones ADD COLUMN IF NOT EXISTS link text DEFAULT NULL;
