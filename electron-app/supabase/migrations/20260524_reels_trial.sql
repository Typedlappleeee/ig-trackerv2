-- Add reels_trial column to scheduled_posts
-- When true, the reel is posted as an Instagram Trial (shown to non-followers only).
ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS reels_trial boolean NOT NULL DEFAULT false;
