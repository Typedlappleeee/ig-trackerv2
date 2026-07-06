-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Groupes de comptes (page « Mes comptes »).                        ║
-- ║  1 téléphone = 1 compte Instagram. On range les comptes dans des    ║
-- ║  groupes libres (nom texte). Colonne simple, comme group_name.      ║
-- ║  À exécuter une fois dans Supabase → SQL Editor. Idempotent.        ║
-- ╚══════════════════════════════════════════════════════════════════╝

alter table public.phones add column if not exists account_group text;

create index if not exists idx_phones_account_group on public.phones (account_group);

notify pgrst, 'reload schema';
