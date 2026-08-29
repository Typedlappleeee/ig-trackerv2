// « Mode Metricool » — callback OAuth Meta (Instagram Graph API).
//
// Flux : l'app desktop ouvre le dialog Facebook Login → l'utilisateur accepte →
// Meta redirige ICI avec ?code&state. On échange le code contre un token longue
// durée, on liste les Pages + comptes IG Business autorisés, et on stocke chaque
// connexion dans `meta_connections` (service role). Puis on renvoie une page de
// confirmation. L'app desktop détecte la nouvelle connexion en relisant la table.
//
// DORMANT tant que les variables d'env Vercel ne sont pas posées :
//   META_APP_ID, META_APP_SECRET, META_REDIRECT_URI (= l'URL de CE fichier),
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// `state` est le user_id (+ éventuellement :org_id) passé par l'app desktop.

module.exports.config = { maxDuration: 15 }

const { createClient } = require('@supabase/supabase-js')

const GRAPH = 'https://graph.facebook.com/v21.0'

function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis')
  return createClient(url, key, { auth: { persistSession: false } })
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0B0B0F;color:#E4E4E7;display:grid;place-items:center;height:100vh">
  <div style="text-align:center;max-width:420px;padding:24px">
  <div style="font-size:40px">${title.startsWith('Connecté') ? '✅' : '⚠️'}</div>
  <h1 style="font-size:20px;margin:16px 0 8px">${title}</h1>
  <p style="color:#A1A1AA;font-size:14px;line-height:1.6">${body}</p>
  <p style="color:#52525B;font-size:12px;margin-top:20px">Tu peux fermer cet onglet et revenir dans ScaleFlow.</p>
  </div></body>`
}

module.exports = async (req, res) => {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const redirectUri = process.env.META_REDIRECT_URI
  const { code, state, error, error_description } = req.query || {}

  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (error) return res.status(200).send(page('Autorisation refusée', String(error_description || error)))
  if (!appId || !appSecret || !redirectUri) {
    return res.status(200).send(page('Connexion pas encore configurée',
      'L\'App Meta n\'est pas branchée (variables d\'env manquantes côté serveur). Reviens quand META_APP_ID / META_APP_SECRET / META_REDIRECT_URI seront posées sur Vercel.'))
  }
  if (!code || !state) return res.status(200).send(page('Lien invalide', 'Paramètres OAuth manquants.'))

  // state = "<user_id>" ou "<user_id>:<org_id>"
  const [userId, orgId] = String(state).split(':')
  if (!userId) return res.status(200).send(page('Lien invalide', 'Identifiant utilisateur manquant.'))

  try {
    // 1) code → token courte durée
    const shortRes = await fetch(`${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(code)}`)
    const short = await shortRes.json()
    if (!short.access_token) throw new Error(short.error?.message || 'échange du code échoué')

    // 2) token courte → token longue durée (~60 j)
    const longRes = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(short.access_token)}`)
    const long = await longRes.json()
    const userToken = long.access_token || short.access_token

    // 3) Pages du user + compte IG Business relié à chaque Page (+ token de Page)
    const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,` +
      `instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`)
    const pages = await pagesRes.json()
    const list = Array.isArray(pages.data) ? pages.data : []

    const db = admin()
    let connected = 0
    for (const p of list) {
      const iga = p.instagram_business_account
      if (!iga?.id) continue
      await db.from('meta_connections').upsert({
        user_id: userId,
        org_id: orgId || null,
        ig_user_id: String(iga.id),
        ig_username: iga.username || null,
        page_id: String(p.id),
        page_access_token: p.access_token, // token de Page = longue durée pour les insights
        token_expires_at: null,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id,ig_user_id' })
      connected++
    }

    if (connected === 0) {
      return res.status(200).send(page('Aucun compte Instagram trouvé',
        'Aucune Page Facebook reliée à un compte Instagram Business n\'a été autorisée. Vérifie que le compte est en mode Business/Créateur et relié à une Page.'))
    }
    return res.status(200).send(page(`Connecté (${connected} compte${connected > 1 ? 's' : ''})`,
      'Tes comptes Instagram sont reliés. Leurs stats officielles vont remonter dans Performances.'))
  } catch (e) {
    return res.status(200).send(page('Échec de la connexion', String(e?.message || e)))
  }
}
