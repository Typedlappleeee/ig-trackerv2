import { useState, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { useLicense } from '@/lib/license'

// ── Bibliothèque ──────────────────────────────────────────────────────────────
// Utilisateurs : écran « Bientôt » premium.
// Superadmin   : catalogue exhaustif des capacités GeeLark (endpoints + params).

const BASE_URL = 'https://openapi.geelark.com/open/v1'

type IconFn = (p: { size?: number }) => JSX.Element
const S = (size = 22) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.85, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })
const IconPhone:  IconFn = ({ size }) => (<svg {...S(size)}><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>)
const IconRocket: IconFn = ({ size }) => (<svg {...S(size)}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 8-10c1.5 1.5 3 4 3 6-2 0-4.5 1.5-8 7z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>)
const IconFlame:  IconFn = ({ size }) => (<svg {...S(size)}><path d="M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z"/></svg>)
const IconUpload: IconFn = ({ size }) => (<svg {...S(size)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v13"/></svg>)
const IconTerminal: IconFn = ({ size }) => (<svg {...S(size)}><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/></svg>)
const IconPulse:  IconFn = ({ size }) => (<svg {...S(size)}><path d="M3 12h4l2 6 4-14 2 8h6"/></svg>)
const IconWebhook: IconFn = ({ size }) => (<svg {...S(size)}><path d="M18 16.98h-5.99c-1.66 0-3.01-1.34-3.01-3 0-1.66 1.35-3 3.01-3"/><circle cx="18" cy="17" r="3"/><circle cx="6" cy="7" r="3"/><path d="M6 10v4a2 2 0 0 0 2 2h2"/></svg>)

interface Capability { name: string; desc: string; endpoint: string; method?: string; params: string[] }
interface Category { key: string; title: string; sub: string; Icon: IconFn; accent: string; grad: string; glow: string; items: Capability[] }

const CATALOG: Category[] = [
  {
    key: 'phones', title: 'Téléphones', sub: 'Cycle de vie des cloud phones', Icon: IconPhone,
    accent: '#818CF8', grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.5)',
    items: [
      { name: 'Lister les téléphones', desc: 'Pagine tous les cloud phones et lit leur statut live (running / stopped / booting).', endpoint: '/phone/list', params: ['page', 'pageSize'] },
      { name: 'Démarrer', desc: 'Boot un ou plusieurs téléphones. Renvoie le nombre de succès / échecs.', endpoint: '/phone/start', params: ['ids[]'] },
      { name: 'Éteindre', desc: 'Stoppe les téléphones (libère le proxy et arrête la facturation GeeLark).', endpoint: '/phone/stop', params: ['ids[]'] },
    ],
  },
  {
    key: 'publish', title: 'Publication', sub: 'Publier des Reels & vidéos', Icon: IconRocket,
    accent: '#F472B6', grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.5)',
    items: [
      { name: 'Publier un Reels (Instagram)', desc: 'Tâche RPA native : une vidéo → un Reels, avec légende. Une tâche par téléphone.', endpoint: '/rpa/task/instagramPubReels', params: ['id', 'scheduleAt', 'description', 'video[]', 'shareType?'] },
      { name: 'Publier une vidéo (TikTok)', desc: 'Batch de posting TikTok : tous les comptes en un seul appel.', endpoint: '/task/add · taskType 1', params: ['list[{scheduleAt, envId, video, videoDesc}]'] },
    ],
  },
  {
    key: 'warmup', title: 'Warmup & profil', sub: 'Chauffe & personnalise les comptes', Icon: IconFlame,
    accent: '#FBBF24', grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.45)',
    items: [
      { name: 'Warmup Instagram (IA)', desc: 'Navigation humaine pilotée côté serveur pour chauffer un compte.', endpoint: '/rpa/task/instagramWarmup', params: ['id', 'browseVideo', 'keyword?', 'name'] },
      { name: 'Warmup TikTok (feed)', desc: 'Parcourt le feed ou recherche par mots-clés pour simuler un usage réel.', endpoint: '/task/add · taskType 2', params: ["action: 'browse'|'search'", 'keywords?', 'duration'] },
      { name: 'Likes aléatoires (TikTok)', desc: 'Like aléatoire des vidéos parcourues selon une probabilité.', endpoint: '/rpa/task/tiktokRandomStar', params: ['id', 'likeProbability'] },
      { name: 'Follows aléatoires (TikTok)', desc: 'Suit quelques comptes de façon aléatoire pendant le warmup.', endpoint: '/rpa/task/tiktokRandomFollow', params: ['id', 'followProbability'] },
      { name: 'Commentaires IA (TikTok)', desc: 'Commente les vidéos avec une IA pour un warmup crédible.', endpoint: '/rpa/task/tiktokRandomComment', params: ['id', 'useAi'] },
      { name: 'Éditer le profil (Instagram)', desc: 'Change nom, pseudo, bio, photo et lien du profil de façon native.', endpoint: '/rpa/task/instagramEdit', params: ['nickname?', 'username?', 'biography?', 'profilePicture?', 'linkURL?'] },
      { name: 'Éditer le profil (TikTok)', desc: 'Modifie nom, bio, avatar et site du profil TikTok.', endpoint: '/rpa/task/tiktokEdit', params: ['nickName?', 'bio?', 'avatar?', 'site?'] },
    ],
  },
  {
    key: 'files', title: 'Fichiers & upload', sub: 'Envoi des médias vers GeeLark', Icon: IconUpload,
    accent: '#34D399', grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.42)',
    items: [
      { name: 'URL présignée d\'upload', desc: 'Obtient une URL S3 présignée pour pousser directement la vidéo (token).', endpoint: '/upload/getUrl', params: ['fileType'] },
      { name: 'Enregistrer un média', desc: 'Référence une URL distante dans le Material Center → renvoie un fileId.', endpoint: '/material/temp/upload', params: ['fileUrl', 'fileType', 'fileName'] },
      { name: 'Pousser sur le téléphone', desc: 'Copie un média (fileId) dans le système de fichiers du téléphone.', endpoint: '/phone/file/upload', params: ['id', 'fileId', 'path'] },
      { name: 'Statut du transfert', desc: 'Suit l\'état du push fichier (pending / uploading / success / failed).', endpoint: '/phone/file/uploadStatus', params: ['taskId'] },
    ],
  },
  {
    key: 'shell', title: 'Automatisation ADB', sub: 'Contrôle bas niveau du device', Icon: IconTerminal,
    accent: '#22D3EE', grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(34,211,238,0.42)',
    items: [
      { name: 'Exécuter une commande shell', desc: 'Lance n\'importe quelle commande Android : screenshot, dump UIAutomator, tap / saisie / swipe, presse-papier, force-stop… Tout le flow Story serveur repose dessus.', endpoint: '/shell/execute', params: ['id', 'cmd'] },
    ],
  },
  {
    key: 'tasks', title: 'Tâches & suivi', sub: 'Pilotage des tâches RPA', Icon: IconPulse,
    accent: '#A78BFA', grad: 'linear-gradient(135deg,#8B5CF6,#6366F1)', glow: 'rgba(167,139,250,0.45)',
    items: [
      { name: 'Interroger une tâche', desc: 'Récupère le statut d\'une ou plusieurs tâches (en cours / réussie / échouée).', endpoint: '/task/query', params: ['ids[]'] },
      { name: 'Annuler une tâche RPA', desc: 'Stoppe des tâches RPA en cours (utilisé au bouton Stop).', endpoint: '/rpa/task/cancel', params: ['ids[]'] },
      { name: 'Lister les flows RPA', desc: 'Énumère les templates de flows RPA disponibles côté GeeLark.', endpoint: '/task/rpa/flow/list', params: ['page', 'pageSize'] },
    ],
  },
  {
    key: 'webhook', title: 'Webhooks', sub: 'Callbacks de fin de tâche', Icon: IconWebhook,
    accent: '#94A3B8', grad: 'linear-gradient(135deg,#64748B,#475569)', glow: 'rgba(148,163,184,0.4)',
    items: [
      { name: 'Lire l\'URL de callback', desc: 'Retourne l\'URL webhook actuellement configurée chez GeeLark.', endpoint: '/callback/get', params: [] },
      { name: 'Configurer le webhook', desc: 'Enregistre l\'URL qui reçoit les événements de fin de tâche (idempotent).', endpoint: '/callback/set', params: ['url'] },
    ],
  },
]

const TOTAL_ENDPOINTS = CATALOG.reduce((n, c) => n + c.items.length, 0)

const CSS = `
@property --lib-a { syntax:'<angle>'; inherits:false; initial-value:0deg }
@keyframes lib-spin { to { --lib-a: 360deg } }
@keyframes lib-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(38px,26px)} }
@keyframes lib-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,36px)} }
@keyframes lib-shimmer { 0%{background-position:-160% 0} 100%{background-position:260% 0} }
@keyframes lib-rise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes lib-pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
.libcard { position: relative; transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s, border-color .3s; }
.libcard::before {
  content:''; position:absolute; inset:-1px; border-radius:19px; padding:1.3px;
  background: conic-gradient(from var(--lib-a), transparent 0%, var(--ring) 15%, transparent 34%, transparent 66%, var(--ring) 85%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity .35s ease; animation: lib-spin 6s linear infinite; pointer-events:none; z-index:3;
}
.libcard:hover { transform: translateY(-4px); border-color: transparent; }
.libcard:hover::before { opacity: .9 }
.libchip { transition: background .2s, color .2s, border-color .2s; }
.libchip:hover { background: rgba(255,255,255,0.09) !important; }
`

function CopyEndpoint({ endpoint, accent }: { endpoint: string; accent: string }) {
  const [copied, setCopied] = useState(false)
  const full = endpoint.includes('·') ? endpoint.split('·')[0].trim() : endpoint
  return (
    <button
      className="libchip"
      onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(BASE_URL + full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1100) }).catch(() => {}) }}
      title="Copier l'URL complète"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11.5, fontWeight: 600,
        color: copied ? '#34D399' : accent, background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer',
      }}
    >
      <span style={{ display: 'inline-flex', width: 15, height: 15, borderRadius: 4, background: copied ? '#34D399' : accent, color: '#0A0B0E', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, flexShrink: 0 }}>
        {copied ? '✓' : 'P'}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{endpoint}</span>
    </button>
  )
}

function CapabilityCard({ cap, accent }: { cap: Capability; accent: string }) {
  return (
    <div
      className="libcard"
      style={{
        ['--ring' as any]: accent,
        position: 'relative', overflow: 'hidden', padding: 18, borderRadius: 18,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 8px 26px -18px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: 11, isolation: 'isolate', minHeight: 150,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{cap.name}</h4>
        <span style={{ flexShrink: 0, marginTop: 1, width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 10px ${accent}`, animation: 'lib-pulse 2.4s ease-in-out infinite' }} />
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(233,234,240,0.56)', flex: 1 }}>{cap.desc}</p>
      <CopyEndpoint endpoint={cap.endpoint} accent={accent} />
      {cap.params.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {cap.params.map((p, i) => (
            <span key={i} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, fontWeight: 600, color: 'rgba(233,234,240,0.6)', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '3px 7px' }}>{p}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Écran « Bientôt » pour les utilisateurs non-admin ────────────────────────
const TEASERS = [
  { emoji: '🎓', title: 'Guides & tutoriels', desc: 'Pas à pas pour maîtriser chaque outil.' },
  { emoji: '🧩', title: 'Templates de tâches', desc: 'Séquences prêtes à l\'emploi à importer.' },
  { emoji: '🎨', title: 'Presets de contenu', desc: 'Légendes, hooks et styles réutilisables.' },
  { emoji: '⚙️', title: 'Recettes d\'automatisation', desc: 'Des workflows complets, clés en main.' },
]

function ComingSoon() {
  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', paddingTop: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 18, fontSize: 11, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#818CF8' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#818CF8', animation: 'lib-pulse 2s ease-in-out infinite' }} />
          Bientôt disponible
        </div>
        <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(34px, 5.6vw, 58px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.0, background: 'linear-gradient(100deg,#fff 15%,#a5b4fc 50%,#c4b5fd 85%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'lib-shimmer 7s linear infinite' }}>
          La Bibliothèque arrive
        </h1>
        <p style={{ margin: '0 auto', maxWidth: 520, fontSize: 15.5, color: 'rgba(233,234,240,0.58)', lineHeight: 1.65 }}>
          Guides, templates, presets et recettes d'automatisation — tout ce qu'il te faut pour aller plus vite, réuni au même endroit.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {TEASERS.map((tsr, i) => (
          <div key={i} style={{
            position: 'relative', overflow: 'hidden', padding: 22, borderRadius: 18, minHeight: 150,
            background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
            border: '1px solid rgba(255,255,255,0.08)', animation: `lib-rise .5s ease both ${i * 0.08}s`,
            display: 'flex', flexDirection: 'column', gap: 9,
          }}>
            <div style={{ fontSize: 30, filter: 'grayscale(0.15)' }}>{tsr.emoji}</div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>{tsr.title}</h4>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(233,234,240,0.5)' }}>{tsr.desc}</p>
            <span style={{ position: 'absolute', top: 14, right: 14, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.4)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
              Bientôt
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 34, textAlign: 'center', fontSize: 13, color: 'rgba(233,234,240,0.4)' }}>
        On y travaille — reviens vite. 🚀
      </div>
    </div>
  )
}

// ── Catalogue GeeLark (superadmin) ───────────────────────────────────────────
function GeelarkCatalog() {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATALOG
    return CATALOG
      .map(cat => ({ ...cat, items: cat.items.filter(it => (it.name + it.desc + it.endpoint + it.params.join(' ')).toLowerCase().includes(q)) }))
      .filter(cat => cat.items.length > 0)
  }, [query])

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ marginBottom: 30 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 16, fontSize: 11, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Bibliothèque · Superadmin
        </div>
        <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.0, background: 'linear-gradient(100deg,#fff 12%,#a5b4fc 46%,#6ee7b7 82%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'lib-shimmer 7s linear infinite' }}>
          Tout ce que GeeLark peut faire
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: 'rgba(233,234,240,0.55)', maxWidth: 640, lineHeight: 1.65 }}>
          Le catalogue complet des capacités branchées dans ScaleFlow — endpoints, paramètres, tout. Clique un endpoint pour copier son URL.
        </p>

        <div style={{ display: 'flex', gap: 26, marginTop: 22, flexWrap: 'wrap', alignItems: 'baseline' }}>
          {[[String(TOTAL_ENDPOINTS), 'capacités'], [String(CATALOG.length), 'catégories'], ['REST', 'API GeeLark']].map(([v, l], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>{v}</span>
              <span style={{ fontSize: 11.5, color: 'rgba(233,234,240,0.42)' }}>{l}</span>
            </div>
          ))}
          <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'rgba(233,234,240,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '4px 9px' }}>{BASE_URL}</code>
        </div>

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher une capacité, un endpoint, un paramètre…"
          style={{
            marginTop: 22, width: '100%', maxWidth: 460, boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: '11px 15px', fontSize: 13.5, color: '#fff', outline: 'none',
          }}
        />
      </div>

      {filtered.map(cat => (
        <section key={cat.key} style={{ marginBottom: 34 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: cat.grad, boxShadow: `0 10px 24px -8px ${cat.glow}, inset 0 1px 0 0 rgba(255,255,255,0.3)`, flexShrink: 0 }}><cat.Icon size={21} /></div>
            <div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{cat.title}</h2>
              <span style={{ fontSize: 12.5, color: 'rgba(233,234,240,0.45)' }}>{cat.sub}</span>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: cat.accent, background: 'rgba(255,255,255,0.05)', border: `1px solid ${cat.accent}33`, borderRadius: 99, padding: '3px 10px' }}>{cat.items.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {cat.items.map((cap, i) => <CapabilityCard key={i} cap={cap} accent={cat.accent} />)}
          </div>
        </section>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(233,234,240,0.4)', fontSize: 14 }}>Aucune capacité ne correspond à « {query} ».</div>
      )}
    </div>
  )
}

export function Library({ user: _user }: { user: User }) {
  const isSuperAdmin = useLicense()?.isSuperAdmin === true
  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      <style>{CSS}</style>
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -140, left: '10%', width: 540, height: 540, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)', filter: 'blur(46px)', animation: 'lib-float-a 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 40, right: '4%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.1), transparent 70%)', filter: 'blur(46px)', animation: 'lib-float-b 24s ease-in-out infinite' }} />
      </div>
      {isSuperAdmin ? <GeelarkCatalog /> : <ComingSoon />}
    </div>
  )
}
