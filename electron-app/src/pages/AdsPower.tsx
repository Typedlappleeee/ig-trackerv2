import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BankPicker } from '@/pages/Bank'

interface AdsPowerProps { user: User }

interface SelectedVideo { path: string; title: string }

// ── Types ──────────────────────────────────────────────────────────────────────
interface FbProfile {
  id:           string
  name:         string          // display name
  page_name:    string          // Facebook page slug / name
  ads_user_id:  string          // AdsPower profile user_id
  enabled:      boolean
}

type LogStatus = 'pending' | 'running' | 'done' | 'error'
interface LogEntry {
  profile_id: string
  profile_name: string
  status: LogStatus
  message: string
  ts: string
}

const STATUS_COLOR: Record<LogStatus, string> = {
  pending: 'rgba(148,163,184,0.4)',
  running: '#60a5fa',
  done:    '#22c55e',
  error:   '#f87171',
}
const STATUS_ICON: Record<LogStatus, string> = {
  pending: '⏳',
  running: '⚡',
  done:    '✅',
  error:   '❌',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function now() { return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function adsRequest(urlPath: string, apiKey?: string, body?: unknown): Promise<any> {
  const sep = urlPath.includes('?') ? '&' : '?'
  const fullPath = `${urlPath}${apiKey ? `${sep}serial_number=${encodeURIComponent(apiKey)}` : ''}`

  const api = (window as unknown as {
    electronAPI?: {
      adspowerRequest?: (opts: { method: 'GET' | 'POST'; path: string; body?: unknown }) => Promise<{ ok: boolean; data?: unknown; error?: string }>
    }
  }).electronAPI

  if (!api?.adspowerRequest) {
    throw new Error("AdsPower n'est disponible que dans l'application desktop (Electron), pas dans le navigateur.")
  }

  const result = await api.adspowerRequest({ method: body ? 'POST' : 'GET', path: fullPath, body })
  if (!result.ok) throw new Error(result.error ?? 'AdsPower IPC error')
  return result.data
}

// ── Profile row ────────────────────────────────────────────────────────────────
function ProfileRow({
  profile, selected, onToggle, onDelete,
}: {
  profile: FbProfile
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderRadius: 10, cursor: 'pointer',
        background: selected ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.02)',
        border: selected ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(255,255,255,0.05)',
        transition: 'all 0.15s',
      }}
    >
      {/* Checkbox */}
      <div style={{
        width: 16, height: 16, borderRadius: 4, border: selected ? 'none' : '1.5px solid rgba(148,163,184,0.3)',
        background: selected ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10,
      }}>
        {selected && '✓'}
      </div>

      {/* FB icon */}
      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
        f
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#F2F0FF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile.name}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Page : {profile.page_name} · ID : {profile.ads_user_id}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.45)', fontSize: 14, padding: 4, flexShrink: 0 }}
        title="Supprimer"
      >✕</button>
    </div>
  )
}

// ── Add profile modal ──────────────────────────────────────────────────────────
function AddProfileModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: Omit<FbProfile, 'id' | 'enabled'>) => void }) {
  const [name, setName]       = useState('')
  const [page, setPage]       = useState('')
  const [adsId, setAdsId]     = useState('')

  const submit = () => {
    if (!name.trim() || !adsId.trim()) return
    onAdd({ name: name.trim(), page_name: page.trim() || name.trim(), ads_user_id: adsId.trim() })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#0e0e1a', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 16, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F2F0FF', margin: '0 0 20px' }}>Ajouter un profil AdsPower</h3>

        {[
          { label: 'Nom affiché', value: name, set: setName, placeholder: 'Ex: Page Cuisine FR' },
          { label: 'Nom de la page Facebook', value: page, set: setPage, placeholder: 'Ex: maboutique.fr ou @maboutique' },
          { label: 'AdsPower User ID', value: adsId, set: setAdsId, placeholder: 'Ex: j5abc123' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.5)', display: 'block', marginBottom: 6 }}>{f.label}</label>
            <input
              value={f.value}
              onChange={e => f.set(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder={f.placeholder}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#F2F0FF', fontSize: 13, outline: 'none' }}
            />
          </div>
        ))}

        <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', margin: '0 0 18px', lineHeight: 1.6 }}>
          L'User ID se trouve dans AdsPower → liste des profils → colonne ID.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={submit} disabled={!name || !adsId} style={{ padding: '8px 16px', borderRadius: 8, background: 'linear-gradient(130deg,#7c3aed,#ec4899)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (!name || !adsId) ? 0.5 : 1 }}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function AdsPower({ user }: AdsPowerProps) {
  const [profiles, setProfiles]     = useState<FbProfile[]>([])
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [video, setVideo]           = useState<SelectedVideo | null>(null)
  const [caption, setCaption]       = useState('')
  const [showBank, setShowBank]     = useState(false)
  const [showAdd, setShowAdd]       = useState(false)
  const [logs, setLogs]             = useState<LogEntry[]>([])
  const [running, setRunning]       = useState(false)
  const [delayMin, setDelayMin]     = useState(60)
  const [syncing, setSyncing]       = useState(false)
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [apiKey, setApiKey]         = useState('')
  const [showKey, setShowKey]       = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // ── Load profiles + API key from localStorage ─────────────────────────────
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

  // ── Sync from AdsPower API ────────────────────────────────────────────────
  const syncFromAds = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      // Fetch all profiles — paginate until done
      let allProfiles: FbProfile[] = []
      let page = 1
      while (true) {
        const res = await adsRequest(`/api/v1/user/list?page=${page}&page_size=100`, apiKey || undefined)
        if (res.code !== 0) throw new Error(res.msg ?? 'Erreur API AdsPower')
        const rows: Array<{
          user_id: string
          name: string
          domain_name?: string
          username?: string
          remark?: string
          group_name?: string
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
      // Merge: keep existing page_name overrides, add new ones
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

  // Auto-scroll log
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

  // ── Get video URL (already resolved by BankPicker resolveMode=signed-url) ──
  const getVideoUrl = async (): Promise<string> => {
    if (!video?.path) throw new Error('Aucune vidéo sélectionnée')
    return video.path
  }

  // ── Post to one profile via AdsPower API ───────────────────────────────────
  const postToProfile = async (profile: FbProfile, videoUrl: string) => {
    // 1. Start browser
    addLog(profile.id, profile.name, 'running', 'Ouverture du navigateur AdsPower…')
    const startRes = await adsRequest(`/api/v1/browser/start?user_id=${profile.ads_user_id}`, apiKey || undefined)
    if (startRes.code !== 0) throw new Error(`Démarrage échoué : ${startRes.msg}`)

    const wsUrl = startRes.data?.ws?.puppeteer
    if (!wsUrl) throw new Error('WebSocket Puppeteer non trouvé')

    updateLog(profile.id, 'running', 'Navigateur ouvert — connexion Playwright…')

    // 2. Use Electron's playwright bridge if available, otherwise fetch proxy
    if (false) {
      // Reserved for future Electron bridge (adspowerPost)
    } else {
      // Web: proxy via Vercel
      const res = await fetch('/api/adspower-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsUrl, pageTarget: profile.page_name, videoUrl, caption }),
      })
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
      const r = await res.json()
      if (!r.success) throw new Error(r.error ?? 'Erreur inconnue')
    }

    // 3. Close browser
    await adsRequest(`/api/v1/browser/stop?user_id=${profile.ads_user_id}`, apiKey || undefined)
  }

  // ── Launch ─────────────────────────────────────────────────────────────────
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
      addLog('_', 'Système', 'error', (e as Error).message)
      setRunning(false)
      return
    }

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i]
      addLog(p.id, p.name, 'pending', 'En attente…')
    }

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i]
      try {
        updateLog(p.id, 'running', 'Démarrage…')
        await postToProfile(p, videoUrl)
        updateLog(p.id, 'done', '✅ Publication réussie !')
      } catch (e: unknown) {
        updateLog(p.id, 'error', `❌ ${(e as Error).message}`)
        // Close browser on error silently
        try { await adsRequest(`/api/v1/browser/stop?user_id=${p.ads_user_id}`, apiKey || undefined) } catch {}
      }

      // Delay between posts
      if (i < targets.length - 1 && delayMin > 0) {
        addLog('_delay', `Pause`, 'running', `Pause ${delayMin}s avant le prochain compte…`)
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
    <div style={{ display: 'flex', height: '100%', background: '#07070c', minHeight: 0 }}>

      {/* ── Left panel — profiles ─────────────────────────────────────────── */}
      <div style={{ width: 300, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#F2F0FF', margin: 0 }}>Profils AdsPower</p>
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', margin: '2px 0 0' }}>{profiles.length} profil{profiles.length !== 1 ? 's' : ''} · {selected.size} sélectionné{selected.size !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.7)', fontSize: 12, cursor: 'pointer' }}>
              + Manuel
            </button>
          </div>

          {/* API Key */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.4)', display: 'block', marginBottom: 5 }}>
              Clé API AdsPower
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => saveApiKey(e.target.value)}
                placeholder="Colle ta clé ici…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 36px 8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#F2F0FF', fontSize: 12, outline: 'none', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => setShowKey(v => !v)}
                style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.4)', fontSize: 13, padding: 0 }}>
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.25)', margin: '4px 0 0' }}>
              AdsPower → Paramètres → Clé API. Optionnel si accès local.
            </p>
          </div>

          {/* Sync button */}
          <button
            onClick={syncFromAds}
            disabled={syncing}
            style={{
              width: '100%', padding: '8px', borderRadius: 8, border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
              background: syncing ? 'rgba(255,255,255,0.04)' : 'linear-gradient(130deg,#1877f2,#0d6bcc)',
              color: syncing ? 'rgba(148,163,184,0.4)' : '#fff', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginBottom: syncError ? 8 : 0,
            }}>
            {syncing ? '⏳ Synchronisation…' : '🔄 Sync depuis AdsPower'}
          </button>

          {syncError && (
            <div style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', fontSize: 11, color: '#f87171', marginBottom: 8 }}>
              ⚠ {syncError}
            </div>
          )}

          {profiles.length > 0 && (
            <button
              onClick={toggleAll}
              style={{ fontSize: 11, color: 'rgba(167,139,250,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 8, display: 'block' }}>
              {selected.size === profiles.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          )}
        </div>

        {/* Profile list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {profiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'rgba(148,163,184,0.35)' }}>
              <p style={{ fontSize: 28, margin: '0 0 10px' }}>📘</p>
              <p style={{ fontSize: 12, margin: '0 0 14px', lineHeight: 1.6 }}>
                Clique sur <strong style={{ color: 'rgba(148,163,184,0.6)' }}>Sync depuis AdsPower</strong> pour importer automatiquement tous tes profils.
              </p>
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.25)', margin: 0 }}>AdsPower doit être ouvert sur ce PC.</p>
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

      {/* ── Center panel — config ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#F2F0FF', margin: 0 }}>AdsPower — Facebook Mass Post</p>
            <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', margin: '2px 0 0' }}>
              {selectedProfiles.length} compte{selectedProfiles.length !== 1 ? 's' : ''} sélectionné{selectedProfiles.length !== 1 ? 's' : ''}
              {video ? ` · ${video.title}` : ' · aucune vidéo'}
            </p>
          </div>
          <button
            onClick={handleLaunch}
            disabled={!canLaunch}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 13, cursor: canLaunch ? 'pointer' : 'not-allowed',
              background: canLaunch ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.06)',
              color: canLaunch ? '#fff' : 'rgba(148,163,184,0.3)',
              boxShadow: canLaunch ? '0 4px 20px rgba(124,58,237,0.35)' : 'none',
              transition: 'all 0.15s',
            }}>
            {running ? '⏳ En cours…' : '▶ Lancer'}
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* Config col */}
          <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>

            {/* Video picker */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.4)', margin: '0 0 10px' }}>Vidéo</p>
              {video ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎬</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#F2F0FF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</p>
                    <button onClick={() => setVideo(null)} style={{ fontSize: 11, color: 'rgba(248,113,113,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>Retirer</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowBank(true)}
                  style={{ width: '100%', padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1.5px dashed rgba(139,92,246,0.25)', color: 'rgba(167,139,250,0.6)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  🎬 Choisir depuis la banque
                </button>
              )}
            </div>

            {/* Caption */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.4)', margin: '0 0 10px' }}>Description / Caption</p>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Écris ta description ici…&#10;&#10;#hashtag #facebook"
                rows={6}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#F2F0FF', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
              <p style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', margin: '6px 0 0', textAlign: 'right' }}>{caption.length} caractères</p>
            </div>

            {/* Options */}
            <div style={{ padding: '16px 18px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.4)', margin: '0 0 12px' }}>Options</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#F2F0FF', margin: 0 }}>Délai entre les posts</p>
                  <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', margin: '2px 0 0' }}>Pour éviter les détections</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={600}
                    value={delayMin}
                    onChange={e => setDelayMin(Number(e.target.value))}
                    style={{ width: 60, padding: '6px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#F2F0FF', fontSize: 13, textAlign: 'center', outline: 'none' }}
                  />
                  <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>sec</span>
                </div>
              </div>
            </div>
          </div>

          {/* Log col */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(148,163,184,0.4)', margin: 0 }}>Journal en temps réel</p>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>Effacer</button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace' }}>
              {logs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(148,163,184,0.25)' }}>
                  <p style={{ fontSize: 24, margin: '0 0 8px' }}>📋</p>
                  <p style={{ fontSize: 12, margin: 0 }}>Le journal apparaîtra ici au lancement</p>
                </div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ color: 'rgba(148,163,184,0.3)', fontSize: 10, flexShrink: 0, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{l.ts}</span>
                    <span style={{ flexShrink: 0, width: 14, textAlign: 'center' }}>{STATUS_ICON[l.status]}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#c4b5fd', flexShrink: 0 }}>{l.profile_name}</span>
                    <span style={{ fontSize: 11, color: STATUS_COLOR[l.status], flex: 1 }}>{l.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>

            {/* Summary bar */}
            {logs.length > 0 && !running && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 16 }}>
                {[
                  { label: 'Réussi', count: logs.filter(l => l.status === 'done').length, color: '#22c55e' },
                  { label: 'Erreur', count: logs.filter(l => l.status === 'error').length, color: '#f87171' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
                    <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>{s.label} : </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showBank && (
        <BankPicker
          user={user}
          mode="single"
          onSelect={(paths, titles) => {
            if (paths[0]) setVideo({ path: paths[0], title: titles?.[0] ?? paths[0].split('/').pop() ?? 'Vidéo' })
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
