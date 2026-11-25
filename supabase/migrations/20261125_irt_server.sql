-- iRemoTech sur SERVEUR (PC éteint) : file des sessions, journal en direct, serveurs en ligne.
-- ScaleFlow prépare la session (iPhones, comptes, vidéos, descriptions, lieux) et l'enregistre ici ; le programme
-- serveur (public/irt-worker/worker.mjs) la prend, la fait tourner et écrit le journal ligne par ligne.
-- À coller dans Supabase → SQL Editor → Run. Ré-exécutable. Utilise public.sf_in_space (20261015_genjutsu.sql).

create table if not exists public.irt_server_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,      -- null = espace perso
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space text generated always as (coalesce(org_id::text, 'u:' || user_id::text)) stored,
  kind text not null default 'reel',                                      -- 'reel' (étape 1)
  title text,
  devices jsonb not null default '[]'::jsonb,                             -- ids des iPhones (jamais deux sessions sur le même)
  plan jsonb not null,                                                     -- iPhones → posts (compte, vidéo, description, lieu) + options
  status text not null default 'queued',                                   -- queued · running · done · failed · cancelled
  cancel_requested boolean not null default false,
  progress jsonb not null default '{}'::jsonb,                             -- { total, done, ok }
  worker_id text,
  error text,
  created_by_name text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz
);
create index if not exists irt_server_runs_space on public.irt_server_runs (space, created_at desc);
create index if not exists irt_server_runs_status on public.irt_server_runs (status, created_at);

create table if not exists public.irt_server_logs (
  id bigserial primary key,
  run_id uuid not null references public.irt_server_runs(id) on delete cascade,
  at timestamptz not null default now(),
  line text not null
);
create index if not exists irt_server_logs_run on public.irt_server_logs (run_id, id);

-- Serveurs en ligne (battement toutes les 30 s) : ScaleFlow affiche « Serveur iRemoTech : en ligne ».
create table if not exists public.irt_workers (
  id text primary key,
  last_seen timestamptz not null default now(),
  version text,
  active_runs int not null default 0
);

alter table public.irt_server_runs enable row level security;
alter table public.irt_server_logs enable row level security;
alter table public.irt_workers enable row level security;

drop policy if exists irt_server_runs_rw on public.irt_server_runs;
create policy irt_server_runs_rw on public.irt_server_runs for all
  using ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)))
  with check ((org_id is null and user_id = auth.uid()) or (org_id is not null and public.sf_in_space(org_id)));
grant select, insert, update on public.irt_server_runs to authenticated;

drop policy if exists irt_server_logs_read on public.irt_server_logs;
create policy irt_server_logs_read on public.irt_server_logs for select
  using (exists (select 1 from public.irt_server_runs r where r.id = run_id
    and ((r.org_id is null and r.user_id = auth.uid()) or (r.org_id is not null and public.sf_in_space(r.org_id)))));
grant select on public.irt_server_logs to authenticated;

drop policy if exists irt_workers_read on public.irt_workers;
create policy irt_workers_read on public.irt_workers for select using (auth.role() = 'authenticated');
grant select on public.irt_workers to authenticated;

-- Prise d'une session par un serveur (atomique) : la plus ancienne en attente dont AUCUN iPhone n'est déjà utilisé
-- par une session en cours. Réservée au serveur (clé service_role).
create or replace function public.irt_claim_run(p_worker text)
returns setof public.irt_server_runs
language plpgsql security definer set search_path = public as $$
declare r public.irt_server_runs;
begin
  select q.* into r from public.irt_server_runs q
   where q.status = 'queued' and not q.cancel_requested
     and not exists (
       select 1 from public.irt_server_runs b
        where b.status = 'running'
          and exists (select 1 from jsonb_array_elements_text(b.devices) d1, jsonb_array_elements_text(q.devices) d2 where d1 = d2))
   order by q.created_at
   for update skip locked
   limit 1;
  if not found then return; end if;
  update public.irt_server_runs set status = 'running', worker_id = p_worker, started_at = now(), heartbeat_at = now()
   where id = r.id returning * into r;
  return next r;
end $$;
revoke all on function public.irt_claim_run(text) from public, anon, authenticated;
grant execute on function public.irt_claim_run(text) to service_role;
