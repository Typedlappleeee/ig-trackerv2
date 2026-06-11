import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BankPicker } from '@/pages/Bank'
import { useT, useLang } from '@/lib/i18n'

interface AdsPowerProps { user: User }

interface SelectedVideo { path: string; title: string }

// ── Types ──────────────────────────────────────────────────────────────────────
interface FbProfile {
  id:           string
  name:         string
  page_name:    string
  ads_user_id:  string
  enabled:      boolean
}

type LogStatus = 'pending' | 'running' | 'done' | 'error'
interface LogEntry {
  profile_id:   string
  profile_name: string
  status:       LogStatus
  message:      string
  ts:           string
}

const STATUS_COLOR: Record<LogStatus, string> = {
  pending: 'rgba(148,163,184,0.4)',
  running: '#60a5fa',
  done:    '#22c55e',
  error:   '#f87171',
}

// ── Status dot SVGs ────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: LogStatus }) {
  if (status === 'pending') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: STATUS_COLOR.pending, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  )
  if (status === 'running') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: STATUS_COLOR.running, flexShrink: 0 }} className="anim-pulse">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
  if (status === 'done') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: STATUS_COLOR.done, flexShrink: 0 }}>
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  )
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: STATUS_COLOR.error, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
    </svg>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function now() { return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function adsRequest(urlPath: string, apiKey?: string, body?: unknown): Promise<any> {
  const sep = urlPath.includes('?') ? '&' : '?'
  const fullPath = `${urlPath}${apiKey ? `${sep}serial_number=${encodeURIComponent(apiKey)}` : ''}`
  const fetchOpts: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }

  const api = (window as unknown as {
    electronAPI?: {
      adspowerRequest?: (opts: { method: 'GET' | 'POST'; path: string; body?: unknown }) => Promise<{ ok: boolean; data?: unknown; error?: string }>
    }
  }).electronAPI
  if (api?.adspowerRequest) {
    const result = await api.adspowerRequest({ method: body ? 'POST' : 'GET', path: fullPath, body })
    if (!result.ok) throw new Error(result.error ?? 'AdsPower IPC error')
    return result.data
  }

  const endpoints = [
    `http://127.0.0.1:50327${fullPath}`,
    `http://localhost:50327${fullPath}`,
    `http://localhost:50325${fullPath}`,
    `http://127.0.0.1:50325${fullPath}`,
  ]
  let lastErr = ''
  for (const url of endpoints) {
    try {
      const res = await fetch(url, fetchOpts)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      lastErr = (e as Error).message
    }
  }
  throw new Error(`AdsPower inaccessible (${lastErr}). Open the ScaleFlow desktop app on this PC, then try again.`)
}

// ── Profile row ────────────────────────────────────────────────────────────────
function ProfileRow({
  profile, selected, onToggle, onDelete,
}: {
  profile:  FbProfile
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="sf-card p-3 flex items-center gap-2.5 cursor-pointer transition-all"
      style={selected
        ? { borderColor: 'rgba(201,181,132,0.4)', background: 'rgba(201,181,132,0.08)' }
        : {}}
    >
      {/* Checkbox */}
      <div
        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          border: selected ? 'none' : '1.5px solid rgba(148,163,184,0.3)',
          background: selected ? 'linear-gradient(130deg,#C9B584,#D4C499)' : 'transparent',
        }}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        )}
      </div>

      {/* FB avatar */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-[13px]"
        style={{ background: '#1877f2' }}>
        f
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-text truncate">{profile.name}</p>
        <p className="text-[11px] text-text3 truncate mt-0.5">
          {profile.page_name} · {profile.ads_user_id}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer flex-shrink-0 text-danger opacity-40 hover:opacity-100"
        title="Supprimer"
        aria-label="Delete profile"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

// ── Add profile modal ──────────────────────────────────────────────────────────
function AddProfileModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: Omit<FbProfile, 'id' | 'enabled'>) => void }) {
  const t = useT()
  const [name, setName]   = useState('')
  const [page, setPage]   = useState('')
  const [adsId, setAdsId] = useState('')

  const submit = () => {
    if (!name.trim() || !adsId.trim()) return
    onAdd({ name: name.trim(), page_name: page.trim() || name.trim(), ads_user_id: adsId.trim() })
    onClose()
  }

  return (
    <div
      className="sf-modal-bg anim-scale-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sf-modal">
        <div className="sf-modal-header">
          <h3 className="sf-modal-title">{t('adspowerAddProfile')}</h3>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="sf-modal-body space-y-4">
          {[
            { label: t('adspowerDisplayName'), value: name, set: setName, placeholder: 'Ex: Page Cuisine FR' },
            { label: t('adspowerFbPageName'),  value: page, set: setPage, placeholder: 'Ex: maboutique.fr ou @maboutique' },
            { label: t('adspowerUserId'),       value: adsId, set: setAdsId, placeholder: 'Ex: j5abc123' },
          ].map(f => (
            <div key={f.label}>
              <label className="sf-section-label block mb-1.5">{f.label}</label>
              <input
                value={f.value}
                onChange={e => f.set(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder={f.placeholder}
                className="sf-input"
              />
            </div>
          ))}
          <p className="text-[11px] text-text3 leading-relaxed">{t('adspowerUserIdHint')}</p>
        </div>

        <div className="sf-modal-footer">
          <button onClick={onClose} className="sf-btn sf-btn-secondary cursor-pointer">{t('cancel')}</button>
          <button
            onClick={submit}
            disabled={!name || !adsId}
            className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-40"
          >
            {t('adspowerAdd')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function AdsPower({ user }: AdsPowerProps) {
  const t = useT()
  const { lang } = useLang()
  const [profiles, setProfiles]   = useState<FbProfile[]>([])
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [video, setVideo]         = useState<SelectedVideo | null>(null)
  const [caption, setCaption]     = useState('')
  const [showBank, setShowBank]   = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [logs, setLogs]           = useState<LogEntry[]>([])
  const [running, setRunning]     = useState(false)
  const [delayMin, setDelayMin]   = useState(60)
  const [syncing, setSyncing]     = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [apiKey, setApiKey]       = useState('')
  const [showKey, setShowKey]     = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`adspower-profiles-${user.id}`)
      if (saved) setProfiles(JSON.parse(saved))
      const key = localStorage.getItem(`adspower-apikey-${user.id}`)
      if (key) setApiKey(key)
    } catch {}
  }, [user.id])

  const saveApiKey = (k: string) => {
    setApiKey(k)
    localStorage.setItem(`adspower-apikey-${user.id}`, k)
  }

  const saveProfiles = (p: FbProfile[]) => {
    setProfiles(p)
    localStorage.setItem(`adspower-profiles-${user.id}`, JSON.stringify(p))
  }

  const syncFromAds = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      let allProfiles: FbProfile[] = []
      let page = 1
      while (true) {
        const res = await adsRequest(`/api/v1/user/list?page=${page}&page_size=100`, apiKey || undefined)
        if (res.code !== 0) throw new Error(res.msg ?? 'AdsPower API error')
        const rows: Array<{
          user_id: string; name: string; domain_name?: string
          username?: string; remark?: string; group_name?: string
        }> = res.data?.list ?? []
        if (rows.length === 0) break
        const mapped: FbProfile[] = rows.map(r => ({
          id:          r.user_id,
          name:        r.name || r.user_id,
          page_name:   r.domain_name || r.username || r.remark || r.name || '',
          ads_user_id: r.user_id,
          enabled:     true,
        }))
        allProfiles = [...allProfiles, ...mapped]
        if (rows.length < 100) break
        page++
      }
      const existing = new Map(profiles.map(p => [p.ads_user_id, p]))
      const merged = allProfiles.map(p => existing.has(p.ads_user_id)
        ? { ...existing.get(p.ads_user_id)!, name: p.name }
        : p
      )
      saveProfiles(merged)
    } catch (e: unknown) {
      setSyncError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const addProfile = (data: Omit<FbProfile, 'id' | 'enabled'>) => {
    const p: FbProfile = { ...data, id: crypto.randomUUID(), enabled: true }
    saveProfiles([...profiles, p])
  }

  const deleteProfile = (id: string) => {
    saveProfiles(profiles.filter(p => p.id !== id))
    setSelected(s => { const n = new Set(s); n.delete(id); return n })
  }

  const toggleSelect = (id: string) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const toggleAll = () => {
    if (selected.size === profiles.length) setSelected(new Set())
    else setSelected(new Set(profiles.map(p => p.id)))
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (profile_id: string, profile_name: string, status: LogStatus, message: string) => {
    setLogs(prev => [...prev, { profile_id, profile_name, status, message, ts: now() }])
  }

  const updateLog = (profile_id: string, status: LogStatus, message: string) => {
    setLogs(prev => prev.map(l => l.profile_id === profile_id && l.status !== 'done' && l.status !== 'error'
      ? { ...l, status, message, ts: now() }
      : l
    ))
  }

  const getVideoUrl = async (): Promise<string> => {
    if (!video?.path) throw new Error('No video selected')
    return video.path
  }

  const postToProfile = async (profile: FbProfile, videoUrl: string) => {
    addLog(profile.id, profile.name, 'running', 'Opening AdsPower browser…')
    const startRes = await adsRequest(`/api/v1/browser/start?user_id=${profile.ads_user_id}`, apiKey || undefined)
    if (startRes.code !== 0) throw new Error(`Start failed: ${startRes.msg}`)

    const wsUrl = startRes.data?.ws?.puppeteer
    if (!wsUrl) throw new Error('Puppeteer WebSocket not found')

    updateLog(profile.id, 'running', 'Browser open — connecting Playwright…')

    if (false) {
      // Reserved for future Electron bridge (adspowerPost)
    } else {
      const res = await fetch('/api/adspower-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsUrl, pageTarget: profile.page_name, videoUrl, caption }),
      })
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
      const r = await res.json()
      if (!r.success) throw new Error(r.error ?? 'Unknown error')
    }

    await adsRequest(`/api/v1/browser/stop?user_id=${profile.ads_user_id}`, apiKey || undefined)
  }

  const handleLaunch = async () => {
    const targets = profiles.filter(p => selected.has(p.id))
    if (!targets.length) return
    if (!video) return

    setLogs([])
    setRunning(true)

    let videoUrl = ''
    try {
      videoUrl = await getVideoUrl()
    } catch (e: unknown) {
      addLog('_', 'System', 'error', (e as Error).message)
      setRunning(false)
      return
    }

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i]
      addLog(p.id, p.name, 'pending', 'Pending…')
    }

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i]
      try {
        updateLog(p.id, 'running', 'Starting…')
        await postToProfile(p, videoUrl)
        updateLog(p.id, 'done', 'Published successfully!')
      } catch (e: unknown) {
        updateLog(p.id, 'error', `${(e as Error).message}`)
        try { await adsRequest(`/api/v1/browser/stop?user_id=${p.ads_user_id}`, apiKey || undefined) } catch {}
      }

      if (i < targets.length - 1 && delayMin > 0) {
        addLog('_delay', 'Pause', 'running', `Pause ${delayMin}s before next account…`)
        await new Promise(r => setTimeout(r, delayMin * 1000))
        setLogs(prev => prev.filter(l => l.profile_id !== '_delay'))
      }
    }

    setRunning(false)
  }

  const selectedProfiles = profiles.filter(p => selected.has(p.id))
  const canLaunch = selectedProfiles.length > 0 && !!video && !running

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex overflow-hidden anim-page" style={{ background: 'var(--base)' }}>

      {/* ── Left panel — profiles ─────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border)' }}>

        {/* Panel header */}
        <div className="px-4 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[13px] font-bold text-text">{t('adspowerProfiles')}</p>
              <p className="text-[11px] text-text3 mt-0.5">
                {profiles.length} profile{profiles.length !== 1 ? 's' : ''} · {selected.size} {t('selectedCount')}
              </p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>
              {t('adspowerManual')}
            </button>
          </div>

          {/* API Key */}
          <div className="mb-3">
            <label className="sf-section-label block mb-1.5">{t('adspowerApiKey')}</label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => saveApiKey(e.target.value)}
                placeholder={t('adspowerApiKeyPlaceholder')}
                className="sf-input font-mono text-[12px] pr-9"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-2 cursor-pointer text-text3 hover:text-text2 transition-colors"
              >
                {showKey ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M14.12 14.12A3 3 0 1 1 9.88 9.88M1 1l22 22"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-text3 mt-1.5">{t('adspowerApiKeyHint')}</p>
          </div>

          {/* Sync button */}
          <button
            onClick={syncFromAds}
            disabled={syncing}
            className="sf-btn sf-btn-primary w-full cursor-pointer disabled:opacity-50"
            style={{ background: syncing ? undefined : 'linear-gradient(130deg,#1877f2,#0d6bcc)', boxShadow: 'none' }}
          >
            {syncing ? <span className="sf-spinner" /> : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            )}
            {syncing ? t('adspowerSyncing') : t('adspowerSyncBtn')}
          </button>

          {syncError && (
            <div className="mt-2 sf-card p-2.5 flex items-start gap-2" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
              <p className="text-[11px] text-danger">{syncError}</p>
            </div>
          )}

          {profiles.length > 0 && (
            <button
              onClick={toggleAll}
              className="mt-2.5 text-[11px] text-accent hover:text-text transition-colors cursor-pointer"
              style={{ background: 'none', border: 'none', padding: 0, display: 'block' }}
            >
              {selected.size === profiles.length ? t('adspowerDeselectAll') : t('adspowerSelectAll')}
            </button>
          )}
        </div>

        {/* Profile list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {profiles.length === 0 ? (
            <div className="sf-empty">
              <div className="sf-empty-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent-glow)' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <p className="sf-empty-title">{t('adspowerNoProfiles')}</p>
              <p className="sf-empty-desc">{t('adspowerMustBeOpen')}</p>
            </div>
          ) : (
            profiles.map(p => (
              <ProfileRow
                key={p.id}
                profile={p}
                selected={selected.has(p.id)}
                onToggle={() => toggleSelect(p.id)}
                onDelete={() => deleteProfile(p.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Center/Right — config + logs ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* sf-toolbar (page header) */}
        <div className="sf-toolbar justify-between">
          <div className="flex items-center gap-3">
            {/* Icon with glow */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg,rgba(201,181,132,0.18),rgba(243,241,236,0.1))',
                border: '1px solid rgba(201,181,132,0.3)',
                boxShadow: '0 0 14px -4px rgba(201,181,132,0.4)',
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4C499" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                <path d="M12 18h.01"/>
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-bold text-text leading-none">AdsPower — Facebook Mass Post</p>
              <p className="text-[11px] text-text3 mt-0.5">
                {selectedProfiles.length} {t('selectedCount')}
                {video ? ` · ${video.title}` : ` ${t('adspowerNoVideo')}`}
              </p>
            </div>
          </div>

          <button
            onClick={handleLaunch}
            disabled={!canLaunch}
            className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer disabled:opacity-40"
          >
            {running ? (
              <><span className="sf-spinner" />{t('adspowerRunning')}</>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                {t('adspowerLaunch')}
              </>
            )}
          </button>
        </div>

        <div className="flex-1 flex min-h-0">

          {/* Config col */}
          <div className="w-80 flex-shrink-0 flex flex-col overflow-y-auto" style={{ borderRight: '1px solid var(--border)' }}>

            {/* Video picker */}
            <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="sf-section-label mb-3">{t('adspowerVideo')}</p>
              {video ? (
                <div className="sf-card p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(201,181,132,0.12)', border: '1px solid rgba(201,181,132,0.2)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9B584" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-text truncate">{video.title}</p>
                    <button onClick={() => setVideo(null)} className="text-[11px] text-danger hover:text-danger/80 cursor-pointer mt-0.5" style={{ background: 'none', border: 'none', padding: 0 }}>
                      {t('adspowerRemoveVideo')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowBank(true)}
                  className="w-full p-4 rounded-xl text-[13px] cursor-pointer font-semibold text-accent hover:text-text transition-colors"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1.5px dashed rgba(201,181,132,0.3)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block mr-2 -mt-0.5"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                  {t('adspowerSelectFromBank')}
                </button>
              )}
            </div>

            {/* Caption */}
            <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="sf-section-label mb-3">{t('adspowerCaption')}</p>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={t('adspowerCaptionPlaceholder')}
                rows={6}
                className="sf-input sf-textarea"
              />
              <p className="text-[10px] text-text3 mt-1.5 text-right">{caption.length} characters</p>
            </div>

            {/* Options */}
            <div className="p-4">
              <p className="sf-section-label mb-3">{t('adspowerOptions')}</p>
              <div className="sf-card p-3 flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-text">{t('adspowerDelay')}</p>
                  <p className="text-[11px] text-text3 mt-0.5">{t('adspowerDelayHint')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={600}
                    value={delayMin}
                    onChange={e => setDelayMin(Number(e.target.value))}
                    className="sf-input text-center"
                    style={{ width: 64 }}
                  />
                  <span className="text-[11px] text-text3">{t('adspowerSec')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Log col */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="sf-toolbar justify-between">
              <p className="sf-section-label">{t('adspowerLogs')}</p>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer text-text3">
                  {t('adspowerClearLogs')}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-0.5 font-mono">
              {logs.length === 0 ? (
                <div className="sf-empty">
                  <div className="sf-empty-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent-glow)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                  </div>
                  <p className="sf-empty-title">{t('adspowerLogsEmpty')}</p>
                </div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span className="text-[10px] text-text3 flex-shrink-0 mt-0.5 tabular-nums">{l.ts}</span>
                    <StatusIcon status={l.status} />
                    <span className="text-[11px] font-semibold text-accent flex-shrink-0">{l.profile_name}</span>
                    <span className="text-[11px] flex-1" style={{ color: STATUS_COLOR[l.status] }}>{l.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>

            {/* Summary bar */}
            {logs.length > 0 && !running && (
              <div className="sf-toolbar gap-4">
                {[
                  { label: t('adspowerSuccess'), count: logs.filter(l => l.status === 'done').length,  color: 'var(--ok)'     },
                  { label: t('adspowerError'),   count: logs.filter(l => l.status === 'error').length, color: 'var(--danger)' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[11px] text-text3">{s.label}:</span>
                    <span className="text-[12px] font-bold" style={{ color: s.color }}>{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showBank && (
        <BankPicker
          user={user}
          mode="single"
          onSelect={(paths, titles) => {
            if (paths[0]) setVideo({ path: paths[0], title: titles?.[0] ?? paths[0].split('/').pop() ?? 'Video' })
            setShowBank(false)
          }}
          onClose={() => setShowBank(false)}
        />
      )}
      {showAdd && (
        <AddProfileModal onClose={() => setShowAdd(false)} onAdd={addProfile} />
      )}
    </div>
  )
}
