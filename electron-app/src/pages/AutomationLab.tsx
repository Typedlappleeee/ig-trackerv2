// Admin — Automatisation (UI façon GeeLark). Réservé au super-admin.
//   • Onglet « Lancer » : choisir PLUSIEURS téléphones, une automatisation
//     (officielle / communauté / la mienne), remplir les paramètres, lancer en
//     parallèle avec un journal par téléphone.
//   • Onglet « Créer » : le Workshop (sélecteur visuel, recorder intelligent).
//
// Catégories d'automatisations :
//   ⭐ Officielles (maintenues par ScaleFlow)
//   🌍 Communauté (partagées par des utilisateurs) — à venir via Supabase
//   👤 Mes automatisations (créées dans le workshop)
import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useOrg } from '@/lib/orgContext'
import { cloudPhones, loadCloudAgentConfig, getCloudAgent, uploadVideoFile, type CpInstance } from '@/lib/cloudPhones'
import { runFlow, type Flow } from '@/lib/flowRunner'
import { OFFICIAL_FLOWS, findFlow } from '@/lib/officialFlows'
import { listMyFlows, listCommunityFlows, bumpInstalls, type StoredFlow } from '@/lib/flowStore'
import { FlowWorkshop } from '@/components/FlowWorkshop'
import { RPA_TEMPLATES, TPL_RECOMMENDED_ID, PlatformLogo, InstagramLogo, type TplPlatform } from '@/lib/rpaTemplates'

// Correspondance template (catalogue) → flux INTERNE qui tourne sur les cloud
// phones. Au fur et à mesure qu'on traduit un template, on l'ajoute ici.
const TPL_FLOW_MAP: Record<string, string> = {
  '500000000000000016': 'ig-post-reel',     // Publier une vidéo Reels
  '500000000000000043': 'ig-edit-profile',  // Modifier le profil Instagram
  '500000000000000020': 'ig-warmup',        // Warmup de compte (IA)
  '500000000000000049': 'ig-set-privacy',   // Confidentialité public/privé
  '500000000000000053': 'ig-bulk-follow',   // Abonnement en masse
  '500000000000000034': 'ig-login',         // Connexion automatique
}

interface Props { user: User }
type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'
type RunState = { status: 'run' | 'ok' | 'fail'; log: string[]; failedAt?: string }

export function AutomationLab({ user }: Props) {
  const { currentOrg } = useOrg()
  const [conn, setConn] = useState<Conn>('checking')
  const [instances, setInstances] = useState<CpInstance[]>([])
  const [tab, setTab] = useState<'run' | 'post' | 'create'>('run')
  const [postFile, setPostFile] = useState<File | null>(null)
  const [postCaption, setPostCaption] = useState('')
  const [posting, setPosting] = useState(false)

  const [myFlows, setMyFlows] = useState<StoredFlow[]>([])
  const [communityFlows, setCommunityFlows] = useState<StoredFlow[]>([])
  const [flowId, setFlowId] = useState(OFFICIAL_FLOWS[0]?.id ?? '')
  const [flowTab, setFlowTab] = useState<'official' | 'mine' | 'community'>('official')
  const [openedFlow, setOpenedFlow] = useState<string | null>(null)   // null = galerie, sinon page détail
  const [openedTpl, setOpenedTpl] = useState<string | null>(null)     // template ouvert (écran « Utiliser »)
  const [tplVars, setTplVars] = useState<Record<string, string>>({})  // champs saisis pour un template texte
  const [perPhoneVars, setPerPhoneVars] = useState<Record<string, Record<string, string>>>({})  // champs PAR téléphone (templates perAccount)
  const [bulkCreds, setBulkCreds] = useState('')
  const [appFilter, setAppFilter] = useState<string>('all')           // filtre par application
  const [tplFilter, setTplFilter] = useState<'all' | TplPlatform>('all') // filtre plateforme du catalogue
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Record<string, RunState>>({})
  const [running, setRunning] = useState(false)

  const orgId = currentOrg?.id ?? null
  const allFlows: Flow[] = [...OFFICIAL_FLOWS, ...myFlows, ...communityFlows]
  const flow = allFlows.find(f => f.id === flowId)
  const runningPhones = instances.filter(i => /running|up/i.test(i.state))

  const loadFlows = useCallback(async () => {
    const [mine, community] = await Promise.all([listMyFlows(user.id), listCommunityFlows(user.id)])
    setMyFlows(mine); setCommunityFlows(community)
  }, [user.id])
  useEffect(() => { loadFlows() }, [loadFlows])

  const loadInstances = useCallback(async () => {
    const r = await cloudPhones.list()
    if (r.ok) setInstances(r.data?.instances ?? [])
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await loadCloudAgentConfig(currentOrg?.id ?? null, user.id)
      if (!alive) return
      const { url, token } = getCloudAgent()
      if (!url || !token) { setConn('unconfigured'); return }
      const h = await cloudPhones.health()
      if (!alive) return
      if (h.ok) { setConn('ok'); loadInstances() } else setConn('error')
    })()
    return () => { alive = false }
  }, [currentOrg?.id, user.id, loadInstances])

  const togglePhone = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = runningPhones.length > 0 && runningPhones.every(p => selected.has(p.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(runningPhones.map(p => p.id)))

  const run = async () => {
    if (!flow || selected.size === 0) return
    const ids = [...selected]
    if (communityFlows.some(f => f.id === flow.id)) bumpInstalls(flow.id)  // compteur de popularité
    setResults(Object.fromEntries(ids.map(id => [id, { status: 'run', log: [] } as RunState])))
    setRunning(true)
    await Promise.all(ids.map(async id => {
      const res = await runFlow(id, flow, { vars: inputs, log: m => setResults(r => ({ ...r, [id]: { ...r[id], log: [...(r[id]?.log ?? []), m] } })) })
      setResults(r => ({ ...r, [id]: { ...r[id], status: res.ok ? 'ok' : 'fail', failedAt: res.failedAt } }))
    }))
    setRunning(false)
  }

  // TOUT-EN-UN : upload la vidéo sur chaque tel sélectionné puis lance « Poster
  // un Reel » avec la description. En parallèle, journal par tel.
  const postRun = async () => {
    const flow = findFlow('ig-post-reel')
    if (!postFile || !flow || selected.size === 0) return
    const ids = [...selected]
    setResults(Object.fromEntries(ids.map(id => [id, { status: 'run', log: ['⏳ En attente…'] } as RunState])))
    setPosting(true)
    await Promise.all(ids.map(async id => {
      const push = (m: string) => setResults(r => ({ ...r, [id]: { ...r[id], log: [...(r[id]?.log ?? []), m] } }))
      const setOnly = (m: string) => setResults(r => ({ ...r, [id]: { ...r[id], log: [m] } }))
      setOnly('📤 Upload de la vidéo…')
      const up = await uploadVideoFile(id, postFile!, pct => setOnly(`📤 Upload ${pct}%`))
      if (!up.ok) { setResults(r => ({ ...r, [id]: { ...r[id], status: 'fail', failedAt: `upload : ${up.error}` } })); return }
      push('✓ Vidéo envoyée')
      await new Promise(res => setTimeout(res, 1800)) // laisse MediaStore indexer
      const res = await runFlow(id, flow, { vars: { caption: postCaption }, log: push })
      setResults(r => ({ ...r, [id]: { ...r[id], status: res.ok ? 'ok' : 'fail', failedAt: res.failedAt } }))
    }))
    setPosting(false)
  }

  // Runner générique (flux SANS upload de média — ex : édition de profil).
  const flowRun = async (flowId: string, vars: Record<string, string>) => {
    const flow = findFlow(flowId)
    if (!flow || selected.size === 0) return
    const ids = [...selected]
    setResults(Object.fromEntries(ids.map(id => [id, { status: 'run', log: ['⏳ En attente…'] } as RunState])))
    setPosting(true)
    await Promise.all(ids.map(async id => {
      const push = (m: string) => setResults(r => ({ ...r, [id]: { ...r[id], log: [...(r[id]?.log ?? []), m] } }))
      const res = await runFlow(id, flow, { vars, log: push })
      setResults(r => ({ ...r, [id]: { ...r[id], status: res.ok ? 'ok' : 'fail', failedAt: res.failedAt } }))
    }))
    setPosting(false)
  }

  // Runner PAR COMPTE : chaque téléphone reçoit ses propres variables (ex : login).
  const flowRunPerPhone = async (flowId: string) => {
    const flow = findFlow(flowId)
    if (!flow || selected.size === 0) return
    const ids = [...selected]
    setResults(Object.fromEntries(ids.map(id => [id, { status: 'run', log: ['⏳ En attente…'] } as RunState])))
    setPosting(true)
    await Promise.all(ids.map(async id => {
      const push = (m: string) => setResults(r => ({ ...r, [id]: { ...r[id], log: [...(r[id]?.log ?? []), m] } }))
      const res = await runFlow(id, flow, { vars: perPhoneVars[id] ?? {}, log: push })
      setResults(r => ({ ...r, [id]: { ...r[id], status: res.ok ? 'ok' : 'fail', failedAt: res.failedAt } }))
    }))
    setPosting(false)
  }
  // Répartit un collage « identifiant:mot_de_passe » (1 par ligne) sur les tél sélectionnés.
  const spreadBulkCreds = () => {
    const lines = bulkCreds.split('\n').map(l => l.trim()).filter(Boolean)
    const ids = [...selected]
    setPerPhoneVars(prev => {
      const next = { ...prev }
      ids.forEach((id, i) => {
        const line = lines[i]; if (!line) return
        const idx = line.indexOf(':')
        if (idx < 0) return
        next[id] = { account: line.slice(0, idx).trim(), password: line.slice(idx + 1).trim() }
      })
      return next
    })
    setBulkCreds('')
  }

  const nameOf = (id: string) => instances.find(i => i.id === id)?.name ?? id

  return (
    <div className="sf-page sf-page-enter">
      <header className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon" aria-hidden="true">🤖</div>
          <div style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">Automatisation</h1>
            <p className="sf-page-sub">Automatisations UI (façon GeeLark) sur tes cloud phones.</p>
          </div>
        </div>
      </header>
      <style>{`.sf-flowcard:hover{ border-color: var(--accent) !important; background: var(--accent-dim) !important; transform: translateY(-2px); }`}</style>
      <div style={{ maxWidth: 1080, width: '100%', margin: '0 auto', padding: '18px 22px 48px', boxSizing: 'border-box' }}>

      {conn === 'unconfigured' && <Notice>Agent non configuré — va d’abord dans <b>Cloud Phones</b>.</Notice>}
      {conn === 'error' && <Notice tone="error">Agent injoignable — vérifie <b>Cloud Phones</b>.</Notice>}
      {conn === 'checking' && <Notice>Connexion à l’agent…</Notice>}

      {conn === 'ok' && (
        <>
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(0,0,0,0.3)', marginBottom: 18, width: 'fit-content' }}>
            <Tab on={tab === 'run'} onClick={() => setTab('run')}>▶️ Lancer</Tab>
            <Tab on={tab === 'post'} onClick={() => setTab('post')}>📤 Poster</Tab>
            <Tab on={tab === 'create'} onClick={() => setTab('create')}>🛠️ Créer</Tab>
          </div>

          {tab === 'create' && <FlowWorkshop phones={runningPhones} userId={user.id} orgId={orgId} onSaved={loadFlows} />}

          {/* ── LANCER : galerie de flows OU page détail d'un flow ─────────────── */}
          {tab === 'run' && !openedFlow && !openedTpl && (() => {
            // « Officielles » affiche désormais le catalogue de templates RPA.
            const isTpl = flowTab === 'official'
            const baseList = flowTab === 'mine' ? myFlows : flowTab === 'community' ? communityFlows : []
            const src = flowTab === 'mine' ? 'Perso' : 'Communauté'
            const apps = [...new Set(baseList.map(f => f.app).filter(Boolean) as string[])]
            const list = appFilter === 'all' ? baseList : baseList.filter(f => f.app === appFilter)
            // Catalogue de templates (vitrine) filtré par plateforme.
            const tplList = RPA_TEMPLATES.filter(t => tplFilter === 'all' || t.platforms.includes(tplFilter))
            const reco = RPA_TEMPLATES.find(t => t.id === TPL_RECOMMENDED_ID)
            const showReco = reco && (tplFilter === 'all' || reco.platforms.includes(tplFilter))
            const TPL_FILTERS: Array<{ key: 'all' | TplPlatform; label: string }> = [
              { key: 'all', label: 'Tous' }, { key: 'instagram', label: 'Instagram' }, { key: 'tiktok', label: 'TikTok' }, { key: 'youtube', label: 'YouTube' },
            ]
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(0,0,0,0.28)', width: 'fit-content', flexWrap: 'wrap' }}>
                  <SubTab on={flowTab === 'official'} onClick={() => { setFlowTab('official'); setTplFilter('all') }}>⭐ Officielles · {RPA_TEMPLATES.length}</SubTab>
                  <SubTab on={flowTab === 'mine'} onClick={() => { setFlowTab('mine'); setAppFilter('all') }}>👤 Mes automatisations · {myFlows.length}</SubTab>
                  <SubTab on={flowTab === 'community'} onClick={() => { setFlowTab('community'); setAppFilter('all') }}>🌍 Communauté · {communityFlows.length}</SubTab>
                </div>

                {isTpl ? (
                  <>
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Catalogue de flux RPA à exécuter sur tes cloud phones. Filtre par plateforme.</p>
                    {/* Filtres plateforme avec logos */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {TPL_FILTERS.map(f => {
                        const active = tplFilter === f.key
                        return (
                          <button key={f.key} onClick={() => setTplFilter(f.key)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 10, cursor: 'pointer',
                              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-dim)' : 'rgba(255,255,255,0.03)', color: active ? 'var(--accent)' : 'var(--text-2)' }}>
                            {f.key !== 'all' && <PlatformLogo platform={f.key} size={16} />}{f.label}
                          </button>
                        )
                      })}
                    </div>
                    {/* Recommandé */}
                    {showReco && reco && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, background: 'var(--accent-dim)', border: '1px solid var(--accent)' }}>
                        <span style={{ flexShrink: 0 }}><InstagramLogo size={40} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3 }}>★ Recommandé</div>
                          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{reco.title}</p>
                          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0', lineHeight: 1.5 }}>{reco.desc}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-4)', margin: '5px 0 0', fontFamily: 'monospace' }}>Par {reco.author} · Template id : {reco.id}</p>
                        </div>
                        <button onClick={() => setOpenedTpl(reco.id)} className="sf-btn sf-btn-primary" style={{ height: 34, flexShrink: 0 }}>Utiliser</button>
                      </div>
                    )}
                    {/* Grille */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                      {tplList.map(t => {
                        const ready = !!TPL_FLOW_MAP[t.id]
                        return (
                        <div key={t.id} onClick={() => setOpenedTpl(t.id)} className="sf-card sf-flowcard" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, cursor: 'pointer', transition: 'all .14s' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{ flexShrink: 0, display: 'flex', gap: 3 }}>{t.platforms.slice(0, 3).map(p => <PlatformLogo key={p} platform={p} size={26} />)}</span>
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3, margin: 0 }}>{t.title}</p>
                          </div>
                          <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, margin: 0, flex: 1 }}>{t.desc}</p>
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 10, color: 'var(--text-4)', margin: 0 }}>Par {t.author}</p>
                              <p style={{ fontSize: 10, color: 'var(--text-4)', margin: 0, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Template id : {t.id}</p>
                            </div>
                            <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 99, color: ready ? 'var(--accent)' : 'var(--text-4)', background: ready ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ready ? 'var(--accent)' : 'var(--border)'}` }}>{ready ? 'Utiliser →' : 'Bientôt'}</span>
                          </div>
                        </div>
                        )
                      })}
                    </div>
                    {tplList.length === 0 && <div className="sf-card" style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>Aucun template pour cette plateforme.</div>}
                  </>
                ) : (
                <>
                {apps.length > 0 && (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <AppChip on={appFilter === 'all'} onClick={() => setAppFilter('all')} label="Toutes" count={baseList.length} />
                    {apps.map(a => <AppChip key={a} pkg={a} on={appFilter === a} onClick={() => setAppFilter(a)} count={baseList.filter(f => f.app === a).length} />)}
                  </div>
                )}

                {list.length === 0
                  ? <div className="sf-card" style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>{flowTab === 'mine' ? 'Aucune automatisation perso — crée-en dans l’onglet « Créer ».' : 'Rien pour l’instant.'}</div>
                  : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                      {list.map(f => <FlowCard key={f.id} flow={f} source={src} onOpen={() => { setOpenedFlow(f.id); setFlowId(f.id); setInputs({}) }} />)}
                    </div>}
                </>
                )}
              </div>
            )
          })()}

          {/* ── Écran « Utiliser » d'un TEMPLATE (config + lancement) ──────────── */}
          {tab === 'run' && openedTpl && (() => {
            const t = RPA_TEMPLATES.find(x => x.id === openedTpl)
            if (!t) return null
            const mappedFlow = TPL_FLOW_MAP[openedTpl]
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, width: '100%', margin: '0 auto' }}>
                <button onClick={() => setOpenedTpl(null)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px 0 12px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}>
                  <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>‹</span> Retour
                </button>
                {/* En-tête */}
                <div className="sf-card" style={{ padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', flexShrink: 0 }}>
                    <PlatformLogo platform={t.platforms[0]} size={40} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{t.title}</h2>
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.5 }}>{t.desc}</p>
                  </div>
                </div>

                {mappedFlow === 'ig-post-reel' ? (
                  <>
                    <Card title="Vidéo & légende">
                      <p style={{ fontSize: 11.5, color: '#8a8a9c', margin: '0 0 10px', lineHeight: 1.5 }}>La vidéo est <b>envoyée</b> sur chaque téléphone sélectionné puis <b>postée en Reel</b> avec la légende.</p>
                      <label style={{ display: 'block', marginBottom: 10 }}>
                        <input type="file" accept="video/*" onChange={e => setPostFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} id="tpl-post-file" />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1.5px dashed rgba(129,140,248,0.5)', background: 'rgba(129,140,248,0.07)', color: '#C7D2FE', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }} onClick={() => document.getElementById('tpl-post-file')?.click()}>
                          🎬 {postFile ? postFile.name : 'Choisir une vidéo'}
                        </span>
                      </label>
                      <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)} placeholder="Description / légende (emoji ok)" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                    </Card>
                    <PhonePicker phones={runningPhones} selected={selected} allSelected={allSelected} toggleAll={toggleAll} togglePhone={togglePhone} />
                    <button onClick={postRun} disabled={posting || !postFile || selected.size === 0} style={{ ...runBtn, opacity: (posting || !postFile || selected.size === 0) ? 0.55 : 1 }}>
                      {posting ? '⏳ Publication…' : `📤 Publier sur ${selected.size} téléphone${selected.size > 1 ? 's' : ''}`}
                    </button>
                    <ResultsList results={results} nameOf={nameOf} />
                  </>
                ) : mappedFlow && findFlow(mappedFlow) ? (() => {
                  const f = findFlow(mappedFlow)!
                  // ── Template PAR COMPTE (ex : connexion) : un jeu de champs / téléphone.
                  if (f.perAccount) {
                    const ids = [...selected]
                    const setPP = (id: string, key: string, val: string) => setPerPhoneVars(v => ({ ...v, [id]: { ...(v[id] ?? {}), [key]: val } }))
                    const ready = ids.length > 0 && ids.every(id => (f.inputs ?? []).every(inp => inp.optional || (perPhoneVars[id]?.[inp.key] ?? '').trim()))
                    return (
                      <>
                        <PhonePicker phones={runningPhones} selected={selected} allSelected={allSelected} toggleAll={toggleAll} togglePhone={togglePhone} />
                        <Card title="Coller en masse (optionnel)">
                          <p style={{ fontSize: 11.5, color: '#8a8a9c', margin: '0 0 8px', lineHeight: 1.5 }}>Un <b>identifiant:mot_de_passe</b> par ligne — réparti dans l'ordre des téléphones sélectionnés.</p>
                          <textarea value={bulkCreds} onChange={e => setBulkCreds(e.target.value)} placeholder={'compte1:motdepasse1\ncompte2:motdepasse2'} rows={3} wrap="off" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre', overflowX: 'auto' }} />
                          <button onClick={spreadBulkCreds} disabled={!bulkCreds.trim() || selected.size === 0} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border-md)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', cursor: 'pointer', opacity: (!bulkCreds.trim() || selected.size === 0) ? 0.5 : 1 }}>Répartir</button>
                        </Card>
                        {ids.length > 0 && (
                          <Card title={`Identifiants par téléphone (${ids.length})`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {ids.map(id => (
                                <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--accent)' }}>{nameOf(id)}</span>
                                  {(f.inputs ?? []).map(inp => (
                                    <input key={inp.key} type={inp.type === 'password' ? 'password' : 'text'} autoComplete="off"
                                      value={perPhoneVars[id]?.[inp.key] ?? ''} onChange={e => setPP(id, inp.key, e.target.value)}
                                      placeholder={inp.label} style={inputStyle} />
                                  ))}
                                </div>
                              ))}
                            </div>
                          </Card>
                        )}
                        <button onClick={() => flowRunPerPhone(mappedFlow)} disabled={posting || !ready} style={{ ...runBtn, opacity: (posting || !ready) ? 0.55 : 1 }}>
                          {posting ? '⏳ En cours…' : `▶ Lancer sur ${ids.length} téléphone${ids.length > 1 ? 's' : ''}`}
                        </button>
                        <ResultsList results={results} nameOf={nameOf} />
                      </>
                    )
                  }
                  const filled = (f.inputs ?? []).some(inp => inp.type === 'boolean' || (tplVars[inp.key] ?? '').trim())
                  return (
                    <>
                      <Card title="Champs">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {(f.inputs ?? []).map(inp => (
                            <label key={inp.key} style={{ display: 'block' }}>
                              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>{inp.label}{inp.optional && inp.type !== 'boolean' && <span style={{ color: 'var(--text-4)', fontWeight: 500 }}> · optionnel</span>}</span>
                              {inp.type === 'boolean'
                                ? (() => { const on = tplVars[inp.key] === 'true'; return (
                                    <button type="button" onClick={() => setTplVars(v => ({ ...v, [inp.key]: on ? 'false' : 'true' }))}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                        border: `1px solid ${on ? 'var(--accent)' : 'var(--border-md)'}`, background: on ? 'var(--accent-dim)' : 'rgba(0,0,0,0.25)', color: on ? 'var(--accent)' : 'var(--text-2)' }}>
                                      <span style={{ width: 34, height: 20, borderRadius: 99, background: on ? 'var(--accent)' : 'rgba(255,255,255,0.15)', position: 'relative', transition: 'all .15s' }}>
                                        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: '#fff', transition: 'all .15s' }} />
                                      </span>
                                      {on ? '🌐 Public' : '🔒 Privé'}
                                    </button>
                                  ) })()
                                : inp.type === 'textarea' || inp.key === 'biography' || inp.key === 'keywords'
                                ? <textarea value={tplVars[inp.key] ?? ''} onChange={e => setTplVars(v => ({ ...v, [inp.key]: e.target.value }))} placeholder={inp.placeholder} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                                : <input value={tplVars[inp.key] ?? ''} onChange={e => setTplVars(v => ({ ...v, [inp.key]: e.target.value }))} placeholder={inp.placeholder} style={inputStyle} />}
                            </label>
                          ))}
                        </div>
                      </Card>
                      <PhonePicker phones={runningPhones} selected={selected} allSelected={allSelected} toggleAll={toggleAll} togglePhone={togglePhone} />
                      <button onClick={() => flowRun(mappedFlow, tplVars)} disabled={posting || !filled || selected.size === 0} style={{ ...runBtn, opacity: (posting || !filled || selected.size === 0) ? 0.55 : 1 }}>
                        {posting ? '⏳ En cours…' : `▶ Lancer sur ${selected.size} téléphone${selected.size > 1 ? 's' : ''}`}
                      </button>
                      <ResultsList results={results} nameOf={nameOf} />
                    </>
                  )
                })() : (
                  <div className="sf-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6 }}>
                    🚧 Ce template n'est <b>pas encore branché</b> sur tes cloud phones.<br />
                    Envoie-moi son <b>JSON</b> et je le traduis pour qu'il tourne ici (comme le Reels).
                  </div>
                )}
              </div>
            )
          })()}

          {tab === 'run' && openedFlow && flow && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, width: '100%', margin: '0 auto' }}>
              <button onClick={() => setOpenedFlow(null)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px 0 12px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}>
                <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>‹</span> Retour
              </button>
              {/* En-tête du flow — logo encadré + centré */}
              <div className="sf-card" style={{ padding: 22, display: 'flex', gap: 18, alignItems: 'center' }}>
                <div style={{ width: 78, height: 78, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 20px -8px rgba(0,0,0,0.6)' }}>
                  <BrandLogo pkg={flow.app} size={52} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                    <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{flow.name}</h2>
                    {flow.category && <span className="sf-badge sf-badge-accent">{flow.category}</span>}
                  </div>
                  {flow.description && <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.5 }}>{flow.description}</p>}
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--ok)' }} />
                    {appOf(flow).label} · {flow.official ? 'ScaleFlow Officiel' : (flow as StoredFlow).mine ? 'Créé par moi' : 'Communauté'}
                  </div>
                </div>
              </div>

              {flow.inputs && flow.inputs.length > 0 && (
                <Card title="Paramètres">
                  {flow.inputs.map(inp => (
                    <div key={inp.key} style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>{inp.label}{inp.optional ? ' (optionnel)' : ''}</label>
                      <input value={inputs[inp.key] ?? ''} onChange={e => setInputs(s => ({ ...s, [inp.key]: e.target.value }))} placeholder={inp.placeholder} style={inputStyle} />
                    </div>
                  ))}
                </Card>
              )}
              <PhonePicker phones={runningPhones} selected={selected} allSelected={allSelected} toggleAll={toggleAll} togglePhone={togglePhone} />
              <button onClick={run} disabled={running || selected.size === 0} style={{ ...runBtn, opacity: (running || selected.size === 0) ? 0.55 : 1 }}>
                {running ? '⏳ Exécution…' : `▶️ Lancer sur ${selected.size} téléphone${selected.size > 1 ? 's' : ''}`}
              </button>
              <ResultsList results={results} nameOf={nameOf} />
            </div>
          )}

          {tab === 'post' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, width: '100%', margin: '0 auto' }}>
              <Card title="1 · Vidéo + description">
                <p style={{ fontSize: 11.5, color: '#8a8a9c', margin: '0 0 10px', lineHeight: 1.5 }}>Choisis une vidéo et une description → elle sera <b>uploadée</b> sur chaque tel sélectionné puis <b>postée en Reel</b> automatiquement.</p>
                <label style={{ display: 'block', marginBottom: 10 }}>
                  <input type="file" accept="video/*" onChange={e => setPostFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} id="post-file" />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1.5px dashed rgba(129,140,248,0.5)', background: 'rgba(129,140,248,0.07)', color: '#C7D2FE', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }} onClick={() => document.getElementById('post-file')?.click()}>
                    🎬 {postFile ? postFile.name : 'Choisir une vidéo'}
                  </span>
                </label>
                <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)} placeholder="Description / légende (emoji ok)" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </Card>
              <PhonePicker phones={runningPhones} selected={selected} allSelected={allSelected} toggleAll={toggleAll} togglePhone={togglePhone} />
              <button onClick={postRun} disabled={posting || !postFile || selected.size === 0} style={{ ...runBtn, opacity: (posting || !postFile || selected.size === 0) ? 0.55 : 1 }}>
                {posting ? '⏳ Publication…' : `📤 Poster sur ${selected.size} téléphone${selected.size > 1 ? 's' : ''}`}
              </button>
              <ResultsList results={results} nameOf={nameOf} />
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border-md)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-1)' }
const runBtn: React.CSSProperties = { width: '100%', fontSize: 14, fontWeight: 800, padding: '12px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 12.5, fontWeight: 800, padding: '8px 18px', borderRadius: 8, border: 'none', background: on ? 'rgba(255,255,255,0.09)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-4)', cursor: 'pointer', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.35)' : 'none', transition: 'all .12s' }}>{children}</button>
}
function PhonePicker({ phones, selected, allSelected, toggleAll, togglePhone }: { phones: CpInstance[]; selected: Set<string>; allSelected: boolean; toggleAll: () => void; togglePhone: (id: string) => void }) {
  return (
    <Card title={`Téléphones (${selected.size} sélectionné${selected.size > 1 ? 's' : ''})`}>
      {phones.length === 0
        ? <p style={{ fontSize: 12.5, color: 'var(--warn)', margin: 0 }}>Aucun téléphone en ligne. Démarres-en dans <b>Cloud Phones</b>.</p>
        : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Tout sélectionner
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 6 }}>
              {phones.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', background: selected.has(p.id) ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selected.has(p.id) ? 'var(--accent)' : 'var(--border)'}` }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => togglePhone(p.id)} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
    </Card>
  )
}
function ResultsList({ results, nameOf }: { results: Record<string, RunState>; nameOf: (id: string) => string }) {
  if (Object.keys(results).length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.entries(results).map(([id, r]) => (
        <div key={id} className="sf-card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{r.status === 'run' ? '⏳' : r.status === 'ok' ? '✅' : '❌'}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{nameOf(id)}</span>
            {r.status === 'fail' && <span style={{ fontSize: 11, color: 'var(--danger)' }}>bloqué : {r.failedAt}</span>}
          </div>
          <div style={{ maxHeight: 130, overflowY: 'auto', fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
            {r.log.map((l, i) => <div key={i} style={{ color: l.startsWith('✅') ? 'var(--ok)' : l.startsWith('❌') ? 'var(--danger)' : l.startsWith('  ✗') ? 'var(--warn)' : 'var(--text-2)' }}>{l}</div>)}
          </div>
        </div>
      ))}
    </div>
  )
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sf-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
function appOf(f: Flow): { label: string } {
  const m: Record<string, string> = {
    'com.instagram.android': 'Instagram', 'com.zhiliaoapp.musically': 'TikTok',
    'com.instagram.barcelona': 'Threads', 'com.snapchat.android': 'Snapchat',
    'com.facebook.katana': 'Facebook', 'com.twitter.android': 'X',
  }
  return { label: m[f.app ?? ''] ?? 'App' }
}

// Vrais logos officiels des apps, en SVG inline (épurés, propres en petit).
function BrandLogo({ pkg, size = 34 }: { pkg?: string; size?: number }) {
  const box: React.CSSProperties = { width: size, height: size, borderRadius: size * 0.28, display: 'block', flexShrink: 0 }
  switch (pkg) {
    case 'com.instagram.android':
      return (
        <svg style={box} viewBox="0 0 48 48" aria-label="Instagram">
          <defs><radialGradient id="ig-g" cx="30%" cy="107%" r="150%"><stop offset="0" stopColor="#fdf497" /><stop offset=".05" stopColor="#fdf497" /><stop offset=".45" stopColor="#fd5949" /><stop offset=".6" stopColor="#d6249f" /><stop offset=".9" stopColor="#285AEB" /></radialGradient></defs>
          <rect width="48" height="48" rx="13" fill="url(#ig-g)" />
          <rect x="12" y="12" width="24" height="24" rx="7.5" fill="none" stroke="#fff" strokeWidth="3" />
          <circle cx="24" cy="24" r="6.2" fill="none" stroke="#fff" strokeWidth="3" />
          <circle cx="32.4" cy="15.6" r="1.9" fill="#fff" />
        </svg>
      )
    case 'com.zhiliaoapp.musically':
      return (
        <svg style={box} viewBox="0 0 48 48" aria-label="TikTok">
          <rect width="48" height="48" rx="13" fill="#010101" />
          <path d="M31 12c.7 3.2 2.9 5.2 6 5.5v4.4c-2 0-3.9-.6-5.5-1.7v8.2a8.3 8.3 0 1 1-8.3-8.3c.45 0 .9.04 1.3.1v4.5a3.9 3.9 0 1 0 2.7 3.7V12H31z" fill="#25F4EE" transform="translate(-1.4 1.2)" />
          <path d="M31 12c.7 3.2 2.9 5.2 6 5.5v4.4c-2 0-3.9-.6-5.5-1.7v8.2a8.3 8.3 0 1 1-8.3-8.3c.45 0 .9.04 1.3.1v4.5a3.9 3.9 0 1 0 2.7 3.7V12H31z" fill="#FE2C55" transform="translate(1.4 -.6)" />
          <path d="M31 12c.7 3.2 2.9 5.2 6 5.5v4.4c-2 0-3.9-.6-5.5-1.7v8.2a8.3 8.3 0 1 1-8.3-8.3c.45 0 .9.04 1.3.1v4.5a3.9 3.9 0 1 0 2.7 3.7V12H31z" fill="#fff" />
        </svg>
      )
    case 'com.instagram.barcelona':
      return (
        <svg style={box} viewBox="0 0 48 48" aria-label="Threads">
          <rect width="48" height="48" rx="13" fill="#000" />
          <path d="M24.5 13c-5.9 0-9.6 3.6-9.9 9.9-.02.5.36.92.86.94.5.02.92-.36.94-.86.24-5.2 3-7.9 7.6-7.9 3.1 0 5.3 1.4 6.3 4 .3.8-.8 1.2-1.2.5-.9-1.6-2.5-2.6-5.1-2.6-3.7 0-5 2.2-5 4.3 0 2.6 2.2 4 5 4 2.9 0 4.7-1.4 5.4-3.9.1-.4.5-.6.9-.5s.6.5.5.9c-.9 3.2-3.4 5.3-7.3 5.3-3.9 0-6.8-2.3-6.8-5.8 0-3.1 2.2-6.1 6.8-6.1 2.4 0 4.3.7 5.6 2.1 1.3 1.4 1.9 3.4 1.9 5.8 0 5.6-3.5 9.1-9.5 9.1-.5 0-.9.4-.9.9s.4.9.9.9c7 0 11.3-4.3 11.3-10.9 0-2.9-.8-5.4-2.5-7.2C30.3 14 27.7 13 24.5 13z" fill="#fff" />
        </svg>
      )
    case 'com.snapchat.android':
      return (
        <svg style={box} viewBox="0 0 48 48" aria-label="Snapchat">
          <rect width="48" height="48" rx="13" fill="#FFFC00" />
          <path d="M24 12c3.9 0 5.9 3 5.9 6.6 0 1 .1 2 .2 2.6.5.3 1.3.3 2 0 .5-.2 1.3.1 1.3.8 0 .9-1.6 1.2-2.1 1.7-.3.9 1.9 3.7 4.2 4.1.5.1.6.5.6.8-.1.8-2 1-2.5 1.3-.2.3-.1 1-.6 1.1-.6.1-1.4-.3-2.4-.1-1 .2-1.9 1.7-4.6 1.7s-3.6-1.5-4.6-1.7c-1-.2-1.8.2-2.4.1-.5-.1-.4-.8-.6-1.1-.5-.3-2.4-.5-2.5-1.3 0-.3.1-.7.6-.8 2.3-.4 4.5-3.2 4.2-4.1-.5-.5-2.1-.8-2.1-1.7 0-.7.8-1 1.3-.8.7.3 1.5.3 2 0 .1-.6.2-1.6.2-2.6C18.1 15 20.1 12 24 12z" fill="#fff" />
        </svg>
      )
    case 'com.facebook.katana':
      return (
        <svg style={box} viewBox="0 0 48 48" aria-label="Facebook">
          <rect width="48" height="48" rx="13" fill="#1877F2" />
          <path d="M27 24h3l.6-4H27v-2.5c0-1.1.4-1.9 2-1.9h1.7v-3.5c-.3 0-1.4-.1-2.6-.1-2.7 0-4.6 1.6-4.6 4.7V20h-3.1v4H23v11h4V24z" fill="#fff" />
        </svg>
      )
    case 'com.twitter.android':
      return (
        <svg style={box} viewBox="0 0 48 48" aria-label="X">
          <rect width="48" height="48" rx="13" fill="#000" />
          <path d="M28.9 13h3.6l-7.9 9 9.3 12.3h-7.3l-5.7-7.5-6.5 7.5h-3.6l8.4-9.6L11 13h7.5l5.2 6.9L28.9 13zm-1.3 19.2h2l-12.9-17h-2.1l13 17z" fill="#fff" />
        </svg>
      )
    default:
      return <div style={{ ...box, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.4 }}>📱</div>
  }
}

function AppChip({ pkg, label, count, on, onClick }: { pkg?: string; label?: string; count?: number; on: boolean; onClick: () => void }) {
  const name = label ?? appOf({ app: pkg } as Flow).label
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: pkg ? '4px 12px 4px 5px' : '4px 12px', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-dim)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer' }}>
      {pkg ? <BrandLogo pkg={pkg} size={20} /> : <span style={{ fontSize: 13 }}>🗂️</span>}
      {name}{count != null ? ` · ${count}` : ''}
    </button>
  )
}
function SubTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontSize: 12, fontWeight: 800, padding: '7px 15px', borderRadius: 7, border: 'none', background: on ? 'rgba(255,255,255,0.09)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-4)', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.35)' : 'none', transition: 'all .12s' }}>{children}</button>
}

function FlowCard({ flow, source, onOpen }: { flow: Flow; source: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="sf-flowcard" style={{
      textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 14, cursor: 'pointer',
      background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)', transition: 'border-color .12s, transform .12s, background .12s', minHeight: 132,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BrandLogo pkg={flow.app} size={38} />
        {flow.category && <span className="sf-badge sf-badge-muted" style={{ fontSize: 10 }}>{flow.category}</span>}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.3 }}>{flow.name}</div>
      {flow.description && <div style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{flow.description}</div>}
      <span style={{ flex: 1 }} />
      <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{appOf(flow).label} · {source}</div>
    </button>
  )
}
function Notice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return <div className="sf-banner" style={{ color: tone === 'error' ? 'var(--danger)' : 'var(--text-2)' }}>{children}</div>
}

export default AutomationLab
