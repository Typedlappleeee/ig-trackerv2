-- Banque : limite d'espace par abonnement + protection de la corbeille.
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable.
--
--   • Quotas : standard 5 Go · pro 15 Go · organisation / business 50 Go · super-admin illimité.
--     L'espace utilisé = taille RÉELLE des fichiers du bucket « content » sous le dossier
--     de l'espace (videos/users/<id>/… ou videos/orgs/<id>/…) — corbeille comprise
--     (les fichiers y restent 7 jours avant d'être effacés).
--   • Au-delà de la limite, les nouveaux envois sont REFUSÉS par le stockage (policy),
--     les fichiers existants restent.
--   • Corbeille : un membre ne peut mettre à la corbeille que SES médias, sauf droit
--     « bank_delete » (owner / admin, ou donné explicitement).

-- ── Quota (octets) d'un propriétaire selon sa licence active ─────────────────────
create or replace function public.bank_plan_quota(p_owner uuid)
returns bigint language plpgsql security definer stable set search_path = public as $$
declare v_plan text; v_super boolean;
begin
  select coalesce(is_super_admin, false) or email = 'tintin.aunea@gmail.com' into v_super from public.profiles where id = p_owner;
  if coalesce(v_super, false) then return null; end if;           -- illimité
  select plan into v_plan from public.license_keys
   where user_id = p_owner and is_active and (expires_at is null or expires_at > now())
   order by case plan when 'business' then 3 when 'organisation' then 3 when 'pro' then 2 else 1 end desc
   limit 1;
  return case coalesce(v_plan, 'standard')
    when 'business' then 50::bigint * 1024 * 1024 * 1024
    when 'organisation' then 50::bigint * 1024 * 1024 * 1024
    when 'pro' then 15::bigint * 1024 * 1024 * 1024
    else 5::bigint * 1024 * 1024 * 1024 end;
end $$;

-- ── Octets utilisés sous un dossier du bucket ────────────────────────────────────
create or replace function public.bank_used_bytes(p_prefix text)
returns bigint language sql security definer stable set search_path = public, storage as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)::bigint
    from storage.objects where bucket_id = 'content' and name like p_prefix || '%'
$$;

-- ── Espace de l'appelant (perso, ou organisation dont il est membre) ─────────────
create or replace function public.bank_usage(p_org uuid default null)
returns json language plpgsql security definer stable set search_path = public as $$
declare v_owner uuid; v_prefix text; v_quota bigint; v_plan text;
begin
  if auth.uid() is null then return null; end if;
  if p_org is null then
    v_owner := auth.uid(); v_prefix := 'videos/users/' || auth.uid()::text || '/';
  else
    if not public.is_org_member(p_org) then return null; end if;
    select owner_id into v_owner from public.organizations where id = p_org;
    v_prefix := 'videos/orgs/' || p_org::text || '/';
  end if;
  v_quota := public.bank_plan_quota(v_owner);
  select plan into v_plan from public.license_keys where user_id = v_owner and is_active and (expires_at is null or expires_at > now()) limit 1;
  return json_build_object('used', public.bank_used_bytes(v_prefix), 'quota', v_quota, 'plan', coalesce(v_plan, 'standard'));
end $$;
grant execute on function public.bank_usage(uuid) to authenticated;

-- ── Un envoi est-il permis (dossier pas encore plein) ? ──────────────────────────
create or replace function public.bank_can_upload(p_name text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_kind text := (storage.foldername(p_name))[2]; v_id uuid; v_owner uuid; v_quota bigint;
begin
  begin v_id := ((storage.foldername(p_name))[3])::uuid; exception when others then return true; end;
  if v_kind = 'users' then v_owner := v_id;
  elsif v_kind = 'orgs' then select owner_id into v_owner from public.organizations where id = v_id;
  else return true; end if;
  v_quota := public.bank_plan_quota(v_owner);
  if v_quota is null then return true; end if;
  return public.bank_used_bytes('videos/' || v_kind || '/' || v_id::text || '/') < v_quota;
end $$;
grant execute on function public.bank_can_upload(text) to authenticated;

drop policy if exists "content_insert" on storage.objects;
create policy "content_insert" on storage.objects for insert with check (
  bucket_id = 'content' and (
    ((storage.foldername(name))[2] = 'users' and (storage.foldername(name))[3]::uuid = auth.uid())
    or ((storage.foldername(name))[2] = 'orgs' and public.is_org_member((storage.foldername(name))[3]::uuid))
  ) and public.bank_can_upload(name)
);

-- ── Corbeille : seulement ses propres médias, ou avec le droit « bank_delete » ────
create or replace function public.bank_guard_trash()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ok boolean := false;
begin
  if auth.uid() is null then return new; end if;   -- service (cron, edge function)
  if new.deleted_at is not distinct from old.deleted_at then return new; end if;
  if old.org_id is null or old.user_id = auth.uid() then return new; end if;
  -- Sans dépendance externe (member_can_action n'existe pas partout) : owner / admin.
  select exists (select 1 from public.organizations o where o.id = old.org_id and o.owner_id = auth.uid())
      or exists (select 1 from public.organization_members m where m.org_id = old.org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
    into v_ok;
  if not v_ok then
    raise exception 'Tu n''as pas le droit de supprimer les médias des autres membres.';
  end if;
  return new;
end $$;
drop trigger if exists bank_guard_trash on public.content_bank;
create trigger bank_guard_trash before update on public.content_bank for each row execute function public.bank_guard_trash();
