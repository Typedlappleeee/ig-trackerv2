-- Track which custom role template is assigned to a member / invite.
-- custom_role_id is set null when the template is deleted (cascade).
alter table organization_members
  add column if not exists custom_role_id uuid references org_role_templates(id) on delete set null;

alter table organization_invites
  add column if not exists custom_role_id uuid references org_role_templates(id) on delete set null;
