// Notification fan-out proxy.
// POST { settings, subject, message }
//   settings = { telegram_token, telegram_chat, discord_webhook, email, ... }
// Sends the message to every configured channel and returns per-channel results.
// Telegram + Discord need no server secret (token/webhook live in settings).
// Email uses Resend and requires RESEND_API_KEY (+ optional NOTIFY_FROM_EMAIL).

module.exports.config = { maxDuration: 15 }

async function sendTelegram(token, chat, subject, message) {
  if (!token || !chat) return null
  const text = `<b>${escapeHtml(subject)}</b>\n${escapeHtml(message)}`
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
  return { ok: res.ok, status: res.status }
}

async function sendDiscord(webhook, subject, message) {
  if (!webhook) return null
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `**${subject}**\n${message}` }),
  })
  return { ok: res.ok, status: res.status }
}

async function sendEmail(to, subject, message) {
  const key = process.env.RESEND_API_KEY
  if (!to || !key) return null
  const from = process.env.NOTIFY_FROM_EMAIL || 'ScaleFlow <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from, to, subject,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111"><h2 style="margin:0 0 8px">${escapeHtml(subject)}</h2><p style="white-space:pre-wrap;margin:0">${escapeHtml(message)}</p><hr style="border:none;border-top:1px solid #eee;margin:16px 0"/><p style="color:#888;font-size:12px;margin:0">ScaleFlow</p></div>`,
    }),
  })
  return { ok: res.ok, status: res.status }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const { settings = {}, subject = 'ScaleFlow', message = '' } = req.body ?? {}
    const results = {}
    const [tg, dc, em] = await Promise.all([
      sendTelegram(settings.telegram_token, settings.telegram_chat, subject, message).catch(e => ({ ok: false, error: String(e?.message ?? e) })),
      sendDiscord(settings.discord_webhook, subject, message).catch(e => ({ ok: false, error: String(e?.message ?? e) })),
      sendEmail(settings.email, subject, message).catch(e => ({ ok: false, error: String(e?.message ?? e) })),
    ])
    if (tg) results.telegram = tg
    if (dc) results.discord = dc
    if (em) results.email = em
    const any = Object.values(results).some(r => r && r.ok)
    const configured = Object.keys(results).length
    return res.status(200).json({ ok: any || configured === 0, configured, results })
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err?.message ?? err) })
  }
}
