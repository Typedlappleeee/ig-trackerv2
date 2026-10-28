-- ════════════════════════════════════════════════════════════════════════════
--  iRemoTech : containers Crane PARTAGÉS et synchronisés en temps réel.
--  Avant, la liste des containers de chaque iPhone n'était gardée que dans le
--  navigateur (autre PC / autre membre de l'équipe → « 0c »).
--  À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
-- ════════════════════════════════════════════════════════════════════════════

-- Liste des containers par iPhone, dans la même ligne que ses notes et comptes
-- (déjà partagée dans l'agence : même règle d'accès).
alter table public.iremotech_device_meta add column if not exists containers jsonb not null default '[]';

-- Temps réel : les changements sont diffusés aux pages ouvertes (Supabase Realtime).
do $$
begin
  alter publication supabase_realtime add table public.iremotech_device_meta;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
