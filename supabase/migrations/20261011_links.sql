-- Liens suivis façon GetMySocial : pages de liens par modèle + un lien court par compte,
-- avec comptage des clics. Servi publiquement par desktop-app/api/l.js (clé service_role,
-- côté serveur) ; l'app lit/écrit ses pages et liens sous RLS.
-- À coller UNE fois dans Supabase → SQL Editor → Run.

create table if not exists public.link_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  org_id uuid,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  title text not null default '',
  bio text not null default '',
  avatar_url text,
  buttons jsonb not null default '[]'::jsonb,      -- [{ "label": "...", "url": "https://..." }]
  theme text not null default 'dark' check (theme in ('dark','light','violet','rose')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  org_id uuid,
  page_id uuid references public.link_pages(id) on delete cascade,
  phone_id uuid,                                    -- compte (ligne phones) qui porte ce lien
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  destination text,                                 -- null = ouvre la page de liens `page_id`
  label text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists tracked_links_phone on public.tracked_links (phone_id);

create table if not exists public.link_clicks (
  id bigserial primary key,
  link_id uuid references public.tracked_links(id) on delete cascade,
  page_id uuid references public.link_pages(id) on delete cascade,
  button int,                                       -- index du bouton cliqué sur la page (null = visite)
  country text,
  device text,                                      -- ios | android | desktop
  bot boolean not null default false,               -- robots d'aperçu (Instagram, Facebook…)
  created_at timestamptz not null default now()
);
create index if not exists link_clicks_link_ts on public.link_clicks (link_id, created_at desc);
create index if not exists link_clicks_page_ts on public.link_clicks (page_id, created_at desc);

alter table public.link_pages enable row level security;
alter table public.tracked_links enable row level security;
alter table public.link_clicks enable row level security;

-- Propriétaire, ou membre de l'organisation.
drop policy if exists link_pages_rw on public.link_pages;
create policy link_pages_rw on public.link_pages for all
  using (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = link_pages.org_id and m.user_id = auth.uid())))
  with check (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = link_pages.org_id and m.user_id = auth.uid())));

drop policy if exists tracked_links_rw on public.tracked_links;
create policy tracked_links_rw on public.tracked_links for all
  using (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = tracked_links.org_id and m.user_id = auth.uid())))
  with check (user_id = auth.uid() or (org_id is not null and exists (select 1 from organization_members m where m.org_id = tracked_links.org_id and m.user_id = auth.uid())));

-- Clics : lecture seulement (l'écriture se fait côté serveur avec la clé service_role).
drop policy if exists link_clicks_read on public.link_clicks;
create policy link_clicks_read on public.link_clicks for select using (
  exists (select 1 from public.tracked_links l where l.id = link_clicks.link_id)
  or exists (select 1 from public.link_pages p where p.id = link_clicks.page_id)
);

-- (Ré-exécutable) colonne thème si la table existait déjà.
alter table public.link_pages add column if not exists theme text not null default 'dark';
