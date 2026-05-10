-- Migration v4: Add Instagram session ID and status columns to phones table
-- Run this in the Supabase SQL editor or via psql

ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS ig_sessionid text DEFAULT '';
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS ig_status    text DEFAULT 'unknown';
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS following    integer DEFAULT 0;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS bio          text DEFAULT NULL;

-- Normalize empty strings to NULL for cleanliness
UPDATE public.phones SET ig_sessionid = NULL WHERE ig_sessionid = '';
UPDATE public.phones SET ig_status    = NULL WHERE ig_status    = 'unknown';
