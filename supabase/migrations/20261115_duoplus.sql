-- DuoPlus (téléphones virtuels) dans ScaleFlow, réservé à l'accès Blowsome.
-- La clé API DuoPlus de l'espace (agence ou perso) ne sort jamais du serveur : table fermée
-- (RLS sans policy + REVOKE), lue et écrite uniquement par /api/duoplus avec la clé service-role.
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
create table if not exists public.sf_duoplus_keys (
  space text primary key,                 -- id de l'organisation, ou 'u:<id utilisateur>' pour l'espace perso
  api_key text not null,
  set_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.sf_duoplus_keys enable row level security;
revoke all on public.sf_duoplus_keys from anon, authenticated;
