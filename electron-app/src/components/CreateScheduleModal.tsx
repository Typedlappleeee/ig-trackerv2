/**
 * CreateScheduleModal — programme un post directement depuis la page Programmation.
 * Flux : téléphones → vidéos (banque) → légende → date/heure → upload GéeLark → scheduled_posts.
 */
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { canAccessPhoneGroup, filterAccessiblePhones, accessibleGroupNames } from '@/lib/permissions'
import { BankPicker } from '@/pages/Bank'
import { createScheduledPost, defaultSchedValue, type ScheduledVideoRecord } from '@/lib/schedulerService'
import { checkAndDeductCredits, refundCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { useTr } from '@/lib/i18n'

interface SelVideo { url: string; title: string; bank_id?: string; storage_path?: string | null; thumbnail_path?: string | null }

export function CreateScheduleModal({ user, onCreated, onClose, initialPlatform, initialSchedAt }: {
  user:      User
  onCreated: () => void
  onClose:   () => void
  initialPlatform?: 'instagram' | 'tiktok'
  initialSchedAt?: string
}) {
  const { currentOrg, role, perms } = useOrg()
  const tr = useTr()
  const conns = useConnections(user)
  const bearer = conns.bearer ?? ''
  const credits = useCredits()

  const [phones, setPhones]             = useState<Phone[]>([])
  const [selPhones, setSelPhones]       = useState<Set<string>>(new Set())
  const [phoneSearch, setPhoneSearch]   = useState('')
  const [groups, setGroups]             = useState<string[]>(['Tous'])
  const [groupFilter, _setGroupFilter]  = useState(loadLastGroup)
  const setGroupFilter = (g: string) => { _setGroupFilter(g); saveLastGroup(g) }
  const [videos, setVideos]             = useState<SelVideo[]>([])
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [caption, setCaption]           = useState('')
  const [mode, setMode]                 = useState<'seq' | 'random'>('seq')
  const [schedAt, setSchedAt]           = useState(initialSchedAt || defaultSchedValue(60))
  const delayMin = 0   // délai entre comptes retiré de l'UI (toujours 0)
  const [reelsTrial, setReelsTrial]     = useState(false)
  const [deleteAfterPost, setDeleteAfterPost] = useState(false)
  const [platform, setPlatform]         = useState<'instagram' | 'tiktok'>(initialPlatform ?? 'instagram')
  const [submitting, setSubmitting]     = useState(false)
  const [progress, setProgress]         = useState('')
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      // 🔒 Filtre à la source : le membre ne voit que ses groupes autorisés.
      const ps = filterAccessiblePhones((data ?? []) as Phone[], role, perms)
      setPhones(ps)
      const grps = accessibleGroupNames(ps, role, perms)
      setGroups(['Tous', ...grps])
      // Groupe mémorisé disparu (renommé/supprimé) → retour à « Tous »
      if (!grps.includes(loadLastGroup())) setGroupFilter('Tous')
    })
  }, [currentOrg?.id, user.id])

  const visiblePhones = phones.filter(p => {
    if (role && !canAccessPhoneGroup(role, perms, p.group_name)) return false
    if (groupFilter !== 'Tous' && p.group_name !== groupFilter) return false
    if (phoneSearch) {
      const q = phoneSearch.toLowerCase()
      return p.phone_name?.toLowerCase().includes(q) || p.ig_username?.toLowerCase().includes(q)
    }
    return true
  })

  const phoneList = phones.filter(p => selPhones.has(p.id))
  const schedDate = new Date(schedAt)
  const dateValid = !isNaN(schedDate.getTime()) && schedDate.getTime() > Date.now() - 60_000
  const canSubmit = !submitting && !!bearer && phoneList.length > 0 && videos.length > 0 && dateValid

  function togglePhone(id: string) {
    setSelPhones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!canSubmit) return
    // GéeLark expire les fichiers uploadés après 30 jours
    if (schedDate.getTime() > Date.now() + 25 * 24 * 60 * 60 * 1000) {
      setError(tr('Programmation limitée à 25 jours (les vidéos uploadées chez GéeLark expirent après 30 jours).', 'Scheduling limited to 25 days (videos uploaded to GeeLark expire after 30 days).'))
      return
    }
    setSubmitting(true)
    setError(null)
    // Crédits débités à la programmation — remboursés si échec avant création ou annulation
    const creditCost = phoneList.length * CREDIT_COSTS.mass_posting
    const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      setError(`${creditRes.error ?? tr('Crédits insuffisants', 'Insufficient credits')} ${tr(`(requis : ${creditCost} crédits)`, `(required: ${creditCost} credits)`)}`)
      setSubmitting(false)
      return
    }
    if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
    try {
      // In sequential mode only the first min(phones, videos) videos are used
      const toUpload = mode === 'random' ? videos : videos.slice(0, Math.min(phoneList.length, videos.length))
      const tokens: ScheduledVideoRecord[] = []
      for (let i = 0; i < toUpload.length; i++) {
        setProgress(tr(`Upload vidéo ${i + 1}/${toUpload.length}…`, `Uploading video ${i + 1}/${toUpload.length}…`))
        const v = toUpload[i]
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath: v.url })
        if (!up.ok || !up.token) throw new Error(tr(`Upload « ${v.title} » échoué : ${up.error ?? '?'}`, `Upload of "${v.title}" failed: ${up.error ?? '?'}`))
        tokens.push({
          token: up.token, title: v.title,
          // Usage unique : on garde la réf banque pour supprimer après publication.
          ...(deleteAfterPost && v.storage_path
            ? { remove: true, bank_id: v.bank_id, storage_path: v.storage_path, thumbnail_path: v.thumbnail_path }
            : {}),
        })
      }
      setProgress(tr('Création de la programmation…', 'Creating schedule…'))
      await createScheduledPost({
        userId:        user.id,
        orgId:         currentOrg?.id ?? null,
        createdByName: user.email?.split('@')[0] ?? 'Moi',
        type:          'mass_posting',
        scheduledAt:   schedDate,
        phones:        phoneList.map(p => ({ id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username })),
        videos:        tokens,
        caption,
        delayMinutes:  delayMin,
        mode,
        bearerToken:   bearer,
        reelsTrial,
        platform,
      })
      onCreated()
    } catch (e: any) {
      // Échec après déduction → remboursement
      const refunded = await refundCredits(credits.ownerId, creditCost)
      if (refunded) credits.refresh()
      setError(`${e?.message ?? String(e)}${refunded ? tr(` — ${creditCost} crédits remboursés`, ` — ${creditCost} credits refunded`) : ''}`)
      setSubmitting(false)
      setProgress('')
    }
  }

  return (
    <div className="sf-modal-bg" onClick={() => !submitting && onClose()}>
      <div className="sf-modal" onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 720, padding: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>

        {/* Header — pattern v2 (tuile-icône + titre + sous-titre) */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 'var(--sp-4)', padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
            <div className="sf-page-icon sf-page-icon-sm sf-anim-scale-spring" aria-hidden>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
              <h2 className="sf-page-title" style={{ fontSize: 18 }}>{tr('Programmer une publication', 'Schedule a post')}</h2>
              <p className="sf-page-sub">
                {platform === 'tiktok' ? 'TikTok' : 'Instagram'} · {tr('Reels', 'Reels')} · {phoneList.length * CREDIT_COSTS.mass_posting} {tr('crédits', 'credits')}
              </p>
            </div>
          </div>
          <button onClick={() => !submitting && onClose()} className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm" aria-label={tr('Fermer', 'Close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22, scrollbarWidth: 'thin' }}>

          {!bearer && (
            <div className="sf-banner is-warn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {tr('Token GéeLark manquant — ajoute-le dans Paramètres → Connexions avant de programmer.', 'GeeLark token missing — add it in Settings → Connections before scheduling.')}
            </div>
          )}

          {/* ── Plateforme (masquée si déjà choisie via le popup d'entrée) ─── */}
          {!initialPlatform && (
          <section>
            <div className="sf-section-label">{tr('Plateforme', 'Platform')}</div>
            <div className="sf-segment" style={{ display: 'flex', width: '100%' }}>
              {([
                { k: 'instagram', label: 'Instagram', emoji: '📸' },
                { k: 'tiktok',    label: 'TikTok',    emoji: '🎵' },
              ] as const).map(p => (
                <button key={p.k} type="button" onClick={() => setPlatform(p.k)}
                  className={`sf-segment-item${platform === p.k ? ' is-active' : ''}`}
                  style={{ flex: 1, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <span>{p.emoji}</span>{p.label}
                </button>
              ))}
            </div>
          </section>
          )}

          {/* ── Téléphones ─────────────────────────────────────────────────── */}
          <section>
            <div className="sf-section-label">
              {tr('Téléphones', 'Phones')} {phoneList.length > 0 && <span className="sf-tabular" style={{ color: 'var(--accent-lt)', letterSpacing: 'normal' }}>· {phoneList.length}</span>}
            </div>
            <div className="sf-cluster" style={{ gap: 8, marginBottom: 8 }}>
              {groups.length > 1 && (
                <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="sf-input sf-btn-sm cursor-pointer"
                  style={{ height: 30, width: 'auto', fontSize: 12 }}>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <input type="text" className="sf-input" placeholder={tr('Rechercher…', 'Search…')} value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                style={{ flex: 1, minWidth: 120, height: 30, fontSize: 12 }}
              />
              <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))} className="sf-btn sf-btn-ghost sf-btn-sm">
                {tr('Tous', 'All')}
              </button>
              <button onClick={() => setSelPhones(new Set())} className="sf-btn sf-btn-ghost sf-btn-sm">
                {tr('Aucun', 'None')}
              </button>
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', scrollbarWidth: 'thin' }}>
              {phones.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
                  {[70, 55, 62].map((w, i) => (
                    <div key={i} className="sf-skeleton-line" style={{ height: 30, width: `${w}%` }} />
                  ))}
                </div>
              ) : visiblePhones.length === 0 ? (
                <div className="sf-empty" style={{ padding: '26px 16px' }}>
                  <div className="sf-empty-icon" style={{ width: 44, height: 44 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
                  </div>
                  <div className="sf-empty-title">{tr('Aucun téléphone', 'No phones')}</div>
                  <div className="sf-empty-desc">{tr('Aucun téléphone ne correspond à ce filtre.', 'No phone matches this filter.')}</div>
                </div>
              ) : visiblePhones.map(phone => {
                const checked = selPhones.has(phone.id)
                return (
                  <button key={phone.id} onClick={() => togglePhone(phone.id)} className="cursor-pointer sf-press"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)',
                      background: checked ? 'var(--accent-dim)' : 'transparent', transition: 'background var(--t-fast)',
                    }}>
                    <div style={{
                      width: 15, height: 15, flexShrink: 0, borderRadius: 'var(--r-xs)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: checked ? 'var(--accent)' : 'transparent',
                      border: checked ? 'none' : '1px solid var(--border-strong)', transition: 'all var(--t-fast)',
                    }}>
                      {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: checked ? 'var(--text-1)' : 'var(--text-2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {phone.phone_name}
                    </span>
                    {phone.ig_username && <span style={{ fontSize: 11, color: checked ? 'var(--accent-lt)' : 'var(--text-4)' }}>@{phone.ig_username}</span>}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Vidéos ─────────────────────────────────────────────────────── */}
          <section>
            <div className="sf-section-label">
              {tr('Vidéos', 'Videos')} {videos.length > 0 && <span className="sf-tabular" style={{ color: 'var(--accent-lt)', letterSpacing: 'normal' }}>· {videos.length}</span>}
            </div>
            <div className="sf-cluster" style={{ gap: 6 }}>
              {videos.map((v, i) => (
                <span key={i} className="sf-badge sf-badge-accent" style={{ gap: 7, padding: '5px 9px' }}>
                  <span className="sf-tabular" style={{ color: 'var(--accent-lt)', fontWeight: 700 }}>{i + 1}</span>
                  {v.title.length > 28 ? v.title.slice(0, 28) + '…' : v.title}
                  <button onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))} className="cursor-pointer"
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', display: 'flex', padding: 0 }} aria-label={tr('Retirer', 'Remove')}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </button>
                </span>
              ))}
              <button onClick={() => setShowBankPicker(true)} className="sf-btn sf-btn-secondary sf-btn-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {tr('Depuis la banque', 'From bank')}
              </button>
            </div>
            {videos.length === 0 && (
              <p className="sf-hint" style={{ marginTop: 8 }}>{tr('Ajoute au moins une vidéo depuis la banque.', 'Add at least one video from the bank.')}</p>
            )}
          </section>

          {/* ── Légende ────────────────────────────────────────────────────── */}
          <section>
            <div className="sf-section-label">{tr('Légende', 'Caption')}</div>
            <textarea className="sf-textarea" value={caption} onChange={e => setCaption(e.target.value)} rows={3}
              placeholder={tr('Description Instagram…', 'Instagram caption…')}
              style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
            />
          </section>

          {/* ── Date + options ─────────────────────────────────────────────── */}
          <section style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="sf-section-label">{tr('Date & heure', 'Date & time')}</div>
              <input type="datetime-local" className={`sf-input${!dateValid ? ' is-invalid' : ''}`} value={schedAt} onChange={e => setSchedAt(e.target.value)}
                style={{ colorScheme: 'dark', width: 'auto' }}
              />
              {!dateValid && (
                <div className="sf-field-error">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {tr('Choisis une date future', 'Pick a future date')}
                </div>
              )}
            </div>
            <div>
              <div className="sf-section-label">{tr('Attribution', 'Assignment')}</div>
              <div className="sf-segment">
                {([{ k: 'seq', l: tr('Séquentiel', 'Sequential') }, { k: 'random', l: tr('Aléatoire', 'Random') }] as const).map(m => (
                  <button key={m.k} onClick={() => setMode(m.k)} className={`sf-segment-item${mode === m.k ? ' is-active' : ''}`}>
                    {m.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="sf-section-label">{tr('Essai Reels', 'Reels trial')}</div>
              <button onClick={() => setReelsTrial(v => !v)} className={`sf-btn sf-btn-sm ${reelsTrial ? 'sf-btn-primary' : 'sf-btn-secondary'}`} style={{ height: 34 }}>
                {reelsTrial ? tr('Activé', 'On') : tr('Désactivé', 'Off')}
              </button>
            </div>
            <div>
              <div className="sf-section-label">{tr('Usage unique', 'Single use')}</div>
              <button onClick={() => setDeleteAfterPost(v => !v)} className={`sf-btn sf-btn-sm ${deleteAfterPost ? 'sf-btn-primary' : 'sf-btn-secondary'}`} style={{ height: 34 }}
                title={tr('Supprime la vidéo de la banque une fois publiée', 'Removes the video from the bank once published')}>
                {deleteAfterPost ? tr('Activé', 'On') : tr('Désactivé', 'Off')}
              </button>
            </div>
          </section>

          <p className="sf-hint" style={{ margin: 0 }}>
            {tr('Besoin d\'un post qui se répète automatiquement ? Crée une', 'Need a post that repeats automatically? Create a')}{' '}
            <span style={{ color: 'var(--accent-lt)', fontWeight: 600 }}>{tr('Tâche automatique', 'Recurring task')}</span> {tr('depuis l\'onglet Tâches.', 'from the Tasks tab.')}
          </p>

          {error && (
            <div className="sf-banner is-danger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 22px', borderTop: '1px solid var(--border)',
        }}>
          <div className="sf-cluster" style={{ gap: 16, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              <span className="sf-tabular" style={{ fontSize: 15, fontWeight: 700, color: phoneList.length ? 'var(--accent-lt)' : 'var(--text-4)' }}>{phoneList.length}</span> {tr('tél.', 'phones')}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              <span className="sf-tabular" style={{ fontSize: 15, fontWeight: 700, color: videos.length ? 'var(--accent-lt)' : 'var(--text-4)' }}>{videos.length}</span> {tr('vidéos', 'videos')}
            </span>
            {progress && (
              <span className="sf-status-chip is-accent">
                <span className="sf-status-dot" />{progress}
              </span>
            )}
          </div>
          <button onClick={onClose} disabled={submitting} className="sf-btn sf-btn-secondary">
            {tr('Annuler', 'Cancel')}
          </button>
          <button onClick={submit} disabled={!canSubmit} className="sf-btn sf-btn-primary">
            {submitting && <div className="sf-spinner" style={{ width: 12, height: 12 }} />}
            {submitting ? tr('Programmation…', 'Scheduling…') : tr('Programmer', 'Schedule')}
          </button>
        </div>
      </div>

      {/* Bank picker */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, _titles, _descs, items) => {
            const newOnes = paths
              .map((p, i) => ({
                url: p,
                title: items?.[i]?.title ?? (p.replace(/\\/g, '/').split('/').pop()?.split('?')[0] ?? p),
                bank_id: items?.[i]?.id,
                storage_path: items?.[i]?.storage_path ?? null,
                thumbnail_path: items?.[i]?.thumbnail_path ?? null,
              }))
              .filter(v => !videos.some(x => x.url === v.url))
            setVideos(prev => [...prev, ...newOnes])
            setShowBankPicker(false)
          }}
          onClose={() => setShowBankPicker(false)}
        />
      )}
    </div>
  )
}
