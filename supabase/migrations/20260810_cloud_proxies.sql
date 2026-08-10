-- Proxies des cloud phones : stockés par utilisateur (perso) ou agence (org),
-- organisés en groupes, assignables à chaque téléphone. SOCKS5 par défaut.
create table if not exists public.cloud_proxies (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  org_id      uuid,
  label       text,
  group_name  text,
  type        text not null default 'socks5' check (type in ('socks5','http')),
  host        text not null,
  port        int  not null,
  username    text,
  password    text,
  created_at  timestamptz not null default now()
);

create index if not exists cloud_proxies_user_idx  on public.cloud_proxies(user_id);
create index if not exists cloud_proxies_group_idx on public.cloud_proxies(group_name);

alter table public.cloud_proxies enable row level security;

-- Écriture : chacun ne gère que SES proxies.
drop policy if exists cloud_proxies_ins on public.cloud_proxies;
create policy cloud_proxies_ins on public.cloud_proxies for insert with check (user_id = auth.uid());
drop policy if exists cloud_proxies_upd on public.cloud_proxies;
create policy cloud_proxies_upd on public.cloud_proxies for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cloud_proxies_del on public.cloud_proxies;
create policy cloud_proxies_del on public.cloud_proxies for delete using (user_id = auth.uid());

-- Lecture : les miens (base) + ceux partagés à mon agence (séparé → robuste si
-- is_org_member manque).
drop policy if exists cloud_proxies_sel_base on public.cloud_proxies;
create policy cloud_proxies_sel_base on public.cloud_proxies for select using (user_id = auth.uid());
drop policy if exists cloud_proxies_sel_org on public.cloud_proxies;
create policy cloud_proxies_sel_org on public.cloud_proxies for select using (org_id is not null and public.is_org_member(org_id));
