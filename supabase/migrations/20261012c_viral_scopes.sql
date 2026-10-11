-- Veille Reels v2 : deux sources.
--   • scope = 'public'  → « Sélection ScaleFlow » : comptes choisis par le super-admin, visibles par tous.
--   • scope = 'private' → « Mes comptes » : chaque utilisateur (ou son équipe) suit ses propres comptes.
-- À coller dans Supabase → SQL Editor → Run, APRÈS 20261012_viral.sql et 20261012b_viral_shared.sql. Ré-exécutable.
alter table public.viral_watch add column if not exists scope text not null default 'public';   -- lignes existantes = sélection ScaleFlow
alter table public.viral_watch alter column scope set default 'private';
create index if not exists viral_watch_scope on public.viral_watch (scope, user_id);

drop policy if exists viral_watch_rw on public.viral_watch;
drop policy if exists viral_watch_read on public.viral_watch;
drop policy if exists viral_watch_admin on public.viral_watch;
drop policy if exists viral_watch_own on public.viral_watch;
-- Lecture : la sélection publique + ses propres comptes (ou ceux de son équipe).
create policy viral_watch_read on public.viral_watch for select to authenticated using (
  scope = 'public' or user_id = auth.uid()
  or (org_id is not null and exists (select 1 from organization_members m where m.org_id = viral_watch.org_id and m.user_id = auth.uid())));
-- Écriture : le super-admin gère tout ; chacun gère ses comptes privés.
create policy viral_watch_admin on public.viral_watch for all to authenticated
  using (public.sf_is_super_admin()) with check (public.sf_is_super_admin());
create policy viral_watch_own on public.viral_watch for all to authenticated
  using (scope = 'private' and (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = viral_watch.org_id and m.user_id = auth.uid()))))
  with check (scope = 'private' and user_id = auth.uid());

-- Les Reels suivent la visibilité de leur compte surveillé.
drop policy if exists viral_reels_read on public.viral_reels;
create policy viral_reels_read on public.viral_reels for select to authenticated
  using (exists (select 1 from public.viral_watch w where w.id = viral_reels.watch_id));
