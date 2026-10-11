// Liens suivis (façon GetMySocial) — /l/<code>[?b=<bouton>]
//   • <code> = lien d'un compte (tracked_links.code) ou page de liens (link_pages.slug)
//   • enregistre le clic (pays, appareil, robot d'aperçu ?) puis redirige / affiche la page
//   • depuis le navigateur intégré d'Instagram / TikTok : tente d'ouvrir le vrai navigateur
// Env Vercel : SUPABASE_URL (ou VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js'

const BOT = /facebookexternalhit|facebot|instagram.*(preview|link)|twitterbot|slackbot|whatsapp|telegrambot|discordbot|linkedinbot|bot\b|crawler|spider|preview/i
const IN_APP = /Instagram|FBAN|FBAV|BytedanceWebview|musical_ly|TikTok/i

function db() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('config')
  return createClient(url, key, { auth: { persistSession: false } })
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : null

// Thèmes des pages publiques : [fond, texte, texte secondaire, bouton, bouton (texte), bouton principal, bouton principal (texte), bordure]
const THEMES = {
  dark: ['#0A0A0B', '#EDEDEF', '#A1A1AA', '#161618', '#EDEDEF', '#EDEDEF', '#0A0A0B', 'rgba(255,255,255,.1)'],
  light: ['#FAFAFA', '#0A0A0B', '#52525B', '#FFFFFF', '#0A0A0B', '#0A0A0B', '#FFFFFF', 'rgba(0,0,0,.1)'],
  violet: ['#140F24', '#F4F1FF', '#B9B0DA', '#211936', '#F4F1FF', '#8B7CF6', '#FFFFFF', 'rgba(255,255,255,.12)'],
  rose: ['#1F0F17', '#FFF1F6', '#E3AFC4', '#2E1622', '#FFF1F6', '#F472B6', '#1F0F17', 'rgba(255,255,255,.12)'],
}
function page(res, status, body, extraHead = '', theme = 'dark') {
  const [bg, fg, mut, btn, btnFg, pri, priFg, bd] = THEMES[theme] || THEMES.dark
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex')
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${extraHead}
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:${bg};color:${fg};font-family:-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif;display:flex;justify-content:center}
.w{width:100%;max-width:440px;padding:48px 20px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.av{width:96px;height:96px;border-radius:99px;object-fit:cover;border:1px solid ${bd};background:${btn}}
h1{margin:6px 0 0;font-size:22px;font-weight:600;letter-spacing:-.02em}p{margin:0;color:${mut};font-size:14.5px;line-height:1.55;white-space:pre-line}
a.b{display:block;width:100%;padding:15px 18px;border-radius:12px;background:${btn};border:1px solid ${bd};color:${btnFg};text-decoration:none;font-weight:600;font-size:15px;transition:transform .12s,background .12s}
a.b:active{transform:scale(.98)}a.b:hover{filter:brightness(1.08)}a.p{background:${pri};color:${priFg};border-color:${pri}}
.hint{font-size:12.5px;color:${mut};margin-top:6px}</style></head><body><div class="w">${body}</div></body></html>`)
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x')
    const code = String(url.searchParams.get('p') || '').toLowerCase().replace(/^\/+|\/+$/g, '').split('/')[0]
    const btn = url.searchParams.get('b')
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(code)) return page(res, 404, '<h1>Lien introuvable</h1>')
    const ua = String(req.headers['user-agent'] || '')
    const bot = BOT.test(ua)
    const device = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop'
    const country = String(req.headers['x-vercel-ip-country'] || '') || null
    const s = db()

    // Lien d'un compte, sinon page de liens.
    const { data: link } = await s.from('tracked_links').select('id,page_id,destination').eq('code', code).maybeSingle()
    let pg = null
    const pageId = link?.page_id ?? null
    if (link && !link.destination && pageId) ({ data: pg } = await s.from('link_pages').select('*').eq('id', pageId).maybeSingle())
    if (!link) ({ data: pg } = await s.from('link_pages').select('*').eq('slug', code).maybeSingle())
    if (!link && !pg) return page(res, 404, '<h1>Lien introuvable</h1>')
    if (pg && !pg.active) return page(res, 404, '<h1>Page indisponible</h1>')

    const buttons = Array.isArray(pg?.buttons) ? pg.buttons : []
    const b = btn !== null && /^\d+$/.test(btn) ? Number(btn) : null
    const target = link?.destination ? safeUrl(link.destination) : b !== null ? safeUrl(buttons[b]?.url) : null

    // Navigateur intégré d'Instagram / TikTok → on tente le vrai navigateur (une seule fois).
    if (!bot && IN_APP.test(ua) && url.searchParams.get('x') !== '1') {
      const self = `https://${req.headers.host}/l/${code}${b !== null ? `?b=${b}&x=1` : '?x=1'}`
      if (device === 'android') {
        const intent = `intent://${req.headers.host}/l/${code}?x=1${b !== null ? `&b=${b}` : ''}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(self)};end`
        return page(res, 200, `<p>Ouverture…</p><a class="b p" href="${esc(intent)}">Continuer</a>`, `<meta http-equiv="refresh" content="0;url=${esc(intent)}">`)
      }
      if (device === 'ios' && (target || buttons.length)) {
        return page(res, 200, `<h1>Ouvre dans Safari</h1><p>Pour continuer, ouvre ce lien dans ton navigateur.</p>
<a class="b p" href="x-safari-${esc(self)}">Ouvrir dans Safari</a><a class="b" href="${esc(self)}">Continuer ici</a>
<div class="hint">Ou touche « ••• » en haut à droite → « Ouvrir dans le navigateur ».</div>`)
      }
    }

    // Clic enregistré (sans bloquer la redirection en cas d'erreur).
    await s.from('link_clicks').insert({ link_id: link?.id ?? null, page_id: pg?.id ?? pageId, button: b, country, device, bot }).then(() => {}, () => {})

    if (target) { res.statusCode = 302; res.setHeader('Location', target); res.setHeader('Cache-Control', 'no-store'); return res.end() }
    if (!pg) return page(res, 404, '<h1>Lien introuvable</h1>')
    const q = url.searchParams.get('x') === '1' ? '&x=1' : ''
    const body = `${pg.avatar_url ? `<img class="av" src="${esc(pg.avatar_url)}" alt="">` : ''}
<h1>${esc(pg.title)}</h1>${pg.bio ? `<p>${esc(pg.bio)}</p>` : ''}
<div style="width:100%;display:flex;flex-direction:column;gap:10px;margin-top:10px">
${buttons.map((x, i) => safeUrl(x?.url) ? `<a class="b${i === 0 ? ' p' : ''}" href="/l/${esc(code)}?b=${i}${q}" rel="nofollow">${esc(x.label || 'Lien')}</a>` : '').join('')}
</div>`
    return page(res, 200, body, `<title>${esc(pg.title || 'Liens')}</title>`, pg.theme)
  } catch (e) {
    return page(res, 500, '<h1>Indisponible</h1><p>Réessaie dans un instant.</p>')
  }
}
