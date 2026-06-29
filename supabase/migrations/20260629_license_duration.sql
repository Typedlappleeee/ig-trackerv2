-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Clés de licence cumulables : ajoute la DURÉE (en jours) de la clé ║
-- ║  À exécuter une fois dans Supabase → SQL Editor. Idempotent.       ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- La durée (jours) est désormais figée sur la clé, indépendamment de la date
-- d'expiration. À l'activation, on calcule expires_at = (temps restant) + durée
-- → un utilisateur avec 26 j restants qui active une clé de 30 j obtient 56 j.
alter table public.license_keys
  add column if not exists duration_days integer;

-- Backfill des clés existantes : déduit la durée de created_at → expires_at.
-- (null = clé à vie / sans expiration, on laisse null.)
update public.license_keys
  set duration_days = greatest(0, ceil(extract(epoch from (expires_at - created_at)) / 86400))::int
  where duration_days is null and expires_at is not null;

-- Recharge le cache PostgREST pour voir la nouvelle colonne.
notify pgrst, 'reload schema';
