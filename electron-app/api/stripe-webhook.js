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
        const priceId = sub.items.data[0]?.price?.id
        const plan    = PLAN_BY_PRICE[priceId] || 'standard'
        const expires = new Date(sub.current_period_end * 1000).toISOString()

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
        const expires = new Date(sub.current_period_end * 1000).toISOString()

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
        const priceId = sub.items.data[0]?.price?.id
        const plan    = PLAN_BY_PRICE[priceId] || null
        const update  = {
          is_active:     (sub.status === 'active' || sub.status === 'trialing'),
          stripe_status: sub.status,
          expires_at:    new Date(sub.current_period_end * 1000).toISOString(),
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
