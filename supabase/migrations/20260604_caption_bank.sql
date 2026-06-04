-- Caption bank: stores reusable text captions (org-scoped or solo)
CREATE TABLE IF NOT EXISTS public.caption_bank (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  title       text NOT NULL DEFAULT '',
  content     text NOT NULL,
  folder      text,
  tags        text[] DEFAULT '{}',
  used_count  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caption_bank_user_id ON public.caption_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_caption_bank_org_id  ON public.caption_bank(org_id);

ALTER TABLE public.caption_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caption_bank_select" ON public.caption_bank;
DROP POLICY IF EXISTS "caption_bank_insert" ON public.caption_bank;
DROP POLICY IF EXISTS "caption_bank_update" ON public.caption_bank;
DROP POLICY IF EXISTS "caption_bank_delete" ON public.caption_bank;

CREATE POLICY "caption_bank_select" ON public.caption_bank FOR SELECT USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_member(org_id))
);
CREATE POLICY "caption_bank_insert" ON public.caption_bank FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (org_id IS NULL OR public.is_org_member(org_id))
);
CREATE POLICY "caption_bank_update" ON public.caption_bank FOR UPDATE USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_member(org_id))
);
CREATE POLICY "caption_bank_delete" ON public.caption_bank FOR DELETE USING (
  user_id = auth.uid() OR (org_id IS NOT NULL AND public.is_org_admin(org_id))
);
