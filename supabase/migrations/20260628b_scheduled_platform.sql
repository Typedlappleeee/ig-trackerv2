-- Plateforme cible d'un post programmé (Instagram par défaut, ou TikTok).
-- Le client (executeScheduledPost) et l'edge function branchent dessus :
--   instagram → /rpa/task/instagramPubReels (1 tâche/téléphone)
--   tiktok    → /task/add taskType:1 (batch)
alter table if exists public.scheduled_posts
  add column if not exists platform text not null default 'instagram';
