-- Fix phones unique constraints so multi-org / multi-member syncs work cleanly.
--
-- Problem: UNIQUE (user_id, geelark_id) is a table-level constraint that always
-- fires. When two orgs share the same GéeLark API (same phone geelark_ids) or
-- two members of the same org sync simultaneously, inserts fail because:
--   · phones_user_geelark_unique fires on (user_id, geelark_id) even in org mode
--   · phones_org_geelark_uniq fires on (org_id, geelark_id) in race conditions
--
-- Fix: drop the table-level constraint and replace with two partial indexes:
--   · Solo mode  (org_id IS NULL)     → UNIQUE (user_id, geelark_id)
--   · Org mode   (org_id IS NOT NULL) → UNIQUE (org_id, geelark_id)  [already exists]
--
-- This allows the same geelark_id to exist in multiple orgs simultaneously.

-- 1. Drop the old table-level constraint (requires finding its name first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.phones'::regclass
      AND contype = 'u'
      AND conname = 'phones_user_geelark_unique'
  ) THEN
    ALTER TABLE public.phones DROP CONSTRAINT phones_user_geelark_unique;
  END IF;

  -- Also try the auto-generated name pattern in case it differs
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.phones'::regclass
      AND contype = 'u'
      AND array_to_string(
            ARRAY(SELECT attname FROM pg_attribute
                  WHERE attrelid = conrelid
                    AND attnum = ANY(conkey)
                  ORDER BY attnum),
            ','
          ) IN ('user_id,geelark_id', 'geelark_id,user_id')
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.phones DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.phones'::regclass
        AND contype = 'u'
        AND array_to_string(
              ARRAY(SELECT attname FROM pg_attribute
                    WHERE attrelid = conrelid
                      AND attnum = ANY(conkey)
                    ORDER BY attnum),
              ','
            ) IN ('user_id,geelark_id', 'geelark_id,user_id')
      LIMIT 1
    );
  END IF;
END $$;

-- 2. Replace with a partial unique index — solo mode only
CREATE UNIQUE INDEX IF NOT EXISTS phones_user_geelark_solo_uniq
  ON public.phones(user_id, geelark_id)
  WHERE org_id IS NULL;

-- 3. The org index already exists but recreate it idempotently to be safe
CREATE UNIQUE INDEX IF NOT EXISTS phones_org_geelark_uniq
  ON public.phones(org_id, geelark_id)
  WHERE org_id IS NOT NULL;
