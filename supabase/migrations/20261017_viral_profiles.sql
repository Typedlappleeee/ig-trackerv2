-- Veille : profil Instagram des comptes suivis (photo, nom, bio, abonnés…) pour la page
-- profil « comme sur Instagram ». Rempli au relevé (sans appel en plus : le profil sert déjà
-- à trouver l'identifiant du compte). À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
alter table public.viral_watch add column if not exists full_name text;
alter table public.viral_watch add column if not exists biography text;
alter table public.viral_watch add column if not exists profile_pic text;
alter table public.viral_watch add column if not exists external_url text;
alter table public.viral_watch add column if not exists followers bigint;
alter table public.viral_watch add column if not exists following bigint;
alter table public.viral_watch add column if not exists media_count bigint;
alter table public.viral_watch add column if not exists is_verified boolean not null default false;
alter table public.viral_watch add column if not exists profile_at timestamptz;
