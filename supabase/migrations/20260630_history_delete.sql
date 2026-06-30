-- Vider l'historique de posting.
-- scheduled_posts n'avait aucune policy DELETE (RLS bloquait toute suppression),
-- et post_runs n'autorisait que la suppression de ses propres lignes. On ajoute
-- des policies DELETE : l'utilisateur supprime son propre historique, et un
-- admin/propriétaire d'org peut vider l'historique de l'org.

drop policy if exists "sched_delete" on public.scheduled_posts;
create policy "sched_delete" on public.scheduled_posts for delete using (
  auth.uid() = user_id
  or (org_id is not null and public.is_org_admin(org_id))
);

drop policy if exists "post_runs_delete_org" on public.post_runs;
create policy "post_runs_delete_org" on public.post_runs for delete using (
  auth.uid() = user_id
  or (org_id is not null and public.is_org_admin(org_id))
);

notify pgrst, 'reload schema';
