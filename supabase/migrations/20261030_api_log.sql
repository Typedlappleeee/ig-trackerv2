-- ════════════════════════════════════════════════════════════════════════════
--  API ScaleFlow : journal des appels (Réglages › Intégrations › Activité de l'API).
--  Pour voir si un site appelle bien l'API, avec quel résultat (clé fausse, appel depuis
--  une page web bloqué, route inconnue…). Gardé 7 jours. À coller dans Supabase → SQL
--  Editor → Run. Ré-exécutable. Nécessite 20261029_scaleflow_link.sql.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.sf_api_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  space_org  uuid,                 -- espace de la clé (null = espace perso, voir owner_id)
  owner_id   uuid,                 -- créateur de la clé ; null = appel non rattaché (sans clé / clé inconnue)
  token_id   uuid,
  method     text not null,
  route      text not null,
  status     int  not null,
  error      text,
  origin     text,                 -- présent = appel fait depuis une PAGE WEB (navigateur)
  ip         text,
  ua         text
);
create index if not exists sf_api_log_space on public.sf_api_log (space_org, at desc);
create index if not exists sf_api_log_owner on public.sf_api_log (owner_id, at desc);
alter table public.sf_api_log enable row level security;
revoke all on public.sf_api_log from anon, authenticated;

-- Les 60 derniers appels de l'espace (owner/admin). Le super admin voit aussi les appels
-- non rattachés des dernières 24 h (sans clé, clé inconnue) — utile pour diagnostiquer.
create or replace function public.sf_api_log_list(p_org uuid)
returns table(at timestamptz, method text, route text, status int, error text, origin text, ip text, attached boolean)
language plpgsql volatile security definer set search_path = public as $$
declare v_super boolean;
begin
  if not public.sf_link_can_manage(p_org) then return; end if;
  delete from public.sf_api_log old where old.at < now() - interval '7 days';
  select coalesce(p.is_super_admin, false) or p.email = 'tintin.aunea@gmail.com' into v_super from public.profiles p where p.id = auth.uid();
  return query
    select l.at, l.method, l.route, l.status, l.error, l.origin, l.ip, l.owner_id is not null
      from public.sf_api_log l
     where (case when p_org is null then l.space_org is null and l.owner_id = auth.uid() else l.space_org = p_org end)
        or (coalesce(v_super, false) and l.owner_id is null and l.at > now() - interval '24 hours')
     order by l.at desc
     limit 60;
end $$;
revoke all on function public.sf_api_log_list(uuid) from public, anon;
grant execute on function public.sf_api_log_list(uuid) to authenticated;

notify pgrst, 'reload schema';
