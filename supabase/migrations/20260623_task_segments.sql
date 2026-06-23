-- Add segments column to recurring_tasks
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS segments jsonb NOT NULL DEFAULT '[]';
