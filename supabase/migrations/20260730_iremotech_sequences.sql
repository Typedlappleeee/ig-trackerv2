-- Séquences d'automatisation iRemoTech (macros) : la suite d'actions enregistrée
-- pendant un posting fait "à la main", rejouable sur tous les tels avec la vidéo
-- et la description choisies. Visible par toute l'agence (org) — ou perso.
create table if not exists public.iremotech_sequences (
  id         uuid primary key default gen_random_uuid(),
  scope_id   text not null,                 -- org_id (agence) OU user_id (perso)
  is_org     boolean not null default false,
  name       text not null,
  steps      jsonb not null default '[]',    -- [{ delay, action?, upload?, captionVar? }]
  created_at timestamptz not null default now()
);
alter table public.iremotech_sequences enable row level security;
drop policy if exists "irt_seq_access" on public.iremotech_sequences;
create policy "irt_seq_access" on public.iremotech_sequences for all
  using (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  )
  with check (
    (not is_org and scope_id = auth.uid()::text)
    or (is_org and exists (select 1 from public.organization_members m where m.org_id::text = scope_id and m.user_id = auth.uid()))
  );
