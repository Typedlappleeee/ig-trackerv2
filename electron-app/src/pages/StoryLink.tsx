import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, postInstagramStoryRpa, stopPhone, fetchPhoneProxies, type GeelarkPhone } from '@/lib/geelark'
import { startRun, updateRun, endRun, setRunPhase, proxyConflicts, type PhaseStatus } from '@/lib/activeRuns'
import { resolveRotationUrls, useProxyRotation, getProxyRotation } from '@/lib/proxyRotation'
import { ProxyPicker } from '@/components/ProxyPicker'
import { migrateConcurrencyOnce } from '@/lib/postingOpts'
import { createScheduledPost, defaultSchedValue } from '@/lib/schedulerService'
import { checkAndDeductCredits, refundCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { BankPicker } from '@/pages/Bank'
import type { CaptionItem } from '@/pages/CaptionBank'
import { supabase } from '@/lib/supabase'
import { playSuccess, playError } from '@/lib/sounds'
import { useToast } from '@/components/Toast'
import { ACCENT, ACCENT_L, ACCENT_D, TEXT_1, HAIR, BG_2 } from '@/lib/theme'
import { useTr } from '@/lib/i18n'

// ── Types ─────────────────────────────────────────────────────────────────────
type JobStatus = 'idle' | 'running' | 'ok' | 'error'
type Job = { phoneId: string; status: JobStatus; logs: string[] }
type PoolPhoto = { url: string; name: string }
type Distribution = 'rotation' | 'random'

// ── Persistent pool config ────────────────────────────────────────────────────
const LS_PHOTO_POOL = 'sf-story-photo-pool'
const LS_TEXT_POOL  = 'sf-story-text-pool'
const LS_DISTRIB    = 'sf-story-distribution'
const lsLinkKey = (id: string) => `sf-story-link-${id}`

function loadPhotoPool(): PoolPhoto[] {
  try { return JSON.parse(localStorage.getItem(LS_PHOTO_POOL) ?? '[]') } catch { return [] }
}
function loadTextPool(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_TEXT_POOL) ?? '[]') } catch { return [] }
}
function loadDistrib(): Distribution {
  return (localStorage.getItem(LS_DISTRIB) as Distribution | null) ?? 'rotation'
}
function loadPhoneLink(id: string): string {
  const raw = localStorage.getItem(lsLinkKey(id)) ?? ''
  // Guard against old JSON format e.g. {"linkUrl":"https://...","linkText":"..."}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.linkUrl === 'string') {
      const url = parsed.linkUrl
      if (url) localStorage.setItem(lsLinkKey(id), url) // migrate to plain string
      return url
    }
  } catch { /* not JSON — use as-is */ }
  return raw
}
function savePhoneLink(id: string, link: string) {
  if (link.trim()) localStorage.setItem(lsLinkKey(id), link.trim())
  else localStorage.removeItem(lsLinkKey(id))
}

function savePhotoPool(v: PoolPhoto[]) { localStorage.setItem(LS_PHOTO_POOL, JSON.stringify(v)) }
function saveTextPool(v: string[])     { localStorage.setItem(LS_TEXT_POOL,  JSON.stringify(v)) }
function saveDistrib(v: Distribution)  { localStorage.setItem(LS_DISTRIB,    v) }

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────
function shuffleIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconLink = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IconLinkSm = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
  </svg>
)
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconX = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
)
const IconCheck = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
)
const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
)
const IconPhoto = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/>
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
  </svg>
)
const IconText = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconShuffle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/>
    <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/>
    <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>
  </svg>
)
const IconRotate = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
    <path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
  </svg>
)
const IconWarn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
)
const IconStop = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2"/>
  </svg>
)
const IconSave = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>
  </svg>
)
const IconTarget = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
)
const IconPhotoSm = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const IconTextSm = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconNoConnection = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="m19 5 3-3M2 22l3-3"/>
    <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/>
    <path d="m7.5 13.5 1-1M10.5 16.5l1-1"/>
    <path d="M12 6 18 12l2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>
  </svg>
)

// ── Caption Bank Picker modal ─────────────────────────────────────────────────
function CaptionBankPicker({
  user, onSelect, onClose,
}: {
  user: User
  onSelect: (texts: string[]) => void
  onClose: () => void
}) {
  const { currentOrg } = useOrg()
  const tr = useTr()
  const [items,    setItems]    = useState<CaptionItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [folder,   setFolder]   = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      setLoading(true)
      let q = supabase.from('caption_bank').select('*').order('created_at', { ascending: false })
      if (currentOrg?.id) q = q.eq('org_id', currentOrg.id)
      else q = q.eq('user_id', user.id)
      const { data } = await q
      setItems((data as CaptionItem[]) ?? [])
      setLoading(false)
    }
    load()
  }, [user.id, currentOrg?.id])

  const folders = ['Tous', ...Array.from(new Set(items.map(i => i.folder).filter(Boolean) as string[])).sort()]
  const visible = folder && folder !== 'Tous' ? items.filter(i => i.folder === folder) : items

  function toggleAll() {
    if (visible.every(i => selected.has(i.id))) {
      setSelected(prev => { const n = new Set(prev); visible.forEach(i => n.delete(i.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); visible.forEach(i => n.add(i.id)); return n })
    }
  }

  function confirm() {
    const texts = items.filter(i => selected.has(i.id)).map(i => i.content).filter(Boolean)
    if (texts.length) onSelect(texts)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 560, margin: '0 16px', maxHeight: '80vh', background: BG_2, border: `1px solid ${HAIR}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: TEXT_1, margin: 0 }}>{tr('Banque de captions', 'Caption bank')}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>{tr(`${selected.size} sélectionné${selected.size !== 1 ? 's' : ''}`, `${selected.size} selected`)}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', lineHeight: 1, display: 'flex' }}><IconX /></button>
        </div>

        {/* Folder tabs */}
        {folders.length > 1 && (
          <div style={{ padding: '10px 14px 0', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, borderBottom: `1px solid ${HAIR}` }}>
            {folders.map(f => {
              const active = (folder ?? 'Tous') === f
              const folderIds = f === 'Tous' ? [] : items.filter(i => i.folder === f && i.content).map(i => i.id)
              const allSel = folderIds.length > 0 && folderIds.every(id => selected.has(id))
              return (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px 4px 10px', borderRadius: 20, marginBottom: 10,
                  background: active ? 'rgba(99,102,241,0.15)' : 'transparent', border: `1px solid ${active ? 'rgba(99,102,241,0.4)' : HAIR}`, transition: 'all 0.12s' }}>
                  <button onClick={() => setFolder(f === 'Tous' ? null : f)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: active ? 700 : 400, color: active ? ACCENT_L : 'var(--text-3)' }}>
                    {f === 'Tous' ? tr('Tous', 'All') : f}
                  </button>
                  {f !== 'Tous' && folderIds.length > 0 && (
                    <button
                      onClick={() => setSelected(prev => {
                        const n = new Set(prev)
                        if (allSel) folderIds.forEach(id => n.delete(id)); else folderIds.forEach(id => n.add(id))
                        return n
                      })}
                      title={allSel ? tr(`Retirer le dossier "${f}"`, `Remove folder "${f}"`) : tr(`Sélectionner tout le dossier "${f}"`, `Select entire folder "${f}"`)}
                      className="cursor-pointer"
                      style={{ width: 15, height: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
                        background: allSel ? 'var(--accent)' : 'transparent', border: allSel ? 'none' : `1px solid ${HAIR}`, color: '#fff' }}>
                      {allSel ? <IconCheck /> : <IconPlus />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
          {loading ? (
            <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><div className="sf-spinner" /></div>
          ) : visible.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '32px 0' }}>{tr('Aucune caption trouvée', 'No caption found')}</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', marginBottom: 4 }}>
                <button onClick={toggleAll} style={{ fontSize: 11, color: ACCENT_L, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {visible.every(i => selected.has(i.id)) ? tr('Tout désélectionner', 'Deselect all') : tr('Tout sélectionner', 'Select all')}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{tr(`(${visible.length} caption${visible.length !== 1 ? 's' : ''})`, `(${visible.length} caption${visible.length !== 1 ? 's' : ''})`)}</span>
              </div>
              {visible.map(item => {
                const sel = selected.has(item.id)
                return (
                  <div key={item.id}
                    onClick={() => setSelected(prev => { const n = new Set(prev); sel ? n.delete(item.id) : n.add(item.id); return n })}
                    style={{ display: 'flex', gap: 10, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 4,
                      background: sel ? 'rgba(99,102,241,0.09)' : 'rgba(255,255,255,0.025)', border: `1px solid ${sel ? 'rgba(99,102,241,0.32)' : 'transparent'}`, transition: 'all 0.12s' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: sel ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: sel ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                      {sel && <IconCheck />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: sel ? TEXT_1 : 'var(--text-2)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.content.slice(0, 40)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content}</p>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${HAIR}`, display: 'flex', gap: 9, flexShrink: 0 }}>
          <button onClick={onClose} className="sf-btn sf-btn-secondary cursor-pointer" style={{ flex: 1, justifyContent: 'center' }}>{tr('Annuler', 'Cancel')}</button>
          <button onClick={confirm} disabled={selected.size === 0} className="sf-btn sf-btn-primary cursor-pointer"
            style={{ flex: 2, justifyContent: 'center', opacity: selected.size === 0 ? 0.45 : 1, cursor: selected.size === 0 ? 'not-allowed' : 'pointer' }}>
            {tr(`Ajouter ${selected.size > 0 ? `(${selected.size})` : ''} caption${selected.size !== 1 ? 's' : ''}`, `Add ${selected.size > 0 ? `(${selected.size})` : ''} caption${selected.size !== 1 ? 's' : ''}`)}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StoryLink({ user }: { user: User }) {
  const conns  = useConnections(user)
  const bearer = conns.bearer
  useProxyRotation(user)  // charge la config de rotation d'IP dans le cache
  const { role, perms, currentOrg } = useOrg()
  const credits = useCredits()
  const toast = useToast()
  const tr = useTr()

  const [storyPlatformChosen, setStoryPlatformChosen] = useState(false)

  // ── Phones ────────────────────────────────────────────────────────────────
  const [phones, setPhones]           = useState<GeelarkPhone[]>([])
  const [loadingPhones, setLoading]   = useState(false)
  const [phoneSearch, setPhoneSearch] = useState('')
  const [groupFilter, _setGroupFilter] = useState(loadLastGroup)
  const setGroupFilter = (g: string) => { _setGroupFilter(g); saveLastGroup(g) }
  const [groups, setGroups]           = useState<string[]>(['Tous'])
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [pickMode, setPickMode]       = useState<'phones' | 'groups'>('phones')

  // ── Pool config (persisted) ───────────────────────────────────────────────
  const [photoPool, setPhotoPool]     = useState<PoolPhoto[]>([])
  const [textPool, setTextPool]       = useState<string[]>([])
  const [distribution, setDistrib]    = useState<Distribution>(loadDistrib)
  const [phoneLinks, setPhoneLinks]   = useState<Record<string, string>>({})

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showBankPicker, setShowBankPicker]         = useState(false)
  const [showCaptionPicker, setShowCaptionPicker]   = useState(false)
  const [editingText, setEditingText]               = useState('')
  const [running, setRunning]               = useState(false)
  const [jobs, setJobs]                     = useState<Job[]>([])
  const [igByPhone, setIgByPhone]           = useState<Record<string, string>>({})   // geelark_id → @pseudo IG
  const [openLog, setOpenLog]               = useState<string | null>(null)
  const [dryRun, setDryRun]                 = useState(false)
  // Concurrence (proxys rotatifs) — persistée
  const [rotProxy, setRotProxy]   = useState(() => localStorage.getItem('sf-story-rotproxy') === '1')
  const [maxConc,  setMaxConc]    = useState(() => { migrateConcurrencyOnce(); return parseInt(localStorage.getItem('sf-story-maxconc') ?? '0', 10) || 0 })
  // Proxys à roter pour ce lancement (sous-ensemble). Vide = tous. Persisté.
  const [rotUrls, setRotUrls]     = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('sf-story-roturls') ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('sf-story-rotproxy', rotProxy ? '1' : '0') }, [rotProxy])
  useEffect(() => { localStorage.setItem('sf-story-maxconc', String(maxConc)) }, [maxConc])
  useEffect(() => { localStorage.setItem('sf-story-roturls', JSON.stringify(rotUrls)) }, [rotUrls])
  // Highlights (option RPA) — ajouter la story à un highlight après publication.
  const [addToHl, setAddToHl] = useState(() => localStorage.getItem('sf-story-hl') === '1')
  const [hlMode,  setHlMode]  = useState<'existing' | 'create'>(() => (localStorage.getItem('sf-story-hlmode') as 'existing' | 'create') || 'existing')
  const [hlName,  setHlName]  = useState(() => localStorage.getItem('sf-story-hlname') || '')
  useEffect(() => { localStorage.setItem('sf-story-hl', addToHl ? '1' : '0') }, [addToHl])
  useEffect(() => { localStorage.setItem('sf-story-hlmode', hlMode) }, [hlMode])
  useEffect(() => { localStorage.setItem('sf-story-hlname', hlName) }, [hlName])
  const [showSchedule, setShowSchedule]     = useState(false)
  const [schedAt, setSchedAt]               = useState(() => defaultSchedValue(60))
  const [schedDelay, setSchedDelay]         = useState(2)
  const [scheduling, setScheduling]         = useState(false)
  const [schedDone, setSchedDone]           = useState('')
  const [schedErr, setSchedErr]             = useState('')
  const abortRef = useRef(false)
  // Run courant dans le registre global — pour le clôturer IMMÉDIATEMENT à
  // l'annulation (sinon il reste « running » et déclenche une fausse alerte
  // « même proxy » au posting suivant).
  const runIdRef = useRef<string | null>(null)

  useEffect(() => () => { abortRef.current = true }, [])

  // ⚠️ La publication de stories tourne dans le navigateur : un refresh l'arrête.
  useEffect(() => {
    if (!running) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = tr('Une publication est en cours. Si tu quittes ou rafraîchis, elle sera interrompue.', 'A publication is in progress. If you leave or refresh, it will be interrupted.')
      return e.returnValue
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [running])

  // ── Persist whenever pools change ─────────────────────────────────────────
  useEffect(() => savePhotoPool(photoPool), [photoPool])
  useEffect(() => saveTextPool(textPool),   [textPool])
  useEffect(() => saveDistrib(distribution),  [distribution])

  // ── Per-phone link helpers ────────────────────────────────────────────────
  const getLink = (id: string) => phoneLinks[id] ?? loadPhoneLink(id)
  function setLink(id: string, link: string) {
    setPhoneLinks(prev => ({ ...prev, [id]: link }))
    savePhoneLink(id, link)
    supabase.from('phones').update({ link: link.trim() || null }).eq('geelark_id', id)
      .then(() => {}, () => {})
  }

  // Applique un même lien à TOUS les comptes sélectionnés (évite 200 saisies).
  const [bulkLink, setBulkLink] = useState('')
  function applyLinkToAll() {
    const link = bulkLink.trim()
    if (!link) return
    selectedIds.forEach(id => setLink(id, link))
  }

  // ── Load phones ───────────────────────────────────────────────────────────
  async function loadPhones() {
    if (!bearer) return
    setLoading(true)
    try {
      const raw = await fetchAllPhones(bearer)
      // 🔒 Filtre À LA SOURCE : un membre ne voit QUE les groupes autorisés → ni le
      // sélecteur, ni le filtre, ni la sélection ne peuvent toucher un autre groupe.
      const list = role ? raw.filter(p => canAccessPhoneGroup(role, perms, p.group?.name ?? p.groupName ?? null)) : raw
      setPhones(list)
      const grps = [...new Set(list.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
      if (!grps.includes(loadLastGroup())) setGroupFilter('Tous')
      // Prefer DB link column (set from Phones tab) over localStorage fallback.
      const { data: dbPhones } = await supabase.from('phones').select('id,geelark_id,link,ig_username').in(
        'geelark_id', list.map(p => p.id),
      )
      // Map geelark_id → @pseudo IG (pour afficher le COMPTE dans les résultats).
      setIgByPhone(Object.fromEntries(
        (dbPhones ?? []).filter(r => r.ig_username).map(r => [r.geelark_id as string, r.ig_username as string])
      ))
      // Map: geelark_id → { link, supabase_uuid }
      const dbInfoMap = new Map(
        (dbPhones ?? []).map(r => [
          r.geelark_id as string,
          { link: (r.link as string | null) ?? '', uuid: r.id as string },
        ])
      )
      const toBackfill: { geelark_id: string; link: string }[] = []
      setPhoneLinks(prev => {
        const n = { ...prev }
        list.forEach(p => {
          if (n[p.id] === undefined) {
            const info = dbInfoMap.get(p.id)
            // Try: DB link → localStorage by geelark_id → localStorage by supabase uuid (Phones tab key)
            const v = info?.link
              || loadPhoneLink(p.id)
              || (info?.uuid ? localStorage.getItem(`sf-story-link-${info.uuid}`) ?? '' : '')
            if (v) {
              n[p.id] = v
              // If found only in localStorage but not yet in DB, backfill
              if (!info?.link) toBackfill.push({ geelark_id: p.id, link: v })
            }
          }
        })
        return n
      })
      // Persist localStorage-only links to DB so future loads are reliable
      for (const { geelark_id, link } of toBackfill) {
        supabase.from('phones').update({ link }).eq('geelark_id', geelark_id)
          .then(() => {}, () => {})
      }
    } catch (_) { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { if (bearer && !conns.loading) loadPhones() }, [bearer, conns.loading])

  const phoneName = (p: GeelarkPhone) => p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)
  const phoneById = (id: string) => phones.find(p => p.id === id)
  // Libellé « compte » : @pseudo IG si connu, sinon le nom du téléphone.
  const accountLabel = (id: string) => igByPhone[id] ? `@${igByPhone[id]}` : (phoneById(id) ? phoneName(phoneById(id)!) : id.slice(-6))

  const visiblePhones = phones.filter(p => {
    const grp = p.group?.name ?? p.groupName ?? null
    if (role && !canAccessPhoneGroup(role, perms, grp)) return false
    if (groupFilter !== 'Tous' && grp !== groupFilter) return false
    if (phoneSearch && !phoneName(p).toLowerCase().includes(phoneSearch.toLowerCase())) return false
    return true
  })

  function selectAll()  { setSelected(new Set(visiblePhones.map(p => p.id))) }
  function clearAll()   { setSelected(new Set()) }
  function togglePhone(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Assignment preview ────────────────────────────────────────────────────
  const selectedIds = [...selected]

  // Stable shuffled indices — only regenerated when pool sizes or distribution mode changes.
  // Using a ref avoids re-rendering on every shuffle update while keeping the value stable.
  const stablePhotoIdx = useRef<number[]>([])
  const stableTextIdx  = useRef<number[]>([])
  const prevPhotoLen   = useRef(-1)
  const prevTextLen    = useRef(-1)
  const prevDistrib    = useRef<Distribution | null>(null)
  if (
    distribution !== prevDistrib.current ||
    photoPool.length !== prevPhotoLen.current ||
    textPool.length  !== prevTextLen.current
  ) {
    stablePhotoIdx.current = shuffleIndices(photoPool.length)
    stableTextIdx.current  = shuffleIndices(textPool.length)
    prevPhotoLen.current   = photoPool.length
    prevTextLen.current    = textPool.length
    prevDistrib.current    = distribution
  }

  const buildAssignments = useCallback((ids: string[]) => {
    if (ids.length === 0 || photoPool.length === 0) return []
    const photoIndices = distribution === 'random'
      ? stablePhotoIdx.current
      : photoPool.map((_, i) => i)
    const textIndices = textPool.length > 0
      ? (distribution === 'random' ? stableTextIdx.current : textPool.map((_, i) => i))
      : []
    return ids.map((id, i) => ({
      phoneId: id,
      photo: photoPool[photoIndices[i % photoIndices.length]],
      text:  textIndices.length > 0 ? textPool[textIndices[i % textIndices.length]] : '',
      link:  getLink(id).trim(),
    }))
  }, [photoPool, textPool, distribution, phoneLinks])

  const previewAssignments = buildAssignments(selectedIds)
  const missingLinkIds = selectedIds.filter(id => !getLink(id).trim())
  const canRun = !!bearer && selectedIds.length > 0 && photoPool.length > 0 && missingLinkIds.length === 0 && !running

  // Raison précise du blocage — pour expliquer un bouton grisé (tooltip).
  const blockReason = !bearer ? tr('Connecte GéeLark dans les Paramètres', 'Connect GeeLark in Settings')
    : selectedIds.length === 0 ? tr('Sélectionne au moins un compte', 'Select at least one account')
    : photoPool.length === 0 ? tr('Ajoute au moins une photo', 'Add at least one photo')
    : missingLinkIds.length > 0 ? tr(`${missingLinkIds.length} compte${missingLinkIds.length > 1 ? 's' : ''} sans lien — renseigne le lien de chaque compte`, `${missingLinkIds.length} account${missingLinkIds.length > 1 ? 's' : ''} without a link — set the link for each account`)
    : ''
  const storyCost = selectedIds.length * CREDIT_COSTS.story

  // ── Run ───────────────────────────────────────────────────────────────────
  async function run() {
    if (!canRun || !bearer) return

    if (!dryRun) {
      const creditCost = selectedIds.length * CREDIT_COSTS.story
      const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
      if (!creditRes.ok) {
        playError()
        setJobs(selectedIds.map(id => ({ phoneId: id, status: 'error', logs: [`❌ ${creditRes.error ?? tr('Crédits insuffisants', 'Insufficient credits')} ${tr(`(${creditCost} crédits nécessaires)`, `(${creditCost} credits required)`)}`] })))
        return
      }
      if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
    }

    abortRef.current = false
    const assignments = buildAssignments(selectedIds)
    setRunning(true)
    setOpenLog(null)
    setJobs(assignments.map(a => ({ phoneId: a.phoneId, status: 'idle', logs: [] })))

    function addLog(id: string, msg: string) {
      // Aussi en console (F12) pour diagnostiquer facilement les échecs.
      const isErr = /échou|echou|erreur|error|❌|⚠️|introuvable|non transf/i.test(msg)
      if (isErr) console.error(`[STORY ${id.slice(-5)}] ${msg}`)
      else console.log(`[STORY ${id.slice(-5)}] ${msg}`)
      setJobs(prev => prev.map(j => j.phoneId === id ? { ...j, logs: [...j.logs, msg] } : j))
    }
    function setStatus(id: string, status: JobStatus) {
      setJobs(prev => prev.map(j => j.phoneId === id ? { ...j, status } : j))
    }
    // Résultat par compte (fiable, hors state React) → détail par compte de l'Historique.
    const phoneOutcome = new Map<string, { ok: boolean; error?: string }>()

    // Une story = des dizaines d'appels ADB (shell/execute) sur ~2 min. Beaucoup de
    // téléphones en parallèle peut multiplier les réponses « shell pas prêt » (le
    // démon shell est occupé) → certaines actions ratent. Concurrence réglable via
    // « Téléphones simultanés » ; défaut = Tous.
    const runOne = async (asgn: typeof assignments[number]): Promise<number> => {
      if (abortRef.current) return 0
      setStatus(asgn.phoneId, 'running')
      try {
        // Mode test : on ne poste pas réellement (RPA GeeLark exécute tout, pas de
        // simulation possible côté client) → on valide juste l'assignation.
        if (dryRun) {
          addLog(asgn.phoneId, tr('🧪 Test — image + lien assignés (aucune publication)', '🧪 Test — image + link assigned (no publication)'))
          setStatus(asgn.phoneId, 'ok'); phoneOutcome.set(asgn.phoneId, { ok: true }); return 1
        }
        // Story via RPA GeeLark (import auto du flow + exécution native). Pas de
        // retry : re-poster risquerait un double post si GeeLark rapporte un faux échec.
        const res = await postInstagramStoryRpa(
          bearer, asgn.phoneId,
          {
            imageUrl: asgn.photo.url, linkUrl: asgn.link, linkText: asgn.text || undefined,
            rotationUrls,
            addToHighlights: addToHl,
            createHighlight:    addToHl && hlMode === 'create'   ? hlName.trim() : '',
            addToHighlightName: addToHl && hlMode === 'existing' ? hlName.trim() : '',
          },
          m => addLog(asgn.phoneId, m),
        )
        if (res.ok) { setStatus(asgn.phoneId, 'ok'); phoneOutcome.set(asgn.phoneId, { ok: true }); return 1 }
        else { setStatus(asgn.phoneId, 'error'); phoneOutcome.set(asgn.phoneId, { ok: false, error: res.error || tr('Échec', 'Failed') }); addLog(asgn.phoneId, `❌ ${res.error ?? tr('La publication de la story a échoué', 'The story publication failed')}`); return 0 }
      } catch (e) {
        setStatus(asgn.phoneId, 'error')
        phoneOutcome.set(asgn.phoneId, { ok: false, error: tr('Erreur inattendue', 'Unexpected error') })
        addLog(asgn.phoneId, `❌ ${tr('La publication de la story a échoué (erreur inattendue)', 'The story publication failed (unexpected error)')}`)
        return 0
      } finally {
        try { await stopPhone(bearer, asgn.phoneId) } catch (_) { /* ignore */ }
      }
    }

    // Par défaut : TOUS les téléphones en même temps (comme le Mass Posting).
    // Rotation d'IP UNIQUEMENT si "Proxy rotatif" est coché ET URLs configurées.
    const rotationUrls = rotProxy ? resolveRotationUrls(rotUrls) : []
    // Proxy rotatif : autant de téléphones en parallèle qu'il y a de proxies (1 IP
    // fraîche par proxy). 1 proxy = série. Sinon : concurrence = réglage utilisateur,
    // ou par défaut TOUS d'un coup (« Tous »). Si tu vois des échecs quand tu lances
    // beaucoup de tels, mets un nombre dans le champ pour brider.
    const CONCURRENCY = rotProxy
      ? Math.max(1, Math.min(rotationUrls.length || 1, assignments.length))
      : (maxConc > 0 ? maxConc : assignments.length)
    // Petit décalage de démarrage plafonné (~6s) pour ne pas booter tout au même
    // instant. En rotatif un seul worker → aucun décalage.
    const staggerBase = rotProxy ? 0 : 1000
    // Suivi global + alerte même-proxy.
    const runId = `story-${Date.now()}`
    runIdRef.current = runId
    ;(async () => {
      let proxyKeys: string[] = []
      try {
        const pm = await fetchPhoneProxies(bearer)
        proxyKeys = [...new Set(assignments.map(a => { const px = pm.get(a.phoneId); return px?.server ? `${px.server}:${px.port ?? ''}` : '' }).filter(Boolean))]
      } catch { /* best-effort */ }
      if (proxyConflicts(proxyKeys, runId).length) {
        toast.show({ title: tr('⚠️ Même proxy déjà utilisé', '⚠️ Same proxy already in use'), body: tr('Un autre posting tourne sur le même proxy — risque de ban.', 'Another posting is running on the same proxy — risk of ban.'), kind: 'warn' })
      }
      startRun({
        id: runId, type: 'story', label: tr(`Story · ${assignments.length} compte${assignments.length > 1 ? 's' : ''}`, `Story · ${assignments.length} account${assignments.length > 1 ? 's' : ''}`),
        proxyKeys, done: 0, total: assignments.length, page: 'storylink',
        phones: assignments.map(a => (
          { id: a.phoneId, name: accountLabel(a.phoneId), status: 'idle' as PhaseStatus }
        )),
      })
    })()

    const queue = [...assignments]
    let okCount = 0, doneCount = 0
    const worker = async (staggerMs: number) => {
      if (staggerMs > 0) await new Promise(r => setTimeout(r, staggerMs))
      while (queue.length && !abortRef.current) {
        const asgn = queue.shift()!
        setRunPhase(runId, asgn.phoneId, 'running')
        const r = await runOne(asgn)
        okCount += r
        setRunPhase(runId, asgn.phoneId, r > 0 ? 'done' : 'error')
        updateRun(runId, { done: ++doneCount })
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, assignments.length) }, (_, i) => worker(Math.min(i, 6) * staggerBase)),
    )
    // Si annulé, le run a déjà été clôturé par le bouton — on évite le double-endRun.
    if (runIdRef.current === runId) {
      endRun(runId, okCount === 0 && assignments.length > 0 ? 'error' : 'done')
      runIdRef.current = null
    }
    if (okCount > 0) playSuccess(); else playError()
    setRunning(false)

    // Remboursement des stories non publiées (échec, annulation, Stop). Symétrique
    // au chemin programmation. Uniquement si on a réellement débité (pas en dryRun).
    if (!dryRun) {
      const failed = Math.max(0, selectedIds.length - okCount)
      if (failed > 0) {
        const refunded = await refundCredits(credits.ownerId, failed * CREDIT_COSTS.story)
        if (refunded) credits.refresh()
      }
    }

    // Historique : on enregistre TOUJOURS le run (réussi ou non) pour que la
    // page Historique soit fiable. (table post_runs, fire-and-forget)
    // `assignments` = const local frais (pas le state `jobs` potentiellement périmé
    // dans cette closure async de ~2 min) → total cohérent avec okCount.
    const totalRun = assignments.length
    // Détail par compte pour l'Historique cliquable (réussis / échoués + raison).
    const phoneResults = assignments.map(a => {
      const o = phoneOutcome.get(a.phoneId)
      const p = phones.find(ph => ph.id === a.phoneId)
      const name = igByPhone[a.phoneId] ? `@${igByPhone[a.phoneId]}` : (p ? phoneName(p) : a.phoneId.slice(-6))
      return { name, ok: !!o?.ok, ...(o?.ok ? {} : { error: o?.error || tr('Échec', 'Failed') }) }
    })
    const base = {
      user_id:   user.id,
      org_id:    currentOrg?.id ?? null,
      type:      'story',
      ok_count:  okCount,
      err_count: Math.max(0, totalRun - okCount),
      total:     totalRun,
    }
    supabase.from('post_runs').insert({ ...base, phone_results: phoneResults })
      .then(({ error }) => {
        // Colonne phone_results absente (migration non appliquée) → insert sans.
        if (error && /phone_results/i.test(error.message)) supabase.from('post_runs').insert(base).then(() => {}, () => {})
      }, () => {})

    // Reset après un run réussi : vide pool photos, textes et sélection téléphones
    if (okCount > 0) {
      setTimeout(() => {
        setPhotoPool([])
        savePhotoPool([])
        setTextPool([])
        saveTextPool([])
        setSelected(new Set())
        setJobs([])
        toast.show({ title: tr('Configuration réinitialisée', 'Configuration reset'), body: tr('Photos, textes et comptes ont été vidés après la publication.', 'Photos, texts and accounts were cleared after publishing.'), kind: 'info' })
      }, 3000)
    }
  }

  // ── Schedule ──────────────────────────────────────────────────────────────
  const canSchedule = !!bearer && selectedIds.length > 0 && photoPool.length > 0 && missingLinkIds.length === 0 && !running

  // whenOverride : posting « maintenant » côté serveur (date imposée ~now).
  async function scheduleRun(whenOverride?: Date) {
    if (!canSchedule || scheduling) return
    setSchedErr(''); setScheduling(true)
    try {
      const when = whenOverride ?? new Date(schedAt)
      if (isNaN(when.getTime()) || when.getTime() < Date.now() + 30_000) {
        setSchedErr(tr('Choisis une date au moins 1 minute dans le futur.', 'Pick a date at least 1 minute in the future.'))
        setScheduling(false)
        return
      }
      const creditCost = selectedIds.length * CREDIT_COSTS.story
      const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
      if (!creditRes.ok) {
        setSchedErr(`${creditRes.error ?? tr('Crédits insuffisants', 'Insufficient credits')} ${tr(`(requis : ${creditCost} crédits)`, `(required: ${creditCost} credits)`)}`)
        setScheduling(false)
        return
      }
      if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
      const assignments = buildAssignments(selectedIds)
      await createScheduledPost({
        userId:        user.id,
        orgId:         currentOrg?.id ?? null,
        createdByName: user.email?.split('@')[0] ?? tr('Moi', 'Me'),
        type:          'story',
        scheduledAt:   when,
        phones: assignments.map(a => {
          const p = phoneById(a.phoneId)
          return {
            id:               a.phoneId,
            geelark_id:       a.phoneId,
            phone_name:       p ? phoneName(p) : a.phoneId.slice(-6),
            ig_username:      igByPhone[a.phoneId] ?? null,
            story_photo:      a.photo.url,
            story_photo_name: a.photo.name,
            story_link:       a.link,
            story_text:       a.text || undefined,
          }
        }),
        videos:       [],
        caption:      '',
        delayMinutes: schedDelay,
        mode:         'seq',
        bearerToken:  '',
        reelsTrial:   false,
      })
      playSuccess()
      const soon = when.getTime() <= Date.now() + 2 * 60_000
      setSchedDone(soon
        ? tr(`✅ ${assignments.length} story(s) envoyée(s) au serveur — elles partent d'ici ~1 min. Tu peux fermer ton PC.`, `✅ ${assignments.length} story(s) sent to the server — they go out in ~1 min. You can close your PC.`)
        : tr(`${assignments.length} story(s) programmée(s) pour le ${when.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`, `${assignments.length} story(s) scheduled for ${when.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}`))
      // Toast VISIBLE même sans la modale ouverte (bouton « Publier » direct).
      toast.show({
        title: soon ? tr('✅ Story envoyée au serveur', '✅ Story sent to the server') : tr('🗓 Story programmée', '🗓 Story scheduled'),
        body: soon
          ? tr(`${assignments.length} story(s) partent d'ici ~1 min. Suis-les dans l'Historique — tu peux fermer ton PC.`, `${assignments.length} story(s) go out in ~1 min. Track them in History — you can close your PC.`)
          : tr(`Programmée${assignments.length > 1 ? 's' : ''} pour le ${when.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.`, `Scheduled for ${when.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}.`),
        kind: 'ok',
      })
      setTimeout(() => { setShowSchedule(false); setSchedDone('') }, soon ? 4000 : 2200)
    } catch (e) {
      const refundAmount = selectedIds.length * CREDIT_COSTS.story
      const refunded = await refundCredits(credits.ownerId, refundAmount)
      if (refunded) credits.refresh()
      setSchedErr(`${e instanceof Error ? e.message : String(e)}${refunded ? tr(` — ${refundAmount} crédits remboursés`, ` — ${refundAmount} credits refunded`) : ''}`)
    } finally {
      setScheduling(false)
    }
  }

  // ── Job status helpers ────────────────────────────────────────────────────
  // Lookup O(1) — évite un jobs.find() O(n) dans le .map de la liste (rendu O(n²)).
  const jobByPhone = useMemo(() => new Map(jobs.map(j => [j.phoneId, j])), [jobs])
  const jobFor = (id: string) => jobByPhone.get(id)
  const statusColor = (s?: JobStatus) =>
    s === 'ok' ? 'var(--ok)' : s === 'error' ? 'var(--err)' : s === 'running' ? 'var(--accent-l)' : 'rgba(148,163,184,0.28)'

  // ── No connection guard ───────────────────────────────────────────────────
  if (!conns.loading && !bearer) return (
    <div className="sf-page anim-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="sf-empty">
        <div className="sf-empty-icon" style={{ color: 'var(--accent-l)' }}>
          <IconNoConnection />
        </div>
        <p className="sf-empty-title">{tr('GéeLark non connecté', 'GeeLark not connected')}</p>
        <p className="sf-empty-desc">
          {tr('Ajoute ta clé GéeLark dans les Paramètres pour automatiser tes stories.', 'Add your GeeLark key in Settings to automate your stories.')}
        </p>
      </div>
    </div>
  )

  return (
    <div className="sf-page anim-page">
      {/* Popup de choix de plateforme — Story = Instagram uniquement pour le moment */}
      {!storyPlatformChosen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,11,14,0.8)', backdropFilter: 'blur(8px)', padding: 24 }}>
          <div className="sf-anim-scale-in" style={{
            width: '100%', maxWidth: 500, position: 'relative',
            background: 'linear-gradient(170deg, #16171F, #0F1014)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 20, overflow: 'hidden',
            boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <div aria-hidden style={{ position: 'absolute', top: -70, left: '30%', width: 300, height: 180, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(139,92,246,0.18), transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', padding: '24px 24px 4px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A5B4FC' }}>Story</p>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>{tr('Quelle plateforme ?', 'Which platform?')}</h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, marginBottom: 0 }}>{tr('Les stories sont disponibles sur Instagram.', 'Stories are available on Instagram.')}</p>
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 22 }}>
              <button
                onClick={() => setStoryPlatformChosen(true)}
                className="cursor-pointer"
                style={{
                  padding: 18, borderRadius: 16, textAlign: 'center',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                  border: '1px solid rgba(139,92,246,0.35)',
                  transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s, border-color 0.25s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 22px 46px -20px rgba(139,92,246,0.5)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.55)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)' }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#8B5CF6,#6366F1)', boxShadow: '0 10px 22px -8px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="#fff" stroke="none"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Instagram</div>
                  <div style={{ fontSize: 11, color: 'rgba(233,234,240,0.5)', marginTop: 4 }}>{tr('Story + sticker lien', 'Story + link sticker')}</div>
                </div>
              </button>
              <div style={{
                padding: 18, borderRadius: 16, textAlign: 'center', opacity: 0.55,
                background: 'linear-gradient(160deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))',
                border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#06B6D4,#3B82F6)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 3c.4 2.4 2 4.1 4.5 4.4v3c-1.7.1-3.2-.4-4.6-1.3v6.2c0 3.6-2.7 5.9-6 5.9-3.2 0-5.6-2.5-5.6-5.5 0-3.4 2.9-5.9 6.4-5.3v3.1c-.4-.1-.9-.2-1.3-.2-1.4 0-2.4 1-2.4 2.4 0 1.4 1 2.4 2.5 2.4 1.6 0 2.6-1.1 2.6-2.9V3h3.9z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'rgba(233,234,240,0.6)' }}>TikTok</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#22D3EE', background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.24)', borderRadius: 99, padding: '3px 9px', marginTop: 5 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                    {tr('Bientôt', 'Soon')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showBankPicker && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            setPhotoPool(prev => {
              const next = [
                ...prev,
                ...paths.map((url, i) => ({ url, name: titles?.[i] ?? `photo ${prev.length + i + 1}` })),
              ]
              return next
            })
            setShowBankPicker(false)
          }}
          onClose={() => setShowBankPicker(false)}
        />
      )}

      {showCaptionPicker && (
        <CaptionBankPicker
          user={user}
          onSelect={texts => setTextPool(prev => {
            const existing = new Set(prev)
            return [...prev, ...texts.filter(t => !existing.has(t))]
          })}
          onClose={() => setShowCaptionPicker(false)}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="sf-page-header">
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div
            className="sf-page-icon sf-anim-scale-spring"
          >
            <IconLink />
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad">Story</h1>
            <p className="sf-page-sub">
              {tr('Instagram · Publie ou programme des stories avec lien.', 'Instagram · Publish or schedule stories with a link.')}
              {selectedIds.length > 0 ? ` · ${storyCost} ${tr('crédits', 'credits')}` : ` · ${CREDIT_COSTS.story} ${tr('crédit/compte', 'credit/account')}`}
            </p>
          </div>
        </div>

        <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
          {running && (
            <span className="sf-status-chip is-live" title={tr('Publication en cours', 'Publishing in progress')}>
              <span className="sf-status-dot" />
              {tr('En cours', 'Running')}
            </span>
          )}
          {/* Dry-run toggle */}
          <button
            onClick={() => setDryRun(v => !v)}
            disabled={running}
            title={running ? tr('Indisponible pendant une exécution', 'Unavailable during a run') : tr("Déroule toute l'automation (image, caméra, sticker, lien) mais s'arrête avant de publier. Gratuit — idéal pour vérifier que le flux marche sur tes téléphones.", 'Runs the whole automation (image, camera, sticker, link) but stops before publishing. Free — ideal to check the flow works on your phones.')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 13px', borderRadius: 8, cursor: running ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 600,
              background: dryRun ? 'rgba(251,191,36,0.12)' : 'transparent',
              border: `1px solid ${dryRun ? 'rgba(251,191,36,0.4)' : HAIR}`,
              color: dryRun ? '#fbbf24' : 'var(--text-3)',
              transition: 'all 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
            </svg>
            {dryRun ? tr('Mode test ON (ne publie pas)', 'Test mode ON (does not publish)') : tr('Mode test', 'Test mode')}
          </button>

          {/* Schedule button */}
          <button
            onClick={() => { setSchedAt(defaultSchedValue(60)); setSchedErr(''); setShowSchedule(true) }}
            disabled={!canSchedule}
            title={canSchedule ? tr('Programmer la story pour plus tard', 'Schedule the story for later') : blockReason || undefined}
            className="sf-btn sf-btn-lg sf-btn-secondary"
            style={{ cursor: canSchedule ? 'pointer' : 'not-allowed', opacity: canSchedule ? 1 : 0.45, gap: 8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>
            </svg>
            {tr('Programmer', 'Schedule')}
          </button>

          {/* Launch / Stop button */}
          {running ? (
            <button
              onClick={() => { abortRef.current = true; setRunning(false); if (runIdRef.current) { endRun(runIdRef.current); runIdRef.current = null } }}
              className="sf-btn sf-btn-lg sf-btn-danger"
              style={{ cursor: 'pointer', gap: 8 }}
            >
              <IconStop />
              {tr('Arrêter', 'Stop')}
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!canRun}
              title={canRun ? (dryRun ? tr('Test — ne publie pas réellement', 'Test — does not actually publish') : tr(`Publie la story sur ${selectedIds.length} compte${selectedIds.length > 1 ? 's' : ''} (~5 en parallèle · garde l'app ouverte) · ${storyCost} crédits`, `Publishes the story to ${selectedIds.length} account${selectedIds.length > 1 ? 's' : ''} (~5 in parallel · keep the app open) · ${storyCost} credits`)) : blockReason || undefined}
              className={`sf-btn sf-btn-lg sf-btn-primary cursor-pointer`}
              style={{ cursor: canRun ? 'pointer' : 'not-allowed', gap: 9, opacity: canRun ? 1 : 0.5 }}
            >
              <IconSend />
              {dryRun
                ? tr(`Tester${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`, `Test${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`)
                : tr(`Publier${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}${storyCost > 0 ? ` · ${storyCost} cr.` : ''}`, `Publish${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}${storyCost > 0 ? ` · ${storyCost} cr.` : ''}`)}
            </button>
          )}
        </div>
      </header>

      {/* ── Body: 3-column split ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '272px 1fr 304px', minHeight: 0 }}>

        {/* ══ COL 1 — Phone selector ══════════════════════════════════════════ */}
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>

          {/* Toolbar */}
          <div style={{ flexShrink: 0, padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="sf-section-label" style={{ margin: 0 }}>{tr('Comptes', 'Accounts')}</span>
              {selected.size > 0 && (
                <span className="sf-badge sf-badge-accent" style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                  {tr(`${selected.size} sélectionné${selected.size > 1 ? 's' : ''}`, `${selected.size} selected`)}
                </span>
              )}
            </div>

            {/* Toggle Téléphones / Groupes */}
            {groups.filter(g => g !== 'Tous').length > 0 && (
              <div className="sf-segment" style={{ display: 'flex', width: '100%', marginBottom: 8 }}>
                {([{ k: 'phones', l: 'Téléphones' }, { k: 'groups', l: 'Groupes' }] as const).map(m => (
                  <button
                    key={m.k}
                    onClick={() => setPickMode(m.k)}
                    className={`sf-segment-item cursor-pointer${pickMode === m.k ? ' is-active' : ''}`}
                    style={{ flex: 1 }}
                  >{tr(m.l, m.k === 'phones' ? 'Phones' : 'Groups')}</button>
                ))}
              </div>
            )}

            {pickMode === 'phones' && (
              <>
                {groups.length > 1 && (
                  <select
                    value={groupFilter}
                    onChange={e => setGroupFilter(e.target.value)}
                    className="sf-input"
                    style={{ height: 32, marginBottom: 8, cursor: 'pointer', fontSize: 12 }}
                  >
                    {groups.map(g => <option key={g} value={g} style={{ background: '#0C0C15' }}>{g}</option>)}
                  </select>
                )}

                {/* Search input */}
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}>
                    <IconSearch />
                  </span>
                  <input
                    value={phoneSearch}
                    onChange={e => setPhoneSearch(e.target.value)}
                    placeholder={tr('Rechercher…', 'Search…')}
                    className="sf-input"
                    style={{ height: 32, paddingLeft: 32, fontSize: 12 }}
                  />
                </div>

                {/* Select / Clear */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={selectAll} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer" style={{ flex: 1 }}>
                    {tr('Tout sélectionner', 'Select all')}
                  </button>
                  <button onClick={clearAll} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ flex: 1 }}>
                    {tr('Effacer', 'Clear')}
                  </button>
                </div>
              </>
            )}

            {pickMode === 'groups' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setSelected(new Set(phones.map(p => p.id)))} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer" style={{ flex: 1 }}>
                  {tr('Tout sélectionner', 'Select all')}
                </button>
                <button onClick={clearAll} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ flex: 1 }}>
                  {tr('Effacer', 'Clear')}
                </button>
              </div>
            )}
          </div>

          {/* Phone list — anim-stagger */}
          <div className="sf-scroll anim-stagger" style={{ flex: 1, padding: '6px 8px 10px' }}>
            {pickMode === 'groups' ? (
              groups.filter(g => g !== 'Tous').length === 0 ? (
                <div className="sf-empty" style={{ padding: '40px 20px' }}>
                  <div className="sf-empty-icon" style={{ color: 'var(--text-3)' }}><IconTarget /></div>
                  <p className="sf-empty-title" style={{ fontSize: 13 }}>{tr('Aucun groupe', 'No group')}</p>
                  <p className="sf-empty-desc" style={{ fontSize: 12 }}>{tr("Crée des groupes dans l'onglet Téléphones.", 'Create groups in the Phones tab.')}</p>
                </div>
              ) : groups.filter(g => g !== 'Tous').map(g => {
                const ids = phones.filter(p => (p.group?.name ?? p.groupName ?? null) === g).map(p => p.id)
                const selCount = ids.filter(id => selected.has(id)).length
                const allSel = ids.length > 0 && selCount === ids.length
                return (
                  <div
                    key={g}
                    role="checkbox"
                    aria-checked={allSel}
                    tabIndex={0}
                    onClick={() => setSelected(prev => {
                      const n = new Set(prev)
                      if (allSel) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id))
                      return n
                    })}
                    className="sf-card-lift cursor-pointer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 3,
                      background: selCount > 0 ? 'rgba(99,102,241,0.09)' : 'transparent',
                      border: `1px solid ${selCount > 0 ? 'rgba(99,102,241,0.32)' : 'transparent'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: allSel ? 'var(--accent)' : selCount > 0 ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)',
                      border: selCount > 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    }}>
                      {selCount > 0 && <IconCheck />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: selCount > 0 ? 600 : 400, color: selCount > 0 ? 'var(--text-1)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{g}</p>
                      <p style={{ fontSize: 10.5, color: selCount > 0 ? 'var(--accent-l)' : 'var(--text-4)', margin: '2px 0 0' }}>
                        {selCount > 0 ? tr(`${selCount}/${ids.length} sélectionné${ids.length > 1 ? 's' : ''}`, `${selCount}/${ids.length} selected`) : tr(`${ids.length} compte${ids.length > 1 ? 's' : ''}`, `${ids.length} account${ids.length > 1 ? 's' : ''}`)}
                      </p>
                    </div>
                  </div>
                )
              })
            ) : loadingPhones ? (
              <div aria-busy="true" aria-label={tr('Chargement des comptes', 'Loading accounts')} style={{ padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="sf-skeleton" style={{ height: 38, borderRadius: 9, opacity: 1 - i * 0.09 }} />
                ))}
              </div>
            ) : visiblePhones.length === 0 ? (
              <div className="sf-empty" style={{ padding: '40px 20px' }}>
                <div className="sf-empty-icon" style={{ color: 'var(--text-3)' }}><IconSearch /></div>
                <p className="sf-empty-title" style={{ fontSize: 13 }}>{tr('Aucun compte', 'No account')}</p>
                <p className="sf-empty-desc" style={{ fontSize: 12 }}>{tr("Vérifie le filtre de groupe, ou ajoute des téléphones dans l'onglet Téléphones.", 'Check the group filter, or add phones in the Phones tab.')}</p>
              </div>
            ) : visiblePhones.map(p => {
              const sel = selected.has(p.id)
              const grp = p.group?.name ?? p.groupName
              const j = jobFor(p.id)
              return (
                <div
                  key={p.id}
                  role="checkbox"
                  aria-checked={sel}
                  tabIndex={0}
                  onClick={() => togglePhone(p.id)}
                  onKeyDown={e => e.key === ' ' && togglePhone(p.id)}
                  className="sf-card-lift cursor-pointer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 10px', borderRadius: 9, cursor: 'pointer',
                    marginBottom: 3,
                    background: sel ? 'rgba(99,102,241,0.09)' : 'transparent',
                    border: `1px solid ${sel ? 'rgba(99,102,241,0.32)' : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Checkbox */}
                  <span style={{
                    width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: sel ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                    border: sel ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 0.15s',
                  }}>
                    {sel && <IconCheck />}
                  </span>

                  {/* Name + group */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 12.5, fontWeight: sel ? 600 : 400,
                      color: sel ? 'var(--text-1)' : 'var(--text-2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {accountLabel(p.id)}
                    </p>
                    {grp && (
                      <p style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{grp}</p>
                    )}
                  </div>

                  {/* Job status badge */}
                  {j && (
                    <span className={`sf-badge ${j.status === 'ok' ? 'sf-badge-ok' : j.status === 'error' ? 'sf-badge-danger' : j.status === 'running' ? 'sf-badge-accent' : ''}`}
                      style={{ fontSize: 9, flexShrink: 0 }}>
                      {j.status === 'idle' ? '' : j.status}
                    </span>
                  )}

                  {/* Status dot */}
                  {j && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: statusColor(j.status),
                      boxShadow: j.status === 'running' ? '0 0 6px var(--accent-l)' : 'none',
                      transition: 'all 0.2s',
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ══ COL 2 — Pool config (centre) ════════════════════════════════════ */}
        <div className="sf-scroll" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Photo pool ─────────────────────────────────────────────────── */}
          <div className="sf-card anim-stagger" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', color: 'var(--accent-l)' }}><IconPhoto /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>{tr('Pool de photos', 'Photo pool')}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {tr('Les images seront distribuées automatiquement entre les comptes.', 'Images will be automatically distributed across accounts.')}
                </p>
              </div>
              <button
                onClick={() => setShowBankPicker(true)}
                className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                style={{ flexShrink: 0, marginLeft: 12 }}
              >
                <IconPlus />
                {tr('Ajouter depuis la banque', 'Add from bank')}
              </button>
            </div>

            {photoPool.length === 0 ? (
              <button
                onClick={() => setShowBankPicker(true)}
                className="sf-empty cursor-pointer"
                style={{
                  width: '100%', padding: '28px 0', borderRadius: 10,
                  border: '2px dashed rgba(99,102,241,0.18)',
                  background: 'rgba(99,102,241,0.03)',
                  color: 'var(--text-3)', fontSize: 13, gap: 8,
                }}
              >
                <span style={{ color: 'var(--accent-l)', opacity: 0.6 }}><IconPhoto /></span>
                <span>{tr('Aucune photo — cliquer pour en ajouter depuis la banque', 'No photo — click to add some from the bank')}</span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {photoPool.map((ph, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)',
                    maxWidth: 220,
                  }}>
                    <span style={{ color: 'var(--accent-l)', flexShrink: 0 }}><IconPhotoSm /></span>
                    <span style={{ fontSize: 12, color: 'var(--accent-l)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ph.name}
                    </span>
                    <button
                      onClick={() => setPhotoPool(prev => prev.filter((_, j) => j !== i))}
                      aria-label={tr('Retirer la photo', 'Remove photo')}
                      className="sf-btn-icon sf-press cursor-pointer"
                      style={{
                        flexShrink: 0, width: 18, height: 18, borderRadius: 5,
                        background: 'rgba(248,113,113,0.12)', border: 'none', color: 'var(--err)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <IconX />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setShowBankPicker(true)}
                  className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                  style={{ border: '1px dashed rgba(99,102,241,0.22)', color: 'var(--accent-l)' }}
                >
                  <IconPlus />
                  {tr('Ajouter', 'Add')}
                </button>
              </div>
            )}
          </div>

          {/* ── Text pool ──────────────────────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#A5B4FC' }}><IconText /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>{tr('Pool de textes sticker', 'Sticker text pool')}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {tr("Texte affiché sur le sticker lien. Laisse vide pour ne mettre que l'URL.", 'Text shown on the link sticker. Leave empty to show only the URL.')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => setShowCaptionPicker(true)}
                  className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                >
                  <IconPlus />
                  {tr('Depuis la banque', 'From bank')}
                </button>
              </div>
            </div>

            {textPool.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {textPool.map((txt, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 11px', borderRadius: 20,
                    background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)',
                    maxWidth: 260,
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--accent-l)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txt}</span>
                    <button
                      onClick={() => setTextPool(prev => prev.filter((_, j) => j !== i))}
                      aria-label={tr('Retirer le texte', 'Remove text')}
                      className="sf-press cursor-pointer"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(165,180,252,0.55)', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      <IconX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={editingText}
                onChange={e => setEditingText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editingText.trim()) {
                    setTextPool(prev => [...prev, editingText.trim()])
                    setEditingText('')
                  }
                }}
                placeholder={tr('Ou saisir manuellement puis Entrée…', 'Or type manually then Enter…')}
                className="sf-input"
                style={{ flex: 1, height: 36 }}
              />
              <button
                onClick={() => { if (editingText.trim()) { setTextPool(prev => [...prev, editingText.trim()]); setEditingText('') } }}
                disabled={!editingText.trim()}
                className="sf-btn sf-btn-secondary cursor-pointer"
                style={{ cursor: editingText.trim() ? 'pointer' : 'not-allowed', opacity: editingText.trim() ? 1 : 0.4, color: 'var(--accent-l)', borderColor: 'rgba(99,102,241,0.22)' }}
              >
                {tr('Ajouter', 'Add')}
              </button>
            </div>
          </div>

          {/* ── Per-phone links status ──────────────────────────────────────── */}
          <div
            className="sf-card"
            style={{
              padding: 18,
              borderColor: missingLinkIds.length > 0 ? 'rgba(245,158,11,0.5)' : undefined,
              boxShadow: missingLinkIds.length > 0 ? '0 0 18px rgba(245,158,11,0.12)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', color: 'var(--accent-l)' }}><IconLinkSm /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>{tr('Liens — 1 lien par compte', 'Links — 1 link per account')}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {tr('Chaque compte a son propre lien, éditable dans l’aperçu et sauvegardé automatiquement.', 'Each account has its own link, editable in the preview and saved automatically.')}
                </p>
              </div>
              {selectedIds.length > 0 && (
                <span
                  className={`sf-badge ${missingLinkIds.length > 0 ? 'sf-badge-danger' : 'sf-badge-ok'}`}
                  style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                >
                  {tr(`${selectedIds.length - missingLinkIds.length}/${selectedIds.length} liens`, `${selectedIds.length - missingLinkIds.length}/${selectedIds.length} links`)}
                </span>
              )}
            </div>

            {missingLinkIds.length > 0 && (
              <div className="sf-banner is-warn" style={{ marginTop: 12, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}><IconWarn /></span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {tr(`${missingLinkIds.length} compte${missingLinkIds.length > 1 ? 's' : ''} sans lien — remplis-${missingLinkIds.length > 1 ? 'les' : 'le'} dans l’aperçu avant de publier.`, `${missingLinkIds.length} account${missingLinkIds.length > 1 ? 's' : ''} without a link — fill ${missingLinkIds.length > 1 ? 'them' : 'it'} in the preview before publishing.`)}
                </span>
              </div>
            )}
          </div>

          {/* ── Highlights (option) : ajouter la story à la une après publication ── */}
          <div className="sf-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span className="sf-section-label" style={{ margin: 0 }}>{tr('Ajouter à la une (highlight)', 'Add to highlights')}</span>
                <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '3px 0 0' }}>{tr("Après la story, l'épingle dans un highlight du profil.", 'After the story, pin it to a profile highlight.')}</p>
              </div>
              <button
                onClick={() => setAddToHl(v => !v)}
                className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                style={{ background: addToHl ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'rgba(255,255,255,0.08)' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${addToHl ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            {addToHl && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['existing', 'create'] as const).map(m => (
                    <button key={m} onClick={() => setHlMode(m)}
                      className="cursor-pointer" style={{
                        flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                        background: hlMode === m ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${hlMode === m ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'}`,
                        color: hlMode === m ? '#c7cbff' : 'var(--text-3)',
                      }}>
                      {m === 'existing' ? tr('Highlight existant', 'Existing highlight') : tr('Créer un highlight', 'Create a highlight')}
                    </button>
                  ))}
                </div>
                <input
                  value={hlName} onChange={e => setHlName(e.target.value)}
                  placeholder={hlMode === 'create' ? tr('Nom du nouveau highlight', 'New highlight name') : tr('Nom du highlight existant', 'Existing highlight name')}
                  className="sf-input" style={{ height: 32, fontSize: 12.5 }} />
                <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0 }}>
                  {hlMode === 'create'
                    ? tr('Un nouveau highlight portant ce nom sera créé sur chaque compte.', 'A new highlight with this name will be created on each account.')
                    : tr('La story sera ajoutée au highlight portant ce nom (déjà présent sur le profil).', 'The story will be added to the highlight with this name (already on the profile).')}
                </p>
              </div>
            )}
          </div>

          {/* ── Distribution mode ───────────────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#A5B4FC' }}><IconShuffle /></span>
              <span className="sf-section-label" style={{ margin: 0 }}>{tr('Distribution', 'Distribution')}</span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {([
                { k: 'rotation' as const, icon: <IconRotate />, label: tr('Rotation', 'Rotation'),   desc: 'A, B, C, A, B, C…' },
                { k: 'random'   as const, icon: <IconShuffle />, label: tr('Aléatoire', 'Random'),  desc: tr('Mélangé à chaque lancement', 'Shuffled on each run') },
              ]).map(m => {
                const active = distribution === m.k
                return (
                  <button
                    key={m.k}
                    onClick={() => setDistrib(m.k)}
                    className="sf-card-lift cursor-pointer"
                    style={{
                      flex: 1, padding: '13px 14px', borderRadius: 11, textAlign: 'left', cursor: 'pointer',
                      background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${active ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ marginBottom: 7, color: active ? 'var(--accent-l)' : 'var(--text-3)' }}>{m.icon}</div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--accent-l)' : 'var(--text-2)', marginBottom: 2 }}>{m.label}</p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{m.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Proxy rotatif / concurrence ─────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rotProxy ? 0 : 12 }}>
              <div style={{ flex: 1 }}>
                <span className="sf-section-label" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {tr('Proxy rotatif', 'Rotating proxy')}
                  {(() => {
                    const rot = getProxyRotation()
                    const configured = rot.enabled && rot.urls.some(u => /^https?:\/\//i.test(u.trim()))
                    return configured ? null : (
                      <span title={tr("Rotation d'IP non configurée — risque de ban. Active-la dans Paramètres → Rotation d'IP proxy.", 'IP rotation not configured — risk of ban. Enable it in Settings → Proxy IP rotation.')} style={{ width: 7, height: 7, borderRadius: '50%', background: '#F87171', boxShadow: '0 0 6px rgba(248,113,113,0.9)', flexShrink: 0, animation: 'pulse 1.6s ease-in-out infinite' }} />
                    )
                  })()}
                </span>
                <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '3px 0 0' }}>{tr("Change l'IP avant chaque téléphone", 'Change the IP before each phone')}</p>
              </div>
              <button
                onClick={() => setRotProxy(v => !v)}
                className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                style={{ background: rotProxy ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'rgba(255,255,255,0.08)' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${rotProxy ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            {!rotProxy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{tr('Téléphones simultanés', 'Simultaneous phones')}</span>
                <input type="number" min={0} max={200} value={maxConc || ''} placeholder={tr('Tous', 'All')}
                  onChange={e => setMaxConc(Math.max(0, parseInt(e.target.value) || 0))}
                  className="sf-input" style={{ width: 64, textAlign: 'center', padding: '6px 8px' }} />
              </div>
            )}
            {rotProxy && (() => {
              const rot = getProxyRotation()
              const active = rot.enabled && rot.urls.some(u => /^https?:\/\//i.test(u.trim()))
              return active ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '9px 12px', borderRadius: 10, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.28)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#34D399', margin: 0 }}>{tr("Rotation d'IP active", 'IP rotation active')}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>{tr('IP fraîche avant chaque story ✓', 'Fresh IP before each story ✓')}</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(248,113,113,0.09)', border: '1px solid rgba(248,113,113,0.35)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#F87171', margin: 0 }}>{tr("Rotation d'IP non configurée — risque de ban ⚠", 'IP rotation not configured — risk of ban ⚠')}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '3px 0 0', lineHeight: 1.5 }}>{tr('Poster plusieurs comptes sur la même IP fait bannir. Active-la dans', 'Posting several accounts on the same IP gets you banned. Enable it in')} <strong style={{ color: '#fff' }}>{tr("Paramètres → Rotation d'IP proxy", 'Settings → Proxy IP rotation')}</strong>.</p>
                  </div>
                </div>
              )
            })()}
            {rotProxy && <div style={{ marginTop: 12 }}><ProxyPicker selected={rotUrls} onChange={setRotUrls} /></div>}
          </div>

        </div>

        {/* ══ COL 3 — Preview + assignment logs ═══════════════════════════════ */}
        <div style={{ borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>

          {/* Preview header */}
          <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <span className="sf-section-label">{tr('Aperçu des assignations', 'Assignment preview')}</span>
            {selectedIds.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)' }}>{tr('Sélectionne des comptes', 'Select accounts')}</p>
            ) : photoPool.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)' }}>{tr('Ajoute des photos dans le pool', 'Add photos to the pool')}</p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {tr(`${selectedIds.length} compte${selectedIds.length > 1 ? 's' : ''} · ${photoPool.length} photo${photoPool.length > 1 ? 's' : ''}${textPool.length > 0 ? ` · ${textPool.length} texte${textPool.length > 1 ? 's' : ''}` : ''}`, `${selectedIds.length} account${selectedIds.length > 1 ? 's' : ''} · ${photoPool.length} photo${photoPool.length > 1 ? 's' : ''}${textPool.length > 0 ? ` · ${textPool.length} text${textPool.length > 1 ? 's' : ''}` : ''}`)}
              </p>
            )}
          </div>

          {/* Barre : appliquer un lien à tous les comptes sélectionnés */}
          {previewAssignments.length > 0 && (
            <div style={{ display: 'flex', gap: 6, padding: '8px 10px 0' }}>
              <input
                value={bulkLink}
                onChange={e => setBulkLink(e.target.value)}
                disabled={running}
                placeholder={tr('Appliquer un lien à tous les comptes…', 'Apply a link to all accounts…')}
                className="sf-input"
                style={{ flex: 1, height: 30, fontSize: 11.5, borderRadius: 8 }}
                onKeyDown={e => { if (e.key === 'Enter') applyLinkToAll() }}
              />
              <button
                onClick={applyLinkToAll}
                disabled={running || !bulkLink.trim()}
                className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                style={{ flexShrink: 0, opacity: (running || !bulkLink.trim()) ? 0.5 : 1 }}
                title={tr('Renseigne ce lien pour tous les comptes sélectionnés', 'Set this link for all selected accounts')}
              >
                {tr('Appliquer à tous', 'Apply to all')}
              </button>
            </div>
          )}

          {/* Assignment list — anim-stagger */}
          <div className="sf-scroll anim-stagger" style={{ flex: 1, padding: '8px 10px' }}>
            {previewAssignments.length === 0 ? (
              <div className="sf-empty" style={{ padding: '48px 24px' }}>
                <div className="sf-empty-icon" style={{ color: 'var(--text-3)' }}>
                  <IconTarget />
                </div>
                <p className="sf-empty-title" style={{ fontSize: 13 }}>{tr('Aucune assignation', 'No assignment')}</p>
                <p className="sf-empty-desc" style={{ fontSize: 12 }}>{tr('Sélectionne des comptes et ajoute des photos.', 'Select accounts and add photos.')}</p>
              </div>
            ) : previewAssignments.map(a => {
              const p = phoneById(a.phoneId)
              const j = jobFor(a.phoneId)
              const hasLog = j && j.logs.length > 0
              const borderCol = j?.status === 'error' ? 'rgba(248,113,113,0.22)' : j?.status === 'ok' ? 'rgba(52,211,153,0.22)' : 'var(--border)'
              return (
                <div
                  key={a.phoneId}
                  style={{ marginBottom: 7, borderRadius: 10, overflow: 'hidden', border: `1px solid ${borderCol}` }}
                >
                  {/* Phone row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: 'rgba(255,255,255,0.018)' }}>
                    {/* Status dot */}
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: statusColor(j?.status),
                      boxShadow: j?.status === 'running' ? '0 0 6px var(--accent-l)' : 'none',
                      transition: 'all 0.2s',
                    }} />
                    <span style={{
                      flex: 1, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: j?.status === 'ok' ? 'var(--ok)' : j?.status === 'error' ? 'var(--err)' : 'var(--text-1)',
                    }}>
                      {accountLabel(a.phoneId)}
                    </span>
                    {/* Status badge */}
                    {j && j.status !== 'idle' && (
                      <span className={`sf-badge ${j.status === 'ok' ? 'sf-badge-ok' : j.status === 'error' ? 'sf-badge-danger' : j.status === 'running' ? 'sf-badge-accent' : ''}`}
                        style={{ fontSize: 9 }}>
                        {j.status}
                      </span>
                    )}
                    {hasLog && (
                      <button
                        onClick={() => setOpenLog(openLog === a.phoneId ? null : a.phoneId)}
                        aria-label={openLog === a.phoneId ? tr('Masquer les logs', 'Hide logs') : tr('Afficher les logs', 'Show logs')}
                        className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                        style={{ padding: '2px 6px', height: 22, color: 'var(--text-3)' }}
                      >
                        <IconChevron open={openLog === a.phoneId} />
                      </button>
                    )}
                  </div>

                  {/* Details */}
                  <div style={{ padding: '7px 11px 10px', fontSize: 11, lineHeight: 1.65 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(129,140,248,0.75)', marginBottom: 3 }}>
                      <span style={{ flexShrink: 0 }}><IconPhotoSm /></span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.photo.name}</span>
                    </div>

                    {a.text && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', marginBottom: 3 }}>
                        <span style={{ flexShrink: 0 }}><IconTextSm /></span>
                        <span>"{a.text}"</span>
                      </div>
                    )}

                    {/* Per-phone link input */}
                    <div style={{ position: 'relative', marginTop: 6 }}>
                      <span style={{
                        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                        pointerEvents: 'none', color: getLink(a.phoneId).trim() ? 'var(--accent)' : 'var(--text-4)',
                      }}>
                        <IconLinkSm />
                      </span>
                      <input
                        value={getLink(a.phoneId)}
                        onChange={e => setLink(a.phoneId, e.target.value)}
                        disabled={running}
                        placeholder={tr('lien de ce compte…', "this account's link…")}
                        className="sf-input"
                        style={{
                          height: 30, paddingLeft: 26, paddingRight: getLink(a.phoneId).trim() ? 28 : 9,
                          fontSize: 11.5, borderRadius: 8,
                          borderColor: getLink(a.phoneId).trim() ? 'rgba(99,102,241,0.28)' : 'rgba(245,158,11,0.28)',
                        }}
                      />
                      {getLink(a.phoneId).trim() && (
                        <span style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          pointerEvents: 'none', display: 'inline-flex', color: 'var(--accent)',
                        }} title={tr('Enregistré', 'Saved')} aria-label={tr('Enregistré', 'Saved')}>
                          <IconSave />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Log panel */}
                  {openLog === a.phoneId && j && j.logs.length > 0 && (
                    <div style={{
                      borderTop: '1px solid var(--border)',
                      padding: '8px 11px',
                      background: 'rgba(7,7,11,0.9)',
                      fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.7,
                      maxHeight: 180, overflowY: 'auto',
                    }}>
                      {j.logs.map((l, i) => (
                        <div key={i} style={{
                          color: l.startsWith('[err]') ? 'var(--err)' : l.includes('ok') ? 'var(--ok)' : 'var(--text-2)',
                        }}>
                          {l}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Stop button — shown in col 3 when running */}
          {running && (
            <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { abortRef.current = true; setRunning(false); if (runIdRef.current) { endRun(runIdRef.current); runIdRef.current = null } }}
                className="sf-btn sf-btn-danger cursor-pointer"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <IconStop />
                {tr('Arrêter', 'Stop')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Schedule modal ───────────────────────────────────────────────────── */}
      {showSchedule && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9980,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
          }}
          onClick={e => { if (e.target === e.currentTarget && !scheduling) setShowSchedule(false) }}
        >
          <div style={{
            width: '100%', maxWidth: 420, margin: '0 16px',
            background: BG_2, border: `1px solid ${HAIR}`, borderRadius: 14,
            overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px', borderBottom: `1px solid ${HAIR}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ fontSize: 14.5, fontWeight: 700, color: TEXT_1, margin: 0 }}>{tr('Programmer les stories', 'Schedule stories')}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {tr(`${selectedIds.length} compte${selectedIds.length > 1 ? 's' : ''} · ${photoPool.length} photo${photoPool.length > 1 ? 's' : ''} · assignations figées au moment de la programmation`, `${selectedIds.length} account${selectedIds.length > 1 ? 's' : ''} · ${photoPool.length} photo${photoPool.length > 1 ? 's' : ''} · assignments locked at scheduling time`)}
                </p>
              </div>
              <button
                onClick={() => !scheduling && setShowSchedule(false)}
                aria-label={tr('Fermer', 'Close')}
                className="sf-btn-icon cursor-pointer"
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'transparent', border: 'none', color: 'var(--text-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><IconX /></button>
            </div>

            {schedDone ? (
              <div style={{ padding: '34px 20px', textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                </div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_1, margin: 0 }}>{schedDone}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '6px 0 0' }}>
                  {tr("Retrouve-la dans l'onglet Programmation.", 'Find it in the Scheduling tab.')}
                </p>
              </div>
            ) : (
              <>
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Date / time */}
                  <div>
                    <label style={{
                      display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
                      textTransform: 'uppercase', color: ACCENT, marginBottom: 7,
                    }}>{tr('Date et heure', 'Date and time')}</label>
                    <input
                      type="datetime-local"
                      value={schedAt}
                      onChange={e => setSchedAt(e.target.value)}
                      className="sf-input"
                      style={{ height: 38, width: '100%', colorScheme: 'dark' }}
                    />
                  </div>

                  {/* Delay between accounts */}
                  <div>
                    <label style={{
                      display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
                      textTransform: 'uppercase', color: ACCENT, marginBottom: 7,
                    }}>{tr('Délai entre comptes', 'Delay between accounts')}</label>
                    <div style={{ display: 'flex', gap: 7 }}>
                      {[0, 2, 5, 10, 15].map(m => (
                        <button
                          key={m}
                          onClick={() => setSchedDelay(m)}
                          className="cursor-pointer"
                          style={{
                            flex: 1, height: 34, borderRadius: 8, cursor: 'pointer',
                            fontSize: 12.5, fontWeight: 600,
                            background: schedDelay === m ? 'rgba(99,102,241,0.15)' : 'transparent',
                            border: `1px solid ${schedDelay === m ? 'rgba(99,102,241,0.4)' : HAIR}`,
                            color: schedDelay === m ? ACCENT_L : 'var(--text-3)',
                            transition: 'all 0.15s',
                          }}
                        >{m === 0 ? tr('Aucun', 'None') : `${m} min`}</button>
                      ))}
                    </div>
                  </div>

                  {schedErr && (
                    <div className="sf-banner is-danger" role="alert" style={{ alignItems: 'flex-start' }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}><IconWarn /></span>
                      <span>{schedErr}</span>
                    </div>
                  )}

                  <p style={{ fontSize: 11, color: 'var(--text-4)', margin: 0, lineHeight: 1.55 }}>
                    {tr("Les stories utilisent l'automation du téléphone — l'application doit être ouverte à l'heure programmée pour qu'elles partent.", 'Stories use the phone automation — the app must be open at the scheduled time for them to go out.')}
                  </p>
                </div>

                {/* Footer */}
                <div style={{ padding: '0 20px 18px', display: 'flex', gap: 9 }}>
                  <button
                    onClick={() => setShowSchedule(false)}
                    disabled={scheduling}
                    className="sf-btn sf-btn-secondary cursor-pointer"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >{tr('Annuler', 'Cancel')}</button>
                  <button
                    onClick={() => scheduleRun()}
                    disabled={scheduling}
                    className="sf-btn sf-btn-primary cursor-pointer"
                    style={{
                      flex: 2, justifyContent: 'center',
                      opacity: scheduling ? 0.7 : 1,
                      cursor: scheduling ? 'wait' : 'pointer', gap: 8,
                    }}
                  >
                    {scheduling ? (
                      <><span className="sf-spinner" style={{ width: 13, height: 13 }} /> {tr('Programmation…', 'Scheduling…')}</>
                    ) : (
                      <>{tr(`Programmer ${selectedIds.length} story${selectedIds.length > 1 ? 's' : ''}`, `Schedule ${selectedIds.length} story${selectedIds.length > 1 ? 's' : '' }`)}</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
