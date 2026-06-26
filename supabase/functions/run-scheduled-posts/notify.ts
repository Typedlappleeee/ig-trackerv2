// Server-side notification fan-out for the scheduler cron.
// Reads notification_settings from org_config (if org) or app_config (solo) and
// pushes a message to every configured channel. Best-effort: never throws.

interface NotifySettings {
  telegram_token?: string
  telegram_chat?: string
  discord_webhook?: string
  email?: string
  events?: Record<string, boolean>
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// deno-lint-ignore no-explicit-any
async function loadSettings(db: any, userId: string | null, orgId: string | null): Promise<NotifySettings | null> {
  try {
    if (orgId) {
      const { data } = await db.from('org_config').select('notification_settings').eq('org_id', orgId).maybeSingle()
      if (data?.notification_settings && Object.keys(data.notification_settings).length) return data.notification_settings
    }
    if (userId) {
      const { data } = await db.from('app_config').select('notification_settings').eq('user_id', userId).maybeSingle()
      if (data?.notification_settings && Object.keys(data.notification_settings).length) return data.notification_settings
    }
  } catch { /* ignore */ }
  return null
}

async function fanOut(s: NotifySettings, subject: string, message: string): Promise<void> {
  const jobs: Promise<unknown>[] = []
  if (s.telegram_token && s.telegram_chat) {
    jobs.push(fetch(`https://api.telegram.org/bot${s.telegram_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: s.telegram_chat, text: `<b>${esc(subject)}</b>\n${esc(message)}`, parse_mode: 'HTML', disable_web_page_preview: true }),
    }).catch(() => {}))
  }
  if (s.discord_webhook) {
    jobs.push(fetch(s.discord_webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `**${subject}**\n${message}` }),
    }).catch(() => {}))
  }
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (s.email && resendKey) {
    const from = Deno.env.get('NOTIFY_FROM_EMAIL') || 'ScaleFlow <onboarding@resend.dev>'
    jobs.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from, to: s.email, subject, html: `<p style="white-space:pre-wrap">${esc(message)}</p>` }),
    }).catch(() => {}))
  }
  await Promise.allSettled(jobs)
}

// Public helper: load settings for the owner of a task/post and notify if the
// event is enabled (events default to ON when unspecified).
// deno-lint-ignore no-explicit-any
export async function notifyOwner(
  db: any,
  ctx: { userId: string | null; orgId: string | null },
  event: string,
  subject: string,
  message: string,
): Promise<void> {
  try {
    const s = await loadSettings(db, ctx.userId, ctx.orgId)
    if (!s) return
    if (s.events && s.events[event] === false) return
    await fanOut(s, subject, message)
  } catch { /* best-effort, never break the cron */ }
}
