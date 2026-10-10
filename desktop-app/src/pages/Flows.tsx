import { useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Empty, Icon, PageHead, Segmented } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import Automation from './Automation'
import CreateTaskModal from '@/components/CreateTaskModal'

interface Flow { k: string; t: string; d: string; p: string; n: number; reco?: boolean; beta?: boolean; ok: boolean; i: string }
const FLOWS: Flow[] = [
  { k: 'reels', t: 'Publier un Reel', d: "Ouvre l'app, sélectionne la vidéo, écrit la légende et publie.", p: 'Instagram', n: 12, reco: true, ok: true, i: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z' },
  { k: 'story', t: 'Story + sticker lien', d: "Caméra story, choix de l'image, pose le sticker lien propre à chaque compte.", p: 'Instagram', n: 18, reco: true, ok: true, i: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1' },
  { k: 'tiktok', t: 'Publier sur TikTok', d: 'Import galerie, description, hashtags et publication native.', p: 'TikTok', n: 10, ok: true, i: 'M9 18V5l12-2v13|M9 9l12-2|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { k: 'warm', t: 'Warmup feed', d: 'Scroll naturel, likes et vues espacés sur la durée de la session.', p: 'Instagram', n: 8, ok: true, i: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z' },
  { k: 'profile', t: 'Éditer le profil', d: 'Nom, bio, lien et photo de profil mis à jour automatiquement.', p: 'Instagram', n: 14, ok: true, i: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z' },
  { k: 'follow', t: 'Suivre des comptes', d: 'Suit une liste ciblée à rythme humain, avec pauses aléatoires.', p: 'Instagram', n: 9, beta: true, ok: false, i: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6' },
  { k: 'comment', t: 'Commenter en masse', d: 'Dépose des commentaires générés par IA sur des posts ciblés.', p: 'Instagram', n: 11, beta: true, ok: false, i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { k: 'dm', t: 'Message privé', d: 'Envoie un DM personnalisé aux nouveaux abonnés.', p: 'Instagram', n: 7, beta: true, ok: false, i: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M22 6l-10 7L2 6' },
  { k: 'threads', t: 'Publier sur Threads', d: 'Vidéo ou photo publiée via l’automation native.', p: 'Threads', n: 9, beta: true, ok: false, i: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M8 12h8' },
  { k: 'boost', t: 'Chauffe accélérée', d: 'Séquence intensive pour comptes neufs : vues, likes, follows.', p: 'Instagram', n: 15, beta: true, ok: false, i: 'M13 2 3 14h9l-1 8 10-12h-9z' },
]

// Flux → page réelle qui l'exécute. Les flux absents d'ici n'ont pas (encore)
// d'implémentation → marqués ok:false (« Bientôt »), pas de faux lancement.
const FLOW_PAGE: Record<string, string> = {
  reels: 'publish', story: 'publish', tiktok: 'publish', warm: 'warmup', profile: 'warmup',
}

const LS_FAVS = 'sf-flow-favs'
function readFavs(): string[] { try { const v = JSON.parse(localStorage.getItem(LS_FAVS) ?? ''); return Array.isArray(v) ? v : ['reels'] } catch { return ['reels'] } }
const PLATFORMS = ['Tous', 'Instagram', 'TikTok', 'Threads']
type Tab = 'catalog' | 'sched'

export default function Flows({ theme, infra, user, org, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onNavigate?: (p: string) => void
}) {
  const [tab, setTab] = useState<Tab>('catalog')
  const [favs, setFavs] = useState<string[]>(readFavs)
  const [plat, setPlat] = useState('Tous')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  // « Lancer » un flux → on ouvre la vraie page qui l'exécute (pas de wizard bidon).
  // Seuls les flux ayant une page réelle sont actionnables (les autres = « Bientôt »).
  function openFlow(f: Flow, mode: 'now' | 'sched' | null = null) {
    if (!f.ok) return
    if (mode === 'sched') { setCreateOpen(true); return }   // programmer → vrai modal de tâche
    const page = FLOW_PAGE[f.k]
    if (page) onNavigate?.(page)
    else setCreateOpen(true)
  }

  const toggleFav = (k: string) => setFavs(f => {
    const next = f.includes(k) ? f.filter(x => x !== k) : [...f, k]
    try { localStorage.setItem(LS_FAVS, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  const ql = q.trim().toLowerCase()
  const match = (f: Flow) => (plat === 'Tous' || f.p === plat) && (!ql || f.t.toLowerCase().includes(ql) || f.d.toLowerCase().includes(ql))

  const reco = FLOWS.filter(f => f.reco)
  const rest = FLOWS.filter(f => !f.reco).filter(match)
  const favList = rest.filter(f => favs.includes(f.k))
  const others = rest.filter(f => !favs.includes(f.k))

  const Star = ({ k, big }: { k: string; big?: boolean }) => {
    const on = favs.includes(k)
    return (
      <button onClick={e => { e.stopPropagation(); toggleFav(k) }} title={on ? 'Retirer des favoris' : 'Ajouter aux favoris'} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: big ? 26 : 22, height: big ? 26 : 22, borderRadius: 6, cursor: 'pointer', flexShrink: 0, border: 'none',
        background: 'transparent', color: on ? '#FBBF24' : '#5A5A63',
      }}>
        <svg viewBox="0 0 24 24" width={big ? 14 : 13} height={big ? 14 : 13} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
      </button>
    )
  }
  const IconBtn = ({ d, title, onClick, disabled }: { d: string; title: string; onClick?: (e: any) => void; disabled?: boolean }) => (
    <button onClick={onClick} title={title} disabled={disabled} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', border: '1px solid rgba(255,255,255,0.09)', background: '#161618', color: '#A1A1AA', opacity: disabled ? 0.4 : 1 }}><Icon d={d} size={13} /></button>
  )

  // Carte de flux, deux tailles (fidèle au ZIP : big = ligne, small = colonne).
  const card = (f: Flow, big?: boolean): ReactNode => (
    <div key={f.k} onClick={() => openFlow(f)} style={{
      position: 'relative', display: 'flex', flexDirection: big ? 'row' : 'column', alignItems: big ? 'center' : 'stretch', gap: big ? 14 : 12,
      padding: 16, borderRadius: 8, cursor: f.ok ? 'pointer' : 'default',
      background: theme.panelBg, flexWrap: big ? 'wrap' : undefined,
      border: '1px solid ' + theme.panelEdge,
      transition: 'background .12s ease, border-color .12s ease', boxSizing: 'border-box',
    }}
      onMouseEnter={e => { if (!f.ok) return; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.background = '#161618' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = theme.panelEdge; e.currentTarget.style.background = theme.panelBg }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: big ? 32 : 28, height: big ? 32 : 28, borderRadius: 6, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText }}><Icon d={f.i} size={big ? 15 : 14} /></span>
      <span style={{ flex: 1, minWidth: big ? 200 : 0, display: 'flex', flexDirection: 'column', gap: big ? 4 : 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>{f.t}</span>
          {f.beta && <Chip text="Beta" tone="warn" />}
        </span>
        <span style={{ fontSize: 12, lineHeight: 1.55, color: '#8B8B94' }}>{f.d}</span>
        {!big && <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11.5, fontWeight: 500, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{f.p}<span style={{ opacity: 0.4 }}>·</span>{f.n} étapes</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        {big && <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginRight: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#A1A1AA' }}>{f.p}</span>
          <span style={{ fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{f.n} étapes</span>
        </span>}
        <Star k={f.k} big={big} />
        <IconBtn d="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" title="Programmer" onClick={(e) => { e.stopPropagation(); openFlow(f, 'sched') }} disabled={!f.ok} />
        {big
          ? <Btn theme={theme} sm tone="primary" icon="M5 3l14 9-14 9z" label="Lancer" disabled={!f.ok} onClick={() => openFlow(f, 'now')} />
          : <IconBtn d="M5 3l14 9-14 9z" title="Lancer" onClick={(e) => { e.stopPropagation(); openFlow(f, 'now') }} disabled={!f.ok} />}
      </span>
    </div>
  )

  const section = (label: string, items: Flow[], hint?: string): ReactNode => items.length === 0 ? null : (
    <div key={label} style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {label === 'Recommandés' && <span style={{ color: '#FBBF24', display: 'flex', alignSelf: 'center' }}><Icon d="M13 2 3 14h9l-1 8 10-12h-9z" size={12} /></span>}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: '#71717A' }}>{hint}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{items.length}</span>
      </div>
      {label === 'Recommandés'
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{items.map(f => card(f, true))}</div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>{items.map(f => card(f))}</div>}
    </div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Automatisation" sub="Flux exécutés par ton agent, en natif. Marque tes favoris, lance à la demande ou programme-les."
        actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Créer un flux" onClick={() => setCreateOpen(true)} />} />

      <div style={{ marginBottom: 16 }}>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ v: 'catalog', l: 'Catalogue', n: FLOWS.length }, { v: 'sched', l: 'Planifié' }]} />
      </div>

      {tab === 'sched' ? (
        <Automation theme={theme} infra={infra} user={user} org={org} embedded />
      ) : (
        <>
          {section('Recommandés', reco, 'les deux flux que 90 % des agences utilisent')}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, background: '#161618', minWidth: 220, maxWidth: '100%', boxSizing: 'border-box' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.35-4.35" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un flux…" style={{ flex: 1, border: 'none', background: 'transparent', color: '#EDEDEF', fontSize: 13, outline: 'none' }} />
            </div>
            <Segmented value={plat} onChange={setPlat} options={PLATFORMS.map(pl => ({ v: pl, l: pl }))} />
          </div>

          {section('Favoris', favList)}
          {section('Tous les flux', others)}
          {favList.length === 0 && others.length === 0 && <Empty icon="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M20 20l-4.35-4.35" title="Aucun flux ne correspond." text={null} />}
        </>
      )}

      {createOpen && (
        <CreateTaskModal theme={theme} user={user} org={org} infra={infra} mode="recurring"
          onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setTab('sched') }} />
      )}
    </div>
  )
}
