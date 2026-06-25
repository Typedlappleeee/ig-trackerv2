-- Garde-fou anti-coût : suivi des téléphones démarrés par l'AUTOMATION ScaleFlow.
--
-- Chaque fois que le code (client OU serveur) appelle GeeLark /phone/start, il
-- enregistre ici le téléphone avec une heure-limite (stop_at). Le watchdog du cron
-- (run-scheduled-posts) éteint tout téléphone dont stop_at est dépassé, puis purge
-- la ligne. Un téléphone démarré À LA MAIN dans GeeLark n'est jamais inscrit ici,
-- donc le watchdog ne le touche jamais.
--
-- stop_at  : par défaut now()+5min ; surchargé pour les posts à intervalle.

create table if not exists phone_power_watch (
  geelark_id text primary key,
  org_id     uuid,
  user_id    uuid,
  reason     text,
  stop_at    timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ppw_stop_at on phone_power_watch (stop_at);

alter table phone_power_watch enable row level security;

-- Le client (authentifié) doit pouvoir inscrire/mettre à jour/purger les lignes
-- des téléphones qu'il démarre (soit en solo user_id, soit pour son organisation).
create policy "ppw_select" on phone_power_watch
  for select using (
    auth.uid() = user_id
    or (org_id is not null and exists (
      select 1 from org_members m
      where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()
    ))
  );

create policy "ppw_insert" on phone_power_watch
  for insert with check (
    auth.uid() = user_id
    or (org_id is not null and exists (
      select 1 from org_members m
      where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()
    ))
  );

create policy "ppw_update" on phone_power_watch
  for update using (
    auth.uid() = user_id
    or (org_id is not null and exists (
      select 1 from org_members m
      where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()
    ))
  );

create policy "ppw_delete" on phone_power_watch
  for delete using (
    auth.uid() = user_id
    or (org_id is not null and exists (
      select 1 from org_members m
      where m.org_id = phone_power_watch.org_id and m.user_id = auth.uid()
    ))
  );
