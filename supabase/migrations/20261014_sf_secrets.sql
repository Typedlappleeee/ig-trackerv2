-- Clés d'API de services tiers (ex. Higgsfield pour Genjutsu IA), saisies dans l'app par le
-- super-admin. Table SANS aucune policy : illisible et inmodifiable depuis le navigateur.
-- Écriture uniquement via sf_set_secret (super-admin), lecture uniquement par l'edge function
-- (service_role). sf_secret_status ne renvoie que « configurée ? » + les 4 derniers caractères.
create table if not exists public.sf_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.sf_secrets enable row level security;

-- (re)crée le helper super-admin au cas où les SQL de la Veille ne sont pas passés.
create or replace function public.sf_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and (coalesce(p.is_super_admin, false) or p.email = 'tintin.aunea@gmail.com'))
$$;

create or replace function public.sf_set_secret(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sf_is_super_admin() then raise exception 'Réservé au super-admin'; end if;
  if p_name not in ('higgsfield') then raise exception 'Clé inconnue'; end if;
  if coalesce(trim(p_value), '') = '' then
    delete from public.sf_secrets where name = p_name;
  else
    insert into public.sf_secrets(name, value, updated_at) values (p_name, trim(p_value), now())
    on conflict (name) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

create or replace function public.sf_secret_status(p_name text)
returns table(is_set boolean, hint text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sf_is_super_admin() then raise exception 'Réservé au super-admin'; end if;
  return query select true, right(s.value, 4), s.updated_at from public.sf_secrets s where s.name = p_name;
end $$;

revoke all on public.sf_secrets from anon, authenticated;
grant execute on function public.sf_set_secret(text, text) to authenticated;
grant execute on function public.sf_secret_status(text) to authenticated;
