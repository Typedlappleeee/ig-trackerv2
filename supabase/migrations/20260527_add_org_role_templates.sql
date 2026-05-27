-- Custom role templates per organization.
-- These are reusable permission presets (e.g. "Content Manager", "Analyst").
-- When applied to a member or invite, perm_overrides is copied from the template.

create table if not exists org_role_templates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  color          text not null default '#7c3aed',
  perm_overrides jsonb not null default '{}',
  created_by     uuid references auth.users(id),
  created_at     timestamptz default now()
);

alter table org_role_templates enable row level security;

-- Any org member can read the templates of their org
create policy "org members read role templates"
  on org_role_templates for select
  using (
    org_id in (
      select org_id from organization_members where user_id = auth.uid()
    )
  );

-- Only owners and admins can create / update / delete role templates
create policy "org admins manage role templates"
  on org_role_templates for all
  using (
    org_id in (
      select org_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
