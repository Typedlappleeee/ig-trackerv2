-- Clé API iRemoTech configurée PAR AGENCE (org) ou par compte perso, directement
-- dans ScaleFlow (comme le token GeeLark). Stockée en JSON : { api_key }.
alter table if exists public.org_config
  add column if not exists iremotech_config jsonb;

alter table if exists public.app_config
  add column if not exists iremotech_config jsonb;

comment on column public.org_config.iremotech_config is
  'Config iRemoTech de l''agence : { api_key } (Device API).';
