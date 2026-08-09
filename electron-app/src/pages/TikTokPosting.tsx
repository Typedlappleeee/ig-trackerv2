import { useState, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { Input }  from '@/components/ui/Input'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { filterAccessiblePhones } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import { postTikTokVideoAdb } from '@/lib/geelark'
import { BankPicker, VideoThumbnail } from '@/pages/Bank'
import { useTr } from '@/lib/i18n'

// ── Selected video (from the content bank) ──────────────────────────────────
interface SelectedVideo {
  url:   string  // signed URL, ready for download on the phone
  title: string
}

// ── Local phone shape from Supabase ─────────────────────────────────────────
interface Phone {
  id:          string
  geelark_id:  string
  phone_name:  string
  tt_username?: string | null
  ig_username?: string | null
  group_name?:  string | null
}

interface TikTokPostingProps { user: User }

type PhoneStatus = 'idle' | 'booting' | 'running' | 'done' | 'error'

interface PhoneJob {
  phone:   Phone
  status:  PhoneStatus
  logs:    string[]
  result?: string
}

// ── Icons ────────────────────────────────────────────────────────────────────
function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  play:    'M5 3l14 9-14 9V3z',
  stop:    'M18 18H6V6h12v12z',
  check:   'M20 6 9 17l-5-5',
  x:       'M18 6 6 18M6 6l12 12',
  refresh: 'M4 4v5h5M20 20v-5h-5M4.93 14A8 8 0 1 0 6.93 5.93',
  chevron: 'M19 9l-7 7-7-7',
  video:   'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  tiktok:  'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z',
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PhoneStatus }) {
  const tr = useTr()
  const cfg: Record<PhoneStatus, { label: string; cls: string }> = {
    idle:    { label: tr('En attente', 'Waiting'), cls: 'sf-badge-muted'  },
    booting: { label: tr('Démarrage', 'Booting'),  cls: 'sf-badge-warn'   },
    running: { label: tr('En cours…', 'Running…'),  cls: 'sf-badge-accent' },
    done:    { label: tr('Publié', 'Posted'),      cls: 'sf-badge-ok'     },
    error:   { label: tr('Erreur', 'Error'),       cls: 'sf-badge-danger' },
  }
  const { label, cls } = cfg[status]
  const spinning = status === 'booting' || status === 'running'
  return (
    <span className={`sf-badge ${cls}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
      {spinning ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
          {label}
        </span>
      ) : label}
    </span>
  )
}

// ── Log panel (collapsible) ───────────────────────────────────────────────────
function LogPanel({ logs }: { logs: string[] }) {
  const tr = useTr()
  const [open, setOpen] = useState(false)
  if (logs.length === 0) return null
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text2)', fontSize: 11, padding: 0,
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }}>
          <Icon d={ICONS.chevron} size={12} />
        </span>
        {open ? tr('Masquer les logs', 'Hide logs') : tr(`Voir les logs (${logs.length})`, `Show logs (${logs.length})`)}
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace', fontSize: 11,
          color: 'var(--text2)', maxHeight: 180, overflowY: 'auto',
          lineHeight: 1.6, border: '1px solid var(--border)',
        }}>
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TikTokPosting({ user }: TikTokPostingProps) {
  const tr = useTr()
  const { currentOrg, role, perms } = useOrg()
  const { bearer } = useConnections(user)

  // ── Phones state ─────────────────────────────────────────────────────────
  const [phones, setPhones]           = useState<Phone[]>([])
  const [phonesLoading, setPhonesLoading] = useState(false)
  const [phonesError, setPhonesError] = useState<string | null>(null)
  const [selected, setSelected]       = useState<Set<string>>(new Set())

  // ── Form state ───────────────────────────────────────────────────────────
  const [video,     setVideo]     = useState<SelectedVideo | null>(null)
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [caption,   setCaption]   = useState('')
  const [hashtags,  setHashtags]  = useState('')

  // ── Job state ────────────────────────────────────────────────────────────
  const [jobs,    setJobs]    = useState<PhoneJob[]>([])
  const [running, setRunning] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // ── Load phones from Supabase ────────────────────────────────────────────
  const loadPhones = useCallback(async () => {
    setPhonesLoading(true)
    setPhonesError(null)
    try {
      let q = supabase.from('phones').select('*').order('phone_name')
      if (currentOrg) {
        q = q.eq('org_id', currentOrg.id)
      } else {
        q = q.eq('user_id', user.id)
      }
      const { data, error } = await q
      if (error) throw error
      // 🔒 Filtre à la source : le membre ne voit/poste que sur ses groupes autorisés.
      setPhones(filterAccessiblePhones((data ?? []) as Phone[], role, perms))
    } catch (e) {
      setPhonesError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhonesLoading(false)
    }
  }, [currentOrg, user.id, role, perms])

  // Load on mount
  useState(() => { loadPhones() })

  // ── Selection helpers ────────────────────────────────────────────────────
  const allSelected = phones.length > 0 && phones.every(p => selected.has(p.id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(phones.map(p => p.id)))
    }
  }

  function togglePhone(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Update a single job ──────────────────────────────────────────────────
  function updateJob(phoneId: string, patch: Partial<PhoneJob>) {
    setJobs(prev => prev.map(j => j.phone.id === phoneId ? { ...j, ...patch } : j))
  }

  function appendLog(phoneId: string, msg: string) {
    setJobs(prev => prev.map(j =>
      j.phone.id === phoneId ? { ...j, logs: [...j.logs, msg] } : j
    ))
  }

  // ── Launch automation ────────────────────────────────────────────────────
  async function handleLaunch() {
    if (!bearer) return
    if (!video) return
    const toRun = phones.filter(p => selected.has(p.id))
    if (toRun.length === 0) return

    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)

    // Initialize jobs
    setJobs(toRun.map(phone => ({ phone, status: 'idle', logs: [], result: undefined })))

    const fullCaption = [caption.trim(), hashtags.trim()].filter(Boolean).join(' ')

    for (const phone of toRun) {
      if (ac.signal.aborted) break

      updateJob(phone.id, { status: 'booting' })

      try {
        const { ok, error } = await postTikTokVideoAdb(
          bearer,
          phone.geelark_id,
          { videoUrl: video.url, caption: fullCaption },
          (msg) => appendLog(phone.id, msg),
          ac.signal,
        )

        if (ok) {
          updateJob(phone.id, { status: 'done', result: tr('Publié avec succès', 'Posted successfully') })
        } else {
          updateJob(phone.id, { status: 'error', result: error ?? tr('Erreur inconnue', 'Unknown error') })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg === 'Annulé') {
          updateJob(phone.id, { status: 'idle', result: tr('Annulé', 'Cancelled') })
        } else {
          updateJob(phone.id, { status: 'error', result: msg })
        }
      }
    }

    setRunning(false)
    abortRef.current = null
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  // ── Can launch ───────────────────────────────────────────────────────────
  const canLaunch = !running && !!bearer && !!video && selected.size > 0

  // ── Render ───────────────────────────────────────────────────────────────
  const doneCount = jobs.filter(j => j.status === 'done').length
  const errCount  = jobs.filter(j => j.status === 'error').length

  return (
    <div className="sf-page anim-page" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 28px 40px' }}>

      {/* Header */}
      <div className="sf-page-header" style={{ marginBottom: 20 }}>
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring">
            <Icon d={ICONS.tiktok} size={22} />
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">TikTok Mass Posting</h1>
            <p className="sf-page-sub">
              {tr('Publie une vidéo sur plusieurs comptes TikTok en séquence', 'Post one video to multiple TikTok accounts in sequence')}
              {' · '}
              {tr('2 crédits / téléphone', '2 credits / phone')}
            </p>
          </div>
        </div>
        <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
          <span className={`sf-status-chip ${running ? 'is-live' : 'is-idle'}`}>
            <span className="sf-status-dot" />
            {running
              ? tr('En cours', 'Running')
              : tr(`${selected.size} sélectionné${selected.size > 1 ? 's' : ''}`, `${selected.size} selected`)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left: phone list */}
        <div className="sf-card sf-anim-slide-up sf-d100" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span className="sf-section-label" style={{ margin: 0 }}>
              {tr('Téléphones', 'Phones')} ({phones.length})
            </span>
            <div className="sf-cluster" style={{ gap: 8 }}>
              <button
                className="sf-btn sf-btn-ghost sf-btn-sm"
                onClick={toggleAll}
                disabled={phones.length === 0}
              >
                {allSelected ? tr('Tout désélect.', 'Deselect all') : tr('Tout sélect.', 'Select all')}
              </button>
              <button
                className="sf-btn sf-btn-secondary sf-btn-icon sf-btn-sm"
                onClick={loadPhones}
                disabled={phonesLoading}
                title={tr('Actualiser', 'Refresh')}
              >
                <span className={phonesLoading ? 'animate-spin' : ''} style={{ display: 'flex' }}>
                  <Icon d={ICONS.refresh} size={13} />
                </span>
              </button>
            </div>
          </div>

          {phonesLoading && (
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="sf-skeleton sf-skeleton-line" style={{ height: 34 }} />
              ))}
            </div>
          )}
          {!phonesLoading && phonesError && (
            <div style={{ padding: 16 }}>
              <div className="sf-banner is-danger">
                <Icon d={ICONS.x} size={15} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{phonesError}</span>
                <button className="sf-btn sf-btn-secondary sf-btn-sm sf-banner-action" onClick={loadPhones}>
                  {tr('Réessayer', 'Retry')}
                </button>
              </div>
            </div>
          )}
          {!phonesLoading && !phonesError && phones.length === 0 && (
            <div className="sf-empty" style={{ padding: '32px 20px' }}>
              <div className="sf-empty-icon"><Icon d={ICONS.tiktok} size={24} /></div>
              <div className="sf-empty-title">{tr('Aucun téléphone', 'No phone')}</div>
              <div className="sf-empty-desc">
                {tr('Ajoutez un téléphone GeeLark pour publier sur TikTok.', 'Add a GeeLark phone to post on TikTok.')}
              </div>
            </div>
          )}

          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {phones.map(phone => {
              const isSelected = selected.has(phone.id)
              return (
                <button
                  key={phone.id}
                  onClick={() => togglePhone(phone.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', textAlign: 'left', border: 'none',
                    borderBottom: '1px solid rgba(233,234,240,0.04)',
                    borderLeft: isSelected ? '2px solid rgba(99,102,241,0.5)' : '2px solid transparent',
                    background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                    cursor: 'pointer', transition: 'background 0.15s, border-left-color 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(233,234,240,0.03)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(99,102,241,0.06)' : 'transparent' }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 16, height: 16, flexShrink: 0, borderRadius: 4,
                    border: `1.5px solid ${isSelected ? 'rgba(99,102,241,0.7)' : 'rgba(233,234,240,0.2)'}`,
                    background: isSelected ? 'rgba(99,102,241,0.25)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#818CF8',
                  }}>
                    {isSelected && <Icon d={ICONS.check} size={10} />}
                  </div>

                  {/* Info */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{
                      fontSize: 12, fontWeight: 600, margin: 0,
                      color: isSelected ? 'rgba(233,234,240,0.9)' : 'rgba(233,234,240,0.6)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {phone.phone_name}
                    </p>
                    {phone.ig_username && (
                      <p style={{ fontSize: 10, margin: 0, color: 'rgba(233,234,240,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        IG: @{phone.ig_username}
                      </p>
                    )}
                  </div>

                  {/* TikTok chip */}
                  {phone.tt_username && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                      background: 'rgba(0,0,0,0.35)', color: '#fff',
                      border: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      TT
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div style={{
            padding: '10px 14px', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text2)',
          }}>
            {tr(`${selected.size} sélectionné${selected.size > 1 ? 's' : ''}`, `${selected.size} selected`)}
          </div>
        </div>

        {/* Right: form + results */}
        <div className="sf-stack sf-anim-slide-up sf-d150" style={{ gap: 16 }}>

          {/* Form */}
          <div className="sf-card" style={{ padding: 20 }}>
            <div className="sf-section-label" style={{ marginBottom: 16 }}>
              {tr('Contenu à publier', 'Content to post')}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="sf-field-label" style={{ display: 'block', marginBottom: 6 }}>
                {tr('Vidéo', 'Video')}
              </label>

              {!video ? (
                <button
                  onClick={() => setShowBankPicker(true)}
                  style={{
                    width: '100%', padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                    borderRadius: 12, border: '1px dashed rgba(99,102,241,0.35)',
                    background: 'rgba(99,102,241,0.04)', transition: 'background 0.18s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.04)' }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, margin: '0 auto 10px',
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818CF8',
                  }}>
                    <Icon d={ICONS.video} size={18} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 3px' }}>
                    {tr('Choisir depuis la banque', 'Pick from the bank')}
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--text2)', margin: 0 }}>
                    {tr('Sélectionnez une vidéo de votre banque de contenu', 'Select a video from your content bank')}
                  </p>
                </button>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12,
                  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)',
                }}>
                  <div style={{
                    width: 54, height: 72, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                    background: 'var(--surface-2)',
                  }}>
                    <VideoThumbnail filePath={video.url} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {video.title}
                    </p>
                    <button className="sf-btn sf-btn-secondary sf-btn-sm" onClick={() => setShowBankPicker(true)}>
                      {tr('Changer', 'Change')}
                    </button>
                  </div>
                  <button
                    onClick={() => setVideo(null)}
                    title={tr('Retirer', 'Remove')}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--text2)', padding: 4, display: 'flex',
                    }}
                  >
                    <Icon d={ICONS.x} size={15} />
                  </button>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="sf-field-label" style={{ display: 'block', marginBottom: 6 }}>
                {tr('Légende', 'Caption')}
              </label>
              <textarea
                className="sf-textarea"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={tr('Ajouter une description…', 'Add a description…')}
                rows={3}
                style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <Input
                label={tr('Hashtags (séparés par des espaces)', 'Hashtags (space-separated)')}
                placeholder="#fyp #viral #tiktok"
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
              />
            </div>

            {!bearer && (
              <div className="sf-banner is-warn" style={{ marginBottom: 14 }}>
                <Icon d={ICONS.refresh} size={15} />
                <span>{tr('Clé API GéeLark non configurée — allez dans les paramètres.', 'GeeLark API key not configured — go to Settings.')}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {!running ? (
                <button
                  className="sf-btn sf-btn-primary"
                  onClick={handleLaunch}
                  disabled={!canLaunch}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Icon d={ICONS.play} size={14} />
                  {tr(`Lancer (${selected.size} téléphone${selected.size > 1 ? 's' : ''})`, `Launch (${selected.size} phone${selected.size > 1 ? 's' : ''})`)}
                </button>
              ) : (
                <button
                  className="sf-btn sf-btn-danger"
                  onClick={handleStop}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Icon d={ICONS.stop} size={14} />
                  {tr('Arrêter', 'Stop')}
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          {jobs.length > 0 && (
            <div className="sf-card sf-anim-slide-up" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
              }}>
                <span className="sf-section-label" style={{ margin: 0 }}>{tr('Progression', 'Progress')}</span>
              </div>
              {jobs.map(job => (
                <div key={job.phone.id} style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(233,234,240,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Phone name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--text)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
                      }}>
                        {job.phone.phone_name}
                      </span>
                      {job.phone.tt_username && (
                        <span style={{ fontSize: 11, color: 'var(--text2)' }}>@{job.phone.tt_username}</span>
                      )}
                    </div>

                    {/* Status */}
                    <StatusBadge status={job.status} />

                    {/* Result */}
                    {job.result && (
                      <span style={{
                        fontSize: 11, color: job.status === 'error' ? 'var(--danger)' : 'var(--text2)',
                        maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {job.result}
                      </span>
                    )}
                  </div>

                  <LogPanel logs={job.logs} />
                </div>
              ))}

              {/* Summary */}
              {!running && jobs.length > 0 && (
                <div style={{
                  padding: '10px 16px', borderTop: '1px solid var(--border)',
                  fontSize: 12, display: 'flex', gap: 8,
                }}>
                  <span className="sf-badge sf-badge-ok sf-tabular">
                    {tr(`${doneCount} réussi${doneCount > 1 ? 's' : ''}`, `${doneCount} succeeded`)}
                  </span>
                  {errCount > 0 && (
                    <span className="sf-badge sf-badge-danger sf-tabular">
                      {tr(`${errCount} échoué${errCount > 1 ? 's' : ''}`, `${errCount} failed`)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bank picker modal — pick a single video from the content bank */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="single"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const url = paths[0]
            if (url) {
              setVideo({
                url,
                title: titles?.[0] ?? url.split('/').pop()?.split('?')[0] ?? tr('Vidéo', 'Video'),
              })
            }
            setShowBankPicker(false)
          }}
          onClose={() => setShowBankPicker(false)}
        />
      )}
    </div>
  )
}
