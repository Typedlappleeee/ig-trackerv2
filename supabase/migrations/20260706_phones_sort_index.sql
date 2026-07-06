-- Ordre d'affichage des téléphones = ordre GéeLark (l'ordre renvoyé par
-- /phone/list). Stocké à la synchro dans phones.sort_index pour que ScaleFlow
-- affiche ET assigne (posting séquentiel) les téléphones dans le MÊME ordre que
-- GéeLark. NULL pour les lignes pas encore re-synchronisées → triées en dernier.
alter table if exists public.phones
  add column if not exists sort_index integer;

-- MAJ de la RPC de synchro : stocke aussi sort_index (index dans /phone/list).
create or replace function public.sync_geelark_phones(p_rows jsonb, p_org_id uuid default null)
returns void language plpgsql security definer as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    if p_org_id is not null then
      insert into public.phones
        (user_id, org_id, geelark_id, serial_no, phone_name, group_name, status, remark, synced_at, sort_index)
      values (
        (r->>'user_id')::uuid, p_org_id, r->>'geelark_id',
        r->>'serial_no', r->>'phone_name', r->>'group_name',
        r->>'status', r->>'remark', (r->>'synced_at')::timestamptz, (r->>'sort_index')::int
      )
      on conflict (org_id, geelark_id) where org_id is not null
      do update set
        user_id    = excluded.user_id,
        serial_no  = excluded.serial_no,
        phone_name = excluded.phone_name,
        group_name = excluded.group_name,
        status     = excluded.status,
        remark     = excluded.remark,
        synced_at  = excluded.synced_at,
        sort_index = excluded.sort_index;
    else
      insert into public.phones
        (user_id, org_id, geelark_id, serial_no, phone_name, group_name, status, remark, synced_at, sort_index)
      values (
        (r->>'user_id')::uuid, null, r->>'geelark_id',
        r->>'serial_no', r->>'phone_name', r->>'group_name',
        r->>'status', r->>'remark', (r->>'synced_at')::timestamptz, (r->>'sort_index')::int
      )
      on conflict (user_id, geelark_id) where org_id is null
      do update set
        serial_no  = excluded.serial_no,
        phone_name = excluded.phone_name,
        group_name = excluded.group_name,
        status     = excluded.status,
        remark     = excluded.remark,
        synced_at  = excluded.synced_at,
        sort_index = excluded.sort_index;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
