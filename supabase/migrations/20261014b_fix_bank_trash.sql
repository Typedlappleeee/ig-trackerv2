-- CORRECTIF URGENT : « function public.member_can_action(uuid, unknown) does not exist »
-- empêchait de mettre des médias à la corbeille (le garde-fou de 20261013_bank_quota.sql
-- appelait une fonction absente de certaines bases). Ce garde-fou ne dépend plus de rien :
-- on peut toujours supprimer SES médias ; ceux des autres membres seulement si on est
-- owner / admin de l'organisation (ou son propriétaire). À coller dans SQL Editor → Run.
create or replace function public.bank_guard_trash()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ok boolean := false;
begin
  if auth.uid() is null then return new; end if;                       -- service (cron, edge)
  if new.deleted_at is not distinct from old.deleted_at then return new; end if;
  if old.org_id is null or old.user_id = auth.uid() then return new; end if;
  select exists (select 1 from public.organizations o where o.id = old.org_id and o.owner_id = auth.uid())
      or exists (select 1 from public.organization_members m where m.org_id = old.org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
    into v_ok;
  if not v_ok then
    raise exception 'Tu n''as pas le droit de supprimer les médias des autres membres.';
  end if;
  return new;
end $$;
drop trigger if exists bank_guard_trash on public.content_bank;
create trigger bank_guard_trash before update on public.content_bank for each row execute function public.bank_guard_trash();
