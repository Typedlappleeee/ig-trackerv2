-- ════════════════════════════════════════════════════════════════════════════
-- Banque — corbeille (soft-delete). Plus aucune suppression DÉFINITIVE de médias :
-- l'usage unique et la corbeille manuelle marquent `deleted_at` (restaurable 7 jours),
-- puis l'edge function purge définitivement au-delà de 7 jours.
-- Idempotent + ré-exécutable.
-- ════════════════════════════════════════════════════════════════════════════

alter table if exists public.content_bank
  add column if not exists deleted_at timestamptz;

-- Index partiel : ne concerne que les lignes en corbeille (rapide pour masquer/purger).
create index if not exists idx_content_bank_deleted_at
  on public.content_bank (deleted_at)
  where deleted_at is not null;
