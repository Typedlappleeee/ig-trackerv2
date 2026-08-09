-- Option "Blowsome" sur les clés de licence (add-on agence VIP).
-- Une clé avec blowsome=true débloque l'onglet Blowsome (réservé, "à venir").
-- L'onglet n'est visible QUE pour les utilisateurs dont la clé active porte ce flag.
alter table if exists public.license_keys
  add column if not exists blowsome boolean not null default false;

comment on column public.license_keys.blowsome is
  'Add-on VIP "Blowsome" : débloque l''onglet Blowsome pour le détenteur de la clé.';
