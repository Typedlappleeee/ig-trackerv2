import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import Automation from './Automation'

// Catalogue des automatisations disponibles (capacités de l'agent). Les deux
// recommandées sont mises en avant. Porté de _autoFlows()/_flows() du prototype.
interface Flow {
  k: string; t: string; d: string; p: string; tone: string; reco?: boolean; beta?: boolean; ok: boolean; i: string
}
const FLOWS: Flow[] = [
  { k: 'reels', t: 'Publier un Reel', d: "Ouvre l'app, sélectionne la vidéo, écrit la légende et publie.", p: 'Instagram', tone: '6,182,212', reco: true, ok: true, i: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
  { k: 'story', t: 'Story + sticker lien', d: "Caméra story, choix de l'image, pose le sticker lien propre à chaque compte.", p: 'Instagram', tone: '139,92,246', reco: true, ok: true, i: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1' },
  { k: 'tiktok', t: 'Publier sur TikTok', d: 'Import galerie, description, hashtags et publication native.', p: 'TikTok', tone: '6,182,212', ok: true, i: 'M9 18V5l12-2v13|M9 9l12-2|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { k: 'warm', t: 'Warmup feed', d: 'Scroll naturel, likes et vues espacés sur la durée de la session.', p: 'Instagram', tone: '245,158,11', ok: true, i: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z' },
  { k: 'profile', t: 'Éditer le profil', d: 'Nom, bio, lien et photo de profil mis à jour automatiquement.', p: 'Instagram', tone: '167,139,250', ok: true, i: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z' },
  { k: 'follow', t: 'Suivre des comptes', d: 'Suit une liste ciblée à rythme humain, avec pauses aléatoires.', p: 'Instagram', tone: '16,185,129', ok: true, i: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6' },
  { k: 'comment', t: 'Commenter en masse', d: 'Dépose des commentaires générés par IA sur des posts ciblés.', p: 'Instagram', tone: '139,92,246', ok: true, i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { k: 'dm', t: 'Message privé', d: 'Envoie un DM personnalisé aux nouveaux abonnés.', p: 'Instagram', tone: '99,102,241', ok: true, i: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M22 6l-10 7L2 6' },
  { k: 'threads', t: 'Publier sur Threads', d: 'Vidéo ou photo publiée via l’automation native.', p: 'Threads', tone: '113,113,122', beta: true, ok: false, i: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M8 12h8' },
  { k: 'boost', t: 'Chauffe accélérée', d: 'Séquence intensive pour comptes neufs : vues, likes, follows.', p: 'Instagram', tone: '245,158,11', beta: true, ok: false, i: 'M13 2 3 14h9l-1 8 10-12h-9z' },
]

const LS_FAVS = 'sf-flow-favs'
function readFavs(): string[] {
  try { const v = JSON.parse(localStorage.getItem(LS_FAVS) ?? ''); return Array.isArray(v) ? v : ['reels'] } catch { return ['reels'] }
}

type Tab = 'catalog' | 'sched'
type Filt = 'all' | 'reco' | 'fav'

export default function Flows({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const [tab, setTab] = useState<Tab>('catalog')
  const [favs, setFavs] = useState<string[]>(readFavs)
  const [filt, setFilt] = useState<Filt>('all')
  const [q, setQ] = useState('')

  const toggleFav = (k: string) => setFavs(f => {
    const next = f.includes(k) ? f.filter(x => x !== k) : [...f, k]
    try { localStorage.setItem(LS_FAVS, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const ql = q.trim().toLowerCase()
  const shown = useMemo(() => FLOWS.filter(f =>
    (filt === 'all' || (filt === 'reco' && f.reco) || (filt === 'fav' && favs.includes(f.k)))
    && (!ql || f.t.toLowerCase().includes(ql) || f.d.toLowerCase().includes(ql) || f.p.toLowerCase().includes(ql))
  ), [filt, favs, ql])

  const segStyle = (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
    background: on ? `rgba(${theme.tone},0.16)` : 'transparent', color: on ? theme.accentText : '#71717A', fontSize: 12, fontWeight: 700, transition: 'all .14s ease',
  })

  const Star = ({ k }: { k: string }) => {
    const on = favs.includes(k)
    return (
      <span onClick={e => { e.stopPropagation(); toggleFav(k) }} title={on ? 'Retirer des favoris' : 'Ajouter aux favoris'} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
        background: on ? 'rgba(245,158,11,0.13)' : 'transparent', color: on ? '#FBBF24' : '#3F3F46', transition: 'all .16s ease',
      }}>
        <svg viewBox="0 0 24 24" width={13} height={13} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      </span>
    )
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Automatisation"
        sub={tab === 'catalog'
          ? 'Le catalogue de ce que l’agent sait faire sur tes appareils. Les deux recommandées sont mises en avant.'
          : 'Ce qui tourne tout seul — exécuté côté serveur, ton PC peut être éteint.'}
        actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label={tab === 'catalog' ? 'Créer un flux' : 'Programmer'} />}
      />

      {/* Onglets Catalogue / Planifié */}
      <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        {([['catalog', 'Catalogue', FLOWS.length], ['sched', 'Planifié', 0]] as [Tab, string, number][]).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} style={segStyle(tab === k)}>
            {l}{k === 'catalog' && <span style={{ opacity: 0.55, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{n}</span>}
          </button>
        ))}
      </div>

      {tab === 'sched' ? (
        // Réutilise l'écran d'automatisation réel (posts programmés + tâches récurrentes).
        <Automation theme={theme} infra={infra} user={user} org={org} embedded />
      ) : (
        <>
          {/* Filtres + recherche */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {([['all', 'Tout'], ['reco', 'Recommandés'], ['fav', 'Favoris']] as [Filt, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setFilt(k)} style={{ ...segStyle(filt === k), height: 26, fontSize: 11.5 }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 11px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, background: 'rgba(255,255,255,0.02)', minWidth: 200 }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#52525B" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.35-4.35" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une automatisation…" style={{ flex: 1, border: 'none', background: 'transparent', color: '#E4E4E7', fontSize: 12, outline: 'none' }} />
            </div>
          </div>

          {/* Grille du catalogue */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
            {shown.map(f => (
              <Panel key={f.k} theme={theme} style={{ opacity: f.ok ? 1 : 0.62 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '15px 15px 0' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: `rgba(${f.tone},0.12)`, border: `1px solid rgba(${f.tone},0.26)`, color: `rgb(${f.tone})` }}>
                    <Icon d={f.i} size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F6' }}>{f.t}</span>
                      {f.reco && <Chip text="Recommandé" tone="violet" />}
                      {f.beta && <Chip text="Bientôt" tone="mute" />}
                    </span>
                    <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#71717A' }}>{f.d}</span>
                  </span>
                  <Star k={f.k} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 15px' }}>
                  <Chip text={f.p} tone="mute" />
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <Btn theme={theme} sm tone="quiet" icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" label="Programmer" disabled={!f.ok} />
                    <Btn theme={theme} sm tone="primary" icon="M5 3l14 9-14 9z" label="Lancer" disabled={!f.ok} />
                  </span>
                </div>
              </Panel>
            ))}
            {shown.length === 0 && (
              <div style={{ gridColumn: '1/-1', padding: '40px 15px', textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucune automatisation ne correspond.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
