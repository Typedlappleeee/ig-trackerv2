-- Track which phones don't support Trial Reels (set automatically when a trial-reels post fails)
ALTER TABLE phones
  ADD COLUMN IF NOT EXISTS reels_trial_unsupported boolean NOT NULL DEFAULT false;
