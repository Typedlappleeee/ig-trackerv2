-- Support tickets system

create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid references organizations(id) on delete set null,
  user_email  text not null,
  org_name    text,
  subject     text not null,
  description text not null,
  category    text not null default 'general', -- general | billing | technical | other
  status      text not null default 'open',    -- open | in_progress | resolved | closed
  priority    text not null default 'normal',  -- low | normal | high | urgent
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  is_admin    boolean not null default false,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- Indexes
create index if not exists support_tickets_user_id_idx   on support_tickets(user_id);
create index if not exists support_tickets_org_id_idx    on support_tickets(org_id);
create index if not exists support_tickets_status_idx    on support_tickets(status);
create index if not exists ticket_messages_ticket_id_idx on ticket_messages(ticket_id);

-- Auto-update updated_at on support_tickets
create or replace function update_ticket_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ticket_updated_at on support_tickets;
create trigger trg_ticket_updated_at
  before update on support_tickets
  for each row execute function update_ticket_updated_at();

-- Also bump ticket updated_at when a message is added
create or replace function bump_ticket_on_message()
returns trigger language plpgsql security definer as $$
begin
  update support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_ticket_on_message on ticket_messages;
create trigger trg_bump_ticket_on_message
  after insert on ticket_messages
  for each row execute function bump_ticket_on_message();

-- RLS
alter table support_tickets  enable row level security;
alter table ticket_messages  enable row level security;

-- Users can CRUD their own tickets
drop policy if exists "tickets_user_select"  on support_tickets;
drop policy if exists "tickets_user_insert"  on support_tickets;
drop policy if exists "tickets_user_update"  on support_tickets;

create policy "tickets_user_select"
  on support_tickets for select
  using (user_id = auth.uid());

create policy "tickets_user_insert"
  on support_tickets for insert
  with check (user_id = auth.uid());

create policy "tickets_user_update"
  on support_tickets for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can read/insert messages on their own tickets
drop policy if exists "messages_user_select" on ticket_messages;
drop policy if exists "messages_user_insert" on ticket_messages;

create policy "messages_user_select"
  on ticket_messages for select
  using (
    exists (select 1 from support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    or sender_id = auth.uid()
  );

create policy "messages_user_insert"
  on ticket_messages for insert
  with check (
    sender_id = auth.uid()
    and not is_admin
    and exists (select 1 from support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

-- Super-admin RPC: get all tickets
create or replace function get_all_support_tickets()
returns table (
  id          uuid,
  user_id     uuid,
  org_id      uuid,
  user_email  text,
  org_name    text,
  subject     text,
  description text,
  category    text,
  status      text,
  priority    text,
  created_at  timestamptz,
  updated_at  timestamptz,
  message_count bigint
)
language plpgsql security definer as $$
declare
  v_caller uuid := auth.uid();
begin
  if not exists (
    select 1 from profiles
    where id = v_caller and is_super_admin = true
  ) then
    raise exception 'unauthorized';
  end if;

  return query
    select
      t.id, t.user_id, t.org_id, t.user_email, t.org_name,
      t.subject, t.description, t.category, t.status, t.priority,
      t.created_at, t.updated_at,
      count(m.id)::bigint as message_count
    from support_tickets t
    left join ticket_messages m on m.ticket_id = t.id
    group by t.id
    order by t.updated_at desc;
end;
$$;

-- Super-admin RPC: get all messages for a ticket
create or replace function get_ticket_messages_admin(p_ticket_id uuid)
returns table (
  id           uuid,
  ticket_id    uuid,
  sender_id    uuid,
  sender_email text,
  is_admin     boolean,
  message      text,
  created_at   timestamptz
)
language plpgsql security definer as $$
declare
  v_caller uuid := auth.uid();
begin
  if not exists (
    select 1 from profiles
    where id = v_caller and is_super_admin = true
  ) then
    raise exception 'unauthorized';
  end if;

  return query
    select m.id, m.ticket_id, m.sender_id, m.sender_email,
           m.is_admin, m.message, m.created_at
    from ticket_messages m
    where m.ticket_id = p_ticket_id
    order by m.created_at asc;
end;
$$;

-- Super-admin RPC: post admin reply
create or replace function admin_reply_ticket(p_ticket_id uuid, p_message text)
returns void
language plpgsql security definer as $$
declare
  v_caller uuid := auth.uid();
  v_email  text;
begin
  if not exists (
    select 1 from profiles
    where id = v_caller and is_super_admin = true
  ) then
    raise exception 'unauthorized';
  end if;

  select email into v_email from auth.users where id = v_caller;

  insert into ticket_messages (ticket_id, sender_id, sender_email, is_admin, message)
  values (p_ticket_id, v_caller, coalesce(v_email, 'admin'), true, p_message);
end;
$$;

-- Super-admin RPC: update ticket status/priority
create or replace function admin_update_ticket(
  p_ticket_id uuid,
  p_status    text default null,
  p_priority  text default null
)
returns void
language plpgsql security definer as $$
declare
  v_caller uuid := auth.uid();
begin
  if not exists (
    select 1 from profiles
    where id = v_caller and is_super_admin = true
  ) then
    raise exception 'unauthorized';
  end if;

  update support_tickets
  set
    status   = coalesce(p_status,   status),
    priority = coalesce(p_priority, priority),
    updated_at = now()
  where id = p_ticket_id;
end;
$$;
