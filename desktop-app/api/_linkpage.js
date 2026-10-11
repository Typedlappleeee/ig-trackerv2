// Rendu HTML d'une page de liens (façon GetMySocial / Linktree), partagé par :
//   • api/l.js (page publique servie aux visiteurs)
//   • src/pages/Links.tsx (aperçu en direct dans l'éditeur, via un iframe srcDoc)
// → l'aperçu est EXACTEMENT la page publique. Aucune dépendance, HTML + CSS seuls.

export const GRADIENTS = {
  lavender: 'linear-gradient(135deg,#E9E3FF 0%,#F6DDF2 45%,#EBD9FB 100%)',
  peach: 'linear-gradient(135deg,#FFE5D9 0%,#FFD6E8 50%,#FFE9C7 100%)',
  sunset: 'linear-gradient(160deg,#FF7EB3 0%,#FF758C 40%,#FFB38A 100%)',
  ocean: 'linear-gradient(160deg,#4FACFE 0%,#00F2FE 100%)',
  mint: 'linear-gradient(160deg,#D4FC79 0%,#96E6A1 100%)',
  midnight: 'linear-gradient(160deg,#0F0C29 0%,#302B63 55%,#24243E 100%)',
  noir: 'linear-gradient(160deg,#0A0A0B 0%,#1C1C22 100%)',
  rose: 'linear-gradient(160deg,#1F0F17 0%,#3A1428 100%)',
}
export const FONTS = {
  poppins: ["'Poppins',sans-serif", 'Poppins:wght@500;600;700;800'],
  inter: ["'Inter',sans-serif", 'Inter:wght@400;500;600;700'],
  serif: ["'Playfair Display',serif", 'Playfair+Display:wght@500;600;700'],
  rounded: ["'Nunito',sans-serif", 'Nunito:wght@600;700;800'],
}
const ICONS = {
  mym: '<span class="ic ic-t">MYM</span>',
  of: '<span class="ic ic-t" style="background:#00AFF0;color:#fff">OF</span>',
  telegram: '<span class="ic" style="background:#229ED9"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M9.8 15.3l-.4 5.6c.6 0 .8-.2 1.1-.5l2.6-2.5 5.5 4c1 .6 1.7.3 2-.9l3.6-17c.4-1.5-.5-2.1-1.5-1.7L1.5 9.6c-1.4.6-1.4 1.4-.2 1.8l5.4 1.7L19 5.3c.6-.4 1.1-.2.7.2"/></svg></span>',
  instagram: '<span class="ic" style="background:linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff"/></svg></span>',
  tiktok: '<span class="ic" style="background:#000"><svg viewBox="0 0 24 24" width="17" height="17" fill="#fff"><path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.3v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a6 6 0 1 0 5.1 5.9V9.1a7.5 7.5 0 0 0 4.4 1.4V7.2a4.3 4.3 0 0 1-3.3-1.4z"/></svg></span>',
  heart: '<span class="ic" style="background:#FF3B6B"><svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M12 21s-7.5-4.6-9.5-9.2C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.8 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg></span>',
}
export const EFFECTS = ['none', 'aurora', 'hearts', 'stars', 'particles', 'glow']

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : null
const safeImg = u => /^(https?:|data:image\/)/i.test(String(u || '')) ? String(u) : null
// Pseudo-aléatoire stable (mêmes positions d'effets à chaque rendu).
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }

/** Design par défaut (et conversion des anciens « thèmes » simples). */
export function normalizeDesign(page) {
  const d = (page && page.design && typeof page.design === 'object') ? page.design : {}
  const legacy = { dark: 'noir', light: 'lavender', violet: 'midnight', rose: 'rose' }[page?.theme] || 'lavender'
  const darkBg = ['midnight', 'noir', 'rose'].includes(d.bg?.preset || legacy)
  return {
    bg: { type: d.bg?.type || 'gradient', preset: d.bg?.preset || legacy, color: d.bg?.color || '#F3E8FF', image: d.bg?.image || '', blur: Number(d.bg?.blur ?? 0), dim: Number(d.bg?.dim ?? 0) },
    effect: EFFECTS.includes(d.effect) ? d.effect : 'aurora',
    font: FONTS[d.font] ? d.font : 'poppins',
    text: safeColor(d.text) || (darkBg ? '#FFFFFF' : '#FFFFFF'),
    shadowText: d.shadowText !== false,
    verified: d.verified !== false,
    online: d.online !== false,
    ring: safeColor(d.ring) || '#C4B5FD',
    btn: { bg: safeColor(d.btn?.bg) || '#000000', fg: safeColor(d.btn?.fg) || '#FFFFFF', radius: Math.max(0, Math.min(40, Number(d.btn?.radius ?? 22))), shadow: d.btn?.shadow !== false },
  }
}

/**
 * HTML complet de la page. `buttons` = [{ label, href, style: 'pill'|'card', image?, icon?, bg?, fg? }].
 * `preview` : désactive les liens (aperçu dans l'éditeur).
 */
export function renderLinkPage({ title, bio, avatar, buttons, design, preview = false }) {
  const D = design
  const [fontCss, fontQ] = FONTS[D.font]
  const bgImg = D.bg.type === 'image' && safeImg(D.bg.image)
  const bgCss = D.bg.type === 'color' ? (safeColor(D.bg.color) || '#F3E8FF') : D.bg.type === 'image' && bgImg ? '#111' : (GRADIENTS[D.bg.preset] || GRADIENTS.lavender)
  const r = rng(title.length * 7919 + 13)
  let fx = ''
  if (D.effect === 'aurora') fx = `<div class="fx aur"><i style="background:#C4B5FD;top:-10%;left:-10%"></i><i style="background:#F9A8D4;top:30%;right:-15%;animation-delay:-6s"></i><i style="background:#A5B4FC;bottom:-15%;left:20%;animation-delay:-12s"></i></div>`
  if (D.effect === 'hearts') fx = `<div class="fx">${Array.from({ length: 16 }, () => `<b class="hrt" style="left:${(r() * 100).toFixed(1)}%;font-size:${(12 + r() * 18).toFixed(0)}px;animation-duration:${(9 + r() * 10).toFixed(1)}s;animation-delay:-${(r() * 18).toFixed(1)}s">♥</b>`).join('')}</div>`
  if (D.effect === 'stars') fx = `<div class="fx">${Array.from({ length: 60 }, () => `<b class="str" style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 100).toFixed(1)}%;width:${(1 + r() * 2.5).toFixed(1)}px;height:${(1 + r() * 2.5).toFixed(1)}px;animation-delay:-${(r() * 4).toFixed(1)}s"></b>`).join('')}</div>`
  if (D.effect === 'particles') fx = `<div class="fx">${Array.from({ length: 28 }, () => `<b class="prt" style="left:${(r() * 100).toFixed(1)}%;width:${(4 + r() * 8).toFixed(0)}px;height:${(4 + r() * 8).toFixed(0)}px;animation-duration:${(12 + r() * 14).toFixed(1)}s;animation-delay:-${(r() * 24).toFixed(1)}s"></b>`).join('')}</div>`
  const glow = D.effect === 'glow' ? '<span class="glw"></span>' : ''
  const ts = D.shadowText ? 'text-shadow:0 1px 8px rgba(0,0,0,.28);' : ''
  const btns = buttons.map((b, i) => {
    const bg = safeColor(b.bg) || D.btn.bg, fg = safeColor(b.fg) || D.btn.fg
    const href = preview ? '#' : esc(b.href)
    if (b.style === 'card' && safeImg(b.image)) {
      return `<a class="card" href="${href}" rel="nofollow" style="border-radius:${D.btn.radius}px"><img src="${esc(b.image)}" alt=""><span class="cg"></span><span class="ct">${esc(b.label)}</span><span class="cl"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></svg></span></a>`
    }
    const ic = ICONS[b.icon] || ''
    return `<a class="pill${i === 0 ? ' first' : ''}" href="${href}" rel="nofollow" style="background:${bg};color:${fg};border-radius:${D.btn.radius}px">${ic}<span class="pt">${esc(b.label)}</span>${ic ? '<span class="ic-sp"></span>' : ''}</a>`
  }).join('')
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title || 'Liens')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=${fontQ}&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}html,body{min-height:100%}
body{font-family:${fontCss};color:${D.text};background:${bgCss};min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.bgi{position:fixed;inset:-30px;background:url("${bgImg ? esc(bgImg) : ''}") center/cover;filter:blur(${D.bg.blur}px);z-index:0}
.dim{position:fixed;inset:0;background:rgba(0,0,0,${Math.max(0, Math.min(0.8, D.bg.dim / 100))});z-index:0}
.fx{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.aur i{position:absolute;width:60vmax;height:60vmax;border-radius:50%;filter:blur(70px);opacity:.55;animation:aur 18s ease-in-out infinite alternate}
@keyframes aur{0%{transform:translate(0,0) scale(1)}50%{transform:translate(8vw,-6vh) scale(1.15)}100%{transform:translate(-6vw,8vh) scale(.95)}}
.hrt{position:absolute;bottom:-40px;color:rgba(255,80,140,.55);animation:up linear infinite}
@keyframes up{0%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:1}100%{transform:translateY(-115vh) rotate(25deg);opacity:0}}
.str{position:absolute;border-radius:50%;background:#fff;animation:tw 3.5s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.15}50%{opacity:1}}
.prt{position:absolute;bottom:-20px;border-radius:50%;background:rgba(255,255,255,.55);animation:up linear infinite}
main{position:relative;z-index:1;width:100%;max-width:500px;margin:0 auto;padding:28px 18px 48px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.av{position:relative;width:118px;height:118px;border-radius:50%;padding:4px;background:${D.ring};box-shadow:0 10px 30px -10px rgba(0,0,0,.35)}
.av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;background:#ddd}
.av .on{position:absolute;right:6px;bottom:8px;width:20px;height:20px;border-radius:50%;background:#22C55E;border:3px solid #fff}
.glw{position:absolute;inset:-18px;border-radius:50%;background:${D.ring};filter:blur(24px);opacity:.6;z-index:-1;animation:tw 3s ease-in-out infinite}
h1{display:flex;align-items:center;gap:8px;font-size:26px;font-weight:700;letter-spacing:-.01em;margin-top:6px;${ts}}
.vf{width:22px;height:22px;flex-shrink:0}
.bio{font-size:15px;font-weight:500;opacity:.95;white-space:pre-line;${ts}}
.list{width:100%;display:flex;flex-direction:column;gap:12px;margin-top:14px}
a{-webkit-tap-highlight-color:transparent;text-decoration:none}
.card{position:relative;display:block;width:100%;aspect-ratio:3/1;overflow:hidden;box-shadow:${D.btn.shadow ? '0 18px 40px -16px rgba(0,0,0,.45)' : 'none'};transition:transform .15s}
.card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.card .cg{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0) 55%)}
.card .ct{position:absolute;left:0;right:0;bottom:16px;font-size:18px;font-weight:800;color:#fff;letter-spacing:.01em;text-transform:uppercase;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.card .cl{position:absolute;top:12px;right:14px;display:flex}
.pill{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:64px;padding:10px 14px;font-size:16px;font-weight:700;letter-spacing:.01em;text-transform:uppercase;box-shadow:${D.btn.shadow ? '0 14px 30px -14px rgba(0,0,0,.45)' : 'none'};transition:transform .15s}
.pill .pt{flex:1;text-align:center}.ic-sp{width:44px;flex-shrink:0}
.ic{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;flex-shrink:0;background:#0f1a24}
.ic-t{font-size:10px;font-weight:800;color:#fff;letter-spacing:.02em}
.card:active,.pill:active{transform:scale(.98)}@media (hover:hover){.card:hover,.pill:hover{transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.fx *{animation:none!important}}
</style></head><body>
${bgImg ? `<div class="bgi"></div>` : ''}${D.bg.dim > 0 ? '<div class="dim"></div>' : ''}${fx}
<main>
<div class="av">${glow}${safeImg(avatar) ? `<img src="${esc(avatar)}" alt="">` : '<img alt="">'}${D.online ? '<span class="on"></span>' : ''}</div>
<h1>${esc(title)}${D.verified ? '<svg class="vf" viewBox="0 0 24 24"><path fill="#1D9BF0" d="M12 1.5l2.6 1.9 3.2-.2 1 3 2.7 1.8-.9 3.1.9 3.1-2.7 1.8-1 3-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3L2.5 16l.9-3.1L2.5 9.8 5.2 8l1-3 3.2.2z"/><path d="M8 12.2l2.6 2.6L16.2 9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</h1>
${bio ? `<p class="bio">${esc(bio)}</p>` : ''}
<div class="list">${btns}</div>
</main></body></html>`
}
