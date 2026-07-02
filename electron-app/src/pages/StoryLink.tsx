import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, postInstagramStory, stopPhone, type GeelarkPhone } from '@/lib/geelark'
import { createScheduledPost, defaultSchedValue } from '@/lib/schedulerService'
import { checkAndDeductCredits, refundCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { BankPicker } from '@/pages/Bank'
import type { CaptionItem } from '@/pages/CaptionBank'
import { supabase } from '@/lib/supabase'
import { playSuccess, playError } from '@/lib/sounds'
import { useToast } from '@/components/Toast'
import { ACCENT, ACCENT_L, ACCENT_D, TEXT_1, HAIR, BG_2 } from '@/lib/theme'

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
            <p style={{ fontSize: 14, fontWeight: 700, color: TEXT_1, margin: 0 }}>Banque de captions</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>{selected.size} sélectionné{selected.size !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', lineHeight: 1, display: 'flex' }}><IconX /></button>
        </div>

        {/* Folder tabs */}
        {folders.length > 1 && (
          <div style={{ padding: '10px 14px 0', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, borderBottom: `1px solid ${HAIR}` }}>
            {folders.map(f => {
              const active = (folder ?? 'Tous') === f
              return (
                <button key={f} onClick={() => setFolder(f === 'Tous' ? null : f)}
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: active ? 700 : 400, cursor: 'pointer', marginBottom: 10,
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent', border: `1px solid ${active ? 'rgba(99,102,241,0.4)' : HAIR}`, color: active ? ACCENT_L : 'var(--text-3)', transition: 'all 0.12s' }}>
                  {f}
                </button>
              )
            })}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
          {loading ? (
            <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><div className="sf-spinner" /></div>
          ) : visible.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '32px 0' }}>Aucune caption trouvée</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', marginBottom: 4 }}>
                <button onClick={toggleAll} style={{ fontSize: 11, color: ACCENT_L, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {visible.every(i => selected.has(i.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>({visible.length} caption{visible.length !== 1 ? 's' : ''})</span>
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
          <button onClick={onClose} className="sf-btn sf-btn-secondary cursor-pointer" style={{ flex: 1, justifyContent: 'center' }}>Annuler</button>
          <button onClick={confirm} disabled={selected.size === 0} className="sf-btn sf-btn-primary cursor-pointer"
            style={{ flex: 2, justifyContent: 'center', opacity: selected.size === 0 ? 0.45 : 1, cursor: selected.size === 0 ? 'not-allowed' : 'pointer' }}>
            Ajouter {selected.size > 0 ? `(${selected.size})` : ''} caption{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StoryLink({ user }: { user: User }) {
  const conns  = useConnections(user)
  const bearer = conns.bearer
  const { role, perms, currentOrg } = useOrg()
  const credits = useCredits()
  const toast = useToast()

  const [storyPlatformChosen, setStoryPlatformChosen] = useState(false)

  // ── Phones ────────────────────────────────────────────────────────────────
  const [phones, setPhones]           = useState<GeelarkPhone[]>([])
  const [loadingPhones, setLoading]   = useState(false)
  const [phoneSearch, setPhoneSearch] = useState('')
  const [groupFilter, _setGroupFilter] = useState(loadLastGroup)
  const setGroupFilter = (g: string) => { _setGroupFilter(g); saveLastGroup(g) }
  const [groups, setGroups]           = useState<string[]>(['Tous'])
  const [selected, setSelected]       = useState<Set<string>>(new Set())

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
  const [openLog, setOpenLog]               = useState<string | null>(null)
  const [dryRun, setDryRun]                 = useState(false)
  // Concurrence (proxys rotatifs) — persistée
  const [rotProxy, setRotProxy]   = useState(() => localStorage.getItem('sf-story-rotproxy') === '1')
  const [maxConc,  setMaxConc]    = useState(() => parseInt(localStorage.getItem('sf-story-maxconc') ?? '0', 10) || 0)
  useEffect(() => { localStorage.setItem('sf-story-rotproxy', rotProxy ? '1' : '0') }, [rotProxy])
  useEffect(() => { localStorage.setItem('sf-story-maxconc', String(maxConc)) }, [maxConc])
  const [showSchedule, setShowSchedule]     = useState(false)
  const [schedAt, setSchedAt]               = useState(() => defaultSchedValue(60))
  const [schedDelay, setSchedDelay]         = useState(2)
  const [scheduling, setScheduling]         = useState(false)
  const [schedDone, setSchedDone]           = useState('')
  const [schedErr, setSchedErr]             = useState('')
  const abortRef = useRef(false)

  useEffect(() => () => { abortRef.current = true }, [])

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

  // ── Load phones ───────────────────────────────────────────────────────────
  async function loadPhones() {
    if (!bearer) return
    setLoading(true)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
      const grps = [...new Set(list.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
      if (!grps.includes(loadLastGroup())) setGroupFilter('Tous')
      // Prefer DB link column (set from Phones tab) over localStorage fallback.
      const { data: dbPhones } = await supabase.from('phones').select('id,geelark_id,link').in(
        'geelark_id', list.map(p => p.id),
      )
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
  const blockReason = !bearer ? 'Connecte GéeLark dans les Paramètres'
    : selectedIds.length === 0 ? 'Sélectionne au moins un compte'
    : photoPool.length === 0 ? 'Ajoute au moins une photo'
    : missingLinkIds.length > 0 ? `${missingLinkIds.length} compte${missingLinkIds.length > 1 ? 's' : ''} sans lien — renseigne le lien de chaque compte`
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
        setJobs(selectedIds.map(id => ({ phoneId: id, status: 'error', logs: [`[err] ${creditRes.error ?? 'Crédits insuffisants'} (requis : ${creditCost})`] })))
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

    // Une story = des dizaines d'appels ADB (shell/execute) sur ~2 min. Lancer TOUS
    // les téléphones en parallèle sature la limite GeeLark (200 req/min) → la moitié
    // des appels échouent → stories ratées. On borne la concurrence à 3 téléphones.
    const runOne = async (asgn: typeof assignments[number]): Promise<number> => {
      if (abortRef.current) return 0
      setStatus(asgn.phoneId, 'running')
      try {
        // La vérification de connexion (proxy rotatif) est faite AU DÉBUT de
        // postInstagramStory. Pas de retry sur échec : re-poster risquerait un
        // double post si GéeLark rapporte un faux échec.
        const res = await postInstagramStory(
          bearer, asgn.phoneId,
          { imageUrl: asgn.photo.url, linkUrl: asgn.link, linkText: asgn.text || undefined, dryRun },
          m => addLog(asgn.phoneId, m),
        )
        if (res.ok) { setStatus(asgn.phoneId, 'ok'); return 1 }
        else { setStatus(asgn.phoneId, 'error'); addLog(asgn.phoneId, `[err] ${res.error ?? 'Échec'}`); return 0 }
      } catch (e) {
        setStatus(asgn.phoneId, 'error')
        addLog(asgn.phoneId, `[err] ${e instanceof Error ? e.message : String(e)}`)
        return 0
      } finally {
        try { await stopPhone(bearer, asgn.phoneId) } catch (_) { /* ignore */ }
      }
    }

    // Par défaut : TOUS les téléphones en même temps (comme le Mass Posting).
    // Proxy rotatif → 1 à la fois ; sinon le nombre choisi (0 = tous).
    const CONCURRENCY = rotProxy ? 1 : (maxConc > 0 ? maxConc : assignments.length)
    // Petit décalage de démarrage plafonné (~6s) pour ne pas booter tout au même
    // instant. En rotatif un seul worker → aucun décalage.
    const staggerBase = rotProxy ? 0 : 1000
    const queue = [...assignments]
    let okCount = 0
    const worker = async (staggerMs: number) => {
      if (staggerMs > 0) await new Promise(r => setTimeout(r, staggerMs))
      while (queue.length && !abortRef.current) {
        const asgn = queue.shift()!
        okCount += await runOne(asgn)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, assignments.length) }, (_, i) => worker(Math.min(i, 6) * staggerBase)),
    )
    if (okCount > 0) playSuccess(); else playError()
    setRunning(false)

    // Historique : on enregistre TOUJOURS le run (réussi ou non) pour que la
    // page Historique soit fiable. (table post_runs, fire-and-forget)
    const totalRun = jobs.length || assignments.length
    supabase.from('post_runs').insert({
      user_id:   user.id,
      org_id:    currentOrg?.id ?? null,
      type:      'story',
      ok_count:  okCount,
      err_count: Math.max(0, totalRun - okCount),
      total:     totalRun,
    }).then(() => {}, () => {})

    // Reset après un run réussi : vide pool photos, textes et sélection téléphones
    if (okCount > 0) {
      setTimeout(() => {
        setPhotoPool([])
        savePhotoPool([])
        setTextPool([])
        saveTextPool([])
        setSelected(new Set())
        setJobs([])
        toast.show({ title: 'Configuration réinitialisée', body: 'Photos, textes et comptes ont été vidés après la publication.', kind: 'info' })
      }, 3000)
    }
  }

  // ── Schedule ──────────────────────────────────────────────────────────────
  const canSchedule = !!bearer && selectedIds.length > 0 && photoPool.length > 0 && missingLinkIds.length === 0 && !running

  async function scheduleRun() {
    if (!canSchedule || scheduling) return
    setSchedErr(''); setScheduling(true)
    try {
      const when = new Date(schedAt)
      if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
        setSchedErr('Choisis une date au moins 1 minute dans le futur.')
        setScheduling(false)
        return
      }
      const creditCost = selectedIds.length * CREDIT_COSTS.story
      const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
      if (!creditRes.ok) {
        setSchedErr(`${creditRes.error ?? 'Crédits insuffisants'} (requis : ${creditCost} crédits)`)
        setScheduling(false)
        return
      }
      if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
      const assignments = buildAssignments(selectedIds)
      await createScheduledPost({
        userId:        user.id,
        orgId:         currentOrg?.id ?? null,
        createdByName: user.email?.split('@')[0] ?? 'Moi',
        type:          'story',
        scheduledAt:   when,
        phones: assignments.map(a => {
          const p = phoneById(a.phoneId)
          return {
            id:               a.phoneId,
            geelark_id:       a.phoneId,
            phone_name:       p ? phoneName(p) : a.phoneId.slice(-6),
            ig_username:      null,
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
      setSchedDone(`${assignments.length} story(s) programmée(s) pour le ${when.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`)
      setTimeout(() => { setShowSchedule(false); setSchedDone('') }, 2200)
    } catch (e) {
      const refundAmount = selectedIds.length * CREDIT_COSTS.story
      const refunded = await refundCredits(credits.ownerId, refundAmount)
      if (refunded) credits.refresh()
      setSchedErr(`${e instanceof Error ? e.message : String(e)}${refunded ? ` — ${refundAmount} crédits remboursés` : ''}`)
    } finally {
      setScheduling(false)
    }
  }

  // ── Job status helpers ────────────────────────────────────────────────────
  const jobFor = (id: string) => jobs.find(j => j.phoneId === id)
  const statusColor = (s?: JobStatus) =>
    s === 'ok' ? 'var(--ok)' : s === 'error' ? 'var(--err)' : s === 'running' ? 'var(--accent-l)' : 'rgba(148,163,184,0.28)'

  // ── No connection guard ───────────────────────────────────────────────────
  if (!conns.loading && !bearer) return (
    <div className="sf-page anim-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="sf-empty">
        <div className="sf-empty-icon" style={{ color: 'var(--accent-l)' }}>
          <IconNoConnection />
        </div>
        <p className="sf-empty-title">GéeLark non connecté</p>
        <p className="sf-empty-desc">
          Ajoute ta clé GéeLark dans les Paramètres pour automatiser tes stories.
        </p>
      </div>
    </div>
  )

  return (
    <div className="sf-page anim-page">
      {/* Popup de choix de plateforme — Story = Instagram uniquement pour le moment */}
      {!storyPlatformChosen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,11,14,0.8)', backdropFilter: 'blur(6px)' }}>
          <div className="sf-card sf-anim-scale-in" style={{ width: '100%', maxWidth: 440, padding: '30px 30px 26px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: TEXT_1 }}>Story — quelle plateforme ?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, marginBottom: 22 }}>Les stories sont disponibles sur Instagram.</p>
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                onClick={() => setStoryPlatformChosen(true)}
                className="cursor-pointer"
                style={{ flex: 1, padding: '22px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1.5px solid rgba(99,102,241,0.4)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 12 }}>📸</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_1 }}>Instagram</div>
                <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 5 }}>Story + sticker lien</div>
              </button>
              <div style={{ flex: 1, padding: '22px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.01)', border: '1.5px solid var(--border)', opacity: 0.5 }}>
                <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 12 }}>🎵</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-3)' }}>TikTok</div>
                <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 5 }}>Bientôt</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
            boxShadow: '0 10px 24px -8px rgba(245,158,11,0.5), inset 0 1px 0 0 rgba(255,255,255,0.35)',
          }}>
            <IconLink />
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">Story</h1>
            <p className="sf-page-sub">Publie ou programme des stories avec lien sur tous tes comptes.</p>
          </div>
        </div>

        <div className="sf-anim-slide-up sf-d100" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {/* Dry-run toggle */}
          <button
            onClick={() => setDryRun(v => !v)}
            disabled={running}
            title={running ? 'Indisponible pendant une exécution' : "Déroule toute l'automation (image, caméra, sticker, lien) mais s'arrête avant de publier. Gratuit — idéal pour vérifier que le flux marche sur tes téléphones."}
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
            {dryRun ? 'Mode test ON (ne publie pas)' : 'Mode test'}
          </button>

          {/* Schedule button */}
          <button
            onClick={() => { setSchedAt(defaultSchedValue(60)); setSchedErr(''); setShowSchedule(true) }}
            disabled={!canSchedule}
            title={canSchedule ? 'Programmer la story pour plus tard' : blockReason || undefined}
            className="sf-btn sf-btn-lg sf-btn-secondary"
            style={{ cursor: canSchedule ? 'pointer' : 'not-allowed', opacity: canSchedule ? 1 : 0.45, gap: 8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>
            </svg>
            Programmer
          </button>

          {/* Launch / Stop button */}
          {running ? (
            <button
              onClick={() => { abortRef.current = true; setRunning(false) }}
              className="sf-btn sf-btn-lg sf-btn-danger"
              style={{ cursor: 'pointer', gap: 8 }}
            >
              <IconStop />
              Arrêter
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!canRun}
              title={canRun ? (dryRun ? 'Test — ne publie pas réellement' : `Publier la story sur ${selectedIds.length} compte${selectedIds.length > 1 ? 's' : ''} · ${storyCost} crédits`) : blockReason || undefined}
              className={`sf-btn sf-btn-lg sf-btn-primary cursor-pointer`}
              style={{ cursor: canRun ? 'pointer' : 'not-allowed', gap: 9, opacity: canRun ? 1 : 0.5 }}
            >
              <IconSend />
              {dryRun
                ? `Tester${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`
                : `Publier${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}${storyCost > 0 ? ` · ${storyCost} cr.` : ''}`}
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
              <span className="sf-section-label" style={{ margin: 0 }}>Comptes</span>
              {selected.size > 0 && (
                <span className="sf-badge sf-badge-accent" style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                  {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
                </span>
              )}
            </div>

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
                placeholder="Rechercher…"
                className="sf-input"
                style={{ height: 32, paddingLeft: 32, fontSize: 12 }}
              />
            </div>

            {/* Select / Clear */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={selectAll} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer" style={{ flex: 1 }}>
                Tout sélectionner
              </button>
              <button onClick={clearAll} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ flex: 1 }}>
                Effacer
              </button>
            </div>
          </div>

          {/* Phone list — anim-stagger */}
          <div className="sf-scroll anim-stagger" style={{ flex: 1, padding: '6px 8px 10px' }}>
            {loadingPhones ? (
              <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div className="sf-spinner" />
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Chargement…</p>
              </div>
            ) : visiblePhones.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 4px' }}>Aucun compte</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Vérifie le filtre de groupe, ou ajoute des téléphones dans l'onglet Téléphones.</p>
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
                      {phoneName(p)}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ color: 'var(--accent-l)' }}><IconPhoto /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>Pool de photos</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Les images seront distribuées automatiquement entre les comptes.
                </p>
              </div>
              <button
                onClick={() => setShowBankPicker(true)}
                className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                style={{ flexShrink: 0, marginLeft: 12 }}
              >
                <IconPlus />
                Ajouter depuis la banque
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
                <span>Aucune photo — cliquer pour en ajouter depuis la banque</span>
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
                      aria-label="Retirer la photo"
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
                  Ajouter
                </button>
              </div>
            )}
          </div>

          {/* ── Text pool ──────────────────────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ color: 'var(--accent-l)' }}><IconText /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>Pool de textes sticker</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Texte affiché sur le sticker lien. Laisse vide pour ne mettre que l'URL.
                </p>
              </div>
              <button
                onClick={() => setShowCaptionPicker(true)}
                className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
                style={{ flexShrink: 0, marginLeft: 12 }}
              >
                <IconPlus />
                Depuis la banque
              </button>
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
                    <span style={{ fontSize: 12, color: '#67e8f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txt}</span>
                    <button
                      onClick={() => setTextPool(prev => prev.filter((_, j) => j !== i))}
                      aria-label="Retirer le texte"
                      className="sf-press cursor-pointer"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(103,232,249,0.5)', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
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
                placeholder='Ou saisir manuellement puis Entrée…'
                className="sf-input"
                style={{ flex: 1, height: 36 }}
              />
              <button
                onClick={() => { if (editingText.trim()) { setTextPool(prev => [...prev, editingText.trim()]); setEditingText('') } }}
                disabled={!editingText.trim()}
                className="sf-btn sf-btn-secondary cursor-pointer"
                style={{ cursor: editingText.trim() ? 'pointer' : 'not-allowed', opacity: editingText.trim() ? 1 : 0.4, color: '#67e8f9', borderColor: 'rgba(99,102,241,0.22)' }}
              >
                Ajouter
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ color: 'var(--accent-l)' }}><IconLinkSm /></span>
                  <span className="sf-section-label" style={{ margin: 0 }}>Liens — 1 lien par compte</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Chaque compte a son propre lien, éditable dans l’aperçu et sauvegardé automatiquement.
                </p>
              </div>
              {selectedIds.length > 0 && (
                <span
                  className={`sf-badge ${missingLinkIds.length > 0 ? 'sf-badge-danger' : 'sf-badge-ok'}`}
                  style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                >
                  {selectedIds.length - missingLinkIds.length}/{selectedIds.length} liens
                </span>
              )}
            </div>

            {missingLinkIds.length > 0 && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 9,
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
                color: 'rgba(251,191,36,0.9)', fontSize: 12,
              }}>
                <span style={{ flexShrink: 0, marginTop: 1, color: '#fbbf24' }}><IconWarn /></span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {missingLinkIds.length} compte{missingLinkIds.length > 1 ? 's' : ''} sans lien — remplis-{missingLinkIds.length > 1 ? 'les' : 'le'} dans l’aperçu avant de publier.
                </span>
              </div>
            )}
          </div>

          {/* ── Distribution mode ───────────────────────────────────────────── */}
          <div className="sf-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
              <span style={{ color: 'var(--accent-l)' }}><IconShuffle /></span>
              <span className="sf-section-label" style={{ margin: 0 }}>Distribution</span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {([
                { k: 'rotation' as const, icon: <IconRotate />, label: 'Rotation',   desc: 'A, B, C, A, B, C…' },
                { k: 'random'   as const, icon: <IconShuffle />, label: 'Aléatoire',  desc: 'Mélangé à chaque lancement' },
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
                <span className="sf-section-label" style={{ margin: 0 }}>Proxy rotatif</span>
                <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '3px 0 0' }}>Poste 1 téléphone à la fois (évite les coupures de co)</p>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Téléphones simultanés</span>
                <input type="number" min={0} max={200} value={maxConc || ''} placeholder="Tous"
                  onChange={e => setMaxConc(Math.max(0, parseInt(e.target.value) || 0))}
                  className="sf-input" style={{ width: 64, textAlign: 'center', padding: '6px 8px' }} />
              </div>
            )}
          </div>
        </div>

        {/* ══ COL 3 — Preview + assignment logs ═══════════════════════════════ */}
        <div style={{ borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>

          {/* Preview header */}
          <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <span className="sf-section-label">Aperçu des assignations</span>
            {selectedIds.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)' }}>Sélectionne des comptes</p>
            ) : photoPool.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)' }}>Ajoute des photos dans le pool</p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {selectedIds.length} compte{selectedIds.length > 1 ? 's' : ''} · {photoPool.length} photo{photoPool.length > 1 ? 's' : ''}{textPool.length > 0 ? ` · ${textPool.length} texte${textPool.length > 1 ? 's' : ''}` : ''}
              </p>
            )}
          </div>

          {/* Assignment list — anim-stagger */}
          <div className="sf-scroll anim-stagger" style={{ flex: 1, padding: '8px 10px' }}>
            {previewAssignments.length === 0 ? (
              <div className="sf-empty" style={{ padding: '48px 24px' }}>
                <div className="sf-empty-icon" style={{ color: 'var(--text-3)' }}>
                  <IconTarget />
                </div>
                <p className="sf-empty-title" style={{ fontSize: 13 }}>Aucune assignation</p>
                <p className="sf-empty-desc" style={{ fontSize: 12 }}>Sélectionne des comptes et ajoute des photos.</p>
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
                      {p ? phoneName(p) : a.phoneId.slice(-6)}
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
                        aria-label={openLog === a.phoneId ? 'Masquer les logs' : 'Afficher les logs'}
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
                        placeholder="lien de ce compte…"
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
                        }} title="Enregistré" aria-label="Enregistré">
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
                onClick={() => { abortRef.current = true; setRunning(false) }}
                className="sf-btn sf-btn-danger cursor-pointer"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <IconStop />
                Arrêter
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
                <p style={{ fontSize: 14.5, fontWeight: 700, color: TEXT_1, margin: 0 }}>Programmer les stories</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {selectedIds.length} compte{selectedIds.length > 1 ? 's' : ''} · {photoPool.length} photo{photoPool.length > 1 ? 's' : ''} · assignations figées au moment de la programmation
                </p>
              </div>
              <button
                onClick={() => !scheduling && setShowSchedule(false)}
                aria-label="Fermer"
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
                  Retrouve-la dans l'onglet Programmation.
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
                    }}>Date et heure</label>
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
                    }}>Délai entre comptes</label>
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
                        >{m === 0 ? 'Aucun' : `${m} min`}</button>
                      ))}
                    </div>
                  </div>

                  {schedErr && (
                    <p style={{
                      fontSize: 12, color: 'var(--err)', margin: 0, padding: '9px 12px',
                      background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)',
                      borderRadius: 8,
                    }}>{schedErr}</p>
                  )}

                  <p style={{ fontSize: 11, color: 'var(--text-4)', margin: 0, lineHeight: 1.55 }}>
                    Les stories utilisent l'automation du téléphone — l'application doit être
                    ouverte à l'heure programmée pour qu'elles partent.
                  </p>
                </div>

                {/* Footer */}
                <div style={{ padding: '0 20px 18px', display: 'flex', gap: 9 }}>
                  <button
                    onClick={() => setShowSchedule(false)}
                    disabled={scheduling}
                    className="sf-btn sf-btn-secondary cursor-pointer"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >Annuler</button>
                  <button
                    onClick={scheduleRun}
                    disabled={scheduling}
                    className="sf-btn sf-btn-primary cursor-pointer"
                    style={{
                      flex: 2, justifyContent: 'center',
                      opacity: scheduling ? 0.7 : 1,
                      cursor: scheduling ? 'wait' : 'pointer', gap: 8,
                    }}
                  >
                    {scheduling ? (
                      <><span className="sf-spinner" style={{ width: 13, height: 13 }} /> Programmation…</>
                    ) : (
                      <>Programmer {selectedIds.length} story{selectedIds.length > 1 ? 's' : ''}</>
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
