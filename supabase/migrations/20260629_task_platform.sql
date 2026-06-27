-- Plateforme cible d'une tâche automatique (Instagram par défaut, ou TikTok).
-- L'edge function propage cette valeur au scheduled_post enfant (colonne platform),
-- qui branche ensuite sur instagramPubReels (IG) ou /task/add taskType:1 (TikTok).
alter table if exists public.recurring_tasks
  add column if not exists platform text not null default 'instagram';
