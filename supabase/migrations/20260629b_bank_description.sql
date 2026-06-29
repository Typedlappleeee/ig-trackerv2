-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Description par vidéo dans la banque de contenu.                  ║
-- ║  À exécuter une fois dans Supabase → SQL Editor. Idempotent.      ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Description (légende) optionnelle, propre à chaque vidéo. Pré-remplit la
-- légende au moment de poster la vidéo. Facultatif → défaut chaîne vide.
alter table public.content_bank
  add column if not exists description text default '';

notify pgrst, 'reload schema';
