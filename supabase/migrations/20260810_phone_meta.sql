-- Per-phone metadata managed inside ScaleFlow (not sourced from GeeLark):
--   • tags         — multiple free-form colored labels per phone
--   • notes        — user note (GeeLark `remark` is overwritten on every sync,
--                    so it is unsafe for user notes — this column is never touched
--                    by sync_geelark_phones)
--   • phone_group  — a local group the user controls in ScaleFlow. Survives sync,
--                    unlike group_name (which the sync resets to GeeLark's value)
--   • login/password/totp_secret — remembered account credentials, reused by the
--                    Warmup auto-login. Protected by the same org-scoped RLS as the
--                    rest of the row (stored as-is, like the existing TOTP field).
--
-- IMPORTANT: sync_geelark_phones (20260602c) only INSERTs/UPDATEs the GeeLark
-- columns (serial/name/group_name/status/remark). It never lists the columns
-- below, so they are defaulted on first insert and preserved across every sync.
-- No change to that RPC is required.

ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS tags        text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS notes       text;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS phone_group text;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS login       text;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS password    text;
ALTER TABLE public.phones ADD COLUMN IF NOT EXISTS totp_secret text;

-- Fast filtering by tag (array containment) and by local group.
CREATE INDEX IF NOT EXISTS idx_phones_tags        ON public.phones USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_phones_phone_group ON public.phones (phone_group);
