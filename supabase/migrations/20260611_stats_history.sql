-- Historique des stats de comptes — alimente la page Stats (courbes 7/30 j).
-- Un snapshot par compte par heure max (côté app), purgeable au-delà de 90 j.

create table if not exists account_stats_history (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users not null,
  org_id      uuid,
  phone_id    uuid not null,
  followers   integer not null default 0,
  following   integer not null default 0,
  total_views bigint  not null default 0,
  posts       integer not null default 0,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_stats_history_phone_time
  on account_stats_history (phone_id, recorded_at desc);
create index if not exists idx_stats_history_user_time
  on account_stats_history (user_id, recorded_at desc);

alter table account_stats_history enable row level security;

create policy "stats_history_read" on account_stats_history
  for select using (
    auth.uid() = user_id
    or (org_id is not null and exists (
      select 1 from org_members m
      where m.org_id = account_stats_history.org_id and m.user_id = auth.uid()
    ))
  );

create policy "stats_history_insert" on account_stats_history
  for insert with check (auth.uid() = user_id);

-- Purge automatique > 90 jours (optionnel, nécessite pg_cron déjà activé)
-- select cron.schedule('purge-stats-history', '0 4 * * *',
--   $$delete from account_stats_history where recorded_at < now() - interval '90 days'$$);
