-- Config de l'agent « Cloud Phones maison » par agence (org_config) ou perso
-- (app_config) — comme pour iRemoTech. Stocke { url, token }.
alter table if exists public.org_config
  add column if not exists cloudphones_config jsonb;
alter table if exists public.app_config
  add column if not exists cloudphones_config jsonb;

comment on column public.org_config.cloudphones_config is
  'Config de l''agent cloud phones auto-hébergé de l''agence : { url, token }.';
