-- Pages Facebook connectées par l'API officielle Meta (publication de Reels sans téléphone).
-- Le jeton de Page ne sort jamais du serveur : table fermée (RLS sans policy + REVOKE),
-- lue et écrite uniquement par /api/fb avec la clé service-role.
create table if not exists public.sf_fb_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,   -- qui a connecté la Page
  space_org uuid references public.organizations(id) on delete cascade, -- espace (null = perso)
  page_id text not null,
  name text not null default '',
  picture text,
  access_token text not null,
  connected_at timestamptz not null default now(),
  last_post_at timestamptz,
  last_error text
);
create unique index if not exists sf_fb_pages_space_page
  on public.sf_fb_pages (coalesce(space_org::text, 'u:' || owner_id::text), page_id);
create index if not exists sf_fb_pages_org on public.sf_fb_pages (space_org);
create index if not exists sf_fb_pages_owner on public.sf_fb_pages (owner_id);

alter table public.sf_fb_pages enable row level security;
revoke all on public.sf_fb_pages from anon, authenticated;
