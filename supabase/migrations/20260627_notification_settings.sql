-- Notifications externes (Telegram / Discord / email) par utilisateur et par org.
-- Stocké en jsonb pour rester souple :
-- {
--   "telegram_token": "123:ABC",      -- token du bot Telegram (optionnel)
--   "telegram_chat":  "123456789",    -- chat_id destinataire
--   "discord_webhook":"https://discord.com/api/webhooks/...",
--   "email":          "moi@exemple.com",
--   "events": { "task_paused": true, "post_failed": true, "batch_done": false, "ban_risk": true }
-- }
alter table if exists public.app_config
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

alter table if exists public.org_config
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;
