// Admin — Galerie de templates d'automatisation RPA (mockup visuel façon
// GeeLark store). Réservé au super-admin. Les templates ne sont PAS encore
// fonctionnels : les menus s'ouvrent mais leurs actions sont des placeholders.
// (L'ancien gestionnaire de cloud phones vit dans l'historique git.)
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { useLicense } from '@/lib/license'
import { useTr } from '@/lib/i18n'

interface Props { user: User }

type Platform = 'instagram' | 'multi'

interface Template {
  id: string
  title: string
  desc: string
  author: string
  platform: Platform
}

// Le template mis en avant en haut de page.
const RECOMMENDED: Template = {
  id: '500000000000000016',
  title: 'Post Reels video on Instagram',
  desc: 'Publish short Reels videos with one click on Instagram to improve operational efficiency',
  author: 'By Ted',
  platform: 'instagram',
}

// Catalogue complet — métadonnées calquées sur le store GeeLark.
const TEMPLATES: Template[] = [
  { id: '6231190517779904823', title: 'Post Carousel photo on Instagram', desc: 'Post Instagram photo carousels with just a few clicks and streamline your workflow.', author: 'By Carlos', platform: 'instagram' },
  { id: '567852161145246224', title: 'Send comment on Latest Instagram Post', desc: 'Search for usernames and send comment on Latest Instagram Post', author: 'By sird****@gmail.com', platform: 'instagram' },
  { id: '622396849117986917', title: 'Switch to Professional Instagram Account (Content Creator)', desc: 'Automatically converts your personal account to a professional account in content creator mode.', author: 'By Carlos', platform: 'instagram' },
  { id: '500000000000000043', title: 'Edit Instagram profile', desc: 'Bulk edit profile details: avatars, usernames, handles, bios, and URLs.', author: 'By Ted', platform: 'instagram' },
  { id: '500000000000000020', title: 'Instagram AI account warmup', desc: 'Simulate how real users browse and like to increase engagement and get more followers.', author: 'By Ted', platform: 'instagram' },
  { id: '500000000000000049', title: 'Instagram account privacy settings', desc: 'Switch Instagram accounts between public and private for easier privacy management', author: 'By Mandarin', platform: 'instagram' },
  { id: '500000000000000034', title: 'Instagram auto login', desc: 'Quickly log in to your Instagram account for more efficient account management and content posting', author: 'By Mandarin', platform: 'instagram' },
  { id: '500000000000000053', title: 'Instagram bulk follow', desc: 'Search for usernames to follow multiple accounts in bulk.', author: 'By Mandarin', platform: 'instagram' },
  { id: '500000000000000031', title: 'Instagram publish Reels gallery', desc: 'One-click publish Reels gallery via Instagram to improve operational efficiency', author: 'By Ted', platform: 'instagram' },
  { id: '500000000000000016', title: 'Post Reels video on Instagram', desc: 'Publish short Reels videos with one click on Instagram to improve operational efficiency', author: 'By Ted', platform: 'instagram' },
  { id: '500000000000000022', title: 'Send private messages on Instagram', desc: 'Search for usernames and send private messages in bulk.', author: 'By Ted', platform: 'instagram' },
  { id: '500000000000000017', title: 'Post videos on TikTok/Instagram Reels/YouTube Shorts', desc: 'Post videos on TikTok, Instagram Reels and YouTube Shorts at the same time for maximum engagement.', author: 'By Ted', platform: 'multi' },
  { id: '603260376578003125', title: 'Instagram AutoLogin 2FA', desc: 'Simula o processo de login de um usuário real, realizando a autenticação automaticamente e validando o acesso por meio de 2FA', author: 'By Carlos tec', platform: 'instagram' },
  { id: '617907879776622023', title: 'Instagram Engagement', desc: 'Automatic collection of the last 7 days: views, interactions, and followers. Use the API to collect data via logs. Requires a professional Instagram account.', author: 'By Carlos', platform: 'instagram' },
  { id: '6271538163152323368', title: 'Instagram Login 2FA 2.0', desc: 'Simulate the login process of a real user, performing authentication automatically and validating access through 2FA.', author: 'By Carlos', platform: 'instagram' },
]

// Badge d'icône de plateforme (dégradé Instagram / multi-plateforme).
function AppIcon({ platform }: { platform: Platform }) {
  const bg = platform === 'instagram'
    ? 'linear-gradient(135deg, #833AB4 0%, #E1306C 55%, #F77737 100%)'
    : 'linear-gradient(135deg, #25F4EE 0%, #0d0d0d 50%, #FE2C55 100%)'
  return (
    <div aria-hidden="true" style={{
      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 22, boxShadow: '0 4px 14px -6px rgba(0,0,0,0.6)',
    }}>
      {platform === 'instagram' ? '📸' : '🎵'}
    </div>
  )
}

export function CloudPhones({ user }: Props) {
  const tr = useTr()
  const license = useLicense()
  const isSuperAdmin = license.isSuperAdmin

  // Un seul popover ⋮ ouvert à la fois. La clé est l'index de la carte pour
  // gérer les ids de templates dupliqués (ex : 500000000000000016).
  const [openMenu, setOpenMenu] = useState<number | null>(null)

  void user // conservé pour la signature d'export attendue par le routing

  if (!isSuperAdmin) {
    return (
      <div className="sf-page anim-page">
        <div className="sf-card" style={{ padding: '48px 24px', textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>
            {tr('Accès refusé', 'Access denied')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-4)' }}>
            {tr('Cette section est réservée au super-admin.', 'This section is restricted to the super-admin.')}
          </div>
        </div>
      </div>
    )
  }

  // Action placeholder — les templates seront câblés plus tard.
  const placeholder = (kind: 'regular' | 'recurring', t: Template) => {
    setOpenMenu(null)
    // eslint-disable-next-line no-console
    console.log(`[template] ${kind} task requested for`, t.id, t.title)
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
    padding: 16, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative',
    minHeight: 138,
  }
  const menuItemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
    fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', background: 'transparent',
    border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div
      className="sf-page anim-page"
      onClick={() => openMenu !== null && setOpenMenu(null)}
    >
      <div className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad">{tr('Templates d\'automatisation', 'Automation templates')}</h1>
            <p className="sf-page-sub">{tr('Catalogue des flux RPA à exécuter sur tes cloud phones', 'Catalog of RPA flows to run on your cloud phones')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-8 pb-10">
        {/* ─── Recommandé ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 12px' }}>
          <span style={{ fontSize: 16 }} aria-hidden="true">☆</span>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '.01em' }}>
            {tr('Recommandé', 'Recommended')}
          </h2>
        </div>

        <div
          style={{
            ...cardStyle,
            borderColor: 'var(--accent)',
            background: 'linear-gradient(135deg, rgba(129,140,248,0.10), var(--card))',
            flexDirection: 'row', alignItems: 'flex-start', gap: 16, minHeight: 0,
          }}
        >
          <AppIcon platform={RECOMMENDED.platform} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>{RECOMMENDED.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 8 }}>{RECOMMENDED.desc}</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
              {RECOMMENDED.author} · {tr('Template id', 'Template id')}: {RECOMMENDED.id}
            </div>
          </div>
          <Button size="sm" onClick={() => placeholder('regular', RECOMMENDED)}>
            {tr('Utiliser', 'Use')}
          </Button>
        </div>

        {/* ─── Tous les templates ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '28px 0 12px' }}>
          <span style={{ fontSize: 15 }} aria-hidden="true">▤</span>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '.01em' }}>
            {tr('Tous les templates', 'All templates')}
          </h2>
          <span style={{ fontSize: 11.5, color: 'var(--text-4)', fontWeight: 600 }}>· {TEMPLATES.length}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {TEMPLATES.map((t, i) => (
            <div key={i} style={cardStyle} className="sf-anim-slide-up">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <AppIcon platform={t.platform} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.3 }}>{t.title}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, flex: 1 }}>{t.desc}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                <div style={{ fontSize: 10.5, color: 'var(--text-4)', minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.author}</div>
                  <div style={{ fontFamily: 'monospace' }}>{tr('Template id', 'Template id')}: {t.id}</div>
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setOpenMenu(openMenu === i ? null : i)}
                    className="sf-btn sf-btn-ghost"
                    style={{ height: 28, width: 28, padding: 0, fontWeight: 800, fontSize: 15 }}
                    aria-label={tr('Actions', 'Actions')}
                  >⋮</button>
                  {openMenu === i && (
                    <div style={{
                      position: 'absolute', right: 0, bottom: '110%', zIndex: 20,
                      background: '#12131d', border: '1px solid var(--border)', borderRadius: 10,
                      boxShadow: '0 16px 40px -14px rgba(0,0,0,0.8)', padding: 6, minWidth: 200,
                    }}>
                      <button style={menuItemStyle} onClick={() => placeholder('regular', t)}>
                        {tr('Créer une tâche', 'Create regular task')}
                      </button>
                      <button style={menuItemStyle} onClick={() => placeholder('recurring', t)}>
                        {tr('Créer une tâche récurrente', 'Create recurring task')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CloudPhones
