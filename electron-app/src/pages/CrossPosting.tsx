import { useState, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { supabase } from '@/lib/supabase'
import {
  publishVideoCrossPlatform, CROSS_PLATFORMS,
  type CrossPlatform,
} from '@/lib/geelark'
import { activeRotationUrls, getProxyRotation } from '@/lib/proxyRotation'
import { BankPicker } from '@/pages/Bank'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/Toast'

interface Phone { id: string; geelark_id: string; phone_name: string; ig_username?: string | null; group_name?: string | null }
interface CrossPostingProps { user: User }

type JobStatus = 'idle' | 'uploading' | 'running' | 'done' | 'error'
interface Job { key: string; phone: Phone; platform: CrossPlatform; status: JobStatus; detail?: string }

export function CrossPosting({ user }: CrossPostingProps) {
  const { currentOrg } = useOrg()
  const { bearer } = useConnections(user)
  const toast = useToast()

  const [phones, setPhones]     = useState<Phone[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch]     = useState('')

  const [platforms, setPlatforms] = useState<Set<CrossPlatform>>(new Set(['threads']))
  const [videos, setVideos]       = useState<{ url: string; title: string }[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [captionsText, setCaptionsText] = useState('')
  const [mode, setMode]           = useState<'seq' | 'random'>('seq')
  const [loadingCaps, setLoadingCaps] = useState(false)

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

  // Importe les captions de la banque de captions dans la pool (une par ligne).
  async function importCaptions() {
    setLoadingCaps(true)
    let q = supabase.from('caption_bank').select('content').order('created_at', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await q
    const texts = (data ?? []).map(r => String((r as { content?: string }).content ?? '').trim()).filter(Boolean)
    if (texts.length) setCaptionsText(prev => (prev.trim() ? prev.trim() + '\n' : '') + texts.join('\n'))
    setLoadingCaps(false)
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

    // Distribution vidéo/caption par téléphone : séquentiel (tél i → élément i) ou
    // aléatoire. Les templates RPA téléchargent la vidéo depuis l'URL signée.
    const pick = <T,>(arr: T[], i: number): T =>
      mode === 'seq' ? arr[i % arr.length] : arr[Math.floor(Math.random() * arr.length)]

    let ok = 0, err = 0
    for (let i = 0; i < toRun.length; i++) {
      const phone = toRun[i]
      const vid = pick(videos, i)
      const cap = caps.length ? pick(caps, i) : ''
      for (const pl of plats) {
        const key = `${phone.id}:${pl.key}`
        setJob(key, { status: 'running' })
        try {
          const r = await publishVideoCrossPlatform(bearer!, phone.geelark_id, pl.key,
            { videoUrl: vid.url, caption: cap || undefined, rotationUrls },
            m => setJob(key, { detail: m }))
          if (r.ok) { ok++; setJob(key, { status: 'done', detail: 'Publié ✓' }) }
          else { err++; setJob(key, { status: 'error', detail: r.error ?? 'Échec' }) }
        } catch (e) {
          err++; setJob(key, { status: 'error', detail: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    setRunning(false)
    toast.show({
      title: err === 0 ? 'Cross-posting terminé ✓' : 'Terminé avec erreurs',
      body: `${ok} publication(s) réussie(s)${err ? ` · ${err} échec(s)` : ''}`,
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
          <h1 className="sf-page-title" style={{ fontSize: 22 }}>Cross-posting</h1>
          <p className="sf-page-sub">Mass posting Threads &amp; co : plusieurs vidéos + captions de la banque, distribuées en séquentiel ou aléatoire sur tes comptes.</p>
        </div>
      </div>

      {!bearer ? (
        <div className="sf-card" style={{ margin: 24 }}>
          <EmptyState
            title="GéeLark non connecté"
            description="Ajoute ton token GéeLark pour utiliser le cross-posting."
            action={{ label: 'Configurer dans les Réglages', onClick: () => window.dispatchEvent(new CustomEvent('sf:navigate', { detail: { page: 'settings', tab: 'connexions' } })) }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, padding: '0 24px 24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Left : config */}
          <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 320 }}>
            {/* Platforms */}
            <div className="sf-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>Plateformes</p>
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
                ⚠ Les templates RPA de ces plateformes dépendent de la version de l’API GéeLark ; en cas d’erreur, le message exact est affiché par téléphone.
              </p>
            </div>

            {/* Vidéos */}
            <div className="sf-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Vidéos</p>
                {videos.length > 0 && <span className="sf-badge sf-badge-accent" style={{ fontSize: 10 }}>{videos.length}</span>}
                {videos.length > 0 && <button onClick={() => setVideos([])} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ marginLeft: 'auto', fontSize: 11 }}>Vider</button>}
              </div>
              <button onClick={() => setShowPicker(true)} className="sf-btn sf-btn-secondary cursor-pointer" style={{ justifyContent: 'flex-start' }}>
                {videos.length ? `🎬 ${videos.length} vidéo(s) — ajouter d'autres` : '＋ Choisir dans la banque'}
              </button>

              {/* Distribution seq/random */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([{ k: 'seq', l: 'Séquentiel' }, { k: 'random', l: 'Aléatoire' }] as const).map(m => (
                  <button key={m.k} onClick={() => setMode(m.k)} className="cursor-pointer"
                    style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r-sm)', fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (mode === m.k ? 'var(--border-accent)' : 'var(--border)'),
                      background: mode === m.k ? 'var(--accent-dim)' : 'var(--surface-2)', color: mode === m.k ? 'var(--accent-lt)' : 'var(--text-3)' }}>
                    {m.l}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0 }}>
                {mode === 'seq' ? 'Téléphone 1 → vidéo 1, téléphone 2 → vidéo 2…' : 'Chaque téléphone reçoit une vidéo au hasard.'}
              </p>
            </div>

            {/* Captions (description Threads = champ title) */}
            <div className="sf-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Captions</p>
                <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>une par ligne · distribuées comme les vidéos</span>
                <button onClick={importCaptions} disabled={loadingCaps} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ marginLeft: 'auto', fontSize: 11 }}>
                  {loadingCaps ? '…' : '＋ Banque de captions'}
                </button>
              </div>
              <textarea
                value={captionsText}
                onChange={e => setCaptionsText(e.target.value)}
                placeholder="Une caption par ligne… (optionnel)"
                className="sf-input"
                style={{ minHeight: 90, resize: 'vertical', padding: 10, fontSize: 12.5 }}
              />
              <div className="sf-card" style={{ padding: '10px 12px', background: 'var(--surface-2)' }}>
                <Toggle on={rotProxy} onChange={setRotProxy} label="Proxy rotatif"
                  warn={!rotConfigured} warnTitle="Rotation non configurée — Réglages → Connexions"
                  hint={rotProxy ? 'Série · nouvelle IP avant chaque téléphone' : 'Parallèle par téléphone · sans rotation'} />
              </div>
            </div>

            <button
              onClick={launch}
              disabled={!canLaunch}
              className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer"
              style={{ opacity: canLaunch ? 1 : 0.5 }}
            >
              {running ? 'Publication en cours…' : `🚀 Publier — ${selected.size} téléphone(s) × ${platforms.size} plateforme(s)`}
            </button>
          </div>

          {/* Right : phones + jobs */}
          <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 300 }}>
            <div className="sf-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un téléphone…"
                  className="sf-input" style={{ flex: 1, height: 30, fontSize: 12 }} />
                <button onClick={() => setSelected(new Set(visible.map(p => p.id)))} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">Tous</button>
                <button onClick={() => setSelected(new Set())} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">Aucun</button>
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                {visible.length === 0 ? (
                  <EmptyState compact title="Aucun téléphone"
                    description="Synchronise tes cloud phones depuis l’onglet Téléphones."
                    action={{ label: 'Aller aux Téléphones', onClick: () => window.dispatchEvent(new CustomEvent('sf:navigate', { detail: { page: 'phones' } })) }} />
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
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>Progression</p>
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
          onSelect={(paths, titles) => {
            const added = paths.map((p, i) => ({ url: p, title: titles?.[i] ?? 'video' }))
            setVideos(prev => {
              const seen = new Set(prev.map(v => v.url))
              return [...prev, ...added.filter(a => !seen.has(a.url))]
            })
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
