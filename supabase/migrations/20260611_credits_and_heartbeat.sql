-- 1. Remboursement de crédits (annulation d'un post programmé avant exécution).
--    SECURITY DEFINER : permet à un membre d'orga d'initier le remboursement
--    vers le owner sans droit d'écriture direct sur user_credits.
create or replace function refund_user_credits(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
as $$
begin
  if p_amount <= 0 then
    return;
  end if;
  update user_credits
     set balance = balance + p_amount
   where user_id = p_user_id;
end;
$$;

-- 2. Heartbeat d'exécution : un post 'running' met à jour heartbeat_at toutes
--    les 60 s pendant son exécution. L'auto-réparation marque en échec tout
--    post running sans battement depuis 5 min — précis quel que soit le type
--    ou la durée (remplace les fenêtres fixes 30 min / 6 h).
alter table scheduled_posts
  add column if not exists heartbeat_at timestamptz;
