import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as RPointerEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Modal, PageHead, Panel, PanelHead, StatusDot } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { scopeInfra, phoneLabel } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { loadProxyRotation, resolveRotationUrls } from '@/lib/proxyRotation'
import { cancelRun } from '@/lib/runStore'
import BankPicker from '@/components/BankPicker'
import {
  BLOCKS, BLOCK, TEMPLATES, newBlock, newFlow, estimateFlow, flowCredits, fmtMinutes, validateFlow, lines,
  loadFlows, saveFlow, deleteFlow, runFlow, useFlowRuns, dismissFlowRun, BOOT_ESTIMATE,
  blockName, blockEstimate, isActive, retriesOf, loadBankSummary,
  type Flow, type FlowBlock, type BlockType, type BlockParams, type Creds, type FlowRun, type StepStatus, type PoolMode,
  type BankSummary, type MediaSource, type BlockOnError, type FlowDefaults,
} from '@/lib/flowEngine'

interface Phone { id: string; ig_username: string | null; phone_name: string; status: string; geelark_id: string | null; group_name: string | null }
type Drag = { kind: 'new'; type: BlockType } | { kind: 'move'; from: number }

const MONO = "'JetBrains Mono',monospace"
const inputStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
const areaStyle: CSSProperties = { ...inputStyle, height: 'auto', padding: 10, resize: 'vertical', lineHeight: 1.5 }

// Mise en page responsive (les styles inline n'ont pas de media queries).
const LAYOUT_CSS = `
.fb-grid{display:grid;grid-template-columns:236px minmax(0,1fr) 344px;gap:12px;align-items:start}
@media (max-width:1180px){.fb-grid{grid-template-columns:minmax(0,1fr) 330px}.fb-palette{grid-column:1 / -1}}
@media (max-width:860px){.fb-grid{grid-template-columns:minmax(0,1fr)}}
.fb-card .fb-actions{opacity:0;transition:opacity .12s ease}
.fb-card:hover .fb-actions,.fb-card.sel .fb-actions{opacity:1}
.fb-pal-item:hover{background:rgba(255,255,255,0.05)!important}
.fb-vp{cursor:grab}.fb-vp:active{cursor:grabbing}
.fb-lib-row .fb-lib-actions{opacity:0;transition:opacity .12s ease}
.fb-lib-row:hover .fb-lib-actions,.fb-lib-row.on .fb-lib-actions{opacity:1}
.fb-lib-row:hover{background:rgba(255,255,255,0.03)}
.fb-card:not(.sel):hover{background:#141416!important}
.fb-adv > summary::-webkit-details-marker{display:none}
.fb-adv > summary svg{transition:transform .15s ease}
.fb-adv[open] > summary svg{transform:rotate(90deg)}
.fb-adv > summary:hover{color:#EDEDEF}
`

export default function FlowBuilder({ theme, infra, user, org }: { theme: Theme; infra: InfraKey; user: User; org: OrgState }) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const bearer = conns.bearer
  const [flows, setFlows] = useState<Flow[]>([])
  const [flowsLoading, setFlowsLoading] = useState(true)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overSlot, setOverSlot] = useState<number | null>(null)
  const [insertMenu, setInsertMenu] = useState<number | null>(null)
  const [picker, setPicker] = useState<{ blockId: string; kind: 'videos' | 'images' | 'captions' } | null>(null)
  const [bank, setBank] = useState<BankSummary | null>(null)
  const [rotationConfigured, setRotationConfigured] = useState(false)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [newOpen, setNewOpen] = useState<number | null>(null)   // null = fermé, -1 = vide, i = modèle
  const [confirmDel, setConfirmDel] = useState<Flow | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })   // déplacement + zoom du canvas
  const vpRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null)
  const [phones, setPhones] = useState<Phone[]>([])
  const runs = useFlowRuns()
  const runsRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flow = flows.find(f => f.id === flowId) ?? null

  useEffect(() => {
    let alive = true
    loadFlows(user.id).then(fs => {
      if (!alive) return
      // Fusion (pas écrasement) : un flow créé pendant le chargement est conservé.
      setFlows(prev => [...prev.filter(p => !fs.some(x => x.id === p.id)), ...fs])
      setFlowId(cur => cur ?? fs[0]?.id ?? null)
      setFlowsLoading(false)
    }).catch(() => { if (alive) setFlowsLoading(false) })
    return () => { alive = false }
  }, [user.id])

  const loadPhones = useCallback(async () => {
    let q = supabase.from('phones').select('id,ig_username,phone_name,status,geelark_id,group_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q = scopeInfra(q, infra)
    const { data } = await q
    setPhones(((data ?? []) as Phone[]).filter(p => p.geelark_id))
  }, [currentOrg?.id, user.id, infra])
  useEffect(() => { loadPhones() }, [loadPhones])
  // Résumé de la banque (dossiers + nombre de vidéos/images) pour les sources « dossier ».
  const loadBank = useCallback(() => {
    loadBankSummary({ orgId: currentOrg?.id ?? null, userId: user.id }).then(setBank).catch(() => setBank(null))
  }, [currentOrg?.id, user.id])
  useEffect(() => { loadBank() }, [loadBank])
  useEffect(() => {
    loadProxyRotation(currentOrg?.id ?? null, user.id).then(c => setRotationConfigured(c.enabled && c.urls.some(u => /^https?:\/\//i.test(u.trim())))).catch(() => {})
  }, [currentOrg?.id, user.id])

  // ── Sauvegarde automatique (anti-rebond) ───────────────────────────────────
  const persist = useCallback((f: Flow, immediate = false) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    const go = async () => {
      const r = await saveFlow(f, user.id, currentOrg?.id ?? null)
      setSaveState(r.ok ? 'saved' : 'error'); setSaveError(r.ok ? null : r.error ?? 'Échec')
    }
    if (immediate) void go()
    else saveTimer.current = setTimeout(() => { void go() }, 700)
  }, [user.id, currentOrg?.id])

  const update = (fn: (f: Flow) => Flow) => {
    if (!flow) return
    const nf = fn(flow)
    setFlows(fs => fs.map(x => x.id === nf.id ? nf : x))
    persist(nf)
  }

  function createFlow(name: string, types: BlockType[] = []) {
    const nf = newFlow(name.trim() || 'Nouveau flow', types)
    setFlows(fs => [nf, ...fs]); setFlowId(nf.id); setSel(nf.blocks[0]?.id ?? null)
    setView({ x: 0, y: 0, z: 1 })
    persist(nf, true)
  }
  function openFlow(id: string) { setFlowId(id); setSel(null); setInsertMenu(null); setView({ x: 0, y: 0, z: 1 }) }
  function duplicateFlow(f: Flow) {
    const copy: Flow = { ...JSON.parse(JSON.stringify(f)), id: newFlow().id, name: `${f.name} (copie)` }
    copy.blocks = copy.blocks.map((b: FlowBlock) => ({ ...b, id: newBlock(b.type).id }))
    setFlows(fs => [copy, ...fs]); openFlow(copy.id)
    persist(copy, true)
  }
  async function removeFlow(f: Flow) {
    await deleteFlow(f.id, user.id)
    const rest = flows.filter(x => x.id !== f.id)
    setFlows(rest)
    if (flowId === f.id) { setFlowId(rest[0]?.id ?? null); setSel(null) }
    setConfirmDel(null)
  }

  // ── Déplacement à la main (glisser le fond) + molette / zoom ───────────────
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const r = vpRef.current?.getBoundingClientRect()
    const px = cx ?? (r ? r.width / 2 : 0), py = cy ?? (r ? r.height / 3 : 0)
    setView(v => {
      const z = Math.max(0.4, Math.min(1.6, +(v.z * factor).toFixed(3)))
      const k = z / v.z
      return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }
  useEffect(() => {
    const el = vpRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
      } else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [flow?.id, flowsLoading])
  const onPanStart = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.fb-card, button, input, textarea, select, .fb-menu')) return
    panRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPanMove = (e: RPointerEvent<HTMLDivElement>) => {
    const p = panRef.current
    if (!p) return
    const dx = e.clientX - p.px, dy = e.clientY - p.py
    if (!p.moved && Math.hypot(dx, dy) < 4) return
    p.moved = true
    setView(v => ({ ...v, x: p.x + dx, y: p.y + dy }))
  }
  const onPanEnd = () => {
    const p = panRef.current
    panRef.current = null
    if (p && !p.moved) { setSel(null); setInsertMenu(null) }   // simple clic sur le fond = désélection
  }

  // ── Opérations sur les blocs ───────────────────────────────────────────────
  const insertAt = (type: BlockType, at: number) => {
    const b = newBlock(type)
    update(f => { const bl = [...f.blocks]; bl.splice(Math.max(0, Math.min(at, bl.length)), 0, b); return { ...f, blocks: bl } })
    setSel(b.id); setInsertMenu(null)
  }
  const addBlock = (type: BlockType) => {
    if (!flow) { createFlow('Nouveau flow', [type]); return }
    const i = sel ? flow.blocks.findIndex(b => b.id === sel) : -1
    insertAt(type, i >= 0 ? i + 1 : flow.blocks.length)
  }
  const moveBlock = (from: number, slot: number) => {
    const to = slot > from ? slot - 1 : slot
    if (to === from) return
    update(f => { const bl = [...f.blocks]; const [b] = bl.splice(from, 1); bl.splice(to, 0, b); return { ...f, blocks: bl } })
  }
  const removeBlock = (id: string) => { update(f => ({ ...f, blocks: f.blocks.filter(b => b.id !== id) })); if (sel === id) setSel(null) }
  const duplicateBlock = (id: string) => {
    if (!flow) return
    const i = flow.blocks.findIndex(b => b.id === id)
    const copy: FlowBlock = { ...newBlock(flow.blocks[i].type), params: JSON.parse(JSON.stringify(flow.blocks[i].params)) }
    update(f => { const bl = [...f.blocks]; bl.splice(i + 1, 0, copy); return { ...f, blocks: bl } })
    setSel(copy.id)
  }
  const setParams = (id: string, patch: Partial<BlockParams>) =>
    update(f => ({ ...f, blocks: f.blocks.map(b => b.id === id ? { ...b, params: { ...b.params, ...patch } } : b) }))

  const onDropSlot = (slot: number) => {
    if (!drag) return
    if (drag.kind === 'new') insertAt(drag.type, slot)
    else moveBlock(drag.from, slot)
    setDrag(null); setOverSlot(null)
  }

  // Raccourcis : Suppr = supprimer le bloc sélectionné, Échap = désélectionner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeBlock(sel) }
      if (e.key === 'Escape') { setSel(null); setInsertMenu(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selBlock = flow?.blocks.find(b => b.id === sel) ?? null
  const est = flow ? estimateFlow(flow) : BOOT_ESTIMATE
  const credits = flow ? flowCredits(flow) : 0
  const issues = useMemo(() => flow ? validateFlow(flow, 0, undefined, undefined, bank ?? undefined) : [], [flow, bank])
  const blockIssue = (b: FlowBlock) => {
    const s = flow ? validateFlow({ ...flow, blocks: [{ ...b, params: { ...b.params, disabled: false } }] }, 0, undefined, undefined, bank ?? undefined)[0]?.replace(/^Bloc 1 \([^)]*\) : /, '') : undefined
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <style>{LAYOUT_CSS}</style>
      <PageHead
        title="Flow Builder"
        sub="Assemble tes automatisations bloc par bloc, puis lance-les sur tes comptes."
        actions={<>
          {flow && <SaveBadge state={saveState} error={saveError} />}
          <Btn theme={theme} tone="primary" icon="M5 3l14 9-14 9V3z" label="Lancer"
            disabled={!flow || flow.blocks.length === 0 || issues.length > 0 || !bearer}
            onClick={() => setLaunchOpen(true)} />
        </>}
      />

      {!bearer && !conns.loading && (
        <div style={{ padding: '10px 12px', marginBottom: 12, borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', color: '#FBBF24', fontSize: 13 }}>
          Connecte d'abord ton compte GeeLark (token) dans les Réglages pour pouvoir lancer un flow.
        </div>
      )}

      <div className="fb-grid">
        {/* ── Colonne gauche : Mes flows + Blocs ── */}
        <div className="fb-palette" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FlowLibrary theme={theme} flows={flows} activeId={flowId} loading={flowsLoading}
            onOpen={openFlow} onNew={() => setNewOpen(-1)} onDuplicate={duplicateFlow} onDelete={f => setConfirmDel(f)} />
          <Panel theme={theme}>
            <PanelHead title="Blocs" sub="Glisse ou clique pour ajouter" />
            <div style={{ padding: '6px 0 8px' }}>
              {(['Compte', 'Activité', 'Contenu'] as const).map(g => (
                <div key={g}>
                  <div style={{ padding: '8px 16px 4px', fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{g}</div>
                  {BLOCKS.filter(b => b.group === g).map(b => (
                    <div key={b.type} className="fb-pal-item" draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', b.type); setDrag({ kind: 'new', type: b.type }) }}
                      onDragEnd={() => { setDrag(null); setOverSlot(null) }}
                      onClick={() => addBlock(b.type)}
                      title={b.hint}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', cursor: 'grab', userSelect: 'none' }}>
                      <BlockIcon def={b.type} size={24} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{b.label}</span>
                      {b.credits > 0 && <span style={{ fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{b.credits}cr</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Canvas (déplaçable à la main) ── */}
        <Panel theme={theme} style={{ overflow: 'hidden' }}>
          {flow ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
              <input value={flow.name} onChange={e => update(f => ({ ...f, name: e.target.value }))} aria-label="Nom du flow" title="Clique pour renommer"
                style={{ flex: 1, minWidth: 140, height: 30, padding: '0 8px', marginLeft: -8, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: '#EDEDEF', fontSize: 14, fontWeight: 600, outline: 'none' }}
                onFocus={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)' }}
                onBlur={e => { e.currentTarget.style.border = '1px solid transparent' }} />
              <Chip text={`≈ ${fmtMinutes(est)} / compte`} tone="mute" />
              <Chip text={credits > 0 ? `${credits} crédit${credits > 1 ? 's' : ''} / compte` : 'Gratuit'} tone={credits > 0 ? 'violet' : 'ok'} />
              <Btn theme={theme} sm tone="ghost" icon="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z|M17 21v-8H7v8|M7 3v5h8" label="Enregistrer" onClick={() => persist(flow, true)} />
            </div>
          ) : null}
          <div ref={vpRef} className="fb-vp"
            onPointerDown={onPanStart} onPointerMove={onPanMove} onPointerUp={onPanEnd} onPointerCancel={onPanEnd}
            style={{
              position: 'relative', height: 'max(520px, calc(100vh - 300px))', overflow: 'hidden', touchAction: 'none',
              backgroundColor: '#0C0C0E', backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: `${18 * view.z}px ${18 * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px`,
            }}>
            {!flow ? (flowsLoading
              ? <div style={{ padding: 60, textAlign: 'center', color: '#71717A', fontSize: 13 }}>Chargement…</div>
              : <EmptyState theme={theme} onTemplate={i => setNewOpen(i)} />
            ) : (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px 16px 90px', transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }}>
                <Terminal label="Démarrage du téléphone" sub={fmtMinutes(BOOT_ESTIMATE)} icon="M5 3l14 9-14 9V3z" />
                <Slot index={0} theme={theme} drag={drag} over={overSlot === 0} menuOpen={insertMenu === 0}
                  onOver={setOverSlot} onDrop={onDropSlot} onPlus={i => setInsertMenu(insertMenu === i ? null : i)} onPick={insertAt} />
                {flow.blocks.map((b, i) => (
                  <Fragment key={b.id}>
                    <BlockCard theme={theme} block={b} index={i} selected={sel === b.id} issue={blockIssue(b)}
                      onSelect={() => { setSel(b.id); setInsertMenu(null) }}
                      onDragStart={() => setDrag({ kind: 'move', from: i })}
                      onDragEnd={() => { setDrag(null); setOverSlot(null) }}
                      onUp={i > 0 ? () => moveBlock(i, i - 1) : undefined}
                      onDown={i < flow.blocks.length - 1 ? () => moveBlock(i, i + 2) : undefined}
                      onDuplicate={() => duplicateBlock(b.id)}
                      onRemove={() => removeBlock(b.id)} />
                    <Slot index={i + 1} theme={theme} drag={drag} over={overSlot === i + 1} menuOpen={insertMenu === i + 1}
                      onOver={setOverSlot} onDrop={onDropSlot} onPlus={k => setInsertMenu(insertMenu === k ? null : k)} onPick={insertAt} />
                  </Fragment>
                ))}
                <Terminal label="Arrêt du téléphone" sub="automatique" icon="M6 6h12v12H6z" />
              </div>
            )}
            {flow && (
              <>
                <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 7, background: '#111113', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {([['M12 5v14|M5 12h14', () => zoomAt(1.15), 'Zoom avant'],
                     ['M5 12h14', () => zoomAt(1 / 1.15), 'Zoom arrière'],
                     ['M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5', () => setView({ x: 0, y: 0, z: 1 }), 'Recentrer']] as [string, () => void, string][]).map(([d, fn, t]) => (
                    <button key={t} onClick={fn} title={t} aria-label={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: '#A1A1AA', cursor: 'pointer' }}>
                      <Icon d={d} size={13} />
                    </button>
                  ))}
                  <span style={{ padding: '0 6px', fontSize: 11.5, color: '#8B8B94', fontVariantNumeric: 'tabular-nums' }}>{Math.round(view.z * 100)}%</span>
                </div>
                <div style={{ position: 'absolute', top: 10, right: 16, fontSize: 11.5, color: '#71717A', pointerEvents: 'none' }}>
                  Glisse le fond pour te déplacer · Ctrl + molette pour zoomer
                </div>
              </>
            )}
          </div>
        </Panel>

        {/* ── Inspecteur ── */}
        <Panel theme={theme}>
          {selBlock && flow ? (
            <Inspector theme={theme} block={selBlock} index={flow.blocks.indexOf(selBlock)} bank={bank}
              onChange={patch => setParams(selBlock.id, patch)}
              onPick={kind => setPicker({ blockId: selBlock.id, kind })}
              onRemove={() => removeBlock(selBlock.id)} />
          ) : flow ? (
            <FlowSettings theme={theme} flow={flow} issues={issues} rotationConfigured={rotationConfigured}
              groups={[...new Set(phones.map(p => p.group_name).filter(Boolean) as string[])].sort()}
              onPatch={patch => update(f => ({ ...f, ...patch }))}
              onDelete={() => setConfirmDel(flow)} />
          ) : (
            <div style={{ padding: 16, fontSize: 13, color: '#8B8B94', lineHeight: 1.6 }}>Crée un flow (bouton « Nouveau » à gauche) ou choisis un modèle pour commencer.</div>
          )}
        </Panel>
      </div>

      {newOpen !== null && (
        <NewFlowModal theme={theme} preset={newOpen} names={flows.map(f => f.name)}
          onClose={() => setNewOpen(null)}
          onCreate={(name, types) => { createFlow(name, types); setNewOpen(null) }} />
      )}

      {confirmDel && (
        <Modal theme={theme} title="Supprimer ce flow ?" sub={`« ${confirmDel.name} » sera supprimé définitivement.`} icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" width={440}
          onClose={() => setConfirmDel(null)}
          footer={<>
            <Btn theme={theme} tone="ghost" label="Annuler" onClick={() => setConfirmDel(null)} />
            <Btn theme={theme} tone="danger" label="Supprimer" onClick={() => removeFlow(confirmDel)} />
          </>}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#A1A1AA' }}>Les exécutions déjà lancées avec ce flow continuent normalement.</div>
        </Modal>
      )}

      {/* ── Exécutions ── */}
      <div ref={runsRef} style={{ marginTop: 16 }}>
        <RunsPanel theme={theme} runs={runs} />
      </div>

      {picker && flow && (() => {
        const b = flow.blocks.find(x => x.id === picker.blockId)
        if (!b) return null
        const ids = picker.kind === 'videos' ? b.params.videoIds ?? [] : picker.kind === 'images' ? b.params.imageIds ?? [] : []
        return (
          <BankPicker theme={theme} user={user} org={org} kind={picker.kind} multi initialIds={ids}
            title={picker.kind === 'videos' ? 'Vidéos à publier' : picker.kind === 'images' ? 'Images' : 'Légendes à importer'}
            onClose={() => { setPicker(null); loadBank() }}
            onApply={r => {
              if (r.kind === 'videos') setParams(b.id, { videoIds: r.ids })
              else if (r.kind === 'images') setParams(b.id, { imageIds: r.ids })
              else if (r.kind === 'captions') {
                // Ajoutées aux légendes existantes (une par ligne, sans doublon).
                const cur = lines(b.params.captions)
                const add = r.texts.map(t => t.replace(/\s*\n\s*/g, ' ').trim()).filter(t => t && !cur.includes(t))
                setParams(b.id, { captions: [...cur, ...add].join('\n') })
              }
              setPicker(null); loadBank()
            }} />
        )
      })()}

      {launchOpen && flow && bearer && (
        <LaunchModal theme={theme} flow={flow} phones={phones} bearer={bearer} bank={bank}
          ownerId={currentOrg?.owner_id ?? user.id} orgId={currentOrg?.id ?? null} userId={user.id}
          onClose={() => setLaunchOpen(false)}
          onLaunched={() => { setLaunchOpen(false); setTimeout(() => runsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }} />
      )}
    </div>
  )
}

// ── Petits composants ────────────────────────────────────────────────────────

function BlockIcon({ def, size = 28 }: { def: BlockType; size?: number }) {
  const b = BLOCK[def]
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size >= 28 ? 6 : 5, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: `rgb(${b.color})` }}>
      <Icon d={b.icon} size={Math.round(size * 0.5)} />
    </span>
  )
}

function SaveBadge({ state, error }: { state: 'idle' | 'saving' | 'saved' | 'error'; error: string | null }) {
  if (state === 'idle') return null
  const t = state === 'saving' ? 'Enregistrement…' : state === 'saved' ? 'Enregistré' : `Erreur : ${error ?? ''}`
  return <span style={{ alignSelf: 'center', fontSize: 12, fontWeight: 500, color: state === 'error' ? '#F87171' : state === 'saved' ? '#4ADE80' : '#71717A' }}>{state === 'saved' ? '✓ ' : ''}{t}</span>
}

function Terminal({ label, sub, icon }: { label: string; sub: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 12px 0 10px', borderRadius: 6, background: '#111113', border: '1px solid rgba(255,255,255,0.09)', color: '#A1A1AA', fontSize: 12, fontWeight: 500 }}>
      <span style={{ display: 'flex', color: '#71717A' }}><Icon d={icon} size={11} /></span>
      {label}<span style={{ fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{sub}</span>
    </div>
  )
}

// Liaison entre deux blocs : zone de dépôt + bouton « + » d'insertion.
function Slot({ index, theme, drag, over, menuOpen, onOver, onDrop, onPlus, onPick }: {
  index: number; theme: Theme; drag: Drag | null; over: boolean; menuOpen: boolean
  onOver: (i: number | null) => void; onDrop: (i: number) => void; onPlus: (i: number) => void; onPick: (t: BlockType, at: number) => void
}) {
  const active = !!drag
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', height: over ? 64 : 40, width: 300, transition: 'height .12s ease' }}
      onDragOver={e => { if (!active) return; e.preventDefault(); onOver(index) }}
      onDragLeave={() => onOver(null)}
      onDrop={e => { e.preventDefault(); onDrop(index) }}>
      <span style={{ flex: 1, width: 0, borderLeft: `1px dashed ${over ? theme.accent : 'rgba(255,255,255,0.14)'}` }} />
      {over && <span style={{ position: 'absolute', top: '50%', left: 20, right: 20, height: 26, marginTop: -13, borderRadius: 6, border: `1px dashed ${theme.accent}`, background: 'rgba(255,255,255,0.03)' }} />}
      {!active && (
        <button onClick={e => { e.stopPropagation(); onPlus(index) }} aria-label="Insérer un bloc" title="Insérer un bloc ici"
          style={{ position: 'absolute', top: '50%', marginTop: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, border: `1px solid ${menuOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)'}`, background: menuOpen ? '#1C1C1F' : '#111113', color: menuOpen ? '#EDEDEF' : '#8B8B94', cursor: 'pointer', padding: 0 }}>
          <Icon d="M12 5v14|M5 12h14" size={10} sw={2.2} />
        </button>
      )}
      {menuOpen && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: 18, marginTop: -14, zIndex: 20, width: 200, padding: 4, borderRadius: 8, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)', animation: 'aPop .14s ease both' }}>
          {BLOCKS.map(b => (
            <button key={b.type} onClick={() => onPick(b.type, index)} className="fb-pal-item"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px', borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <BlockIcon def={b.type} size={20} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{b.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function sourceLabel(b: FlowBlock): string {
  const p = b.params, src = p.source ?? 'pick'
  const w = BLOCK[b.type].media === 'video' ? 'vidéo' : 'image'
  if (src === 'folder') return `📁 ${p.folder || 'dossier ?'}`
  if (src === 'all') return 'toute la banque'
  const n = (BLOCK[b.type].media === 'video' ? p.videoIds : p.imageIds)?.length ?? 0
  return `${n} ${w}${n > 1 ? 's' : ''}`
}

function summary(b: FlowBlock): string {
  const p = b.params
  const mode = p.mode === 'random' ? 'aléatoire' : 'dans l\'ordre'
  let s = ''
  switch (b.type) {
    case 'login': s = 'Identifiants demandés au lancement'; break
    case 'username': { const l = lines(p.usernames); s = l.length === 0 ? 'Aucun pseudo' : l.length === 1 ? `@${l[0]}` : `${l.length} pseudos`; break }
    case 'avatar': s = `${sourceLabel(b)} · ${mode}`; break
    case 'bio': { const n = lines(p.bios).length; s = [n ? `${n} bio(s)` : '', lines(p.names).length ? 'nom' : '', p.link?.trim() ? 'lien' : ''].filter(Boolean).join(' · ') || 'Vide'; break }
    case 'warmup': { const k = lines(p.keyword); s = `${p.minMin ?? 0}–${p.maxMin ?? 0} min${k.length ? ` · ${k.length === 1 ? `« ${k[0]} »` : `${k.length} mots-clés`}` : ''}`; break }
    case 'pause': s = `${p.minMin ?? 0}–${p.maxMin ?? 0} min${(p.minMin ?? 0) >= 3 ? ' · tél. éteint' : ''}`; break
    case 'post': s = `${sourceLabel(b)} · ${lines(p.captions).length} légende(s)${p.trial ? ' · essai' : ''}${p.removeAfter ? ' · usage unique' : ''}`; break
    case 'story': {
      let host = ''
      try { host = p.link ? new URL(p.link).host : '' } catch { host = p.link ?? '' }
      s = `${sourceLabel(b)} · ${p.linkMode === 'perAccount' ? `${lines(p.links).length} liens` : host || 'sans lien'}`
      break
    }
  }
  const extra = [
    (p.delayMax ?? 0) > 0 ? `⏱ ${p.delayMin ?? 0}–${p.delayMax} min avant` : '',
    retriesOf(p) > 0 ? `↻ ${retriesOf(p)}` : '',
  ].filter(Boolean)
  return [s, ...extra].join(' · ')
}

function BlockCard({ theme, block, index, selected, issue, onSelect, onDragStart, onDragEnd, onUp, onDown, onDuplicate, onRemove }: {
  theme: Theme; block: FlowBlock; index: number; selected: boolean; issue?: string
  onSelect: () => void; onDragStart: () => void; onDragEnd: () => void
  onUp?: () => void; onDown?: () => void; onDuplicate: () => void; onRemove: () => void
}) {
  const def = BLOCK[block.type]
  const off = !isActive(block)
  const edge = selected ? `rgba(${theme.tone},0.6)` : issue && !off ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.09)'
  const act = (d: string, fn: (() => void) | undefined, t: string, danger = false) => (
    <button onClick={e => { e.stopPropagation(); fn?.() }} disabled={!fn} title={t} aria-label={t}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: danger ? '#F87171' : '#A1A1AA', cursor: fn ? 'pointer' : 'default', opacity: fn ? 1 : 0.3, padding: 0 }}>
      <Icon d={d} size={12} />
    </button>
  )
  return (
    <div className={`fb-card${selected ? ' sel' : ''}`} draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.id); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); onSelect() }}
      style={{
        width: 290, borderRadius: 8, cursor: 'pointer', background: off ? '#0F0F11' : '#111113', opacity: off && !selected ? 0.6 : 1,
        borderTop: `1px ${off ? 'dashed' : 'solid'} ${edge}`, borderRight: `1px ${off ? 'dashed' : 'solid'} ${edge}`, borderBottom: `1px ${off ? 'dashed' : 'solid'} ${edge}`,
        borderLeft: `2px ${off ? 'dashed' : 'solid'} ${off ? 'rgba(255,255,255,0.14)' : `rgba(${def.color},0.75)`}`,
        transition: 'border-color .12s ease, background .12s ease, opacity .12s ease',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 10px 10px 12px' }}>
        <BlockIcon def={block.type} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: '#8B8B94' }}>{off ? '⏸ Désactivé' : `⚡ ${def.label}`}</div>
          <div style={{ marginTop: 2, fontSize: 13, fontWeight: 600, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: off ? 'line-through' : undefined }}>{blockName(block)}</div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{fmtMinutes(blockEstimate(block))}{def.credits > 0 ? ` · ${def.credits} cr` : ''}</div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: '#5A5A63', fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: issue && !off ? '#F87171' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issue && !off ? issue : summary(block)}>
          {issue && !off ? `⚠ ${issue}` : summary(block)}
        </span>
        <span className="fb-actions" style={{ display: 'flex', gap: 1 }}>
          {act('M18 15l-6-6-6 6', onUp, 'Monter')}
          {act('M6 9l6 6 6-6', onDown, 'Descendre')}
          {act('M8 8h12v12H8z|M4 16V4h12', onDuplicate, 'Dupliquer')}
          {act('M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6', onRemove, 'Supprimer', true)}
        </span>
      </div>
    </div>
  )
}

function EmptyState({ theme, onTemplate }: { theme: Theme; onTemplate: (preset: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '56px 20px', textAlign: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 8, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText }}>
        <Icon d="M5 3h4v4H5z|M15 17h4v4h-4z|M7 7v4a2 2 0 0 0 2 2h6a2 2 0 0 1 2 2v2" size={18} />
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF' }}>Crée ton premier flow</div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#8B8B94' }}>Pars d'un modèle ou glisse des blocs depuis la gauche.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {TEMPLATES.map((t, ti) => (
          <button key={t.name} onClick={() => onTemplate(ti)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, width: 190, padding: 12, borderRadius: 8, cursor: 'pointer', textAlign: 'left', background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ display: 'flex', gap: 4 }}>{t.types.map((ty, i) => <BlockIcon key={i} def={ty} size={20} />)}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{t.name}</span>
            <span style={{ fontSize: 12, color: '#8B8B94' }}>{t.desc}</span>
          </button>
        ))}
        <button onClick={() => onTemplate(-1)} style={{ width: 120, padding: 12, borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px dashed rgba(255,255,255,0.14)', color: '#A1A1AA', fontSize: 13, fontWeight: 500 }}>Flow vide</button>
      </div>
    </div>
  )
}

// ── Bibliothèque « Mes flows » ───────────────────────────────────────────────

function ago(iso?: string): string {
  if (!iso) return 'à l\'instant'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'à l\'instant'
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 30 * 86400) return `il y a ${Math.floor(s / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

function FlowLibrary({ theme, flows, activeId, loading, onOpen, onNew, onDuplicate, onDelete }: {
  theme: Theme; flows: Flow[]; activeId: string | null; loading: boolean
  onOpen: (id: string) => void; onNew: () => void; onDuplicate: (f: Flow) => void; onDelete: (f: Flow) => void
}) {
  const [q, setQ] = useState('')
  const shown = flows.filter(f => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()))
  const act = (d: string, t: string, fn: () => void, danger = false) => (
    <button onClick={e => { e.stopPropagation(); fn() }} title={t} aria-label={t}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: danger ? '#F87171' : '#A1A1AA', cursor: 'pointer', padding: 0 }}>
      <Icon d={d} size={12} />
    </button>
  )
  return (
    <Panel theme={theme}>
      <PanelHead title="Mes flows" sub={loading ? 'Chargement…' : `${flows.length} sauvegardé${flows.length > 1 ? 's' : ''}`}
        right={<Btn theme={theme} sm tone="primary" icon="M12 5v14|M5 12h14" label="Nouveau" onClick={onNew} />} />
      {flows.length > 5 && (
        <div style={{ padding: '8px 12px 2px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un flow…" style={{ ...inputStyle, height: 28 }} />
        </div>
      )}
      <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 0 6px' }}>
        {!loading && flows.length === 0 && (
          <div style={{ padding: '12px 16px 16px', fontSize: 12, lineHeight: 1.6, color: '#8B8B94' }}>Aucun flow pour l'instant. Clique sur <b style={{ color: '#EDEDEF', fontWeight: 600 }}>Nouveau</b> pour en créer un — il sera sauvegardé ici.</div>
        )}
        {shown.map(f => {
          const on = f.id === activeId
          return (
            <div key={f.id} className={`fb-lib-row${on ? ' on' : ''}`} onClick={() => onOpen(f.id)} role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') onOpen(f.id) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 14px', cursor: 'pointer', borderLeft: `2px solid ${on ? theme.accent : 'transparent'}`, background: on ? 'rgba(255,255,255,0.05)' : undefined }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: on ? '#EDEDEF' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {f.blocks.slice(0, 7).map(b => <span key={b.id} title={BLOCK[b.type].label} style={{ width: 6, height: 6, borderRadius: 99, background: `rgb(${BLOCK[b.type].color})` }} />)}
                    {f.blocks.length === 0 && <span style={{ fontSize: 11.5, color: '#71717A' }}>vide</span>}
                  </span>
                  <span style={{ fontSize: 11.5, color: '#71717A', whiteSpace: 'nowrap' }}>· {ago(f.updatedAt)}</span>
                </div>
              </div>
              <span className="fb-lib-actions" style={{ display: 'flex', gap: 1 }}>
                {act('M8 8h12v12H8z|M4 16V4h12', 'Dupliquer', () => onDuplicate(f))}
                {act('M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6', 'Supprimer', () => onDelete(f), true)}
              </span>
            </div>
          )
        })}
        {flows.length > 0 && shown.length === 0 && <div style={{ padding: 16, fontSize: 12, color: '#71717A' }}>Aucun flow ne correspond.</div>}
      </div>
    </Panel>
  )
}

function NewFlowModal({ theme, preset, names, onClose, onCreate }: {
  theme: Theme; preset: number; names: string[]; onClose: () => void; onCreate: (name: string, types: BlockType[]) => void
}) {
  const [tpl, setTpl] = useState(preset)
  const [name, setName] = useState(preset >= 0 ? TEMPLATES[preset].name : '')
  const finalName = name.trim() || (tpl >= 0 ? TEMPLATES[tpl].name : 'Nouveau flow')
  const dup = names.some(n => n.trim().toLowerCase() === finalName.toLowerCase())
  const submit = () => onCreate(finalName, tpl >= 0 ? TEMPLATES[tpl].types : [])
  const options: { i: number; title: string; desc: string; types: BlockType[] }[] = [
    { i: -1, title: 'Flow vide', desc: 'Tu ajoutes les blocs toi-même', types: [] },
    ...TEMPLATES.map((t, i) => ({ i, title: t.name, desc: t.desc, types: t.types })),
  ]
  return (
    <Modal theme={theme} title="Nouveau flow" sub="Donne-lui un nom : il sera sauvegardé dans « Mes flows »." icon="M5 3h4v4H5z|M15 17h4v4h-4z|M7 7v4a2 2 0 0 0 2 2h6a2 2 0 0 1 2 2v2" width={580}
      onClose={onClose}
      footer={<>
        <Btn theme={theme} tone="ghost" label="Annuler" onClick={onClose} />
        <Btn theme={theme} tone="primary" icon="M20 6L9 17l-5-5" label="Créer et sauvegarder" onClick={submit} />
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Nom du flow" hint={dup ? 'Un flow porte déjà ce nom — tu peux quand même le créer.' : undefined}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="ex. Lancement comptes mode" maxLength={60} style={inputStyle} />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Point de départ</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {options.map(o => {
              const on = tpl === o.i
              return (
                <button key={o.i} onClick={() => { setTpl(o.i); if (!name.trim() || TEMPLATES.some(t => t.name === name.trim())) setName(o.i >= 0 ? o.title : '') }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: 12, borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: on ? 'rgba(255,255,255,0.05)' : '#111113', border: `1px solid ${on ? theme.selEdge : 'rgba(255,255,255,0.07)'}` }}>
                  <span style={{ display: 'flex', gap: 4, minHeight: 18 }}>
                    {o.types.length ? o.types.map((ty, k) => <BlockIcon key={k} def={ty} size={18} />) : <span style={{ fontSize: 11.5, color: '#71717A' }}>—</span>}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{o.title}</span>
                  <span style={{ fontSize: 12, color: '#8B8B94' }}>{o.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Inspecteur de bloc ───────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#71717A' }}>{hint}</span>}
    </label>
  )
}

function Seg<T extends string | number>({ theme, value, options, onChange }: { theme: Theme; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 7, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={e => { e.preventDefault(); onChange(v) }} style={{
          flex: 1, height: 26, padding: '0 6px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
          background: value === v ? 'rgba(255,255,255,0.08)' : 'transparent', color: value === v ? '#EDEDEF' : '#8B8B94',
        }}>{l}</button>
      ))}
    </div>
  )
}

function Range({ p, onChange, presets }: { p: BlockParams; onChange: (x: Partial<BlockParams>) => void; presets: [string, number, number][] }) {
  const num = (v: string) => Math.max(0, Math.min(600, Math.round(Number(v) || 0)))
  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {presets.map(([l, a, b]) => {
          const on = p.minMin === a && p.maxMin === b
          return <button key={l} onClick={e => { e.preventDefault(); onChange({ minMin: a, maxMin: b }) }} style={{ height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', border: `1px solid ${on ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.09)'}`, background: on ? 'rgba(255,255,255,0.08)' : 'transparent', color: on ? '#EDEDEF' : '#A1A1AA' }}>{l} · {a}–{b}</button>
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Minimum (min)"><input type="number" min={0} value={p.minMin ?? 0} onChange={e => onChange({ minMin: num(e.target.value) })} style={inputStyle} /></Field>
        <Field label="Maximum (min)"><input type="number" min={0} value={p.maxMin ?? 0} onChange={e => onChange({ maxMin: num(e.target.value) })} style={inputStyle} /></Field>
      </div>
    </>
  )
}

function MediaPick({ theme, count, kind, onPick }: { theme: Theme; count: number; kind: 'videos' | 'images'; onPick: () => void }) {
  const w = kind === 'videos' ? 'vidéo' : 'image'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 12px', borderRadius: 8, background: '#161618', border: `1px solid ${count ? 'rgba(255,255,255,0.09)' : 'rgba(248,113,113,0.3)'}` }}>
      <span style={{ flex: 1, fontSize: 13, color: count ? '#EDEDEF' : '#F87171', fontWeight: 500 }}>{count ? `${count} ${w}${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}` : `Aucune ${w}`}</span>
      <Btn theme={theme} sm tone="ghost" label={count ? 'Modifier' : 'Choisir'} onClick={onPick} />
    </div>
  )
}

// Interrupteur accessible (bouton, clavier, lecteur d'écran).
function Toggle({ theme, on, onChange, label, hint, disabled }: { theme: Theme; on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: disabled ? 0.45 : 1 }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{label}</span>
        {hint && <span style={{ fontSize: 11.5, lineHeight: 1.45, color: '#8B8B94' }}>{hint}</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 32, height: 18, padding: 2, borderRadius: 99, flexShrink: 0, boxSizing: 'border-box', background: on ? theme.accent : 'rgba(255,255,255,0.12)', transition: 'background .12s ease' }}>
        <span style={{ width: 14, height: 14, borderRadius: 99, background: '#fff' }} />
      </span>
    </button>
  )
}

function Inspector({ theme, block, index, bank, onChange, onPick, onRemove }: {
  theme: Theme; block: FlowBlock; index: number; bank: BankSummary | null
  onChange: (p: Partial<BlockParams>) => void; onPick: (k: 'videos' | 'images' | 'captions') => void; onRemove: () => void
}) {
  const def = BLOCK[block.type]
  const p = block.params
  const media = def.media
  const w = media === 'video' ? 'vidéo' : 'image'
  const src = p.source ?? 'pick'
  const modeSeg = (label = 'Répartition entre les comptes') => <Field label={label}><Seg<PoolMode> theme={theme} value={p.mode ?? 'seq'} options={[['seq', 'Dans l\'ordre'], ['random', 'Aléatoire']]} onChange={v => onChange({ mode: v })} /></Field>
  const num = (v: string) => Math.max(0, Math.min(1440, Number(v) || 0))

  const sourceField = media ? (
    <>
      <Field label={media === 'video' ? 'Source des vidéos' : 'Source des images'} hint={src === 'folder' ? `Au lancement, toutes les ${w}s du dossier sont utilisées (y compris celles ajoutées après).` : src === 'all' ? `Toutes les ${w}s de ta banque (${bank ? bank[media] : '…'}).` : undefined}>
        <Seg<MediaSource> theme={theme} value={src} options={[['pick', 'Choisir'], ['folder', 'Dossier'], ['all', 'Toute la banque']]} onChange={v => onChange({ source: v })} />
      </Field>
      {src === 'pick' && <MediaPick theme={theme} count={(media === 'video' ? p.videoIds : p.imageIds)?.length ?? 0} kind={media === 'video' ? 'videos' : 'images'} onPick={() => onPick(media === 'video' ? 'videos' : 'images')} />}
      {src === 'folder' && (
        <select value={p.folder ?? ''} onChange={e => onChange({ folder: e.target.value || undefined })} aria-label="Dossier de la banque"
          style={{ ...inputStyle, cursor: 'pointer', borderColor: p.folder ? 'rgba(255,255,255,0.09)' : 'rgba(248,113,113,0.35)' }}>
          <option value="" style={{ background: '#161618' }}>— Choisir un dossier —</option>
          {(bank?.folders ?? []).map(f => <option key={f.name} value={f.name} style={{ background: '#161618' }}>{f.name} · {f[media]} {w}{f[media] > 1 ? 's' : ''}</option>)}
          {p.folder && bank && !bank.folders.some(f => f.name === p.folder) && <option value={p.folder}>{p.folder} (introuvable)</option>}
        </select>
      )}
    </>
  ) : null

  let body: ReactNode = null
  switch (block.type) {
    case 'login':
      body = <div style={{ padding: 12, borderRadius: 8, background: '#161618', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12.5, lineHeight: 1.6, color: '#A1A1AA' }}>
        Les identifiants (email / mot de passe / clé 2FA) sont demandés au moment du lancement et ne sont <b style={{ color: '#EDEDEF', fontWeight: 600 }}>jamais enregistrés</b> dans le flow.
      </div>
      break
    case 'username': {
      const n = lines(p.usernames).length
      body = <Field label={`Noms d'utilisateur · @username (${n})`} hint={<>Un pseudo par ligne, attribués dans l'ordre aux comptes. <code style={{ fontFamily: MONO, color: '#A1A1AA' }}>{'{4}'}</code> = 4 chiffres aléatoires (ex. <code style={{ fontFamily: MONO, color: '#A1A1AA' }}>lea.mode{'{4}'}</code>). Lettres, chiffres, « . » et « _ » uniquement. Pour le nom affiché, utilise le bloc « Nom, bio &amp; lien ».</>}>
        <textarea rows={7} value={p.usernames ?? ''} onChange={e => onChange({ usernames: e.target.value })} placeholder={'lea.mode{4}\nclara.paris{3}'} style={{ ...areaStyle, fontFamily: MONO, fontSize: 12 }} />
      </Field>
      break
    }
    case 'avatar':
      body = <>{sourceField}{modeSeg()}</>
      break
    case 'bio':
      body = <>
        <Field label="Nom affiché · name (optionnel)" hint="Le nom en gras sur le profil, pas le @. Un par ligne. Vide = inchangé.">
          <textarea rows={2} value={p.names ?? ''} onChange={e => onChange({ names: e.target.value })} placeholder="Léa M." style={areaStyle} />
        </Field>
        <Field label={`Bios (${lines(p.bios).length})`} hint="Une bio par ligne — une est choisie pour chaque compte. Vide = inchangée.">
          <textarea rows={4} value={p.bios ?? ''} onChange={e => onChange({ bios: e.target.value })} placeholder={'✨ Mode & lifestyle · Paris\n🌸 Daily outfits'} style={areaStyle} />
        </Field>
        <Field label="Lien du profil (optionnel)"><input value={p.link ?? ''} onChange={e => onChange({ link: e.target.value })} placeholder="https://…" style={inputStyle} /></Field>
        {p.link?.trim() && <Field label="Titre du lien (optionnel)"><input value={p.linkTitle ?? ''} onChange={e => onChange({ linkTitle: e.target.value })} placeholder="Mon shop" style={inputStyle} /></Field>}
        {modeSeg()}
      </>
      break
    case 'warmup':
      body = <>
        <Range p={p} onChange={onChange} presets={[['Léger', 5, 8], ['Normal', 8, 15], ['Long', 20, 40]]} />
        <Field label={`Mots-clés (${lines(p.keyword).length})`} hint="Optionnel. Un par ligne : chaque compte en tire un au hasard. Vide = parcourt le fil Reels.">
          <textarea rows={3} value={p.keyword ?? ''} onChange={e => onChange({ keyword: e.target.value })} placeholder={'fashion\noutfit\nstreetwear'} style={areaStyle} />
        </Field>
      </>
      break
    case 'pause':
      body = <Range p={p} onChange={onChange} presets={[['Courte', 5, 10], ['Moyenne', 15, 30], ['Longue', 60, 120]]} />
      break
    case 'post':
      body = <>
        {sourceField}
        {modeSeg('Répartition des vidéos')}
        <Field label={`Légendes (${lines(p.captions).length})`} hint="Une légende par ligne. Vide = sans légende.">
          <textarea rows={4} value={p.captions ?? ''} onChange={e => onChange({ captions: e.target.value })} placeholder="Nouvelle vidéo 🔥 #fyp" style={areaStyle} />
        </Field>
        <Btn theme={theme} sm tone="ghost" icon="M4 19.5A2.5 2.5 0 0 1 6.5 17H20|M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" label="Importer depuis la banque de légendes" onClick={() => onPick('captions')} />
        <Field label="Répartition des légendes"><Seg<PoolMode> theme={theme} value={p.captionMode ?? p.mode ?? 'seq'} options={[['seq', 'Dans l\'ordre'], ['random', 'Aléatoire']]} onChange={v => onChange({ captionMode: v })} /></Field>
        <Toggle theme={theme} on={!!p.trial} onChange={v => onChange({ trial: v })} label="Reel d'essai" hint="Montré d'abord aux non-abonnés." />
        <Toggle theme={theme} on={!!p.removeAfter} onChange={v => onChange({ removeAfter: v })} label="Usage unique" hint="Chaque vidéo publiée part à la corbeille de la banque (restaurable 7 j) pour ne jamais être reposté." />
      </>
      break
    case 'story':
      body = <>
        {sourceField}
        <Field label="Lien du sticker">
          <Seg<'same' | 'perAccount'> theme={theme} value={p.linkMode ?? 'same'} options={[['same', 'Même lien pour tous'], ['perAccount', 'Un lien par compte']]} onChange={v => onChange({ linkMode: v })} />
        </Field>
        {(p.linkMode ?? 'same') === 'same'
          ? <input value={p.link ?? ''} onChange={e => onChange({ link: e.target.value })} placeholder="https://…" aria-label="Lien du sticker" style={{ ...inputStyle, borderColor: p.link?.trim() ? 'rgba(255,255,255,0.09)' : 'rgba(248,113,113,0.3)' }} />
          : <Field label={`Liens (${lines(p.links).length})`} hint="Un lien par ligne, dans l'ordre des comptes sélectionnés au lancement.">
              <textarea rows={4} value={p.links ?? ''} onChange={e => onChange({ links: e.target.value })} placeholder={'https://lien-compte-1\nhttps://lien-compte-2'} style={{ ...areaStyle, fontFamily: MONO, fontSize: 11.5 }} />
            </Field>}
        <Field label="Texte du sticker (optionnel)"><input value={p.linkText ?? ''} onChange={e => onChange({ linkText: e.target.value })} placeholder="Voir l'offre" style={inputStyle} /></Field>
        {modeSeg('Répartition des images')}
      </>
      break
  }
  const hasAdvanced = (p.delayMax ?? 0) > 0 || retriesOf(p) > 0 || (p.onError ?? 'inherit') !== 'inherit'
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <BlockIcon def={block.type} size={32} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{index + 1}.</span>
            <input value={p.label ?? ''} onChange={e => onChange({ label: e.target.value })} placeholder={def.label} aria-label="Nom du bloc" maxLength={40}
              style={{ flex: 1, minWidth: 0, height: 28, padding: '0 8px', marginLeft: -4, borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: '#161618', color: '#EDEDEF', fontSize: 13, fontWeight: 600, outline: 'none' }} />
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: '#8B8B94' }}>{def.hint}</div>
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Toggle theme={theme} on={isActive(block)} onChange={v => onChange({ disabled: !v })} label="Bloc activé" hint={isActive(block) ? undefined : 'Désactivé : gardé dans le flow mais sauté à l\'exécution (aucun crédit).'} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>{body}</div>
      <details className="fb-adv" open={hasAdvanced} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <summary style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', cursor: 'pointer', listStyle: 'none', fontSize: 13, fontWeight: 500, color: '#A1A1AA', userSelect: 'none' }}>
          <Icon d="M9 18l6-6-6-6" size={12} /> Options avancées
          {hasAdvanced && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: theme.accentText }}>personnalisé</span>}
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 16px' }}>
          <Field label="Délai aléatoire avant ce bloc (min)" hint="0 = aucun. Si le délai dépasse 3 min, le téléphone est éteint pendant l'attente.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" min={0} value={p.delayMin ?? 0} onChange={e => onChange({ delayMin: num(e.target.value) })} aria-label="Délai minimum" style={inputStyle} />
              <input type="number" min={0} value={p.delayMax ?? 0} onChange={e => onChange({ delayMax: num(e.target.value) })} aria-label="Délai maximum" style={inputStyle} />
            </div>
          </Field>
          <Field label="Nouvelles tentatives si échec">
            <Seg<number> theme={theme} value={retriesOf(p)} options={[[0, 'Aucune'], [1, '1'], [2, '2'], [3, '3']]} onChange={v => onChange({ retries: v })} />
          </Field>
          <Field label="Si ce bloc échoue malgré tout">
            <Seg<BlockOnError> theme={theme} value={p.onError ?? 'inherit'} options={[['inherit', 'Comme le flow'], ['stop', 'Arrêter'], ['continue', 'Continuer']]} onChange={v => onChange({ onError: v })} />
          </Field>
        </div>
      </details>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ flex: 1, fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{fmtMinutes(blockEstimate(block))}{def.credits ? ` · ${def.credits} crédit(s)/compte` : ''}</span>
        <Btn theme={theme} sm tone="danger" label="Supprimer" onClick={onRemove} />
      </div>
    </>
  )
}

function FlowSettings({ theme, flow, issues, groups, rotationConfigured, onPatch, onDelete }: {
  theme: Theme; flow: Flow; issues: string[]; groups: string[]; rotationConfigured: boolean
  onPatch: (p: Partial<Flow>) => void; onDelete: () => void
}) {
  const d = flow.defaults ?? {}
  const setD = (x: Partial<FlowDefaults>) => onPatch({ defaults: { ...d, ...x } })
  const sel = new Set(d.groups ?? [])
  return (
    <>
      <PanelHead title="Réglages du flow" sub="Clique un bloc pour le configurer" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
        <Field label="Description (optionnel)">
          <textarea rows={2} value={flow.description ?? ''} onChange={e => onPatch({ description: e.target.value })} placeholder="À quoi sert ce flow…" style={areaStyle} />
        </Field>
        <Field label="Si un bloc échoue sur un compte" hint={flow.onError === 'stop' ? 'Les blocs suivants sont sautés pour ce compte (chaque bloc peut avoir son propre réglage).' : 'Les blocs suivants sont quand même joués (chaque bloc peut avoir son propre réglage).'}>
          <Seg<'stop' | 'continue'> theme={theme} value={flow.onError} options={[['stop', 'Arrêter ce compte'], ['continue', 'Continuer']]} onChange={v => onPatch({ onError: v })} />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>Lancement par défaut</span>
          <Field label="Comptes en parallèle">
            <Seg<number> theme={theme} value={d.concurrency ?? 3} options={[[1, '1'], [3, '3'], [5, '5'], [10, '10'], [20, '20']]} onChange={v => setD({ concurrency: v })} />
          </Field>
          <Toggle theme={theme} on={!!d.rotation && rotationConfigured} disabled={!rotationConfigured} onChange={v => setD({ rotation: v })} label="Rotation d'IP proxy"
            hint={rotationConfigured ? 'IP changée avant chaque compte (un compte à la fois).' : 'Aucun proxy rotatif configuré (Réglages).'} />
          {groups.length > 0 && (
            <Field label="Groupes présélectionnés" hint="Les comptes de ces groupes sont cochés à l'ouverture de « Lancer ».">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groups.map(g => {
                  const on = sel.has(g)
                  return (
                    <button key={g} type="button" aria-pressed={on} onClick={() => { const n = new Set(sel); on ? n.delete(g) : n.add(g); setD({ groups: [...n] }) }}
                      style={{ height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, border: `1px solid ${on ? theme.selEdge : 'rgba(255,255,255,0.09)'}`, background: on ? 'rgba(255,255,255,0.07)' : 'transparent', color: on ? '#EDEDEF' : '#A1A1AA' }}>{on ? '✓ ' : ''}{g}</button>
                  )
                })}
              </div>
            </Field>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Vérification</span>
          {issues.length === 0 ? (
            <span style={{ fontSize: 13, color: '#4ADE80' }}>✓ Prêt à lancer</span>
          ) : issues.map((s, i) => <span key={i} style={{ fontSize: 12, lineHeight: 1.5, color: '#F87171' }}>• {s}</span>)}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: '#8B8B94' }}>
          Chaque compte démarre <b style={{ color: '#EDEDEF', fontWeight: 600 }}>une seule fois</b>, enchaîne tous les blocs actifs, puis s'éteint — même en cas d'échec ou d'annulation. Raccourcis : <b style={{ color: '#EDEDEF', fontWeight: 600 }}>Suppr</b> retire le bloc sélectionné, <b style={{ color: '#EDEDEF', fontWeight: 600 }}>Échap</b> désélectionne.
        </div>
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
        <Btn theme={theme} sm tone="danger" label="Supprimer le flow" onClick={onDelete} />
      </div>
    </>
  )
}

// ── Lancement ────────────────────────────────────────────────────────────────

// Une ligne d'identifiants : « email:motdepasse:CLÉ2FA » (ou séparés par ; | tab).
// Le mot de passe peut contenir « : » → la clé 2FA n'est prise en fin de ligne que
// si elle ressemble à du base32.
function parseCredLine(l: string): Creds | null {
  const t = l.trim()
  if (!t) return null
  const sep = t.includes('\t') ? '\t' : t.includes(';') ? ';' : t.includes('|') ? '|' : ':'
  const parts = t.split(sep).map(s => sep === ':' ? s : s.trim())
  if (parts.length < 2) return null
  const email = parts[0].trim()
  let totp = ''
  let rest = parts.slice(1)
  const last = rest[rest.length - 1].replace(/\s/g, '')
  if (rest.length >= 2 && /^[A-Z2-7]{16,}=*$/i.test(last)) { totp = last; rest = rest.slice(0, -1) }
  const password = rest.join(sep)
  return email && password ? { email, password, totp } : null
}

function LaunchModal({ theme, flow, phones, bearer, bank, ownerId, orgId, userId, onClose, onLaunched }: {
  theme: Theme; flow: Flow; phones: Phone[]; bearer: string; bank: BankSummary | null; ownerId: string; orgId: string | null; userId: string
  onClose: () => void; onLaunched: () => void
}) {
  // Pré-rempli avec les réglages par défaut du flow (groupes, parallèle, rotation).
  const defaults = flow.defaults ?? {}
  const [sel, setSel] = useState<Set<string>>(() => new Set(defaults.groups?.length ? phones.filter(p => p.group_name && defaults.groups!.includes(p.group_name)).map(p => p.id) : []))
  const [group, setGroup] = useState('Tous')
  const [q, setQ] = useState('')
  const [conc, setConc] = useState(defaults.concurrency ?? 3)
  const [rotationConfigured, setRotationConfigured] = useState(false)
  const [rotationOn, setRotationOn] = useState(false)
  const [credText, setCredText] = useState('')
  const [busy, setBusy] = useState(false)
  const needsLogin = flow.blocks.some(b => isActive(b) && b.type === 'login')

  useEffect(() => {
    loadProxyRotation(orgId, userId).then(c => {
      const ok = c.enabled && c.urls.some(u => /^https?:\/\//i.test(u.trim()))
      setRotationConfigured(ok); setRotationOn(ok && !!defaults.rotation)
    })
  }, [orgId, userId])

  const groups = ['Tous', ...[...new Set(phones.map(p => p.group_name).filter(Boolean) as string[])].sort()]
  const shown = phones.filter(p => (group === 'Tous' || p.group_name === group) && (!q.trim() || phoneLabel(p).toLowerCase().includes(q.trim().toLowerCase())))
  const chosen = phones.filter(p => sel.has(p.id))
  const credLines = lines(credText)
  const creds: Record<string, Creds> = {}
  chosen.forEach((p, i) => { const c = credLines[i] ? parseCredLine(credLines[i]) : null; if (c) creds[p.id] = c })
  const nCreds = Object.keys(creds).length
  const issues = validateFlow(flow, chosen.length, needsLogin ? creds : undefined, chosen.map(p => p.id), bank ?? undefined)
  if (chosen.length === 0) issues.unshift('Sélectionne au moins un compte.')
  const perAcc = flowCredits(flow)
  const est = estimateFlow(flow)
  const effConc = rotationOn ? 1 : Math.min(conc, Math.max(1, chosen.length))
  const waves = Math.ceil(chosen.length / Math.max(1, effConc))
  const total: [number, number] = [est[0] * waves, est[1] * waves]

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allShown = shown.length > 0 && shown.every(p => sel.has(p.id))

  async function launch() {
    if (issues.length || busy) return
    setBusy(true)
    await loadProxyRotation(orgId, userId)
    const rot = rotationOn ? resolveRotationUrls() : []
    await runFlow({
      bearer, flow, creds, concurrency: conc, creditOwnerId: ownerId, scope: { orgId, userId },
      rotationUrls: rot.length ? rot : undefined,
      targets: chosen.map(p => ({ key: p.id, geelarkId: p.geelark_id!, name: phoneLabel(p), username: p.ig_username ?? undefined })),
    })
    setBusy(false)
    onLaunched()
  }

  return (
    <Modal theme={theme} title={`Lancer « ${flow.name} »`} sub={`${flow.blocks.length} bloc(s) · ≈ ${fmtMinutes(est)} par compte`} icon="M5 3l14 9-14 9V3z" width={720} onClose={onClose}
      footer={<>
        <span style={{ flex: 1, fontSize: 12, color: issues.length ? '#F87171' : '#71717A' }}>
          {issues.length ? issues[0] : <>{chosen.length} compte(s) · {perAcc ? <b style={{ color: '#EDEDEF', fontWeight: 600 }}>{perAcc * chosen.length} crédits</b> : 'gratuit'} · fin estimée ≈ {fmtMinutes(total)}</>}
        </span>
        <Btn theme={theme} tone="ghost" label="Annuler" onClick={onClose} />
        <Btn theme={theme} tone="primary" icon="M5 3l14 9-14 9V3z" label={busy ? 'Lancement…' : `Lancer sur ${chosen.length} compte(s)`} disabled={issues.length > 0 || busy} onClick={launch} />
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
        {/* Comptes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…" style={{ ...inputStyle, flex: 1 }} />
            <select value={group} onChange={e => setGroup(e.target.value)} style={{ ...inputStyle, width: 160, cursor: 'pointer' }}>
              {groups.map(g => <option key={g} value={g} style={{ background: '#161618' }}>{g === 'Tous' ? 'Tous les groupes' : g}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94', fontVariantNumeric: 'tabular-nums' }}>{chosen.length} / {phones.length} sélectionné(s)</span>
            <button onClick={() => setSel(s => { const n = new Set(s); shown.forEach(p => allShown ? n.delete(p.id) : n.add(p.id)); return n })} style={{ border: 'none', background: 'transparent', color: theme.accentText, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{allShown ? 'Tout retirer' : 'Tout sélectionner'}</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
            {shown.length === 0 ? <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#71717A' }}>Aucun téléphone GeeLark.</div> : shown.map(p => {
              const on = sel.has(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', borderLeft: `2px solid ${on ? theme.accent : 'transparent'}`, background: on ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box', background: on ? theme.accent : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 9, fontWeight: 600 }}>{on ? '✓' : ''}</span>
                  <StatusDot kind={p.status === 'warming' ? 'warmup' : p.status} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: on ? '#EDEDEF' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Réglages du run */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <Field label="Comptes en parallèle" hint={rotationOn ? 'Rotation d\'IP active → un compte à la fois (sinon la rotation couperait les autres).' : 'Plus = plus rapide. Limité par ton forfait GeeLark (téléphones simultanés).'}>
            <Seg<number> theme={theme} value={rotationOn ? 1 : conc} options={[[1, '1'], [3, '3'], [5, '5'], [10, '10'], [20, '20']]} onChange={v => setConc(v)} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>Rotation d'IP proxy</span>
              <span style={{ fontSize: 11.5, color: '#8B8B94' }}>{rotationConfigured ? 'IP changée avant le démarrage de chaque compte' : 'Aucun proxy rotatif configuré (Réglages)'}</span>
            </span>
            <span onClick={() => rotationConfigured && setRotationOn(v => !v)} role="switch" aria-checked={rotationOn}
              style={{ display: 'flex', alignItems: 'center', justifyContent: rotationOn ? 'flex-end' : 'flex-start', width: 32, height: 18, padding: 2, borderRadius: 99, flexShrink: 0, boxSizing: 'border-box', cursor: rotationConfigured ? 'pointer' : 'not-allowed', opacity: rotationConfigured ? 1 : 0.4, background: rotationOn ? theme.accent : 'rgba(255,255,255,0.12)', transition: 'background .12s ease' }}>
              <span style={{ width: 14, height: 14, borderRadius: 99, background: '#fff' }} />
            </span>
          </div>
          {needsLogin && (
            <Field label={`Identifiants (${nCreds}/${chosen.length})`} hint={<>Une ligne par compte, <b>dans l'ordre de la sélection</b> : <code style={{ fontFamily: MONO }}>email:motdepasse:CLÉ2FA</code> (2FA optionnelle, séparateurs « ; » ou tabulation acceptés). Jamais enregistrés.</>}>
              <textarea rows={6} value={credText} onChange={e => setCredText(e.target.value)} placeholder={'lea@mail.com:MotDePasse1:JBSWY3DPEHPK3PXP\nclara@mail.com:MotDePasse2'} spellCheck={false} style={{ ...areaStyle, fontFamily: MONO, fontSize: 11.5 }} />
            </Field>
          )}
          {needsLogin && chosen.length > 0 && (
            <div style={{ maxHeight: 110, overflowY: 'auto', fontSize: 11, lineHeight: 1.7, color: '#71717A', fontFamily: MONO }}>
              {chosen.map((p, i) => <div key={p.id} style={{ color: creds[p.id] ? '#A1A1AA' : '#F87171', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {phoneLabel(p)} → {creds[p.id]?.email ?? 'manquant'}</div>)}
            </div>
          )}
          {issues.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {issues.slice(1, 5).map((s, i) => <span key={i} style={{ fontSize: 12, color: '#F87171' }}>• {s}</span>)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Exécutions en direct ─────────────────────────────────────────────────────

const STEP_COLOR: Record<StepStatus, string> = { pending: 'rgba(255,255,255,0.1)', running: '#FBBF24', ok: '#4ADE80', failed: '#F87171', skipped: 'rgba(255,255,255,0.04)' }
const PHONE_TONE = { pending: 'mute', booting: 'warn', running: 'warn', done: 'ok', failed: 'bad', cancelled: 'mute' } as const
const PHONE_LABEL = { pending: 'En attente', booting: 'Démarrage', running: 'En cours', done: 'Terminé', failed: 'Échec', cancelled: 'Annulé' } as const

function RunsPanel({ theme, runs }: { theme: Theme; runs: FlowRun[] }) {
  if (runs.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {runs.map(r => <RunCard key={r.id} theme={theme} run={r} />)}
    </div>
  )
}

function RunCard({ theme, run }: { theme: Theme; run: FlowRun }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'failed'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const done = run.phones.filter(p => p.status === 'done').length
  const failed = run.phones.filter(p => p.status === 'failed').length
  const active = run.status === 'preparing' || run.status === 'running'
  const list = run.phones.filter(p => filter === 'all' || (filter === 'failed' ? p.status === 'failed' : p.status === 'booting' || p.status === 'running'))
  const LIMIT = 150
  const elapsed = Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 60_000)
  return (
    <Panel theme={theme}>
      <PanelHead
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{run.flowName}<Chip text={run.status === 'preparing' ? 'Préparation' : run.status === 'running' ? 'En cours' : run.status === 'done' ? 'Terminé' : run.status === 'cancelled' ? 'Annulé' : 'Erreur'} tone={active ? 'warn' : run.status === 'done' ? 'ok' : run.status === 'error' ? 'bad' : 'mute'} /></span>}
        sub={`${done} OK · ${failed} échec(s) · ${run.phones.length} compte(s) · ${elapsed} min`}
        right={<span style={{ display: 'flex', gap: 6 }}>
          {active
            ? <Btn theme={theme} sm tone="danger" label="Arrêter" onClick={() => cancelRun(run.handleId)} />
            : <Btn theme={theme} sm tone="quiet" label="Masquer" onClick={() => dismissFlowRun(run.id)} />}
        </span>}
      />
      {/* Progression globale */}
      <div style={{ height: 3, margin: '12px 16px 0', borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
        <span style={{ width: `${(done / Math.max(1, run.phones.length)) * 100}%`, background: '#4ADE80', transition: 'width .3s ease' }} />
        <span style={{ width: `${(failed / Math.max(1, run.phones.length)) * 100}%`, background: '#F87171', transition: 'width .3s ease' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, margin: '12px 16px 8px', padding: 2, width: 'fit-content', borderRadius: 7, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
        {([['all', 'Tous'], ['active', 'En cours'], ['failed', `Échecs${failed ? ` (${failed})` : ''}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ height: 24, padding: '0 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filter === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: filter === k ? '#EDEDEF' : '#8B8B94' }}>{l}</button>
        ))}
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {list.slice(0, LIMIT).map(p => {
          const isOpen = open === p.key
          const curLabel = p.status === 'booting' ? 'Démarrage du téléphone' : p.current >= 0 && p.status === 'running' ? blockName(run.blocks[p.current]) : ''
          const err = p.errors.find(Boolean)
          return (
            <div key={p.key} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={() => setOpen(isOpen ? null : p.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 44, padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {p.steps.map((s, i) => (
                    <span key={i} title={`${i + 1}. ${blockName(run.blocks[i])} — ${s}${p.errors[i] ? ` : ${p.errors[i]}` : ''}`}
                      style={{ width: 16, height: 6, borderRadius: 2, background: STEP_COLOR[s], animation: s === 'running' ? 'aPulse 1.4s ease-in-out infinite' : undefined }} />
                  ))}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: err && p.status === 'failed' ? '#F87171' : '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.status === 'failed' && err ? err : curLabel}
                </span>
                <Chip text={PHONE_LABEL[p.status]} tone={PHONE_TONE[p.status]} />
              </button>
              {isOpen && (
                <div style={{ margin: '0 16px 12px', padding: '8px 12px', borderRadius: 6, background: '#0C0C0E', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 220, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
                  {p.logs.length ? p.logs.join('\n') : 'En attente…'}
                </div>
              )}
            </div>
          )
        })}
        {list.length > LIMIT && <div style={{ padding: '10px 16px', fontSize: 12, color: '#71717A', borderTop: '1px solid rgba(255,255,255,0.05)' }}>… et {list.length - LIMIT} autre(s) — filtre « En cours » ou « Échecs » pour les voir.</div>}
      </div>
      {run.log.length > 0 && (
        <div style={{ margin: '4px 16px 16px', padding: '8px 12px', borderRadius: 6, background: '#0C0C0E', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 90, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: '#71717A', whiteSpace: 'pre-wrap' }}>
          {run.log.join('\n')}
        </div>
      )}
    </Panel>
  )
}
