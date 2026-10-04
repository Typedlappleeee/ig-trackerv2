-- ═══════════════════════════════════════════════════════════════════════════
-- dreamymeow : comptes, licences et banque 7 jours (SÉPARÉS de ScaleFlow).
--
-- • Comptes « pseudo + mot de passe ». Supabase Auth exige un email : on utilise
--   un email interne invisible <pseudo>@users.dreamymeow.com, créé déjà confirmé
--   (aucun email n'est envoyé, aucun réglage Supabase à changer).
-- • Licences : clés DM-XXXX-XXXX-XXXX créées par un admin, activées par un compte
--   (durée en jours, cumulable). Les outils exigent une licence active.
-- • Banque : fichiers spoofés conservés 7 jours (bucket privé « dreamymeow »).
-- • Admin : voit tous les comptes, crée/révoque des licences, crée des comptes.
--
-- À coller tel quel dans Supabase → SQL Editor (idempotent : relançable).
-- Le compte admin initial se crée ENSUITE avec dm_bootstrap_admin (voir fin).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.dm_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.dm_licenses (
  key         text primary key,
  days        int  not null check (days between 1 and 3650),
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  expires_at  timestamptz,
  revoked_at  timestamptz
);
create index if not exists dm_licenses_redeemed_idx on public.dm_licenses(redeemed_by);

create table if not exists public.dm_bank (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  path       text not null unique,          -- <user_id>/<uuid>.<ext> dans le bucket « dreamymeow »
  name       text not null,
  kind       text not null check (kind in ('image', 'video')),
  size       bigint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists dm_bank_user_idx on public.dm_bank(user_id, created_at desc);
create index if not exists dm_bank_exp_idx on public.dm_bank(expires_at);

alter table public.dm_profiles enable row level security;
alter table public.dm_licenses enable row level security;
alter table public.dm_bank     enable row level security;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.dm_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.dm_profiles where id = auth.uid()), false)
$$;

create or replace function public.dm_license_until(uid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(expires_at) from public.dm_licenses
  where redeemed_by = uid and revoked_at is null and expires_at > now()
$$;

create or replace function public.dm_has_access(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.dm_profiles where id = uid), false)
      or public.dm_license_until(uid) is not null
$$;

-- ── RLS : lecture de ses propres données, admin voit tout. Écritures via RPC. ─
drop policy if exists dm_profiles_select on public.dm_profiles;
create policy dm_profiles_select on public.dm_profiles for select using (id = auth.uid() or public.dm_is_admin());

drop policy if exists dm_licenses_select on public.dm_licenses;
create policy dm_licenses_select on public.dm_licenses for select using (redeemed_by = auth.uid() or public.dm_is_admin());

drop policy if exists dm_bank_select on public.dm_bank;
create policy dm_bank_select on public.dm_bank for select using (user_id = auth.uid() or public.dm_is_admin());
drop policy if exists dm_bank_insert on public.dm_bank;
create policy dm_bank_insert on public.dm_bank for insert with check (
  user_id = auth.uid() and public.dm_has_access(auth.uid())
  and expires_at <= now() + interval '7 days 5 minutes'
);
drop policy if exists dm_bank_delete on public.dm_bank;
create policy dm_bank_delete on public.dm_bank for delete using (user_id = auth.uid() or public.dm_is_admin());

-- ── Stockage : bucket privé, chacun dans son dossier <user_id>/ ─────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('dreamymeow', 'dreamymeow', false, 209715200)   -- 200 Mo par fichier
on conflict (id) do nothing;

drop policy if exists dm_obj_select on storage.objects;
create policy dm_obj_select on storage.objects for select using (
  bucket_id = 'dreamymeow' and ((storage.foldername(name))[1] = auth.uid()::text or public.dm_is_admin())
);
drop policy if exists dm_obj_insert on storage.objects;
create policy dm_obj_insert on storage.objects for insert with check (
  bucket_id = 'dreamymeow' and (storage.foldername(name))[1] = auth.uid()::text and public.dm_has_access(auth.uid())
);
drop policy if exists dm_obj_delete on storage.objects;
create policy dm_obj_delete on storage.objects for delete using (
  bucket_id = 'dreamymeow' and ((storage.foldername(name))[1] = auth.uid()::text or public.dm_is_admin())
);

-- ── Création d'un compte (interne : non appelable depuis le site) ──────────
create or replace function public.dm_create_account(p_username text, p_password text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  u text := lower(trim(p_username));
  v_email text;
  v_id uuid := gen_random_uuid();
begin
  if u !~ '^[a-z0-9._-]{3,24}$' then raise exception 'Pseudo invalide (3 à 24 caractères : lettres, chiffres, . _ -)'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Mot de passe trop court (8 caractères minimum)'; end if;
  if exists (select 1 from public.dm_profiles where username = u) then raise exception 'Ce pseudo est déjà pris'; end if;
  v_email := u || '@users.dreamymeow.com';
  if exists (select 1 from auth.users where email = v_email) then raise exception 'Ce pseudo est déjà pris'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'app', 'dreamymeow'),
    jsonb_build_object('dm_username', u), now(), now(), '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  insert into public.dm_profiles (id, username) values (v_id, u);
  return v_id;
end $$;
revoke execute on function public.dm_create_account(text, text) from public, anon, authenticated;

-- ── Inscription publique (pseudo + mot de passe) ────────────────────────────
create or replace function public.dm_signup(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public.dm_create_account(p_username, p_password);
  return json_build_object('email', lower(trim(p_username)) || '@users.dreamymeow.com');
end $$;
grant execute on function public.dm_signup(text, text) to anon, authenticated;

-- ── Mon compte : pseudo, admin, licence (met à jour « vu le ») ─────────────
create or replace function public.dm_me() returns json
language plpgsql security definer set search_path = public as $$
declare p public.dm_profiles;
begin
  if auth.uid() is null then return null; end if;
  update public.dm_profiles set last_seen_at = now() where id = auth.uid() returning * into p;
  if p.id is null then return null; end if;
  return json_build_object(
    'username', p.username, 'is_admin', p.is_admin,
    'license_until', public.dm_license_until(auth.uid()),
    'access', public.dm_has_access(auth.uid()),
    'had_license', exists (select 1 from public.dm_licenses where redeemed_by = auth.uid())
  );
end $$;
-- anon aussi : renvoie null hors connexion (sert au site à détecter que le système est installé).
grant execute on function public.dm_me() to anon, authenticated;

-- ── Activer une clé (cumulable : prolonge une licence déjà active) ─────────
create or replace function public.dm_redeem(p_key text) returns json
language plpgsql security definer set search_path = public as $$
declare l public.dm_licenses; base timestamptz;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into l from public.dm_licenses where key = upper(trim(p_key)) for update;
  if l.key is null then raise exception 'Clé inconnue'; end if;
  if l.revoked_at is not null then raise exception 'Clé révoquée'; end if;
  if l.redeemed_by is not null then raise exception 'Clé déjà utilisée'; end if;
  base := greatest(now(), coalesce(public.dm_license_until(auth.uid()), now()));
  update public.dm_licenses set redeemed_by = auth.uid(), redeemed_at = now(), expires_at = base + make_interval(days => l.days)
  where key = l.key;
  return json_build_object('license_until', public.dm_license_until(auth.uid()));
end $$;
grant execute on function public.dm_redeem(text) to authenticated;

-- ── Admin ───────────────────────────────────────────────────────────────────
create or replace function public.dm_require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.dm_is_admin() then raise exception 'Réservé aux administrateurs'; end if;
end $$;

create or replace function public.dm_admin_users()
returns table (id uuid, username text, is_admin boolean, created_at timestamptz, last_seen_at timestamptz,
               license_until timestamptz, bank_files int, bank_bytes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.dm_require_admin();
  return query
    select p.id, p.username, p.is_admin, p.created_at, p.last_seen_at, public.dm_license_until(p.id),
           (select count(*)::int from public.dm_bank b where b.user_id = p.id and b.expires_at > now()),
           (select coalesce(sum(b.size), 0)::bigint from public.dm_bank b where b.user_id = p.id and b.expires_at > now())
    from public.dm_profiles p order by p.created_at desc;
end $$;

create or replace function public.dm_admin_licenses()
returns table (key text, days int, note text, created_at timestamptz, redeemed_by uuid, redeemed_username text,
               redeemed_at timestamptz, expires_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.dm_require_admin();
  return query
    select l.key, l.days, l.note, l.created_at, l.redeemed_by, p.username, l.redeemed_at, l.expires_at, l.revoked_at
    from public.dm_licenses l left join public.dm_profiles p on p.id = l.redeemed_by
    order by l.created_at desc limit 1000;
end $$;

create or replace function public.dm_new_key() returns text
language sql volatile set search_path = public, extensions as $$
  select 'DM-' || upper(substr(encode(gen_random_bytes(2), 'hex'), 1, 4)) || '-'
              || upper(substr(encode(gen_random_bytes(2), 'hex'), 1, 4)) || '-'
              || upper(substr(encode(gen_random_bytes(2), 'hex'), 1, 4))
$$;

create or replace function public.dm_admin_create_licenses(p_count int, p_days int, p_note text default null)
returns setof text language plpgsql security definer set search_path = public as $$
declare i int; k text;
begin
  perform public.dm_require_admin();
  if p_count < 1 or p_count > 200 then raise exception 'Entre 1 et 200 clés à la fois'; end if;
  for i in 1..p_count loop
    loop
      k := public.dm_new_key();
      exit when not exists (select 1 from public.dm_licenses where key = k);
    end loop;
    insert into public.dm_licenses (key, days, note, created_by) values (k, p_days, nullif(trim(p_note), ''), auth.uid());
    return next k;
  end loop;
end $$;

create or replace function public.dm_admin_revoke(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dm_require_admin();
  update public.dm_licenses set revoked_at = now() where key = upper(trim(p_key)) and revoked_at is null;
end $$;

-- Donne directement N jours à un compte (crée une clé déjà activée, cumulable).
create or replace function public.dm_admin_grant(p_user uuid, p_days int, p_note text default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare k text; base timestamptz;
begin
  perform public.dm_require_admin();
  if not exists (select 1 from public.dm_profiles where id = p_user) then raise exception 'Compte introuvable'; end if;
  base := greatest(now(), coalesce(public.dm_license_until(p_user), now()));
  loop k := public.dm_new_key(); exit when not exists (select 1 from public.dm_licenses where key = k); end loop;
  insert into public.dm_licenses (key, days, note, created_by, redeemed_by, redeemed_at, expires_at)
  values (k, p_days, coalesce(nullif(trim(p_note), ''), 'Attribuée par un admin'), auth.uid(), p_user, now(), base + make_interval(days => p_days));
  return public.dm_license_until(p_user);
end $$;

-- Coupe tout accès d'un compte (révoque toutes ses licences actives).
create or replace function public.dm_admin_revoke_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dm_require_admin();
  update public.dm_licenses set revoked_at = now() where redeemed_by = p_user and revoked_at is null;
end $$;

create or replace function public.dm_admin_set_admin(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dm_require_admin();
  if p_user = auth.uid() and not p_on then raise exception 'Tu ne peux pas retirer ton propre accès admin'; end if;
  update public.dm_profiles set is_admin = p_on where id = p_user;
end $$;

-- Crée un compte client (optionnellement avec N jours de licence).
create or replace function public.dm_admin_create_user(p_username text, p_password text, p_days int default 0) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.dm_require_admin();
  v_id := public.dm_create_account(p_username, p_password);
  if coalesce(p_days, 0) > 0 then perform public.dm_admin_grant(v_id, p_days); end if;
  return v_id;
end $$;

grant execute on function public.dm_admin_users(), public.dm_admin_licenses(),
  public.dm_admin_create_licenses(int, int, text), public.dm_admin_revoke(text),
  public.dm_admin_grant(uuid, int, text), public.dm_admin_revoke_user(uuid),
  public.dm_admin_set_admin(uuid, boolean), public.dm_admin_create_user(text, text, int)
  to authenticated;

-- ── Premier compte admin (à lancer UNE fois depuis le SQL Editor) ──────────
-- Non appelable depuis le site : réservé au SQL Editor (rôle postgres).
--   select public.dm_bootstrap_admin('ton_pseudo', 'ton_mot_de_passe');
create or replace function public.dm_bootstrap_admin(p_username text, p_password text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.dm_profiles where username = lower(trim(p_username));
  if v_id is null then v_id := public.dm_create_account(p_username, p_password); end if;
  update public.dm_profiles set is_admin = true where id = v_id;
  return v_id;
end $$;
revoke execute on function public.dm_bootstrap_admin(text, text) from public, anon, authenticated;
