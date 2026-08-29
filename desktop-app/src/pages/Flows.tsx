import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, PageHead, Modal, StatusDot } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { scopeInfra } from '@/lib/data'
import Automation from './Automation'
import CreateTaskModal from '@/components/CreateTaskModal'

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
function readFavs(): string[] { try { const v = JSON.parse(localStorage.getItem(LS_FAVS) ?? ''); return Array.isArray(v) ? v : ['reels'] } catch { return ['reels'] } }
const PLATFORMS = ['Tous', 'Instagram', 'TikTok', 'Threads']
type Tab = 'catalog' | 'sched'

export default function Flows({ theme, infra, user, org, onLaunch }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onLaunch?: (k: string) => void
}) {
  const [tab, setTab] = useState<Tab>('catalog')
  const [favs, setFavs] = useState<string[]>(readFavs)
  const [plat, setPlat] = useState('Tous')
  const [q, setQ] = useState('')
  const [flowOpen, setFlowOpen] = useState<Flow | null>(null)
  const [flowMode, setFlowMode] = useState<'now' | 'sched' | null>(null)
  const [cloudPhones, setCloudPhones] = useState<{ id: string; phone_name: string; ig_username: string | null; status: string }[]>([])
  const [flowSel, setFlowSel] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

  // Appareils ScaleFlow Cloud (auto-hébergés) — pour le wizard de flux.
  useEffect(() => {
    if (!flowOpen) return
    const { currentOrg } = org
    let q2 = supabase.from('phones').select('id,phone_name,ig_username,status')
    q2 = currentOrg ? q2.eq('org_id', currentOrg.id) : q2.eq('user_id', user.id).is('org_id', null)
    q2 = scopeInfra(q2, 'cloud')
    q2.order('phone_name').then(({ data }) => setCloudPhones((data ?? []) as any[]))
  }, [flowOpen, org.currentOrg?.id, user.id])

  function openFlow(f: Flow, mode: 'now' | 'sched' | null = null) {
    if (!f.ok) return
    setFlowOpen(f); setFlowMode(mode); setFlowSel(new Set())
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

  const seg = (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
    background: on ? `rgba(${theme.tone},0.16)` : 'transparent', color: on ? theme.accentText : '#71717A', fontSize: 12, fontWeight: 700,
  })

  const Star = ({ k, big }: { k: string; big?: boolean }) => {
    const on = favs.includes(k)
    return (
      <button onClick={e => { e.stopPropagation(); toggleFav(k) }} title={on ? 'Retirer des favoris' : 'Ajouter aux favoris'} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: big ? 26 : 22, height: big ? 26 : 22, borderRadius: 6, cursor: 'pointer', flexShrink: 0, border: 'none',
        background: on ? 'rgba(245,158,11,0.13)' : 'transparent', color: on ? '#FBBF24' : '#3F3F46',
      }}>
        <svg viewBox="0 0 24 24" width={big ? 14 : 13} height={big ? 14 : 13} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
      </button>
    )
  }
  const IconBtn = ({ d, title, onClick, disabled }: { d: string; title: string; onClick?: (e: any) => void; disabled?: boolean }) => (
    <button onClick={onClick} title={title} disabled={disabled} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', color: '#71717A', opacity: disabled ? 0.4 : 1 }}><Icon d={d} size={13} /></button>
  )

  // Carte de flux, deux tailles (fidèle au ZIP : big = ligne, small = colonne).
  const card = (f: Flow, big?: boolean): ReactNode => (
    <div key={f.k} onClick={() => openFlow(f)} style={{
      position: 'relative', display: 'flex', flexDirection: big ? 'row' : 'column', alignItems: big ? 'center' : 'stretch', gap: big ? 15 : 11,
      padding: big ? 17 : 15, borderRadius: 10, cursor: f.ok ? 'pointer' : 'default',
      background: big ? `linear-gradient(120deg, rgba(${f.tone},0.09), ${theme.cloud ? 'rgba(14,22,27,0.9)' : 'rgba(16,16,21,0.9)'})` : theme.panelBg,
      border: '1px solid ' + (big ? `rgba(${f.tone},0.3)` : f.ok ? theme.panelEdge : 'rgba(245,158,11,0.18)'),
      transition: 'all .16s ease', boxSizing: 'border-box',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(${f.tone},0.5)`; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = big ? `rgba(${f.tone},0.3)` : f.ok ? theme.panelEdge : 'rgba(245,158,11,0.18)'; e.currentTarget.style.transform = 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: big ? 40 : 30, height: big ? 40 : 30, borderRadius: big ? 11 : 8, flexShrink: 0, background: `rgba(${f.tone},0.14)`, border: `1px solid rgba(${f.tone},0.26)`, color: `rgb(${f.tone})` }}><Icon d={f.i} size={big ? 18 : 15} /></span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: big ? 4 : 7 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: big ? 14.5 : 13, fontWeight: 700, color: '#F4F4F6' }}>{f.t}</span>
          {f.beta && <Chip text="Beta" tone="warn" />}
        </span>
        <span style={{ fontSize: big ? 12 : 11.5, lineHeight: 1.55, color: '#71717A' }}>{f.d}</span>
        {!big && <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 10.5, fontWeight: 700, color: '#52525B' }}>{f.p}<span style={{ opacity: 0.4 }}>·</span>{f.n} étapes</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        {big && <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginRight: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA' }}>{f.p}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3F3F46' }}>{f.n} étapes</span>
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
    <div key={label} style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        {label === 'Recommandés' && <span style={{ color: '#FBBF24', display: 'flex', alignSelf: 'center' }}><Icon d="M13 2 3 14h9l-1 8 10-12h-9z" size={13} /></span>}
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: label === 'Recommandés' ? '#FBBF24' : '#52525B' }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: '#3F3F46' }}>{hint}</span>}
        <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#3F3F46' }}>{items.length}</span>
      </div>
      {label === 'Recommandés'
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{items.map(f => card(f, true))}</div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(272px,1fr))', gap: 10 }}>{items.map(f => card(f))}</div>}
    </div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Automatisation" sub="Flux exécutés par ton agent, en natif. Marque tes favoris, lance à la demande ou programme-les."
        actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Créer un flux" onClick={() => setCreateOpen(true)} />} />

      <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        {([['catalog', 'Catalogue', FLOWS.length], ['sched', 'Planifié', 3]] as [Tab, string, number][]).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} style={seg(tab === k)}>{l}<span style={{ opacity: 0.55, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{n}</span></button>
        ))}
      </div>

      {tab === 'sched' ? (
        <Automation theme={theme} infra={infra} user={user} org={org} embedded />
      ) : (
        <>
          {section('Recommandés', reco, 'les deux flux que 90 % des agences utilisent')}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 11px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, background: 'rgba(255,255,255,0.02)', minWidth: 220 }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#52525B" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.35-4.35" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un flux…" style={{ flex: 1, border: 'none', background: 'transparent', color: '#E4E4E7', fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {PLATFORMS.map(pl => <button key={pl} onClick={() => setPlat(pl)} style={{ ...seg(plat === pl), height: 26, fontSize: 11.5 }}>{pl}</button>)}
            </div>
          </div>

          {section('Favoris', favList)}
          {section('Tous les flux', others)}
          {favList.length === 0 && others.length === 0 && <div style={{ padding: '40px 15px', textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun flux ne correspond.</div>}
        </>
      )}

      {/* Fenêtre de lancement d'un flux (fidèle au ZIP : choix du mode → appareils) */}
      {flowOpen && (
        <Modal theme={theme} title={flowOpen.t} sub={flowOpen.d} icon={flowOpen.i} onClose={() => { setFlowOpen(null); setFlowMode(null) }} width={540}
          footer={flowMode ? <>
            <Btn theme={theme} tone="quiet" label="Retour" onClick={() => setFlowMode(null)} />
            <Btn theme={theme} tone="primary" disabled={flowSel.size === 0} icon={flowMode === 'now' ? 'M5 3l14 9-14 9z' : 'M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z'}
              label={flowMode === 'now' ? `Lancer sur ${flowSel.size}` : 'Programmer'} onClick={() => { setFlowOpen(null); setFlowMode(null) }} />
          </> : undefined}>
          {/* Récap plateforme / étapes / coût */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '12px 14px', borderRadius: 9, marginBottom: 12, background: 'rgba(255,255,255,0.018)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {([['Plateforme', flowOpen.p], ['Étapes', String(flowOpen.n)], ['Coût', '2 cr / appareil']] as [string, string][]).map(([l, v]) => (
              <span key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#52525B' }}>{l}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#E4E4E7' }}>{v}</span>
              </span>
            ))}
          </div>

          {!flowMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {([['now', 'M5 3l14 9-14 9z', 'Lancer maintenant', 'Choisis les appareils, puis exécute tout de suite.'], ['sched', 'M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z', 'Programmer', 'Une fois, ou tous les jours à heure fixe.']] as [any, string, string, string][]).map(([k, ic, t, h]) => (
                <button key={k} onClick={() => setFlowMode(k)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 11, cursor: 'pointer', textAlign: 'left', width: '100%', background: 'rgba(255,255,255,0.018)', border: '1px solid rgba(255,255,255,0.07)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = theme.selEdge }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `rgba(${theme.tone},0.13)`, border: `1px solid rgba(${theme.tone},0.26)`, color: theme.accentText }}><Icon d={ic} size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#F4F4F6' }}>{t}</span>
                    <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#71717A' }}>{h}</span>
                  </span>
                  <span style={{ display: 'flex', color: '#3F3F46' }}><Icon d="M9 18l6-6-6-6" size={15} /></span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#A1A1AA', marginBottom: 8 }}>Appareils ScaleFlow Cloud</div>
              {cloudPhones.length === 0 ? (
                <div style={{ padding: '24px 15px', textAlign: 'center', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#E4E4E7' }}>Aucun appareil ScaleFlow Cloud</div>
                  <div style={{ fontSize: 11.5, color: '#71717A', marginTop: 5, lineHeight: 1.6 }}>ScaleFlow Cloud tourne sur tes propres serveurs auto-hébergés — branche-les pour lancer ce flux ici. (Pour publier sur GeeLark, bascule d'infrastructure.)</div>
                </div>
              ) : (
                <div style={{ maxHeight: 280, overflowY: 'auto', borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)' }}>
                  {cloudPhones.map(p => {
                    const on = flowSel.has(p.id)
                    return (
                      <button key={p.id} onClick={() => setFlowSel(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left', background: on ? `rgba(${theme.tone},0.07)` : 'transparent' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accentBtn : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 8.5, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                        <StatusDot kind={p.status === 'warming' ? 'warmup' : p.status} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: on ? '#F4F4F6' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.phone_name || (p.ig_username ? `@${p.ig_username}` : 'Appareil')}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {createOpen && (
        <CreateTaskModal theme={theme} user={user} org={org} infra={infra} mode="recurring"
          onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setTab('sched') }} />
      )}
    </div>
  )
}
