// Stripe webhook receiver — provisions subscriptions in Supabase.
// Pure CommonJS, no npm deps beyond what's already installed (@supabase/supabase-js).
// Signature verification uses node:crypto (Stripe's standard HMAC-SHA256 scheme).

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

// Vercel: disable body parsing so we can verify the signature over raw bytes.
module.exports.config = { api: { bodyParser: false } }

// Map Stripe Price IDs → internal plan name.
// Fill these in via env vars on Vercel (no need to redeploy when you switch
// from test to live mode — just update the env vars).
const PLAN_BY_PRICE = {
  [process.env.STRIPE_PRICE_STANDARD || '']: 'standard',
  [process.env.STRIPE_PRICE_PRO      || '']: 'pro',
  [process.env.STRIPE_PRICE_ORG      || '']: 'organisation',
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false
  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const i = p.indexOf('=')
      return [p.slice(0, i), p.slice(i + 1)]
    })
  )
  const timestamp = parts.t
  const provided  = parts.v1
  if (!timestamp || !provided) return false

  // Reject events older than 5 minutes (replay attack guard)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)
  if (!Number.isFinite(age) || age > 300 || age < -60) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')

  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(provided, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function stripeGET(path, secretKey) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  if (!r.ok) throw new Error(`Stripe GET ${path} → ${r.status}`)
  return r.json()
}

// Resolve the Supabase user_id for a given email (used as fallback when
// client_reference_id wasn't passed on the payment link).
async function findUserIdByEmail(supabase, email) {
  if (!email) return null
  try {
    const { data } = await supabase.auth.admin.listUsers()
    const u = data?.users?.find(x => (x.email || '').toLowerCase() === email.toLowerCase())
    return u?.id || null
  } catch {
    return null
  }
}

// Send a welcome email with the license key via Resend.
// Requires RESEND_API_KEY in env. Silently logs and continues if unset/fails —
// the subscription is still provisioned regardless.
async function sendLicenseEmail({ to, plan, licenseKey, periodEnd }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !to) return
  const from   = process.env.RESEND_FROM || 'ScaleFlow <noreply@scaleflow.io>'
  const appUrl = process.env.APP_URL     || 'https://scaleflow-fvtu.vercel.app/'
  const planLabel = plan === 'pro' ? 'Pro' : 'Standard'
  const expiry = periodEnd ? new Date(periodEnd).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : 'à vie'

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;background:#030307;color:#e9e7f5;padding:32px;max-width:560px;margin:auto;border-radius:16px;border:1px solid rgba(139,92,246,0.2)">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="font-size:28px;font-weight:900;margin:0;color:white">
          Scale<span style="background:linear-gradient(130deg,#8b5cf6,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Flow</span>
        </h1>
        <p style="color:#a89bd4;margin:8px 0 0 0;font-size:13px">Bienvenue dans le club 🎉</p>
      </div>

      <p style="color:#e9e7f5;line-height:1.6">Salut,</p>
      <p style="color:#e9e7f5;line-height:1.6">Ton abonnement <strong>${planLabel}</strong> est activé. Ta clé de licence :</p>

      <div style="background:rgba(139,92,246,0.10);border:1px solid rgba(139,92,246,0.30);border-radius:12px;padding:16px;text-align:center;margin:20px 0">
        <code style="font-family:monospace;font-size:14px;letter-spacing:2px;color:#c4b5fd">${licenseKey}</code>
      </div>

      <p style="color:#a89bd4;font-size:13px;line-height:1.6">
        Plan : <strong style="color:white">${planLabel}</strong><br/>
        Renouvellement : <strong style="color:white">${expiry}</strong>
      </p>

      <div style="text-align:center;margin:28px 0">
        <a href="${appUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(130deg,#7c3aed,#ec4899);color:white;text-decoration:none;border-radius:12px;font-weight:bold">
          Ouvrir l'app →
        </a>
      </div>

      <p style="color:#6b5fa0;font-size:12px;line-height:1.6;margin-top:32px">
        Si tu n'as pas de compte, crée-le avec cet email — ton abonnement sera reconnu automatiquement.<br/>
        Une question ? Réponds à ce mail ou écris sur Telegram (@justquentin).
      </p>
    </div>
  `

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Bienvenue sur ScaleFlow — ton accès ${planLabel} 🚀`,
        html,
      }),
    })
    if (!r.ok) {
      const txt = await r.text()
      console.error('Resend send failed', r.status, txt)
    }
  } catch (e) {
    console.error('Resend send error', e.message)
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const rawBody  = await readRawBody(req)
    const sigHdr   = req.headers['stripe-signature']
    const secret   = process.env.STRIPE_WEBHOOK_SECRET
    const stripeKey = process.env.STRIPE_SECRET_KEY

    if (!verifyStripeSignature(rawBody, sigHdr, secret)) {
      return res.status(400).json({ ok: false, error: 'Bad signature' })
    }

    const event = JSON.parse(rawBody)
    const supabase = getSupabaseAdmin()

    switch (event.type) {

      // ── New checkout completed → provision subscription ──────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription') break

        // Resolve user_id: payment link's client_reference_id, else email lookup
        let userId = session.client_reference_id || null
        if (!userId) {
          userId = await findUserIdByEmail(
            supabase,
            session.customer_details?.email || session.customer_email
          )
        }
        if (!userId) {
          console.error('No user_id resolvable for session', session.id)
          return res.status(200).json({ ok: false, error: 'No user resolvable' })
        }

        // Fetch the subscription to get price + period_end
        const sub = await stripeGET(`/subscriptions/${session.subscription}`, stripeKey)
        const item = sub.items.data[0]
        const priceId = item?.price?.id
        const plan    = PLAN_BY_PRICE[priceId] || 'standard'
        const periodEnd = sub.current_period_end || item?.current_period_end
        const expires = periodEnd ? new Date(periodEnd * 1000).toISOString() : null

        const { error: provErr } = await supabase.rpc('provision_stripe_subscription', {
          p_user_id:         userId,
          p_customer_id:     sub.customer,
          p_subscription_id: sub.id,
          p_plan:            plan,
          p_status:          sub.status,
          p_expires_at:      expires,
        })
        if (provErr) console.error('provision_stripe_subscription error', provErr)

        // Grant the first month's credits immediately
        const { error: credErr } = await supabase.rpc('renew_credits_from_subscription', {
          p_subscription_id: sub.id,
        })
        if (credErr) console.error('renew_credits_from_subscription error', credErr)

        // Send welcome email with the license key (best-effort, doesn't block)
        await sendLicenseEmail({
          to:         session.customer_details?.email || session.customer_email,
          plan,
          licenseKey: `STRIPE-${sub.id}`,
          periodEnd:  expires,
        })
        break
      }

      // ── Renewal payment succeeded → push expires_at forward + grant credits ─
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const subId = invoice.subscription
        if (!subId) break
        // Ignore the very first invoice (already handled by checkout.session.completed)
        if (invoice.billing_reason === 'subscription_create') break

        const sub = await stripeGET(`/subscriptions/${subId}`, stripeKey)
        const periodEnd = sub.current_period_end || sub.items.data[0]?.current_period_end
        const expires = periodEnd ? new Date(periodEnd * 1000).toISOString() : null

        // Just push expires_at + status forward; user_id/plan already set
        await supabase
          .from('license_keys')
          .update({
            expires_at: expires,
            is_active: true,
            stripe_status: sub.status,
          })
          .eq('stripe_subscription_id', subId)

        await supabase.rpc('renew_credits_from_subscription', { p_subscription_id: subId })
        break
      }

      // ── Subscription updated (plan change, pause, past_due, etc) ─────────
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const item = sub.items.data[0]
        const priceId = item?.price?.id
        const plan    = PLAN_BY_PRICE[priceId] || null
        const periodEnd = sub.current_period_end || item?.current_period_end
        const update  = {
          is_active:     (sub.status === 'active' || sub.status === 'trialing'),
          stripe_status: sub.status,
          expires_at:    periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        }
        if (plan) update.plan = plan
        await supabase
          .from('license_keys')
          .update(update)
          .eq('stripe_subscription_id', sub.id)
        break
      }

      // ── Cancellation → deactivate license ────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabase.rpc('cancel_stripe_subscription', { p_subscription_id: sub.id })
        break
      }

      default:
        // Ignore unhandled events (return 200 so Stripe doesn't retry)
        break
    }

    return res.status(200).json({ ok: true, received: event.type })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    console.error('stripe-webhook error', msg)
    return res.status(200).json({ ok: false, error: msg })
  }
}
