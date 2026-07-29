-- Add-on Blowsome hérité de l'agence : un membre d'une orga dont l'OWNER possède
-- l'add-on Blowsome (clé license_keys.blowsome = true) doit y avoir accès aussi.
-- RPC SECURITY DEFINER pour lire la clé de l'owner sans exposer les clés via RLS.

create or replace function public.org_owner_blowsome(p_org uuid)
returns boolean
language sql
security definer
stable
as $$
  select coalesce(bool_or(lk.blowsome), false)
  from public.organizations o
  join public.license_keys lk
    on lk.user_id = o.owner_id
   and lk.is_active = true
   and (lk.expires_at is null or lk.expires_at > now())
  where o.id = p_org;
$$;

grant execute on function public.org_owner_blowsome(uuid) to authenticated;
