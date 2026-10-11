-- Veille Reels partagée : le super-admin choisit les comptes de référence,
-- TOUS les utilisateurs connectés voient les Reels (lecture seule).
-- À coller dans Supabase → SQL Editor → Run, APRÈS 20261012_viral.sql. Ré-exécutable.
create or replace function public.sf_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and (coalesce(p.is_super_admin, false) or p.email = 'tintin.aunea@gmail.com'))
$$;

drop policy if exists viral_watch_rw on public.viral_watch;
drop policy if exists viral_watch_read on public.viral_watch;
drop policy if exists viral_watch_admin on public.viral_watch;
create policy viral_watch_read on public.viral_watch for select to authenticated using (true);
create policy viral_watch_admin on public.viral_watch for all to authenticated
  using (public.sf_is_super_admin()) with check (public.sf_is_super_admin());

drop policy if exists viral_reels_read on public.viral_reels;
create policy viral_reels_read on public.viral_reels for select to authenticated using (true);
