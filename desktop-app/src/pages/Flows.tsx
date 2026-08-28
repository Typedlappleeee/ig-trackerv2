import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import Automation from './Automation'

// Catalogue des automatisations (fidèle à _autoFlows()/_flows() du ZIP).
interface Flow { k: string; t: string; d: string; p: string; n: number; tone: string; reco?: boolean; beta?: boolean; ok: boolean; i: string }
const FLOWS: Flow[] = [
  { k: 'reels', t: 'Publier un Reel', d: "Ouvre l'app, sélectionne la vidéo, écrit la légende et publie.", p: 'Instagram', n: 12, tone: '6,182,212', reco: true, ok: true, i: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
  { k: 'story', t: 'Story + sticker lien', d: "Caméra story, choix de l'image, pose le sticker lien propre à chaque compte.", p: 'Instagram', n: 18, tone: '139,92,246', reco: true, ok: true, i: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1' },
  { k: 'tiktok', t: 'Publier sur TikTok', d: 'Import galerie, description, hashtags et publication native.', p: 'TikTok', n: 10, tone: '6,182,212', ok: true, i: 'M9 18V5l12-2v13|M9 9l12-2|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { k: 'warm', t: 'Warmup feed', d: 'Scroll naturel, likes et vues espacés sur la durée de la session.', p: 'Instagram', n: 8, tone: '245,158,11', ok: true, i: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z' },
  { k: 'profile', t: 'Éditer le profil', d: 'Nom, bio, lien et photo de profil mis à jour automatiquement.', p: 'Instagram', n: 14, tone: '167,139,250', ok: true, i: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z' },
  { k: 'follow', t: 'Suivre des comptes', d: 'Suit une liste ciblée à rythme humain, avec pauses aléatoires.', p: 'Instagram', n: 9, tone: '16,185,129', ok: true, i: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6' },
  { k: 'comment', t: 'Commenter en masse', d: 'Dépose des commentaires générés par IA sur des posts ciblés.', p: 'Instagram', n: 11, tone: '139,92,246', ok: true, i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { k: 'dm', t: 'Message privé', d: 'Envoie un DM personnalisé aux nouveaux abonnés.', p: 'Instagram', n: 7, tone: '99,102,241', ok: true, i: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M22 6l-10 7L2 6' },
  { k: 'threads', t: 'Publier sur Threads', d: 'Vidéo ou photo publiée via l’automation native.', p: 'Threads', n: 9, tone: '113,113,122', beta: true, ok: false, i: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M8 12h8' },
  { k: 'boost', t: 'Chauffe accélérée', d: 'Séquence intensive pour comptes neufs : vues, likes, follows.', p: 'Instagram', n: 15, tone: '245,158,11', beta: true, ok: false, i: 'M13 2 3 14h9l-1 8 10-12h-9z' },
]

const LS_FAVS = 'sf-flow-favs'
function readFavs(): string[] {
  try { const v = JSON.parse(localStorage.getItem(LS_FAVS) ?? ''); return Array.isArray(v) ? v : ['reels'] } catch { return ['reels'] }
}
const PLATFORMS = ['Tous', 'Instagram', 'TikTok', 'Threads']
type Tab = 'catalog' | 'sched'

export default function Flows({ theme, infra, user, org, onLaunch }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onLaunch?: (k: string) => void
}) {
  const [tab, setTab] = useState<Tab>('catalog')
  const [favs, setFavs] = useState<string[]>(readFavs)
  const [plat, setPlat] = useState('Tous')
  const [q, setQ] = useState('')

  const toggleFav = (k: string) => setFavs(f => {
    const next = f.includes(k) ? f.filter(x => x !== k) : [...f, k]
    try { localStorage.setItem(LS_FAVS, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const reco = FLOWS.filter(f => f.reco)
  const ql = q.trim().toLowerCase()
  const grid = useMemo(() => FLOWS.filter(f => !f.reco
    && (plat === 'Tous' || f.p === plat)
    && (!ql || f.t.toLowerCase().includes(ql) || f.d.toLowerCase().includes(ql))
  ), [plat, ql])

  const seg = (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
    background: on ? `rgba(${theme.tone},0.16)` : 'transparent', color: on ? theme.accentText : '#71717A', fontSize: 12, fontWeight: 700, transition: 'all .14s ease',
  })

  const Star = ({ k, big }: { k: string; big?: boolean }) => {
    const on = favs.includes(k)
    return (
      <button onClick={e => { e.stopPropagation(); toggleFav(k) }} title={on ? 'Retirer des favoris' : 'Ajouter aux favoris'} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: big ? 26 : 24, height: big ? 26 : 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0, border: 'none',
        background: on ? 'rgba(245,158,11,0.13)' : 'transparent', color: on ? '#FBBF24' : '#3F3F46', transition: 'all .16s ease',
      }}>
        <svg viewBox="0 0 24 24" width={big ? 14 : 13} height={big ? 14 : 13} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      </button>
    )
  }
  const IconBtn = ({ d, title, on, onClick }: { d: string; title: string; on?: boolean; onClick?: () => void }) => (
    <button onClick={onClick} title={title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', color: '#71717A' }}
      onMouseEnter={e => { e.currentTarget.style.color = '#E4E4E7'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
      onMouseLeave={e => { e.currentTarget.style.color = '#71717A'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
      <Icon d={d} size={13} />
    </button>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Automatisation"
        sub="Flux exécutés par ton agent, en natif. Marque tes favoris, lance à la demande ou programme-les."
        actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Créer un flux" />} />

      {/* Onglets Catalogue / Planifié */}
      <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        {([['catalog', 'Catalogue', FLOWS.length], ['sched', 'Planifié', 3]] as [Tab, string, number][]).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} style={seg(tab === k)}>{l}<span style={{ opacity: 0.55, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{n}</span></button>
        ))}
      </div>

      {tab === 'sched' ? (
        <Automation theme={theme} infra={infra} user={user} org={org} embedded />
      ) : (
        <>
          {/* Recommandés */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
            <span style={{ color: '#FBBF24', display: 'flex' }}><Icon d="M13 2 3 14h9l-1 8 10-12h-9z" size={14} /></span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FBBF24' }}>Recommandés</span>
            <span style={{ fontSize: 11.5, color: '#52525B' }}>les deux flux que 90 % des agences utilisent</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {reco.map(f => (
              <Panel key={f.k} theme={theme} style={{ border: `1px solid rgba(${f.tone},0.28)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `rgba(${f.tone},0.12)`, border: `1px solid rgba(${f.tone},0.26)`, color: `rgb(${f.tone})` }}><Icon d={f.i} size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F6' }}>{f.t}</span>
                    <span style={{ fontSize: 12, lineHeight: 1.5, color: '#71717A' }}>{f.d}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0, marginRight: 4 }}>
                    <span style={{ fontSize: 11.5, color: '#A1A1AA' }}>{f.p}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#52525B' }}>{f.n} étapes</span>
                  </span>
                  <Star k={f.k} big />
                  <IconBtn d="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" title="Programmer" />
                  <Btn theme={theme} sm tone="primary" icon="M5 3l14 9-14 9z" label="Lancer" onClick={() => onLaunch?.(f.k)} />
                </div>
              </Panel>
            ))}
          </div>

          {/* Recherche + filtres plateforme */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 11px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, background: 'rgba(255,255,255,0.02)', minWidth: 220 }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#52525B" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.35-4.35" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un flux…" style={{ flex: 1, border: 'none', background: 'transparent', color: '#E4E4E7', fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {PLATFORMS.map(pl => <button key={pl} onClick={() => setPlat(pl)} style={{ ...seg(plat === pl), height: 26, fontSize: 11.5 }}>{pl}</button>)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3F3F46' }}>Tous les flux</span>
            <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3F3F46' }}>{grid.length}</span>
          </div>

          {/* Grille */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
            {grid.map(f => (
              <Panel key={f.k} theme={theme} style={{ opacity: f.ok ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '15px 15px 0' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: `rgba(${f.tone},0.12)`, border: `1px solid rgba(${f.tone},0.26)`, color: `rgb(${f.tone})` }}><Icon d={f.i} size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F6' }}>{f.t}</span>
                      {f.beta && <Chip text="Bientôt" tone="mute" />}
                    </span>
                    <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#71717A' }}>{f.d}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 15px' }}>
                  <span style={{ fontSize: 11, color: '#A1A1AA' }}>{f.p}</span>
                  <span style={{ color: '#3F3F46' }}>·</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#52525B' }}>{f.n} étapes</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    <Star k={f.k} />
                    <IconBtn d="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" title="Programmer" />
                    <IconBtn d="M5 3l14 9-14 9z" title="Lancer" onClick={() => f.ok && onLaunch?.(f.k)} />
                  </span>
                </div>
              </Panel>
            ))}
            {grid.length === 0 && <div style={{ gridColumn: '1/-1', padding: '40px 15px', textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun flux ne correspond.</div>}
          </div>
        </>
      )}
    </div>
  )
}
