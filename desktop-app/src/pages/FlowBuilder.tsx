import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  type Flow, type FlowBlock, type BlockType, type BlockParams, type Creds, type FlowRun, type StepStatus, type PoolMode,
} from '@/lib/flowEngine'

interface Phone { id: string; ig_username: string | null; phone_name: string; status: string; geelark_id: string | null; group_name: string | null }
type Drag = { kind: 'new'; type: BlockType } | { kind: 'move'; from: number }

const MONO = "'JetBrains Mono',monospace"
const inputStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }
const areaStyle: CSSProperties = { ...inputStyle, height: 'auto', padding: 10, resize: 'vertical', lineHeight: 1.5 }

// Mise en page responsive (les styles inline n'ont pas de media queries).
const LAYOUT_CSS = `
.fb-grid{display:grid;grid-template-columns:210px minmax(0,1fr) 320px;gap:10px;align-items:start}
@media (max-width:1180px){.fb-grid{grid-template-columns:minmax(0,1fr) 300px}.fb-palette{grid-column:1 / -1}}
@media (max-width:860px){.fb-grid{grid-template-columns:minmax(0,1fr)}}
.fb-card .fb-actions{opacity:0;transition:opacity .12s ease}
.fb-card:hover .fb-actions,.fb-card.sel .fb-actions{opacity:1}
.fb-pal-item:hover{background:rgba(255,255,255,0.04)!important}
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
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overSlot, setOverSlot] = useState<number | null>(null)
  const [insertMenu, setInsertMenu] = useState<number | null>(null)
  const [picker, setPicker] = useState<{ blockId: string; kind: 'videos' | 'images' } | null>(null)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [phones, setPhones] = useState<Phone[]>([])
  const runs = useFlowRuns()
  const runsRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flow = flows.find(f => f.id === flowId) ?? null

  useEffect(() => {
    let alive = true
    loadFlows(user.id).then(fs => {
      if (!alive) return
      setFlows(fs); setFlowId(fs[0]?.id ?? null); setFlowsLoading(false)
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
    const nf = newFlow(name, types)
    setFlows(fs => [nf, ...fs]); setFlowId(nf.id); setSel(nf.blocks[0]?.id ?? null)
    persist(nf, true)
  }
  async function removeFlow() {
    if (!flow || !window.confirm(`Supprimer le flow « ${flow.name} » ?`)) return
    await deleteFlow(flow.id, user.id)
    const rest = flows.filter(f => f.id !== flow.id)
    setFlows(rest); setFlowId(rest[0]?.id ?? null); setSel(null)
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
  const issues = useMemo(() => flow ? validateFlow(flow, 0) : [], [flow])
  const blockIssue = (b: FlowBlock) => {
    const s = flow ? validateFlow({ ...flow, blocks: [b] }, 0)[0]?.replace(/^Bloc 1 \([^)]*\) : /, '') : undefined
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

      {/* Mes flows (onglets) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {flows.map(f => {
          const on = f.id === flowId
          return (
            <button key={f.id} onClick={() => { setFlowId(f.id); setSel(null) }} style={{
              display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 8, flexShrink: 0, cursor: 'pointer',
              background: on ? `rgba(${theme.tone},0.14)` : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? theme.selEdge : 'rgba(255,255,255,0.06)'}`,
              color: on ? theme.accentText : '#A1A1AA', fontSize: 12, fontWeight: 700,
            }}>
              {f.name}<span style={{ fontFamily: MONO, fontSize: 10, color: on ? theme.accentText : '#52525B', opacity: 0.8 }}>{f.blocks.length}</span>
            </button>
          )
        })}
        <button onClick={() => createFlow(`Flow ${flows.length + 1}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, flexShrink: 0, cursor: 'pointer', background: 'transparent', border: '1px dashed rgba(255,255,255,0.14)', color: '#A1A1AA', fontSize: 12, fontWeight: 700 }}>
          <Icon d="M12 5v14|M5 12h14" size={12} /> Nouveau flow
        </button>
      </div>

      {!bearer && !conns.loading && (
        <div style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 9, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#FBBF24', fontSize: 12 }}>
          Connecte d'abord ton compte GeeLark (token) dans les Réglages pour pouvoir lancer un flow.
        </div>
      )}

      <div className="fb-grid">
        {/* ── Palette ── */}
        <div className="fb-palette">
          <Panel theme={theme}>
            <PanelHead title="Blocs" sub="Glisse ou clique pour ajouter" />
            <div style={{ padding: '6px 0 8px' }}>
              {(['Compte', 'Activité', 'Contenu'] as const).map(g => (
                <div key={g}>
                  <div style={{ padding: '8px 14px 4px', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#52525B' }}>{g}</div>
                  {BLOCKS.filter(b => b.group === g).map(b => (
                    <div key={b.type} className="fb-pal-item" draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', b.type); setDrag({ kind: 'new', type: b.type }) }}
                      onDragEnd={() => { setDrag(null); setOverSlot(null) }}
                      onClick={() => addBlock(b.type)}
                      title={b.hint}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', cursor: 'grab', userSelect: 'none' }}>
                      <BlockIcon def={b.type} size={24} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: '#D4D4D8' }}>{b.label}</span>
                      {b.credits > 0 && <span style={{ fontFamily: MONO, fontSize: 9.5, color: '#71717A' }}>{b.credits}cr</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Canvas ── */}
        <Panel theme={theme} style={{ overflow: 'hidden' }}>
          {flow ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
              <input value={flow.name} onChange={e => update(f => ({ ...f, name: e.target.value }))} aria-label="Nom du flow"
                style={{ flex: 1, minWidth: 140, height: 30, padding: '0 8px', marginLeft: -8, borderRadius: 7, border: '1px solid transparent', background: 'transparent', color: '#F4F4F6', fontSize: 14, fontWeight: 700, outline: 'none' }}
                onFocus={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)' }}
                onBlur={e => { e.currentTarget.style.border = '1px solid transparent' }} />
              <Chip text={`≈ ${fmtMinutes(est)} / compte`} tone="mute" />
              <Chip text={credits > 0 ? `${credits} crédit${credits > 1 ? 's' : ''} / compte` : 'Gratuit'} tone={credits > 0 ? 'violet' : 'ok'} />
            </div>
          ) : null}
          <div onClick={e => { if (e.target === e.currentTarget) { setSel(null); setInsertMenu(null) } }}
            style={{
              position: 'relative', minHeight: 520, maxHeight: 'calc(100vh - 290px)', overflow: 'auto',
              backgroundColor: 'rgba(0,0,0,0.18)', backgroundImage: 'radial-gradient(rgba(255,255,255,0.075) 1px, transparent 1px)', backgroundSize: '18px 18px',
            }}>
            {flowsLoading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
            ) : !flow ? (
              <EmptyState theme={theme} onTemplate={(n, t) => createFlow(n, t)} />
            ) : (
              <div onClick={e => { if (e.target === e.currentTarget) { setSel(null); setInsertMenu(null) } }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px 16px 70px', transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform .15s ease' }}>
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
              <div style={{ position: 'sticky', bottom: 10, left: 10, display: 'flex', gap: 2, width: 'fit-content', marginLeft: 10, marginTop: -44, padding: 3, borderRadius: 8, background: '#16161C', border: '1px solid rgba(255,255,255,0.08)' }}>
                {([['M12 5v14|M5 12h14', () => setZoom(z => Math.min(1.3, +(z + 0.1).toFixed(2))), 'Zoom +'],
                   ['M5 12h14', () => setZoom(z => Math.max(0.6, +(z - 0.1).toFixed(2))), 'Zoom −'],
                   ['M15 3h6v6|M9 21H3v-6|M21 3l-7 7|M3 21l7-7', () => setZoom(1), 'Taille réelle']] as [string, () => void, string][]).map(([d, fn, t]) => (
                  <button key={t} onClick={fn} title={t} aria-label={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: '#A1A1AA', cursor: 'pointer' }}>
                    <Icon d={d} size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* ── Inspecteur ── */}
        <Panel theme={theme}>
          {selBlock && flow ? (
            <Inspector theme={theme} block={selBlock} index={flow.blocks.indexOf(selBlock)}
              onChange={patch => setParams(selBlock.id, patch)}
              onPick={kind => setPicker({ blockId: selBlock.id, kind })}
              onRemove={() => removeBlock(selBlock.id)} />
          ) : flow ? (
            <FlowSettings theme={theme} flow={flow} issues={issues}
              onError={v => update(f => ({ ...f, onError: v }))}
              onDelete={removeFlow} />
          ) : (
            <div style={{ padding: 22, fontSize: 12, color: '#52525B', lineHeight: 1.6 }}>Crée un flow ou choisis un modèle pour commencer.</div>
          )}
        </Panel>
      </div>

      {/* ── Exécutions ── */}
      <div ref={runsRef} style={{ marginTop: 14 }}>
        <RunsPanel theme={theme} runs={runs} />
      </div>

      {picker && flow && (() => {
        const b = flow.blocks.find(x => x.id === picker.blockId)
        if (!b) return null
        const ids = picker.kind === 'videos' ? b.params.videoIds ?? [] : b.params.imageIds ?? []
        return (
          <BankPicker theme={theme} user={user} org={org} kind={picker.kind} multi initialIds={ids}
            title={picker.kind === 'videos' ? 'Vidéos à publier' : 'Images'}
            onClose={() => setPicker(null)}
            onApply={r => {
              if (r.kind === 'videos') setParams(b.id, { videoIds: r.ids })
              else if (r.kind === 'images') setParams(b.id, { imageIds: r.ids })
              setPicker(null)
            }} />
        )
      })()}

      {launchOpen && flow && bearer && (
        <LaunchModal theme={theme} flow={flow} phones={phones} bearer={bearer}
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
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0, background: `rgba(${b.color},0.13)`, border: `1px solid rgba(${b.color},0.3)`, color: `rgb(${b.color})` }}>
      <Icon d={b.icon} size={Math.round(size * 0.5)} />
    </span>
  )
}

function SaveBadge({ state, error }: { state: 'idle' | 'saving' | 'saved' | 'error'; error: string | null }) {
  if (state === 'idle') return null
  const t = state === 'saving' ? 'Enregistrement…' : state === 'saved' ? 'Enregistré' : `Erreur : ${error ?? ''}`
  return <span style={{ alignSelf: 'center', fontSize: 11.5, fontWeight: 600, color: state === 'error' ? '#F87171' : state === 'saved' ? '#34D399' : '#71717A' }}>{state === 'saved' ? '✓ ' : ''}{t}</span>
}

function Terminal({ label, sub, icon }: { label: string; sub: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px 0 10px', borderRadius: 99, background: '#141419', border: '1px solid rgba(255,255,255,0.09)', color: '#A1A1AA', fontSize: 11.5, fontWeight: 600 }}>
      <span style={{ display: 'flex', color: '#71717A' }}><Icon d={icon} size={11} /></span>
      {label}<span style={{ fontFamily: MONO, fontSize: 10, color: '#52525B' }}>{sub}</span>
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
      <span style={{ flex: 1, width: 0, borderLeft: `1.5px dashed ${over ? theme.accent : 'rgba(255,255,255,0.16)'}` }} />
      {over && <span style={{ position: 'absolute', top: '50%', left: 20, right: 20, height: 26, marginTop: -13, borderRadius: 8, border: `1.5px dashed ${theme.accent}`, background: `rgba(${theme.tone},0.08)` }} />}
      {!active && (
        <button onClick={e => { e.stopPropagation(); onPlus(index) }} aria-label="Insérer un bloc" title="Insérer un bloc ici"
          style={{ position: 'absolute', top: '50%', marginTop: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 99, border: `1px solid ${menuOpen ? theme.selEdge : 'rgba(255,255,255,0.14)'}`, background: menuOpen ? `rgba(${theme.tone},0.2)` : '#141419', color: menuOpen ? theme.accentText : '#71717A', cursor: 'pointer', padding: 0 }}>
          <Icon d="M12 5v14|M5 12h14" size={10} sw={2.2} />
        </button>
      )}
      {menuOpen && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: 18, marginTop: -14, zIndex: 20, width: 200, padding: 5, borderRadius: 10, background: '#18181F', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 18px 40px -12px rgba(0,0,0,0.7)', animation: 'aPop .14s ease both' }}>
          {BLOCKS.map(b => (
            <button key={b.type} onClick={() => onPick(b.type, index)} className="fb-pal-item"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <BlockIcon def={b.type} size={20} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#D4D4D8' }}>{b.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function summary(b: FlowBlock): string {
  const p = b.params
  const mode = p.mode === 'random' ? 'aléatoire' : 'dans l\'ordre'
  switch (b.type) {
    case 'login': return 'Identifiants demandés au lancement'
    case 'username': { const l = lines(p.usernames); return l.length === 0 ? 'Aucun pseudo' : l.length === 1 ? `@${l[0]}` : `${l.length} pseudos` }
    case 'avatar': return `${p.imageIds?.length ?? 0} image(s) · ${mode}`
    case 'bio': { const n = lines(p.bios).length; return [n ? `${n} bio(s)` : '', lines(p.names).length ? 'nom' : '', p.link?.trim() ? 'lien' : ''].filter(Boolean).join(' · ') || 'Vide' }
    case 'warmup': return `${p.minMin ?? 0}–${p.maxMin ?? 0} min${p.keyword?.trim() ? ` · « ${p.keyword.trim()} »` : ''}`
    case 'pause': return `${p.minMin ?? 0}–${p.maxMin ?? 0} min${(p.minMin ?? 0) >= 3 ? ' · tél. éteint' : ''}`
    case 'post': return `${p.videoIds?.length ?? 0} vidéo(s) · ${lines(p.captions).length} légende(s)${p.trial ? ' · essai' : ''}`
    case 'story': { let host = ''; try { host = p.link ? new URL(p.link).host : '' } catch { host = p.link ?? '' } return `${p.imageIds?.length ?? 0} image(s)${host ? ` · ${host}` : ' · sans lien'}` }
  }
}

function BlockCard({ theme, block, index, selected, issue, onSelect, onDragStart, onDragEnd, onUp, onDown, onDuplicate, onRemove }: {
  theme: Theme; block: FlowBlock; index: number; selected: boolean; issue?: string
  onSelect: () => void; onDragStart: () => void; onDragEnd: () => void
  onUp?: () => void; onDown?: () => void; onDuplicate: () => void; onRemove: () => void
}) {
  const def = BLOCK[block.type]
  const act = (d: string, fn: (() => void) | undefined, t: string, danger = false) => (
    <button onClick={e => { e.stopPropagation(); fn?.() }} disabled={!fn} title={t} aria-label={t}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: danger ? '#F87171' : '#71717A', cursor: fn ? 'pointer' : 'default', opacity: fn ? 1 : 0.3, padding: 0 }}>
      <Icon d={d} size={12} />
    </button>
  )
  return (
    <div className={`fb-card${selected ? ' sel' : ''}`} draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.id); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); onSelect() }}
      style={{
        width: 290, borderRadius: 12, cursor: 'pointer', background: '#15151B',
        border: `1px solid ${selected ? `rgba(${def.color},0.55)` : issue ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: selected ? `0 0 0 3px rgba(${def.color},0.12), 0 14px 30px -18px rgba(0,0,0,0.9)` : '0 10px 24px -18px rgba(0,0,0,0.9)',
        transition: 'border-color .12s ease, box-shadow .12s ease',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 10px 10px 12px' }}>
        <BlockIcon def={block.type} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: `rgba(${def.color},0.85)` }}>⚡ Automatisation · Instagram</div>
          <div style={{ marginTop: 2, fontSize: 13.5, fontWeight: 700, color: '#F4F4F6' }}>{def.label}</div>
          <div style={{ marginTop: 1, fontFamily: MONO, fontSize: 10.5, color: '#71717A' }}>{fmtMinutes(def.estimate(block.params))}{def.credits > 0 ? ` · ${def.credits} cr` : ''}</div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: '#3F3F46' }}>{index + 1}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 7px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: issue ? '#F87171' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issue ?? summary(block)}>
          {issue ? `⚠ ${issue}` : summary(block)}
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

function EmptyState({ theme, onTemplate }: { theme: Theme; onTemplate: (name: string, types: BlockType[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '56px 20px', textAlign: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 13, background: `rgba(${theme.tone},0.12)`, border: `1px solid rgba(${theme.tone},0.26)`, color: theme.accentText }}>
        <Icon d="M5 3h4v4H5z|M15 17h4v4h-4z|M7 7v4a2 2 0 0 0 2 2h6a2 2 0 0 1 2 2v2" size={22} />
      </span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F4F4F6' }}>Crée ton premier flow</div>
        <div style={{ marginTop: 5, fontSize: 12.5, color: '#71717A' }}>Pars d'un modèle ou glisse des blocs depuis la gauche.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {TEMPLATES.map(t => (
          <button key={t.name} onClick={() => onTemplate(t.name, t.types)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, width: 190, padding: 12, borderRadius: 11, cursor: 'pointer', textAlign: 'left', background: '#15151B', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ display: 'flex', gap: 3 }}>{t.types.map((ty, i) => <BlockIcon key={i} def={ty} size={20} />)}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#E4E4E7' }}>{t.name}</span>
            <span style={{ fontSize: 11, color: '#71717A' }}>{t.desc}</span>
          </button>
        ))}
        <button onClick={() => onTemplate('Nouveau flow', [])} style={{ width: 120, padding: 12, borderRadius: 11, cursor: 'pointer', background: 'transparent', border: '1px dashed rgba(255,255,255,0.14)', color: '#A1A1AA', fontSize: 12, fontWeight: 700 }}>Flow vide</button>
      </div>
    </div>
  )
}

// ── Inspecteur de bloc ───────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10.5, lineHeight: 1.5, color: '#52525B' }}>{hint}</span>}
    </label>
  )
}

function Seg<T extends string | number>({ theme, value, options, onChange }: { theme: Theme; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={e => { e.preventDefault(); onChange(v) }} style={{
          flex: 1, height: 26, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
          background: value === v ? `rgba(${theme.tone},0.16)` : 'transparent', color: value === v ? theme.accentText : '#71717A',
        }}>{l}</button>
      ))}
    </div>
  )
}

function Range({ p, onChange, presets }: { p: BlockParams; onChange: (x: Partial<BlockParams>) => void; presets: [string, number, number][] }) {
  const num = (v: string) => Math.max(0, Math.min(600, Math.round(Number(v) || 0)))
  return (
    <>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {presets.map(([l, a, b]) => {
          const on = p.minMin === a && p.maxMin === b
          return <button key={l} onClick={e => { e.preventDefault(); onChange({ minMin: a, maxMin: b }) }} style={{ height: 26, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, border: `1px solid ${on ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.07)'}`, background: on ? 'rgba(251,191,36,0.1)' : 'transparent', color: on ? '#FBBF24' : '#A1A1AA' }}>{l} · {a}–{b}</button>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: `1px solid ${count ? 'rgba(255,255,255,0.08)' : 'rgba(248,113,113,0.3)'}` }}>
      <span style={{ flex: 1, fontSize: 12, color: count ? '#E4E4E7' : '#F87171', fontWeight: 600 }}>{count ? `${count} ${w}${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}` : `Aucune ${w}`}</span>
      <Btn theme={theme} sm tone="ghost" label={count ? 'Modifier' : 'Choisir'} onClick={onPick} />
    </div>
  )
}

function Inspector({ theme, block, index, onChange, onPick, onRemove }: {
  theme: Theme; block: FlowBlock; index: number
  onChange: (p: Partial<BlockParams>) => void; onPick: (k: 'videos' | 'images') => void; onRemove: () => void
}) {
  const def = BLOCK[block.type]
  const p = block.params
  const modeSeg = <Field label="Répartition entre les comptes"><Seg<PoolMode> theme={theme} value={p.mode ?? 'seq'} options={[['seq', 'Dans l\'ordre'], ['random', 'Aléatoire']]} onChange={v => onChange({ mode: v })} /></Field>
  let body: ReactNode = null
  switch (block.type) {
    case 'login':
      body = <div style={{ padding: 12, borderRadius: 9, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)', fontSize: 12, lineHeight: 1.6, color: '#7DD3FC' }}>
        Les identifiants (email / mot de passe / clé 2FA) sont demandés au moment du lancement et ne sont <b>jamais enregistrés</b> dans le flow.
      </div>
      break
    case 'username': {
      const n = lines(p.usernames).length
      body = <Field label={`Pseudos (${n})`} hint={<>Un pseudo par ligne, attribués dans l'ordre aux comptes. <code style={{ fontFamily: MONO, color: '#A1A1AA' }}>{'{4}'}</code> = 4 chiffres aléatoires (ex. <code style={{ fontFamily: MONO, color: '#A1A1AA' }}>lea.mode{'{4}'}</code>). Lettres, chiffres, « . » et « _ » uniquement.</>}>
        <textarea rows={7} value={p.usernames ?? ''} onChange={e => onChange({ usernames: e.target.value })} placeholder={'lea.mode{4}\nclara.paris{3}'} style={{ ...areaStyle, fontFamily: MONO, fontSize: 12 }} />
      </Field>
      break
    }
    case 'avatar':
      body = <><Field label="Photos"><MediaPick theme={theme} count={p.imageIds?.length ?? 0} kind="images" onPick={() => onPick('images')} /></Field>{modeSeg}</>
      break
    case 'bio':
      body = <>
        <Field label={`Bios (${lines(p.bios).length})`} hint="Une bio par ligne — une est choisie pour chaque compte.">
          <textarea rows={4} value={p.bios ?? ''} onChange={e => onChange({ bios: e.target.value })} placeholder={'✨ Mode & lifestyle · Paris\n🌸 Daily outfits'} style={areaStyle} />
        </Field>
        <Field label="Nom affiché (optionnel)" hint="Un par ligne. Vide = inchangé.">
          <textarea rows={2} value={p.names ?? ''} onChange={e => onChange({ names: e.target.value })} placeholder="Léa M." style={areaStyle} />
        </Field>
        <Field label="Lien du profil (optionnel)"><input value={p.link ?? ''} onChange={e => onChange({ link: e.target.value })} placeholder="https://…" style={inputStyle} /></Field>
        {modeSeg}
      </>
      break
    case 'warmup':
      body = <>
        <Range p={p} onChange={onChange} presets={[['Léger', 5, 8], ['Normal', 8, 15], ['Long', 20, 40]]} />
        <Field label="Mot-clé (optionnel)" hint="Vide = parcourt le fil Reels. Sinon recherche ce mot-clé.">
          <input value={p.keyword ?? ''} onChange={e => onChange({ keyword: e.target.value })} placeholder="ex. fashion" style={inputStyle} />
        </Field>
      </>
      break
    case 'pause':
      body = <Range p={p} onChange={onChange} presets={[['Courte', 5, 10], ['Moyenne', 15, 30], ['Longue', 60, 120]]} />
      break
    case 'post':
      body = <>
        <Field label="Vidéos"><MediaPick theme={theme} count={p.videoIds?.length ?? 0} kind="videos" onPick={() => onPick('videos')} /></Field>
        <Field label={`Légendes (${lines(p.captions).length})`} hint="Une légende par ligne. Vide = sans légende.">
          <textarea rows={4} value={p.captions ?? ''} onChange={e => onChange({ captions: e.target.value })} placeholder="Nouvelle vidéo 🔥 #fyp" style={areaStyle} />
        </Field>
        {modeSeg}
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!p.trial} onChange={e => onChange({ trial: e.target.checked })} style={{ accentColor: theme.accent }} />
          <span style={{ fontSize: 12, color: '#D4D4D8' }}>Reel d'essai (montré aux non-abonnés)</span>
        </label>
      </>
      break
    case 'story':
      body = <>
        <Field label="Images"><MediaPick theme={theme} count={p.imageIds?.length ?? 0} kind="images" onPick={() => onPick('images')} /></Field>
        <Field label="Lien du sticker"><input value={p.link ?? ''} onChange={e => onChange({ link: e.target.value })} placeholder="https://…" style={{ ...inputStyle, borderColor: p.link?.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(248,113,113,0.3)' }} /></Field>
        <Field label="Texte du sticker (optionnel)"><input value={p.linkText ?? ''} onChange={e => onChange({ linkText: e.target.value })} placeholder="Voir l'offre" style={inputStyle} /></Field>
        {modeSeg}
      </>
      break
  }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '14px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <BlockIcon def={block.type} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F6' }}><span style={{ color: '#52525B' }}>{index + 1}.</span> {def.label}</div>
          <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.5, color: '#71717A' }}>{def.hint}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: 15 }}>{body}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 15px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ flex: 1, fontFamily: MONO, fontSize: 10.5, color: '#52525B' }}>{fmtMinutes(def.estimate(p))}{def.credits ? ` · ${def.credits} crédit(s)/compte` : ''}</span>
        <Btn theme={theme} sm tone="danger" label="Supprimer" onClick={onRemove} />
      </div>
    </>
  )
}

function FlowSettings({ theme, flow, issues, onError, onDelete }: {
  theme: Theme; flow: Flow; issues: string[]; onError: (v: 'stop' | 'continue') => void; onDelete: () => void
}) {
  return (
    <>
      <PanelHead title="Réglages du flow" sub="Clique un bloc pour le configurer" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: 15 }}>
        <Field label="Si un bloc échoue sur un compte" hint={flow.onError === 'stop' ? 'Les blocs suivants sont sautés pour ce compte (recommandé : inutile de poster si la connexion a échoué).' : 'Les blocs suivants sont quand même joués.'}>
          <Seg<'stop' | 'continue'> theme={theme} value={flow.onError} options={[['stop', 'Arrêter ce compte'], ['continue', 'Continuer']]} onChange={onError} />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA' }}>Vérification</span>
          {issues.length === 0 ? (
            <span style={{ fontSize: 12, color: '#34D399' }}>✓ Prêt à lancer</span>
          ) : issues.map((s, i) => <span key={i} style={{ fontSize: 11.5, lineHeight: 1.5, color: '#F87171' }}>• {s}</span>)}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.6, color: '#52525B' }}>
          Chaque compte démarre <b style={{ color: '#A1A1AA' }}>une seule fois</b>, enchaîne tous les blocs, puis s'éteint. Raccourcis : <b style={{ color: '#A1A1AA' }}>Suppr</b> retire le bloc sélectionné, <b style={{ color: '#A1A1AA' }}>Échap</b> désélectionne.
        </div>
      </div>
      <div style={{ padding: '11px 15px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end' }}>
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

function LaunchModal({ theme, flow, phones, bearer, ownerId, orgId, userId, onClose, onLaunched }: {
  theme: Theme; flow: Flow; phones: Phone[]; bearer: string; ownerId: string; orgId: string | null; userId: string
  onClose: () => void; onLaunched: () => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [group, setGroup] = useState('Tous')
  const [q, setQ] = useState('')
  const [conc, setConc] = useState(3)
  const [rotationConfigured, setRotationConfigured] = useState(false)
  const [rotationOn, setRotationOn] = useState(false)
  const [credText, setCredText] = useState('')
  const [busy, setBusy] = useState(false)
  const needsLogin = flow.blocks.some(b => b.type === 'login')

  useEffect(() => {
    loadProxyRotation(orgId, userId).then(c => setRotationConfigured(c.enabled && c.urls.some(u => /^https?:\/\//i.test(u.trim()))))
  }, [orgId, userId])

  const groups = ['Tous', ...[...new Set(phones.map(p => p.group_name).filter(Boolean) as string[])].sort()]
  const shown = phones.filter(p => (group === 'Tous' || p.group_name === group) && (!q.trim() || phoneLabel(p).toLowerCase().includes(q.trim().toLowerCase())))
  const chosen = phones.filter(p => sel.has(p.id))
  const credLines = lines(credText)
  const creds: Record<string, Creds> = {}
  chosen.forEach((p, i) => { const c = credLines[i] ? parseCredLine(credLines[i]) : null; if (c) creds[p.id] = c })
  const nCreds = Object.keys(creds).length
  const issues = validateFlow(flow, chosen.length, needsLogin ? creds : undefined, chosen.map(p => p.id))
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
      bearer, flow, creds, concurrency: conc, creditOwnerId: ownerId,
      rotationUrls: rot.length ? rot : undefined,
      targets: chosen.map(p => ({ key: p.id, geelarkId: p.geelark_id!, name: phoneLabel(p) })),
    })
    setBusy(false)
    onLaunched()
  }

  return (
    <Modal theme={theme} title={`Lancer « ${flow.name} »`} sub={`${flow.blocks.length} bloc(s) · ≈ ${fmtMinutes(est)} par compte`} icon="M5 3l14 9-14 9V3z" width={720} onClose={onClose}
      footer={<>
        <span style={{ flex: 1, fontSize: 12, color: issues.length ? '#F87171' : '#71717A' }}>
          {issues.length ? issues[0] : <>{chosen.length} compte(s) · {perAcc ? <b style={{ color: '#E4E4E7' }}>{perAcc * chosen.length} crédits</b> : 'gratuit'} · fin estimée ≈ {fmtMinutes(total)}</>}
        </span>
        <Btn theme={theme} tone="ghost" label="Annuler" onClick={onClose} />
        <Btn theme={theme} tone="primary" icon="M5 3l14 9-14 9V3z" label={busy ? 'Lancement…' : `Lancer sur ${chosen.length} compte(s)`} disabled={issues.length > 0 || busy} onClick={launch} />
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
        {/* Comptes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…" style={{ ...inputStyle, flex: 1 }} />
            <select value={group} onChange={e => setGroup(e.target.value)} style={{ ...inputStyle, width: 160, cursor: 'pointer', background: '#101015' }}>
              {groups.map(g => <option key={g} value={g} style={{ background: '#16161C' }}>{g === 'Tous' ? 'Tous les groupes' : g}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA' }}>{chosen.length} / {phones.length} sélectionné(s)</span>
            <button onClick={() => setSel(s => { const n = new Set(s); shown.forEach(p => allShown ? n.delete(p.id) : n.add(p.id)); return n })} style={{ border: 'none', background: 'transparent', color: theme.accentText, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{allShown ? 'Tout retirer' : 'Tout sélectionner'}</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)' }}>
            {shown.length === 0 ? <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#52525B' }}>Aucun téléphone GeeLark.</div> : shown.map(p => {
              const on = sel.has(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 11px', border: 'none', cursor: 'pointer', textAlign: 'left', borderLeft: `2px solid ${on ? theme.accent : 'transparent'}`, background: on ? `rgba(${theme.tone},0.06)` : 'transparent' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accentBtn : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 8.5, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                  <StatusDot kind={p.status === 'warming' ? 'warmup' : p.status} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: on ? '#F4F4F6' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Réglages du run */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
          <Field label="Comptes en parallèle" hint={rotationOn ? 'Rotation d\'IP active → un compte à la fois (sinon la rotation couperait les autres).' : 'Plus = plus rapide. Limité par ton forfait GeeLark (téléphones simultanés).'}>
            <Seg<number> theme={theme} value={rotationOn ? 1 : conc} options={[[1, '1'], [3, '3'], [5, '5'], [10, '10'], [20, '20']]} onChange={v => setConc(v)} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#E4E4E7' }}>Rotation d'IP proxy</span>
              <span style={{ fontSize: 10.5, color: '#52525B' }}>{rotationConfigured ? 'IP changée avant le démarrage de chaque compte' : 'Aucun proxy rotatif configuré (Réglages)'}</span>
            </span>
            <span onClick={() => rotationConfigured && setRotationOn(v => !v)} role="switch" aria-checked={rotationOn}
              style={{ display: 'flex', alignItems: 'center', justifyContent: rotationOn ? 'flex-end' : 'flex-start', width: 38, height: 22, padding: 2, borderRadius: 99, flexShrink: 0, cursor: rotationConfigured ? 'pointer' : 'not-allowed', opacity: rotationConfigured ? 1 : 0.4, background: rotationOn ? theme.accentBtn : 'rgba(255,255,255,0.12)' }}>
              <span style={{ width: 18, height: 18, borderRadius: 99, background: '#fff' }} />
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
              {issues.slice(1, 5).map((s, i) => <span key={i} style={{ fontSize: 11, color: '#F87171' }}>• {s}</span>)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Exécutions en direct ─────────────────────────────────────────────────────

const STEP_COLOR: Record<StepStatus, string> = { pending: 'rgba(255,255,255,0.1)', running: '#FBBF24', ok: '#34D399', failed: '#F87171', skipped: 'rgba(255,255,255,0.04)' }
const PHONE_TONE = { pending: 'mute', booting: 'warn', running: 'warn', done: 'ok', failed: 'bad', cancelled: 'mute' } as const
const PHONE_LABEL = { pending: 'En attente', booting: 'Démarrage', running: 'En cours', done: 'Terminé', failed: 'Échec', cancelled: 'Annulé' } as const

function RunsPanel({ theme, runs }: { theme: Theme; runs: FlowRun[] }) {
  if (runs.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      <div style={{ height: 3, margin: '0 15px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
        <span style={{ width: `${(done / Math.max(1, run.phones.length)) * 100}%`, background: '#34D399', transition: 'width .3s ease' }} />
        <span style={{ width: `${(failed / Math.max(1, run.phones.length)) * 100}%`, background: '#F87171', transition: 'width .3s ease' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 15px 6px' }}>
        {([['all', 'Tous'], ['active', 'En cours'], ['failed', `Échecs${failed ? ` (${failed})` : ''}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ height: 24, padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: filter === k ? `rgba(${theme.tone},0.14)` : 'transparent', color: filter === k ? theme.accentText : '#71717A' }}>{l}</button>
        ))}
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {list.slice(0, LIMIT).map(p => {
          const isOpen = open === p.key
          const curLabel = p.status === 'booting' ? 'Démarrage du téléphone' : p.current >= 0 && p.status === 'running' ? BLOCK[run.blocks[p.current].type].label : ''
          const err = p.errors.find(Boolean)
          return (
            <div key={p.key} style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
              <button onClick={() => setOpen(isOpen ? null : p.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 15px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {p.steps.map((s, i) => (
                    <span key={i} title={`${i + 1}. ${BLOCK[run.blocks[i].type].label} — ${s}${p.errors[i] ? ` : ${p.errors[i]}` : ''}`}
                      style={{ width: 16, height: 6, borderRadius: 99, background: STEP_COLOR[s], boxShadow: s === 'running' ? '0 0 8px rgba(251,191,36,0.6)' : 'none', animation: s === 'running' ? 'aPulse 1.4s ease-in-out infinite' : undefined }} />
                  ))}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: err && p.status === 'failed' ? '#F87171' : '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.status === 'failed' && err ? err : curLabel}
                </span>
                <Chip text={PHONE_LABEL[p.status]} tone={PHONE_TONE[p.status]} />
              </button>
              {isOpen && (
                <div style={{ margin: '0 15px 10px', padding: '9px 11px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', maxHeight: 220, overflowY: 'auto', fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
                  {p.logs.length ? p.logs.join('\n') : 'En attente…'}
                </div>
              )}
            </div>
          )
        })}
        {list.length > LIMIT && <div style={{ padding: '9px 15px', fontSize: 11, color: '#52525B', borderTop: '1px solid rgba(255,255,255,0.035)' }}>… et {list.length - LIMIT} autre(s) — filtre « En cours » ou « Échecs » pour les voir.</div>}
      </div>
      {run.log.length > 0 && (
        <div style={{ margin: '4px 15px 13px', padding: '8px 11px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)', maxHeight: 90, overflowY: 'auto', fontFamily: MONO, fontSize: 10.5, lineHeight: 1.6, color: '#71717A', whiteSpace: 'pre-wrap' }}>
          {run.log.join('\n')}
        </div>
      )}
    </Panel>
  )
}
