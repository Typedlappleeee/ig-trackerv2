-- Replace full unique constraints (broken for cross-mode upserts) with partial
-- indexes + a SECURITY DEFINER function that uses ON CONFLICT ... WHERE.
--
-- Root cause: UNIQUE (user_id, geelark_id) blocks org-mode inserts when the
-- same user already has the phone in solo mode. Partial indexes are correct
-- semantically but Supabase JS onConflict can't target them. Solution: RPC.

-- 1. Drop full constraints added by previous migration
ALTER TABLE public.phones DROP CONSTRAINT IF EXISTS phones_user_geelark_unique;
ALTER TABLE public.phones DROP CONSTRAINT IF EXISTS phones_org_geelark_unique;

-- 2. Recreate partial indexes (correct semantics)
CREATE UNIQUE INDEX IF NOT EXISTS phones_user_geelark_solo_uniq
  ON public.phones(user_id, geelark_id) WHERE org_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS phones_org_geelark_uniq
  ON public.phones(org_id, geelark_id) WHERE org_id IS NOT NULL;

-- 3. RPC that upserts using the right partial index + WHERE predicate
CREATE OR REPLACE FUNCTION public.sync_geelark_phones(p_rows jsonb, p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF p_org_id IS NOT NULL THEN
      INSERT INTO public.phones
        (user_id, org_id, geelark_id, serial_no, phone_name, group_name, status, remark, synced_at)
      VALUES (
        (r->>'user_id')::uuid, p_org_id, r->>'geelark_id',
        r->>'serial_no', r->>'phone_name', r->>'group_name',
        r->>'status', r->>'remark', (r->>'synced_at')::timestamptz
      )
      ON CONFLICT (org_id, geelark_id) WHERE org_id IS NOT NULL
      DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        serial_no  = EXCLUDED.serial_no,
        phone_name = EXCLUDED.phone_name,
        group_name = EXCLUDED.group_name,
        status     = EXCLUDED.status,
        remark     = EXCLUDED.remark,
        synced_at  = EXCLUDED.synced_at;
    ELSE
      INSERT INTO public.phones
        (user_id, org_id, geelark_id, serial_no, phone_name, group_name, status, remark, synced_at)
      VALUES (
        (r->>'user_id')::uuid, NULL, r->>'geelark_id',
        r->>'serial_no', r->>'phone_name', r->>'group_name',
        r->>'status', r->>'remark', (r->>'synced_at')::timestamptz
      )
      ON CONFLICT (user_id, geelark_id) WHERE org_id IS NULL
      DO UPDATE SET
        serial_no  = EXCLUDED.serial_no,
        phone_name = EXCLUDED.phone_name,
        group_name = EXCLUDED.group_name,
        status     = EXCLUDED.status,
        remark     = EXCLUDED.remark,
        synced_at  = EXCLUDED.synced_at;
    END IF;
  END LOOP;
END;
$$;
