-- Fix: partial unique indexes break ON CONFLICT in Supabase upsert.
-- PostgreSQL requires ON CONFLICT to target a non-partial constraint.
-- Replace partial indexes with regular UNIQUE constraints:
--   · (user_id, geelark_id)  → solo mode upsert target
--   · (org_id,  geelark_id)  → org  mode upsert target
--                               NULLs are distinct in PG so org_id=NULL rows
--                               never conflict each other — behaves like the
--                               old partial index without breaking ON CONFLICT.

DROP INDEX IF EXISTS public.phones_user_geelark_solo_uniq;
DROP INDEX IF EXISTS public.phones_org_geelark_uniq;

ALTER TABLE public.phones DROP CONSTRAINT IF EXISTS phones_user_geelark_unique;
ALTER TABLE public.phones ADD CONSTRAINT phones_user_geelark_unique UNIQUE (user_id, geelark_id);

ALTER TABLE public.phones DROP CONSTRAINT IF EXISTS phones_org_geelark_unique;
ALTER TABLE public.phones ADD CONSTRAINT phones_org_geelark_unique UNIQUE (org_id, geelark_id);
