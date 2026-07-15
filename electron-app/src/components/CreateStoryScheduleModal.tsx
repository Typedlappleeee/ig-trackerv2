/**
 * CreateStoryScheduleModal — programme des stories directement depuis la page Programmation.
 * Même logique que StoryLink mais condensée en modal (sans le mode "Publier maintenant").
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { fetchAllPhones, type GeelarkPhone } from '@/lib/geelark'
import { createScheduledPost, defaultSchedValue } from '@/lib/schedulerService'
import { checkAndDeductCredits, refundCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { BankPicker } from '@/pages/Bank'
import { ACCENT, ACCENT_L, TEXT_1, HAIR, BG_2 } from '@/lib/theme'
import { useTr } from '@/lib/i18n'

// ── Types ─────────────────────────────────────────────────────────────────────
type PoolPhoto    = { url: string; name: string }
type Distribution = 'rotation' | 'random'

// ── LocalStorage keys ─────────────────────────────────────────────────────────
const LS_PHOTO = 'sf-story-photo-pool'
const LS_TEXT  = 'sf-story-text-pool'
const LS_DIST  = 'sf-story-distribution'
const lsLink   = (id: string) => `sf-story-link-${id}`

function loadPhotos(): PoolPhoto[]  { try { return JSON.parse(localStorage.getItem(LS_PHOTO) ?? '[]') } catch { return [] } }
function loadTexts():  string[]     { try { return JSON.parse(localStorage.getItem(LS_TEXT)  ?? '[]') } catch { return [] } }
function loadDist():   Distribution { return (localStorage.getItem(LS_DIST) as Distribution | null) ?? 'rotation' }
function loadLink(id: string)       { return localStorage.getItem(lsLink(id)) ?? '' }
function saveLink(id: string, v: string) { v.trim() ? localStorage.setItem(lsLink(id), v.trim()) : localStorage.removeItem(lsLink(id)) }

function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Mini icons ────────────────────────────────────────────────────────────────
const IcoX = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)
const IcoCheck = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
)
const IcoPlus = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IcoLink = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IcoPhoto = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const IcoWarn = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4M12 17h.01"/>
  </svg>
)
const IcoSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const IcoClose = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

// ── Main component ─────────────────────────────────────────────────────────────
export function CreateStoryScheduleModal({ user, onCreated, onClose }: {
  user:      User
  onCreated: () => void
  onClose:   () => void
}) {
  const { currentOrg, role, perms } = useOrg()
  const tr      = useTr()
  const conns   = useConnections(user)
  const bearer  = conns.bearer ?? ''
  const credits = useCredits()

  // ── Phones ────────────────────────────────────────────────────────────────
  const [phones, setPhones]         = useState<GeelarkPhone[]>([])
  const [loadingPhones, setLoading] = useState(false)
  const [phoneSearch, setSearch]    = useState('')
  const [groupFilter, _setGroup]    = useState(loadLastGroup)
  const setGroup = (g: string) => { _setGroup(g); saveLastGroup(g) }
  const [groups, setGroups]         = useState<string[]>(['Tous'])
  const [selected, setSelected]     = useState<Set<string>>(new Set())

  // ── Pool config ────────────────────────────────────────────────────────────
  const [photoPool, setPhotoPool]   = useState<PoolPhoto[]>(loadPhotos)
  const [textPool, setTextPool]     = useState<string[]>(loadTexts)
  const [distrib, setDistrib]       = useState<Distribution>(loadDist)
  const [phoneLinks, setPhoneLinks] = useState<Record<string, string>>({})
  const [editingText, setEditText]  = useState('')

  // ── Bank picker ────────────────────────────────────────────────────────────
  const [showBank, setShowBank]     = useState(false)

  // ── Schedule ──────────────────────────────────────────────────────────────
  const [schedAt, setSchedAt]       = useState(() => defaultSchedValue(60))
  const [delay, setDelay]           = useState(2)
  const [submitting, setSubmitting] = useState(false)
  const [schedDone, setSchedDone]   = useState('')
  const [schedErr, setSchedErr]     = useState('')

  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // ── Persist pools ─────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem(LS_PHOTO, JSON.stringify(photoPool)) }, [photoPool])
  useEffect(() => { localStorage.setItem(LS_TEXT,  JSON.stringify(textPool))  }, [textPool])
  useEffect(() => { localStorage.setItem(LS_DIST,  distrib)                   }, [distrib])

  // ── Link helpers ──────────────────────────────────────────────────────────
  const getLink = (id: string) => phoneLinks[id] ?? loadLink(id)
  function setLink(id: string, v: string) {
    setPhoneLinks(prev => ({ ...prev, [id]: v }))
    saveLink(id, v)
  }

  // ── Load phones from GéeLark ───────────────────────────────────────────────
  useEffect(() => {
    if (!bearer || conns.loading) return
    setLoading(true)
    fetchAllPhones(bearer).then(raw => {
      if (!mountedRef.current) return
      // 🔒 Filtre à la source : le membre ne voit que ses groupes autorisés.
      const list = role ? raw.filter(p => canAccessPhoneGroup(role, perms, p.group?.name ?? p.groupName ?? null)) : raw
      setPhones(list)
      const gs = [...new Set(list.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...gs])
      // Groupe mémorisé disparu (renommé/supprimé) → retour à « Tous »
      if (!gs.includes(loadLastGroup())) setGroup('Tous')
      setPhoneLinks(prev => {
        const n = { ...prev }
        list.forEach(p => { if (n[p.id] === undefined) { const v = loadLink(p.id); if (v) n[p.id] = v } })
        return n
      })
    }).catch(() => {}).finally(() => { if (mountedRef.current) setLoading(false) })
  }, [bearer, conns.loading])

  const phoneName = (p: GeelarkPhone) => p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)

  const visible = phones.filter(p => {
    const grp = p.group?.name ?? p.groupName ?? null
    if (role && !canAccessPhoneGroup(role, perms, grp)) return false
    if (groupFilter !== 'Tous' && grp !== groupFilter) return false
    if (phoneSearch && !phoneName(p).toLowerCase().includes(phoneSearch.toLowerCase())) return false
    return true
  })

  const selectedIds = [...selected]
  const missingLinks = selectedIds.filter(id => !getLink(id).trim())

  // ── Build assignments ──────────────────────────────────────────────────────
  const buildAssignments = useCallback((ids: string[]) => {
    if (ids.length === 0 || photoPool.length === 0) return []
    const pi = distrib === 'random' ? shuffle(photoPool.length) : photoPool.map((_, i) => i)
    const ti = textPool.length > 0 ? (distrib === 'random' ? shuffle(textPool.length) : textPool.map((_, i) => i)) : []
    return ids.map((id, i) => ({
      phoneId: id,
      photo:   photoPool[pi[i % pi.length]],
      text:    ti.length > 0 ? textPool[ti[i % ti.length]] : '',
      link:    getLink(id).trim(),
    }))
  }, [photoPool, textPool, distrib, phoneLinks])

  const canSubmit = !!bearer && selectedIds.length > 0 && photoPool.length > 0 && missingLinks.length === 0 && !submitting

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (!canSubmit || submitting) return
    setSchedErr('')
    setSubmitting(true)
    try {
      const when = new Date(schedAt)
      if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
        setSchedErr(tr('Choisis une date au moins 1 minute dans le futur.', 'Pick a date at least 1 minute in the future.'))
        return
      }
      const cost = selectedIds.length * CREDIT_COSTS.story
      const cr   = await checkAndDeductCredits(credits.ownerId, cost)
      if (!cr.ok) {
        setSchedErr(`${cr.error ?? tr('Crédits insuffisants', 'Insufficient credits')} ${tr(`(requis : ${cost} crédits)`, `(required: ${cost} credits)`)}`)
        return
      }
      if (typeof cr.balance === 'number') credits.setBalance(cr.balance)

      const phoneById = (id: string) => phones.find(p => p.id === id)
      const asgns = buildAssignments(selectedIds)

      try {
        await createScheduledPost({
          userId:        user.id,
          orgId:         currentOrg?.id ?? null,
          createdByName: user.email?.split('@')[0] ?? 'Moi',
          type:          'story',
          scheduledAt:   when,
          phones: asgns.map(a => {
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
          delayMinutes: delay,
          mode:         'seq',
          bearerToken:  '',
          reelsTrial:   false,
        })
      } catch (e) {
        // createScheduledPost failed — refund
        await refundCredits(credits.ownerId, cost)
        credits.refresh()
        throw e
      }

      setSchedDone(tr(`${asgns.length} story${asgns.length > 1 ? 's' : ''} programmée${asgns.length > 1 ? 's' : ''} pour le ${when.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`, `${asgns.length} story${asgns.length > 1 ? 's' : ''} scheduled for ${when.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}`))
      setTimeout(() => { if (mountedRef.current) onCreated() }, 2000)
    } catch (e) {
      setSchedErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Bank picker overlay ─────────────────────────────────────────────── */}
      {/* z-index 10001 : le picker partage la classe sf-modal-bg (z 9000) que ce
          modal-ci, donc sans contexte d'empilement dédié il s'affiche DERRIÈRE. */}
      {showBank && (
        <div style={{ position: 'relative', zIndex: 10001 }}>
          <BankPicker
            user={user}
            mode="multi"
            resolveMode="signed-url"
            onSelect={(paths, titles) => {
              setPhotoPool(prev => [
                ...prev,
                ...paths.map((url, i) => ({ url, name: titles?.[i] ?? `photo ${prev.length + i + 1}` })),
              ])
              setShowBank(false)
            }}
            onClose={() => setShowBank(false)}
          />
        </div>
      )}

      {/* ── Modal backdrop ──────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(2,2,6,0.82)', backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
        onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
        tabIndex={-1}
        ref={el => el?.focus()}
        onKeyDown={e => { if (e.key === 'Escape' && !submitting) onClose() }}
      >
        <div
          className="anim-scale-in"
          style={{
            width: '100%', maxWidth: 740, maxHeight: '90vh',
            background: BG_2, border: `1px solid ${HAIR}`,
            borderRadius: 'var(--r-xl)', overflow: 'hidden',
            boxShadow: 'var(--elev-3)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* ── Header (pattern v2 : tuile-icône + titre + sous-titre + actions) ── */}
          <div
            className="sf-page-header"
            style={{
              flexShrink: 0, padding: '18px 22px 16px', margin: 0,
              borderRadius: 0, borderBottom: `1px solid ${HAIR}`,
              // @ts-expect-error CSS custom prop — teinte ambre « Story »
              '--icon-grad': 'linear-gradient(135deg,#F59E0B,#F97316)',
            }}
          >
            <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
              <div className="sf-page-icon sf-page-icon-sm sf-anim-scale-spring">
                <IcoPhoto />
              </div>
              <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
                <h1 className="sf-page-title" style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {tr('Programmer une Story', 'Schedule a Story')}
                  <span className="sf-badge sf-badge-accent">📸 Instagram</span>
                  <span className="sf-badge sf-badge-muted">{tr('🎵 TikTok · bientôt', '🎵 TikTok · soon')}</span>
                </h1>
                <p className="sf-page-sub" style={{ marginTop: 3 }}>
                  {tr('Photos + sticker lien · automation GéeLark · app ouverte à l\'heure', 'Photos + link sticker · GeeLark automation · app open at scheduled time')}
                </p>
              </div>
            </div>
            <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
              <button
                onClick={onClose}
                disabled={submitting}
                className="sf-btn sf-btn-ghost sf-btn-icon"
                aria-label={tr('Fermer', 'Close')}
                style={{ width: 30, height: 30 }}
              >
                <IcoClose size={12} />
              </button>
            </div>
          </div>

          {/* ── Success state ──────────────────────────────────────────────── */}
          {schedDone ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <p style={{ fontSize: 32, margin: '0 0 12px' }}>✅</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: TEXT_1, margin: 0 }}>{schedDone}</p>
              <p style={{ fontSize: 12, color: 'rgba(233,234,240,0.42)', margin: '8px 0 0' }}>
                {tr('Retrouve-la dans l\'onglet Programmation.', 'Find it in the Schedule tab.')}
              </p>
            </div>
          ) : (
            /* ── Body: 2-column split ──────────────────────────────────────── */
            <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '230px 1fr', minHeight: 0 }}>

              {/* ══ COL 1 — Phone selector ════════════════════════════════════ */}
              <div style={{
                borderRight: `1px solid ${HAIR}`,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                background: 'rgba(255,255,255,0.012)',
              }}>
                {/* Toolbar */}
                <div style={{ flexShrink: 0, padding: '12px 12px 8px', borderBottom: `1px solid ${HAIR}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
                      {tr('Comptes', 'Accounts')}
                    </span>
                    {selected.size > 0 && (
                      <span className="sf-badge sf-badge-accent">
                        {tr(`${selected.size} sél.`, `${selected.size} sel.`)}
                      </span>
                    )}
                  </div>

                  {groups.length > 1 && (
                    <select
                      value={groupFilter}
                      onChange={e => setGroup(e.target.value)}
                      className="sf-input"
                      style={{ height: 28, marginBottom: 6, fontSize: 11, cursor: 'pointer' }}
                    >
                      {groups.map(g => <option key={g} value={g} style={{ background: '#0C0C15' }}>{g}</option>)}
                    </select>
                  )}

                  <div style={{ position: 'relative', marginBottom: 7 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(148,163,184,0.4)' }}>
                      <IcoSearch />
                    </span>
                    <input
                      value={phoneSearch}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={tr('Rechercher…', 'Search…')}
                      className="sf-input"
                      style={{ height: 28, paddingLeft: 28, fontSize: 11 }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      onClick={() => setSelected(new Set(visible.map(p => p.id)))}
                      className="sf-btn sf-btn-secondary sf-btn-sm"
                      style={{ flex: 1, cursor: 'pointer', fontSize: 10.5, padding: '4px 0' }}
                    >{tr('Tout', 'All')}</button>
                    <button
                      onClick={() => setSelected(new Set())}
                      className="sf-btn sf-btn-ghost sf-btn-sm"
                      style={{ flex: 1, cursor: 'pointer', fontSize: 10.5, padding: '4px 0' }}
                    >{tr('Aucun', 'None')}</button>
                  </div>
                </div>

                {/* Phone list */}
                <div className="sf-scroll" style={{ flex: 1, padding: '5px 7px' }}>
                  {loadingPhones ? (
                    <div style={{ padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="sf-skeleton sf-skeleton-line" style={{ height: 34, borderRadius: 8, opacity: 1 - i * 0.1 }} />
                      ))}
                    </div>
                  ) : !bearer ? (
                    <div style={{ padding: '28px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'rgba(148,163,184,0.5)' }}><IcoSearch /></span>
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', margin: 0 }}>{tr('GéeLark non connecté', 'GeeLark not connected')}</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0, lineHeight: 1.4 }}>{tr('Connecte-le dans les Paramètres.', 'Connect it in Settings.')}</p>
                    </div>
                  ) : visible.length === 0 ? (
                    <div style={{ padding: '28px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'rgba(148,163,184,0.5)' }}><IcoSearch /></span>
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', margin: 0 }}>{tr('Aucun compte', 'No accounts')}</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0, lineHeight: 1.4 }}>{phoneSearch ? tr('Aucun résultat pour cette recherche.', 'No match for this search.') : tr('Aucun compte dans ce groupe.', 'No account in this group.')}</p>
                    </div>
                  ) : visible.map(p => {
                    const sel = selected.has(p.id)
                    const link = getLink(p.id).trim()
                    const grp  = p.group?.name ?? p.groupName
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelected(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                        className="sf-press"
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 9px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                          textAlign: 'left', marginBottom: 1,
                          background: sel ? 'var(--accent-dim)' : 'transparent',
                          border: `1px solid ${sel ? 'var(--border-accent-strong)' : 'transparent'}`,
                          transition: 'background var(--t-fast), border-color var(--t-fast)',
                        }}
                      >
                        <span style={{
                          width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: sel ? ACCENT : 'rgba(255,255,255,0.05)',
                          border: sel ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        }}>
                          {sel && <IcoCheck />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 12, fontWeight: sel ? 600 : 400, margin: 0,
                            color: sel ? TEXT_1 : 'rgba(233,234,240,0.6)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {phoneName(p)}
                          </p>
                          {grp && <p style={{ fontSize: 10, color: 'rgba(233,234,240,0.25)', margin: '1px 0 0' }}>{grp}</p>}
                        </div>
                        {sel && (
                          <span title={link ? tr(`Lien: ${link}`, `Link: ${link}`) : tr('Lien manquant', 'Missing link')} style={{ flexShrink: 0 }}>
                            <span style={{ color: link ? '#22c55e' : '#fbbf24', fontSize: 9 }}>
                              {link ? '●' : '○'}
                            </span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ══ COL 2 — Config + Schedule ═════════════════════════════════ */}
              <div className="sf-scroll" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── Photo pool ────────────────────────────────────────────── */}
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: ACCENT_L }}><IcoPhoto /></span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
                        {tr('Pool de photos', 'Photo pool')}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowBank(true)}
                      className="sf-btn sf-btn-secondary sf-btn-sm"
                      style={{ cursor: 'pointer', fontSize: 11 }}
                    >
                      <IcoPlus /> {tr('Ajouter', 'Add')}
                    </button>
                  </div>

                  {photoPool.length === 0 ? (
                    <button
                      onClick={() => setShowBank(true)}
                      style={{
                        width: '100%', padding: '20px 0', borderRadius: 9, cursor: 'pointer',
                        border: '2px dashed rgba(99,102,241,0.18)',
                        background: 'rgba(99,102,241,0.03)',
                        color: 'rgba(233,234,240,0.3)', fontSize: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <IcoPhoto />
                      {tr('Aucune photo — cliquer pour en ajouter depuis la banque', 'No photos — click to add from the bank')}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {photoPool.map((ph, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 9px', borderRadius: 7,
                          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)',
                          maxWidth: 200,
                        }}>
                          <span style={{ color: ACCENT_L, flexShrink: 0 }}><IcoPhoto /></span>
                          <span style={{ fontSize: 11.5, color: ACCENT_L, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ph.name}
                          </span>
                          <button
                            onClick={() => setPhotoPool(prev => prev.filter((_, j) => j !== i))}
                            style={{
                              flexShrink: 0, width: 16, height: 16, borderRadius: 4, cursor: 'pointer',
                              background: 'rgba(239,68,68,0.15)', border: 'none', color: '#f87171',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <IcoX />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setShowBank(true)}
                        className="sf-btn sf-btn-ghost sf-btn-sm"
                        style={{ cursor: 'pointer', border: '1px dashed rgba(99,102,241,0.22)', color: ACCENT_L, fontSize: 11 }}
                      >
                        <IcoPlus /> {tr('Ajouter', 'Add')}
                      </button>
                    </div>
                  )}
                </section>

                {/* ── Text sticker pool ─────────────────────────────────────── */}
                <section>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
                      {tr('Texte sticker (optionnel)', 'Text sticker (optional)')}
                    </span>
                  </div>
                  {textPool.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {textPool.map((txt, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 20,
                          background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)',
                        }}>
                          <span style={{ fontSize: 12, color: '#67e8f9' }}>{txt}</span>
                          <button
                            onClick={() => setTextPool(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(103,232,249,0.5)', padding: 0, display: 'flex', alignItems: 'center' }}
                          >
                            <IcoX />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 7 }}>
                    <input
                      value={editingText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && editingText.trim()) {
                          setTextPool(prev => [...prev, editingText.trim()])
                          setEditText('')
                        }
                      }}
                      placeholder={tr('Ex: "Regarde ici" puis Entrée…', 'e.g. "Look here" then Enter…')}
                      className="sf-input"
                      style={{ flex: 1, height: 32, fontSize: 12 }}
                    />
                    <button
                      onClick={() => { if (editingText.trim()) { setTextPool(prev => [...prev, editingText.trim()]); setEditText('') } }}
                      disabled={!editingText.trim()}
                      className="sf-btn sf-btn-secondary sf-btn-sm"
                      style={{ cursor: editingText.trim() ? 'pointer' : 'not-allowed', opacity: editingText.trim() ? 1 : 0.4 }}
                    >+</button>
                  </div>
                </section>

                {/* ── Distribution ──────────────────────────────────────────── */}
                <section>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
                      {tr('Distribution photos', 'Photo distribution')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([
                      { k: 'rotation' as const, label: tr('Rotation', 'Rotation'), desc: 'A → B → C → A…' },
                      { k: 'random'   as const, label: tr('Aléatoire', 'Random'), desc: tr('Mélangé', 'Shuffled') },
                    ]).map(m => {
                      const active = distrib === m.k
                      return (
                        <button
                          key={m.k}
                          onClick={() => setDistrib(m.k)}
                          className="sf-press"
                          style={{
                            flex: 1, padding: '10px 12px', borderRadius: 'var(--r-md)', textAlign: 'left', cursor: 'pointer',
                            background: active ? 'var(--accent-dim)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${active ? 'var(--border-accent-strong)' : HAIR}`,
                            transition: 'background var(--t-fast), border-color var(--t-fast)',
                          }}
                        >
                          <p style={{ fontSize: 12.5, fontWeight: 700, color: active ? ACCENT_L : 'rgba(233,234,240,0.5)', margin: '0 0 2px' }}>{m.label}</p>
                          <p style={{ fontSize: 10.5, color: 'rgba(233,234,240,0.25)', margin: 0 }}>{m.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </section>

                {/* ── Per-phone links ───────────────────────────────────────── */}
                {selectedIds.length > 0 && (
                  <section>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: ACCENT_L }}><IcoLink /></span>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
                          {tr('Liens (1 par compte)', 'Links (1 per account)')}
                        </span>
                      </div>
                      <span className={`sf-badge ${missingLinks.length > 0 ? 'sf-badge-warn' : 'sf-badge-ok'}`}>
                        {tr(`${selectedIds.length - missingLinks.length}/${selectedIds.length} remplis`, `${selectedIds.length - missingLinks.length}/${selectedIds.length} filled`)}
                      </span>
                    </div>

                    {missingLinks.length > 0 && (
                      <div className="sf-banner is-warn" style={{ marginBottom: 10, alignItems: 'flex-start', fontSize: 11.5 }}>
                        <span style={{ flexShrink: 0, marginTop: 1 }}><IcoWarn /></span>
                        {tr(`${missingLinks.length} compte${missingLinks.length > 1 ? 's' : ''} sans lien — requis pour publier.`, `${missingLinks.length} account${missingLinks.length > 1 ? 's' : ''} without a link — required to publish.`)}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedIds.map(id => {
                        const p = phones.find(ph => ph.id === id)
                        const link = getLink(id)
                        const hasLink = link.trim().length > 0
                        return (
                          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              flexShrink: 0, minWidth: 110, fontSize: 12, fontWeight: 500,
                              color: 'rgba(233,234,240,0.6)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {p ? phoneName(p) : id.slice(-6)}
                            </span>
                            <div style={{ flex: 1, position: 'relative' }}>
                              <span style={{
                                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                                pointerEvents: 'none', color: hasLink ? ACCENT : 'rgba(148,163,184,0.35)',
                              }}>
                                <IcoLink />
                              </span>
                              <input
                                value={link}
                                onChange={e => setLink(id, e.target.value)}
                                placeholder="https://…"
                                className={`sf-input${hasLink ? '' : ' is-invalid'}`}
                                style={{ height: 30, paddingLeft: 26, fontSize: 11.5, borderRadius: 'var(--r-sm)' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* ── Schedule settings ─────────────────────────────────────── */}
                <section style={{
                  padding: 14, borderRadius: 10,
                  background: 'rgba(99,102,241,0.05)', border: `1px solid rgba(99,102,241,0.14)`,
                }}>
                  <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>
                    {tr('Programmation', 'Scheduling')}
                  </p>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'rgba(233,234,240,0.42)', marginBottom: 5 }}>{tr('Date et heure', 'Date and time')}</label>
                    <input
                      type="datetime-local"
                      value={schedAt}
                      onChange={e => setSchedAt(e.target.value)}
                      className="sf-input"
                      style={{ height: 36, width: '100%', colorScheme: 'dark' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'rgba(233,234,240,0.42)', marginBottom: 5 }}>{tr('Délai entre comptes', 'Delay between accounts')}</label>
                    <div className="sf-segment" style={{ display: 'flex', width: '100%' }}>
                      {[0, 2, 5, 10, 15].map(m => (
                        <button
                          key={m}
                          onClick={() => setDelay(m)}
                          className={`sf-segment-item sf-press${delay === m ? ' is-active' : ''}`}
                          style={{ flex: 1, textAlign: 'center', justifyContent: 'center' }}
                        >{m === 0 ? tr('Aucun', 'None') : `${m} min`}</button>
                      ))}
                    </div>
                  </div>

                  <p style={{ margin: '10px 0 0', fontSize: 11, color: 'rgba(233,234,240,0.3)', lineHeight: 1.55 }}>
                    {tr('⚠ L\'automation des stories nécessite que l\'app soit ouverte à l\'heure programmée.', '⚠ Story automation requires the app to be open at the scheduled time.')}
                  </p>
                </section>

                {/* ── Cost info ─────────────────────────────────────────────── */}
                {selectedIds.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(233,234,240,0.42)' }}>
                    <span>{tr('Coût :', 'Cost:')}</span>
                    <span style={{ fontWeight: 700, color: ACCENT_L }}>
                      {tr(`${selectedIds.length * CREDIT_COSTS.story} crédit${selectedIds.length * CREDIT_COSTS.story > 1 ? 's' : ''}`, `${selectedIds.length * CREDIT_COSTS.story} credit${selectedIds.length * CREDIT_COSTS.story > 1 ? 's' : ''}`)}
                    </span>
                    <span>·</span>
                    <span>{tr('Solde actuel :', 'Current balance:')} <strong style={{ color: TEXT_1 }}>{credits.balance}</strong></span>
                  </div>
                )}

                {/* ── Error ─────────────────────────────────────────────────── */}
                {schedErr && (
                  <div className="sf-banner is-danger sf-anim-slide-up" style={{ alignItems: 'flex-start', fontSize: 12 }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}><IcoWarn /></span>
                    <span>{schedErr}</span>
                  </div>
                )}

                {/* ── Footer buttons ────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 9, paddingBottom: 4 }}>
                  <button
                    onClick={onClose}
                    disabled={submitting}
                    className="sf-btn sf-btn-secondary"
                    style={{ flex: 1, cursor: 'pointer', justifyContent: 'center' }}
                  >{tr('Annuler', 'Cancel')}</button>
                  <button
                    onClick={submit}
                    disabled={!canSubmit}
                    className="sf-btn sf-btn-primary"
                    style={{ flex: 2, justifyContent: 'center', gap: 8 }}
                  >
                    {submitting ? (
                      <><span className="sf-spinner" style={{ width: 13, height: 13 }} /> {tr('Programmation…', 'Scheduling…')}</>
                    ) : (
                      <>{tr('Programmer', 'Schedule')} {selectedIds.length > 0 ? tr(`${selectedIds.length} story${selectedIds.length > 1 ? 's' : ''}`, `${selectedIds.length} story${selectedIds.length > 1 ? 's' : ''}`) : tr('les stories', 'the stories')}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
