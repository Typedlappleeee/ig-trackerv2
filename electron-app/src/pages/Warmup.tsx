import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { useConnections } from '@/lib/connections'
import { fetchAllPhones, warmupAccount, type GeelarkPhone, type WarmupConfig } from '@/lib/geelark'
import { supabase } from '@/lib/supabase'

interface WarmupProps { user: User }

interface PhoneJob {
  phone:   GeelarkPhone
  status:  'idle' | 'running' | 'done' | 'error'
  logs:    string[]
  error?:  string
}

function fileName(p: string) { return p.split(/[\\/]/).pop() ?? p }

export function Warmup({ user }: WarmupProps) {
  const conns = useConnections(user)
  const bearer = conns.bearer

  // Phones
  const [phones,      setPhones]     = useState<GeelarkPhone[]>([])
  const [selected,    setSelected]   = useState<Set<string>>(new Set())
  const [loadingPhones, setLoadingPhones] = useState(false)
  const [phonesError,   setPhonesError]   = useState<string | null>(null)

  // Profile config
  const [profileName,    setProfileName]    = useState('')
  const [bio,            setBio]            = useState('')
  const [profilePicUrl,  setProfilePicUrl]  = useState('')
  const [profilePicFile, setProfilePicFile] = useState<string | null>(null)

  // Warmup config
  const [browseMinutes,   setBrowseMinutes]   = useState(15)
  const [likePosts,       setLikePosts]       = useState(true)
  const [watchReels,      setWatchReels]      = useState(true)
  const [followSuggested, setFollowSuggested] = useState(false)

  // Execution state
  const [jobs,    setJobs]    = useState<PhoneJob[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef<{ abort: boolean }>({ abort: false })

  // Load DB profile defaults
  useEffect(() => {
    supabase.from('app_config').select('profile_niche').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { /* noop, just warmup */ })
  }, [user.id])

  // Stop on unmount
  useEffect(() => { return () => { abortRef.current.abort = true } }, [])

  async function loadPhones() {
    if (!bearer) return
    setLoadingPhones(true); setPhonesError(null)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
    } catch (e) { setPhonesError(e instanceof Error ? e.message : String(e)) }
    setLoadingPhones(false)
  }

  useEffect(() => {
    if (bearer && !conns.loading) loadPhones()
  }, [bearer, conns.loading])

  function togglePhone(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(phones.map(p => p.id)))
  }

  function updateJob(id: string, patch: Partial<PhoneJob>) {
    setJobs(prev => prev.map(j => j.phone.id === id ? { ...j, ...patch } : j))
  }

  function addLog(id: string, msg: string) {
    setJobs(prev => prev.map(j => j.phone.id === id ? { ...j, logs: [...j.logs, msg] } : j))
  }

  async function launch() {
    if (!selected.size || !bearer) return
    const targetPhones = phones.filter(p => selected.has(p.id))

    const config: WarmupConfig = {
      profileName:    profileName.trim() || undefined,
      bio:            bio.trim() || undefined,
      profilePicUrl:  (profilePicUrl.trim() || undefined),
      browseMinutes,
      likePosts,
      watchReels,
      followSuggested,
    }

    const initialJobs: PhoneJob[] = targetPhones.map(phone => ({
      phone, status: 'idle', logs: [],
    }))
    setJobs(initialJobs)
    setRunning(true)
    abortRef.current = { abort: false }

    // Run phones sequentially to avoid GéeLark rate limits
    for (const phone of targetPhones) {
      if (abortRef.current.abort) break
      updateJob(phone.id, { status: 'running' })

      const result = await warmupAccount(
        bearer,
        phone.id,
        config,
        (msg) => addLog(phone.id, msg),
        abortRef.current,
      )

      if (result.ok) {
        updateJob(phone.id, { status: 'done' })
      } else {
        updateJob(phone.id, { status: 'error', error: result.error })
      }
    }

    setRunning(false)
  }

  const phoneName = (p: GeelarkPhone) =>
    p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)

  const isOnline = (p: GeelarkPhone) => p.status === 1 || p.status === 2

  const doneCount  = jobs.filter(j => j.status === 'done').length
  const errorCount = jobs.filter(j => j.status === 'error').length
  const progress   = jobs.length > 0 ? Math.round((doneCount + errorCount) / jobs.length * 100) : 0

  if (conns.loading) {
    return (
      <div className="p-8 flex items-center gap-3">
        <div className="animate-spin w-5 h-5 rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-sm text-text2">Chargement…</span>
      </div>
    )
  }

  if (!bearer) {
    return (
      <div className="p-8 max-w-lg">
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-5 space-y-2">
          <p className="text-warn font-semibold">⚠ Token GéeLark manquant</p>
          <p className="text-sm text-text2">Configure ton token dans <strong className="text-text">Paramètres → Connexions</strong>.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#06040f' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.6)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>
            🔥
          </div>
          <div>
            <h1 className="text-sm font-black text-white">Warmup Compte</h1>
            <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
              Met à jour le profil + chauffe le compte Instagram sur GéeLark
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Progress modal */}
        {running && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(3,1,8,0.92)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-lg rounded-2xl overflow-hidden"
              style={{ background: 'rgba(12,8,28,0.98)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 0 60px rgba(124,58,237,0.2)' }}>
              <div className="px-6 py-4 flex items-center gap-3"
                style={{ borderBottom: '1px solid rgba(139,92,246,0.15)', background: 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(236,72,153,0.06))' }}>
                <div className="relative w-10 h-10 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                    style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    🔥
                  </div>
                </div>
                <div>
                  <p className="text-sm font-black text-white">Warmup en cours…</p>
                  <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.5)' }}>
                    {doneCount} / {jobs.length} téléphone(s) · {progress}%
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-auto">
                {/* Progress bar */}
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.12)' }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
                </div>

                {/* Per-phone status */}
                {jobs.map(job => (
                  <div key={job.phone.id} className="rounded-xl overflow-hidden"
                    style={{ border: `1px solid ${job.status === 'done' ? 'rgba(52,211,153,0.2)' : job.status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.15)'}` }}>
                    <div className="px-4 py-2.5 flex items-center gap-3"
                      style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : job.status === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(139,92,246,0.06)' }}>
                      <span className="text-base flex-shrink-0">
                        {job.status === 'done' ? '✅' : job.status === 'error' ? '❌' : job.status === 'running' ? '⚙️' : '⏳'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{phoneName(job.phone)}</p>
                        {job.error && <p className="text-[10px] text-danger">{job.error}</p>}
                        {job.logs.length > 0 && (
                          <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.5)' }}>
                            {job.logs[job.logs.length - 1]}
                          </p>
                        )}
                      </div>
                    </div>
                    {job.status === 'running' && job.logs.length > 1 && (
                      <div className="px-4 py-2 space-y-0.5 max-h-24 overflow-auto"
                        style={{ background: 'rgba(0,0,0,0.3)' }}>
                        {job.logs.slice(-6).map((l, i) => (
                          <p key={i} className="text-[10px] font-mono" style={{ color: 'rgba(196,181,253,0.4)' }}>{l}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <button onClick={() => { abortRef.current.abort = true; setRunning(false) }}
                  className="w-full py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                  ✕ Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Done modal */}
        {!running && jobs.length > 0 && (doneCount + errorCount) === jobs.length && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(3,1,8,0.88)', backdropFilter: 'blur(6px)' }}>
            <div className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{ background: 'rgba(12,8,28,0.98)', border: `1px solid ${errorCount === 0 ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}` }}>
              <div className="px-6 py-5 space-y-4">
                <div className="text-center space-y-2">
                  <div className="text-4xl">{errorCount === 0 ? '🎉' : '⚠️'}</div>
                  <p className="text-lg font-black text-white">
                    {errorCount === 0 ? `${doneCount} compte(s) warmupés !` : `${doneCount} / ${jobs.length} terminés`}
                  </p>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-auto">
                  {jobs.map(job => (
                    <div key={job.phone.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: job.status === 'done' ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${job.status === 'done' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                      <span>{job.status === 'done' ? '✅' : '❌'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{phoneName(job.phone)}</p>
                        {job.error && <p className="text-[10px] text-danger">{job.error}</p>}
                      </div>
                      <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
                        {job.logs.length} actions
                      </span>
                    </div>
                  ))}
                </div>
                <Button onClick={() => setJobs([])} className="w-full">Fermer</Button>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 grid grid-cols-[1fr_380px] gap-6 max-w-5xl">

          {/* Left column */}
          <div className="space-y-5">

            {/* Phone selector */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
                <p className="text-xs font-black text-white">📱 Téléphones GéeLark</p>
                <div className="flex items-center gap-2">
                  {selected.size > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}>
                      {selected.size} sélectionné(s)
                    </span>
                  )}
                  <button onClick={selectAll} className="text-[10px] px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
                    Tout sélectionner
                  </button>
                  <button onClick={loadPhones} className="text-[10px] px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
                    {loadingPhones ? '↻' : '⟳'} Rafraîchir
                  </button>
                </div>
              </div>

              {phonesError && (
                <p className="px-5 py-3 text-xs text-danger">{phonesError}</p>
              )}

              {phones.length === 0 && !loadingPhones && !phonesError && (
                <p className="px-5 py-4 text-xs" style={{ color: 'rgba(196,181,253,0.4)' }}>
                  Aucun téléphone trouvé. Vérifie ton token GéeLark.
                </p>
              )}

              {loadingPhones && (
                <div className="px-5 py-4 flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 rounded-full border-2 border-accent border-t-transparent" />
                  <span className="text-xs text-text2">Chargement…</span>
                </div>
              )}

              <div className="divide-y divide-purple-900/20">
                {phones.map(phone => {
                  const online = isOnline(phone)
                  const sel = selected.has(phone.id)
                  return (
                    <button key={phone.id} onClick={() => togglePhone(phone.id)}
                      className="w-full px-5 py-3 flex items-center gap-3 transition-colors text-left"
                      style={{ background: sel ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{ border: `2px solid ${sel ? '#8b5cf6' : 'rgba(139,92,246,0.3)'}`, background: sel ? '#8b5cf6' : 'transparent' }}>
                        {sel && <span className="text-[9px] text-white font-black">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{phoneName(phone)}</p>
                        {phone.group?.name && (
                          <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>{phone.group.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: online ? '#34d399' : '#6b7280' }} />
                        <span className="text-[10px]" style={{ color: online ? '#34d399' : '#6b7280' }}>
                          {online ? 'En ligne' : 'Hors ligne'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Profile config */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
                <p className="text-xs font-black text-white">👤 Profil Instagram</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>Laisse vide pour ne pas modifier</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold block mb-1.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    Nom de profil
                  </label>
                  <input
                    type="text" placeholder="Ex: Marie Fitness | Coach Minceur"
                    value={profileName} onChange={e => setProfileName(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold block mb-1.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    Bio
                  </label>
                  <textarea rows={3} placeholder="Ex: 🏋️ Coach fitness certifiée | -10kg en 90 jours ↓"
                    value={bio} onChange={e => setBio(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                  />
                  <p className="text-[10px] mt-1" style={{ color: bio.length > 150 ? '#f87171' : 'rgba(196,181,253,0.3)' }}>
                    {bio.length}/150 caractères
                  </p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold block mb-1.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    Photo de profil — URL de l'image
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text" placeholder="https://… ou laisser vide"
                      value={profilePicUrl} onChange={e => setProfilePicUrl(e.target.value)}
                      className="flex-1 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}
                    />
                    <button onClick={async () => {
                      const p = await window.electronAPI?.pickAnyFile?.({ filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] })
                      if (p) setProfilePicFile(p)
                    }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0"
                      style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                      📂 Fichier local
                    </button>
                  </div>
                  {profilePicFile && (
                    <p className="text-[10px] mt-1 text-accent/70 truncate">📎 {fileName(profilePicFile)}</p>
                  )}
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(196,181,253,0.3)' }}>
                    Le téléphone télécharge l'image via curl — utilise un lien direct (pas Google Drive, pas Instagram)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Warmup config */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
                <p className="text-xs font-black text-white">⚙️ Actions de Warmup</p>
              </div>
              <div className="p-5 space-y-5">

                {/* Duration */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold mb-3" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    Durée de navigation
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 5, 10, 15, 20, 30].map(m => (
                      <button key={m} onClick={() => setBrowseMinutes(m)}
                        className="py-2 rounded-xl text-xs font-bold"
                        style={browseMinutes === m
                          ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                          : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                        }>
                        {m === 0 ? 'Aucune' : `${m} min`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  {[
                    { key: 'like',   label: '❤️ Liker des posts',         value: likePosts,       set: setLikePosts,       disabled: browseMinutes === 0 },
                    { key: 'reels',  label: '🎬 Regarder des Reels',      value: watchReels,      set: setWatchReels,      disabled: browseMinutes === 0 },
                    { key: 'follow', label: '➕ Follow des comptes suggérés', value: followSuggested, set: setFollowSuggested, disabled: browseMinutes === 0 },
                  ].map(({ key, label, value, set, disabled }) => (
                    <label key={key} className={`flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-40' : ''}`}>
                      <div onClick={() => !disabled && set(!value)}
                        className="relative flex-shrink-0 w-9 h-5 rounded-full transition-all"
                        style={{ background: value && !disabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${value && !disabled ? 'left-4' : 'left-0.5'}`} />
                      </div>
                      <span className="text-xs text-white/80">{label}</span>
                    </label>
                  ))}
                </div>

                {browseMinutes === 0 && (
                  <p className="text-[10px] text-warn/70">
                    ⚠ Durée = 0 : seule la mise à jour du profil sera effectuée
                  </p>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(196,181,253,0.4)' }}>Résumé</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(196,181,253,0.5)' }}>Téléphones</span>
                  <span className="text-white font-bold">{selected.size}</span>
                </div>
                {profileName && (
                  <div className="flex justify-between">
                    <span style={{ color: 'rgba(196,181,253,0.5)' }}>Nouveau nom</span>
                    <span className="text-white truncate max-w-[140px]">{profileName}</span>
                  </div>
                )}
                {bio && (
                  <div className="flex justify-between">
                    <span style={{ color: 'rgba(196,181,253,0.5)' }}>Bio</span>
                    <span className="text-white">✓ configurée</span>
                  </div>
                )}
                {(profilePicUrl || profilePicFile) && (
                  <div className="flex justify-between">
                    <span style={{ color: 'rgba(196,181,253,0.5)' }}>Photo profil</span>
                    <span className="text-white">✓ configurée</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(196,181,253,0.5)' }}>Navigation</span>
                  <span className="text-white">{browseMinutes === 0 ? '—' : `${browseMinutes} min`}</span>
                </div>
                {browseMinutes > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'rgba(196,181,253,0.5)' }}>Actions</span>
                    <span className="text-white text-right">
                      {[likePosts && 'Likes', watchReels && 'Reels', followSuggested && 'Follows'].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(196,181,253,0.5)' }}>Durée totale ~</span>
                  <span className="text-white font-bold">
                    {selected.size * (browseMinutes + 2)} min
                  </span>
                </div>
              </div>
            </div>

            <Button
              className="w-full py-3 text-sm font-black"
              disabled={selected.size === 0 || running}
              loading={running}
              onClick={launch}
            >
              🔥 Lancer le warmup ({selected.size} téléphone{selected.size !== 1 ? 's' : ''})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
