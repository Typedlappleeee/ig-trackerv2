-- Renvoie les organisations de l'utilisateur connecté SANS passer par les RLS
-- (SECURITY DEFINER) → évite la récursion de policy qui faisait timeout la
-- requête organization_members ↔ organizations côté client.
create or replace function public.get_my_orgs()
returns table (org jsonb, member jsonb)
language sql
security definer
stable
set search_path = public
as $$
  select to_jsonb(o.*) as org, to_jsonb(m.*) as member
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
$$;

grant execute on function public.get_my_orgs() to authenticated;
