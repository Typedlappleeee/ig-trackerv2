-- Notes + comptes (login/mdp) mémorisés PAR TÉLÉPHONE iRemoTech.
-- Coffre perso : chaque utilisateur a ses propres notes/comptes par device.
create table if not exists public.iremotech_device_meta (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  org_id     uuid,
  device_id  text not null,           -- public_id iRemoTech
  notes      text not null default '',
  accounts   jsonb not null default '[]',   -- [{ label, platform, username, password }]
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

alter table public.iremotech_device_meta enable row level security;

drop policy if exists "irt_meta_own" on public.iremotech_device_meta;
create policy "irt_meta_own" on public.iremotech_device_meta
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
