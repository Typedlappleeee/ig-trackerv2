-- Cache des profils Instagram des comptes iRemoTech (onglet « Comptes ») : photo, abonnés, abonnements,
-- publications, relus au plus toutes les 6 h par l'edge function run-scheduled-posts (HikerAPI).
-- Lecture / écriture par le service-role uniquement (aucune policy).
create table if not exists public.irt_ig_profiles (
  username text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.irt_ig_profiles enable row level security;
revoke all on public.irt_ig_profiles from anon, authenticated;
