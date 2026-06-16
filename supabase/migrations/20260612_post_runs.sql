-- Historique léger des runs directs (Posting / Mass Posting) — alimente le
-- compteur "posts cette semaine" du Hub sans polluer scheduled_posts.
CREATE TABLE IF NOT EXISTS post_runs (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users NOT NULL,
  org_id     uuid,
  type       text NOT NULL CHECK (type IN ('posting', 'mass_posting', 'story')),
  ok_count   integer NOT NULL DEFAULT 0,
  err_count  integer NOT NULL DEFAULT 0,
  total      integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE post_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_runs_own" ON post_runs FOR ALL
  USING (auth.uid() = user_id);

-- Les membres d'une org voient les runs de leur org
CREATE POLICY "post_runs_org" ON post_runs FOR SELECT
  USING (org_id IS NOT NULL AND is_org_member(org_id));

CREATE INDEX IF NOT EXISTS post_runs_user_created
  ON post_runs (user_id, created_at DESC);
