-- Google Drive sync — connecte un/plusieurs dossiers Drive à la banque de contenu.
--
-- Modèle : COMPTE DE SERVICE. L'utilisateur partage son dossier Drive avec
-- l'email du compte de service (stocké côté serveur en secret), puis colle l'ID
-- du dossier ici. Une edge function `sync-drive` (cron horaire) liste les vidéos
-- du dossier, les copie dans le bucket Supabase `content` et crée les entrées de
-- banque correspondantes. Le posting (Mass Posting / Tasks / serveur) fonctionne
-- alors sans modification car tout passe déjà par `storage_path`.

-- ── Table des connexions Drive ──────────────────────────────────────────────
create table if not exists drive_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  org_id        uuid references organizations(id) on delete set null,
  name          text not null default 'Google Drive',
  folder_id     text not null,                 -- ID du dossier Drive partagé
  target_folder text,                           -- dossier de banque où ranger les vidéos (null = racine)
  recursive     boolean not null default true,  -- inclure les sous-dossiers
  status        text not null default 'active', -- active | paused | error
  last_sync_at  timestamptz,
  last_error    text,
  synced_count  integer not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_drive_conn_user_id on drive_connections(user_id);
create index if not exists idx_drive_conn_org_id  on drive_connections(org_id);

-- ── Colonnes de provenance sur content_bank ─────────────────────────────────
alter table content_bank add column if not exists source               text default 'upload'; -- upload | drive
alter table content_bank add column if not exists drive_file_id        text;
alter table content_bank add column if not exists drive_connection_id  uuid references drive_connections(id) on delete set null;

-- Empêche d'importer deux fois le même fichier Drive pour une même connexion.
create unique index if not exists uniq_drive_file_per_conn
  on content_bank(drive_connection_id, drive_file_id)
  where drive_connection_id is not null and drive_file_id is not null;

-- ── RLS (mêmes règles que content_bank) ─────────────────────────────────────
alter table drive_connections enable row level security;

drop policy if exists drive_conn_select on drive_connections;
create policy drive_conn_select on drive_connections for select
  using (user_id = auth.uid() or (org_id is not null and is_org_member(org_id)));

drop policy if exists drive_conn_insert on drive_connections;
create policy drive_conn_insert on drive_connections for insert
  with check (user_id = auth.uid() and (org_id is null or is_org_member(org_id)));

drop policy if exists drive_conn_update on drive_connections;
create policy drive_conn_update on drive_connections for update
  using (user_id = auth.uid() or (org_id is not null and is_org_admin(org_id)));

drop policy if exists drive_conn_delete on drive_connections;
create policy drive_conn_delete on drive_connections for delete
  using (user_id = auth.uid() or (org_id is not null and is_org_admin(org_id)));
