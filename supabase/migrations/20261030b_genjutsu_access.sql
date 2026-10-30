-- ════════════════════════════════════════════════════════════════════════════
--  Genjutsu dans ScaleFlow : pas de mot de passe à taper, l'accès Blowsome suffit.
--  Le super-admin enregistre UNE FOIS le mot de passe du générateur (secret, illisible depuis
--  le navigateur) ; la page Genjutsu le récupère uniquement pour les comptes Blowsome.
--  À coller dans Supabase → SQL Editor → Run. Ré-exécutable. Nécessite 20261014_sf_secrets.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- sf_set_secret accepte maintenant aussi le mot de passe du générateur Genjutsu.
create or replace function public.sf_set_secret(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sf_is_super_admin() then raise exception 'Réservé au super-admin'; end if;
  if p_name not in ('higgsfield', 'genjutsu_password') then raise exception 'Clé inconnue'; end if;
  if coalesce(trim(p_value), '') = '' then
    delete from public.sf_secrets where name = p_name;
  else
    insert into public.sf_secrets(name, value, updated_at) values (p_name, trim(p_value), now())
    on conflict (name) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

-- Le mot de passe du générateur, SEULEMENT pour l'accès Blowsome (ou le super-admin).
-- null = pas encore enregistré par le super-admin.
create or replace function public.sf_genjutsu_access() returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_lic jsonb;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.sf_is_super_admin() then
    v_lic := public.my_license();
    if not coalesce((v_lic->>'blowsome')::boolean, false) then raise exception 'Réservé à l''accès Blowsome'; end if;
  end if;
  return (select value from public.sf_secrets where name = 'genjutsu_password');
end $$;
revoke all on function public.sf_genjutsu_access() from public, anon;
grant execute on function public.sf_genjutsu_access() to authenticated;

notify pgrst, 'reload schema';
