import { useState, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { supabase } from '@/lib/supabase'
import {
  publishVideoCrossPlatform, geelarkUploadForRpa, fetchPhoneProxies, CROSS_PLATFORMS,
  type CrossPlatform,
} from '@/lib/geelark'
import { startRun, updateRun, endRun, setRunPhase, proxyConflicts, type PhaseStatus } from '@/lib/activeRuns'
import { activeRotationUrls, getProxyRotation } from '@/lib/proxyRotation'
import { BankPicker } from '@/pages/Bank'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/Toast'
import { useTr } from '@/lib/i18n'

interface Phone { id: string; geelark_id: string; phone_name: string; ig_username?: string | null; group_name?: string | null }
// lockedPlatform : quand fourni (ex. 'threads'), la page est verrouillée sur CETTE
// plateforme — pas de sélecteur multi-plateforme, titre dédié.
interface CrossPostingProps { user: User; lockedPlatform?: CrossPlatform }

type JobStatus = 'idle' | 'uploading' | 'running' | 'done' | 'error'
interface Job { key: string; phone: Phone; platform: CrossPlatform; status: JobStatus; detail?: string }

export function CrossPosting({ user, lockedPlatform }: CrossPostingProps) {
  const { currentOrg } = useOrg()
  const { bearer } = useConnections(user)
  const toast = useToast()
  const tr = useTr()

  const [phones, setPhones]     = useState<Phone[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch]     = useState('')

  const [platforms, setPlatforms] = useState<Set<CrossPlatform>>(new Set([lockedPlatform ?? 'threads']))
  const lockedCfg = lockedPlatform ? CROSS_PLATFORMS.find(p => p.key === lockedPlatform) : undefined
  const [videos, setVideos]       = useState<{ url: string; title: string; isImage: boolean }[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [captionsText, setCaptionsText] = useState('')
  const [mode, setMode]           = useState<'seq' | 'random'>('seq')
  const [showCapPicker, setShowCapPicker] = useState(false)

  const [rotProxy, setRotProxy]   = useState(() => localStorage.getItem('sf-cross-rotproxy') === '1')
  useEffect(() => { localStorage.setItem('sf-cross-rotproxy', rotProxy ? '1' : '0') }, [rotProxy])

  const [jobs, setJobs]       = useState<Job[]>([])
  const [running, setRunning] = useState(false)

  const loadPhones = useCallback(async () => {
    let q = supabase.from('phones').select('id, geelark_id, phone_name, ig_username, group_name').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id)
    const { data } = await q
    setPhones((data ?? []) as Phone[])
  }, [currentOrg, user.id])
  useEffect(() => { loadPhones() }, [loadPhones])

  const visible = phones.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.phone_name?.toLowerCase().includes(q) || p.ig_username?.toLowerCase().includes(q)
  })
  const togglePhone = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const togglePlatform = (k: CrossPlatform) => setPlatforms(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const captions = captionsText.split('\n').map(s => s.trim()).filter(Boolean)
  const rotConfigured = getProxyRotation().enabled && getProxyRotation().urls.length > 0
  const canLaunch = !running && !!bearer && videos.length > 0 && selected.size > 0 && platforms.size > 0

  function setJob(key: string, patch: Partial<Job>) {
    setJobs(prev => prev.map(j => j.key === key ? { ...j, ...patch } : j))
  }

  // Ajoute les captions choisies dans la banque à la pool (une par ligne).
  function addCaptions(texts: string[]) {
    const clean = texts.map(t => t.trim()).filter(Boolean)
    if (clean.length) setCaptionsText(prev => (prev.trim() ? prev.trim() + '\n' : '') + clean.join('\n'))
  }

  async function launch() {
    if (!canLaunch) return
    const toRun = phones.filter(p => selected.has(p.id))
    const plats = CROSS_PLATFORMS.filter(p => platforms.has(p.key))
    const rotationUrls = rotProxy ? activeRotationUrls() : []
    const caps = captions
    setRunning(true)

    const initial: Job[] = toRun.flatMap(phone => plats.map(pl => ({
      key: `${phone.id}:${pl.key}`, phone, platform: pl.key, status: 'idle' as JobStatus,
    })))
    setJobs(initial)

    // Suivi global + alerte même-proxy.
    const runId = `threads-${Date.now()}`
    ;(async () => {
      let proxyKeys: string[] = []
      try {
        const pm = await fetchPhoneProxies(bearer!)
        proxyKeys = [...new Set(toRun.map(p => { const px = pm.get(p.geelark_id); return px?.server ? `${px.server}:${px.port ?? ''}` : '' }).filter(Boolean))]
      } catch { /* best-effort */ }
      if (proxyConflicts(proxyKeys, runId).length) {
        toast.show({ title: tr('⚠️ Même proxy déjà utilisé', '⚠️ Same proxy already in use'), body: tr('Un autre posting tourne sur le même proxy — risque de ban.', 'Another posting is running on the same proxy — risk of ban.'), kind: 'warn' })
      }
      startRun({
        id: runId, type: 'threads', label: tr(`Threads · ${toRun.length} compte${toRun.length > 1 ? 's' : ''}`, `Threads · ${toRun.length} account${toRun.length > 1 ? 's' : ''}`),
        proxyKeys, done: 0, total: toRun.length, page: 'posting',
        phones: toRun.map(p => ({ id: p.id, name: p.ig_username ? `@${p.ig_username}` : p.phone_name, status: 'idle' as PhaseStatus })),
      })
    })()

    // Distribution vidéo/caption par téléphone : séquentiel (tél i → élément i) ou
    // aléatoire.
    const pick = <T,>(arr: T[], i: number): T =>
      mode === 'seq' ? arr[i % arr.length] : arr[Math.floor(Math.random() * arr.length)]

    // Les templates RPA exigent une URL HÉBERGÉE chez GeeLark. On héberge chaque
    // média UNE fois (cache par URL) — via le MÊME mécanisme que le posting Insta
    // (uploadVideoGeelark : upload côté Electron, pas de blocage CORS). Repli web.
    const isImg = (u: string) => /\.(jpg|jpeg|png|gif|bmp|webp|heif|heic)(\?|$)/i.test(u)
    const hostCache = new Map<string, { resourceUrl: string; isImage: boolean } | null>()
    const ensureHosted = async (url: string): Promise<{ resourceUrl: string; isImage: boolean } | null | { err: string }> => {
      if (hostCache.has(url)) return hostCache.get(url)!
      let out: { resourceUrl: string; isImage: boolean } | null = null
      let errMsg = ''
      if (window.electronAPI?.uploadVideoGeelark) {
        const up = await window.electronAPI.uploadVideoGeelark({ bearer: bearer!, filePath: url })
        if (up?.ok && up.token) out = { resourceUrl: up.token, isImage: isImg(url) }
        else errMsg = up?.error ?? tr('upload échoué', 'upload failed')
      } else {
        out = await geelarkUploadForRpa(bearer!, url, m => { errMsg = m })
      }
      hostCache.set(url, out)
      return out ?? { err: errMsg }
    }

    let ok = 0, err = 0
    for (let i = 0; i < toRun.length; i++) {
      const phone = toRun[i]
      const vid = pick(videos, i)
      const cap = caps.length ? pick(caps, i) : ''
      const phoneKeys = plats.map(pl => `${phone.id}:${pl.key}`)
      phoneKeys.forEach(k => setJob(k, { status: 'uploading', detail: tr('Envoi de la vidéo au téléphone…', 'Sending video to the phone…') }))
      setRunPhase(runId, phone.id, 'running')
      const res = await ensureHosted(vid.url)
      const hosted = res && 'resourceUrl' in res ? res : null
      if (!hosted) {
        err += plats.length
        const reason = res && 'err' in res && res.err ? res.err : tr('upload échoué', 'upload failed')
        phoneKeys.forEach(k => setJob(k, { status: 'error', detail: tr(`Média non envoyé : ${reason}`, `Media not sent: ${reason}`) }))
        setRunPhase(runId, phone.id, 'error')
        continue
      }
      let phoneErr = false
      for (const pl of plats) {
        const key = `${phone.id}:${pl.key}`
        setJob(key, { status: 'running' })
        try {
          const r = await publishVideoCrossPlatform(bearer!, phone.geelark_id, pl.key,
            { mediaUrl: hosted.resourceUrl, isImage: vid.isImage, caption: cap || undefined, rotationUrls },
            m => setJob(key, { detail: m }))
          if (r.ok) { ok++; setJob(key, { status: 'done', detail: tr('Publié ✓', 'Published ✓') }) }
          else { err++; phoneErr = true; setJob(key, { status: 'error', detail: r.error ?? tr('Échec', 'Failed') }) }
        } catch (e) {
          err++; phoneErr = true; setJob(key, { status: 'error', detail: e instanceof Error ? e.message : String(e) })
        }
      }
      setRunPhase(runId, phone.id, phoneErr ? 'error' : 'done')
      updateRun(runId, { done: i + 1 })
    }
    endRun(runId, err > 0 ? 'error' : 'done')
    setRunning(false)
    toast.show({
      title: err === 0 ? tr('Publication terminée ✓', 'Publishing complete ✓') : tr('Terminé avec erreurs', 'Finished with errors'),
      body: tr(`${ok} publication(s) réussie(s)${err ? ` · ${err} échec(s)` : ''}`, `${ok} successful publication(s)${err ? ` · ${err} failure(s)` : ''}`),
      kind: err === 0 ? 'ok' : 'error',
    })
  }

  const statusColor: Record<JobStatus, string> = {
    idle: 'var(--text-4)', uploading: 'var(--info)', running: 'var(--accent)', done: 'var(--ok)', error: 'var(--danger)',
  }

  return (
    <div className="sf-page anim-page">
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title" style={{ fontSize: 22 }}>
            {lockedCfg ? `${lockedCfg.emoji} ${lockedCfg.label}` : 'Cross-posting'}
          </h1>
          <p className="sf-page-sub">
            {lockedCfg
              ? tr(`Mass posting ${lockedCfg.label} : plusieurs vidéos + captions de la banque, distribuées en séquentiel ou aléatoire.`, `Mass posting ${lockedCfg.label}: multiple videos + captions from the bank, distributed sequentially or randomly.`)
              : tr('Mass posting Threads & co : plusieurs vidéos + captions de la banque, distribuées en séquentiel ou aléatoire sur tes comptes.', 'Mass posting Threads & co: multiple videos + captions from the bank, distributed sequentially or randomly across your accounts.')}
          </p>
        </div>
      </div>

      {!bearer ? (
        <div className="sf-card" style={{ margin: 24 }}>
          <EmptyState
            title={tr('GéeLark non connecté', 'GeeLark not connected')}
            description={tr('Ajoute ton token GéeLark pour publier.', 'Add your GeeLark token to publish.')}
            action={{ label: tr('Configurer dans les Réglages', 'Configure in Settings'), onClick: () => window.dispatchEvent(new CustomEvent('sf:navigate', { detail: { page: 'settings', tab: 'connexions' } })) }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, padding: '0 24px 24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Left : config */}
          <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 320 }}>
            {/* Platforms — masqué quand la page est verrouillée sur une plateforme */}
            {!lockedPlatform && (
              <div className="sf-card" style={{ padding: 16 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>{tr('Plateformes', 'Platforms')}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CROSS_PLATFORMS.map(pl => {
                    const on = platforms.has(pl.key)
                    return (
                      <button key={pl.key} onClick={() => togglePlatform(pl.key)}
                        className="cursor-pointer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 'var(--r-md)',
                          fontSize: 12.5, fontWeight: 600, transition: 'all .15s',
                          background: on ? 'var(--accent-dim)' : 'var(--surface-2)',
                          border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border)'}`,
                          color: on ? 'var(--accent-lt)' : 'var(--text-3)',
                        }}>
                        <span>{pl.emoji}</span>{pl.label}
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 10 }}>
                  {tr('⚠ Les templates RPA de ces plateformes dépendent de la version de l’API GéeLark ; en cas d’erreur, le message exact est affiché par téléphone.', '⚠ The RPA templates for these platforms depend on the GeeLark API version; if an error occurs, the exact message is shown per phone.')}
                </p>
              </div>
            )}

            {/* Vidéos */}
            <div className="sf-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{tr('Vidéos & photos', 'Videos & photos')}</p>
                {videos.length > 0 && <span className="sf-badge sf-badge-accent" style={{ fontSize: 10 }}>{videos.length}</span>}
                {videos.length > 0 && <button onClick={() => setVideos([])} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ marginLeft: 'auto', fontSize: 11 }}>{tr('Vider', 'Clear')}</button>}
              </div>
              <button onClick={() => setShowPicker(true)} className="sf-btn sf-btn-secondary cursor-pointer" style={{ justifyContent: 'flex-start' }}>
                {videos.length ? tr(`🎬 ${videos.length} vidéo(s) — ajouter d'autres`, `🎬 ${videos.length} video(s) — add more`) : tr('＋ Choisir dans la banque', '＋ Choose from bank')}
              </button>

              {/* Distribution seq/random */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([{ k: 'seq', l: 'Séquentiel', en: 'Sequential' }, { k: 'random', l: 'Aléatoire', en: 'Random' }] as const).map(m => (
                  <button key={m.k} onClick={() => setMode(m.k)} className="cursor-pointer"
                    style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r-sm)', fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (mode === m.k ? 'var(--border-accent)' : 'var(--border)'),
                      background: mode === m.k ? 'var(--accent-dim)' : 'var(--surface-2)', color: mode === m.k ? 'var(--accent-lt)' : 'var(--text-3)' }}>
                    {tr(m.l, m.en)}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0 }}>
                {mode === 'seq' ? tr('Téléphone 1 → vidéo 1, téléphone 2 → vidéo 2…', 'Phone 1 → video 1, phone 2 → video 2…') : tr('Chaque téléphone reçoit une vidéo au hasard.', 'Each phone gets a random video.')}
              </p>
            </div>

            {/* Captions (description Threads = champ title) */}
            <div className="sf-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Captions</p>
                {captions.length > 0 && <span className="sf-badge sf-badge-accent" style={{ fontSize: 10 }}>{captions.length}</span>}
                <button onClick={() => setShowCapPicker(true)} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ marginLeft: 'auto', fontSize: 11 }}>
                  {tr('＋ Choisir dans la banque', '＋ Choose from bank')}
                </button>
              </div>
              <textarea
                value={captionsText}
                onChange={e => setCaptionsText(e.target.value)}
                placeholder={tr("Une caption par ligne — chaque caption = la description d'un compte…", "One caption per line — each caption = one account's description…")}
                className="sf-input"
                style={{ minHeight: 90, resize: 'vertical', padding: 10, fontSize: 12.5 }}
              />
              <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0 }}>
                {tr(`1 caption = 1 compte (${mode === 'seq' ? 'séquentiel : compte 1 → caption 1…' : 'aléatoire'}). Une ligne par caption.`, `1 caption = 1 account (${mode === 'seq' ? 'sequential: account 1 → caption 1…' : 'random'}). One line per caption.`)}
              </p>
              <div className="sf-card" style={{ padding: '10px 12px', background: 'var(--surface-2)' }}>
                <Toggle on={rotProxy} onChange={setRotProxy} label={tr('Proxy rotatif', 'Rotating proxy')}
                  warn={!rotConfigured} warnTitle={tr('Rotation non configurée — Réglages → Connexions', 'Rotation not configured — Settings → Connections')}
                  hint={rotProxy ? tr('Série · nouvelle IP avant chaque téléphone', 'Serial · new IP before each phone') : tr('Parallèle par téléphone · sans rotation', 'Parallel per phone · no rotation')} />
              </div>
            </div>

            <button
              onClick={launch}
              disabled={!canLaunch}
              className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer"
              style={{ opacity: canLaunch ? 1 : 0.5 }}
            >
              {running ? tr('Publication en cours…', 'Publishing…') : tr(`🚀 Publier — ${selected.size} téléphone(s) × ${platforms.size} plateforme(s)`, `🚀 Publish — ${selected.size} phone(s) × ${platforms.size} platform(s)`)}
            </button>
          </div>

          {/* Right : phones + jobs */}
          <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 300 }}>
            <div className="sf-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher un téléphone…', 'Search a phone…')}
                  className="sf-input" style={{ flex: 1, height: 30, fontSize: 12 }} />
                <button onClick={() => setSelected(new Set(visible.map(p => p.id)))} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{tr('Tous', 'All')}</button>
                <button onClick={() => setSelected(new Set())} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{tr('Aucun', 'None')}</button>
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                {visible.length === 0 ? (
                  <EmptyState compact title={tr('Aucun téléphone', 'No phone')}
                    description={tr('Synchronise tes cloud phones depuis l’onglet Téléphones.', 'Sync your cloud phones from the Phones tab.')}
                    action={{ label: tr('Aller aux Téléphones', 'Go to Phones'), onClick: () => window.dispatchEvent(new CustomEvent('sf:navigate', { detail: { page: 'phones' } })) }} />
                ) : visible.map(p => {
                  const on = selected.has(p.id)
                  return (
                    <button key={p.id} onClick={() => togglePhone(p.id)} className="cursor-pointer"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: 'none', textAlign: 'left',
                        borderLeft: on ? '2px solid var(--accent)' : '2px solid transparent',
                        background: on ? 'var(--accent-dim2)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: on ? 'none' : '1px solid var(--border-strong)', background: on ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {on && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.ig_username ? `@${p.ig_username}` : p.phone_name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Jobs progress */}
            {jobs.length > 0 && (
              <div className="sf-card" style={{ padding: 14 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>{tr('Progression', 'Progress')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 300, overflow: 'auto' }}>
                  {jobs.map(j => {
                    const pl = CROSS_PLATFORMS.find(p => p.key === j.platform)!
                    return (
                      <div key={j.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[j.status], flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{pl.emoji}</span>
                        <span style={{ color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {j.phone.ig_username ? `@${j.phone.ig_username}` : j.phone.phone_name}
                        </span>
                        <span style={{ marginLeft: 'auto', color: statusColor[j.status], flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {j.detail ?? j.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showPicker && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles, _descs, items) => {
            const IMG = /\.(jpg|jpeg|png|gif|bmp|webp|heif|heic)(\?|$)/i
            const added = paths.map((p, i) => {
              // Détection image FIABLE : on regarde le vrai fichier de banque
              // (storage_path / file_url / titre), pas seulement l'URL signée.
              const it = items?.[i] as { storage_path?: string | null; file_url?: string | null } | undefined
              const src = `${it?.storage_path ?? ''} ${it?.file_url ?? ''} ${titles?.[i] ?? ''} ${p}`
              return { url: p, title: titles?.[i] ?? 'media', isImage: IMG.test(src) }
            })
            setVideos(prev => {
              const seen = new Set(prev.map(v => v.url))
              return [...prev, ...added.filter(a => !seen.has(a.url))]
            })
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showCapPicker && (
        <CaptionPicker
          user={user}
          currentOrg={currentOrg}
          onSelect={texts => { addCaptions(texts); setShowCapPicker(false) }}
          onClose={() => setShowCapPicker(false)}
        />
      )}
    </div>
  )
}

// ── Sélecteur de captions depuis la banque (choix multiple) ──────────────────
function CaptionPicker({ user, currentOrg, onSelect, onClose }: {
  user: User
  currentOrg: { id: string } | null
  onSelect: (texts: string[]) => void
  onClose: () => void
}) {
  const tr = useTr()
  const [items, setItems]   = useState<{ id: string; title: string; content: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel]       = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      let q = supabase.from('caption_bank').select('id, title, content').order('created_at', { ascending: false })
      q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
      const { data } = await q
      setItems((data ?? []) as { id: string; title: string; content: string }[])
      setLoading(false)
    })()
  }, [currentOrg, user.id])

  const visible = items.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return (i.title ?? '').toLowerCase().includes(s) || (i.content ?? '').toLowerCase().includes(s)
  })
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="sf-card" style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{tr('Choisir des captions', 'Choose captions')}</p>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{tr(`${sel.size} sélectionnée(s)`, `${sel.size} selected`)}</span>
          <button onClick={onClose} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher…', 'Search…')} className="sf-input" style={{ height: 32, fontSize: 12.5, marginBottom: 10 }} />
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>{tr('Chargement…', 'Loading…')}</p>
          ) : visible.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>{tr('Aucune caption dans la banque.', 'No caption in the bank.')}</p>
          ) : visible.map(i => {
            const on = sel.has(i.id)
            return (
              <button key={i.id} onClick={() => toggle(i.id)} className="cursor-pointer"
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 11px', borderRadius: 'var(--r-sm)', textAlign: 'left', border: '1px solid ' + (on ? 'var(--border-accent)' : 'var(--border)'), background: on ? 'var(--accent-dim)' : 'var(--surface-2)' }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, marginTop: 1, border: on ? 'none' : '1px solid var(--border-strong)', background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {i.content || i.title}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => setSel(new Set(visible.map(i => i.id)))} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{tr('Tout', 'All')}</button>
          <button
            onClick={() => onSelect(items.filter(i => sel.has(i.id)).map(i => i.content || i.title))}
            disabled={sel.size === 0}
            className="sf-btn sf-btn-primary cursor-pointer"
            style={{ marginLeft: 'auto', opacity: sel.size === 0 ? 0.5 : 1 }}
          >
            {tr(`Ajouter ${sel.size > 0 ? `(${sel.size})` : ''}`, `Add ${sel.size > 0 ? `(${sel.size})` : ''}`)}
          </button>
        </div>
      </div>
    </div>
  )
}
