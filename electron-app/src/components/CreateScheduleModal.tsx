/**
 * CreateScheduleModal — programme un post directement depuis la page Programmation.
 * Flux : téléphones → vidéos (banque) → légende → date/heure → upload GéeLark → scheduled_posts.
 */
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { BankPicker } from '@/pages/Bank'
import { createScheduledPost, defaultSchedValue } from '@/lib/schedulerService'
import { checkAndDeductCredits, refundCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'

const GOLD  = '#6366F1'
const IVORY = '#E9EAF0'
const MUTED = 'rgba(233,234,240,0.42)'
const FAINT = 'rgba(233,234,240,0.22)'
const HAIR  = 'rgba(233,234,240,0.08)'
const SERIF = "'Inter', system-ui, sans-serif"

interface SelVideo { url: string; title: string }

export function CreateScheduleModal({ user, onCreated, onClose }: {
  user:      User
  onCreated: () => void
  onClose:   () => void
}) {
  const { currentOrg, role, perms } = useOrg()
  const conns = useConnections(user)
  const bearer = conns.bearer ?? ''
  const credits = useCredits()

  const [phones, setPhones]             = useState<Phone[]>([])
  const [selPhones, setSelPhones]       = useState<Set<string>>(new Set())
  const [phoneSearch, setPhoneSearch]   = useState('')
  const [groups, setGroups]             = useState<string[]>(['Tous'])
  const [groupFilter, setGroupFilter]   = useState('Tous')
  const [videos, setVideos]             = useState<SelVideo[]>([])
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [caption, setCaption]           = useState('')
  const [mode, setMode]                 = useState<'seq' | 'random'>('seq')
  const [schedAt, setSchedAt]           = useState(defaultSchedValue(60))
  const [delayMin, setDelayMin]         = useState(0)
  const [reelsTrial, setReelsTrial]     = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [progress, setProgress]         = useState('')
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      const ps = (data ?? []) as Phone[]
      setPhones(ps)
      const grps = [...new Set(ps.map(p => p.group_name).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
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
      setError('Programmation limitée à 25 jours (les vidéos uploadées chez GéeLark expirent après 30 jours).')
      return
    }
    setSubmitting(true)
    setError(null)
    // Crédits débités à la programmation — remboursés si échec avant création ou annulation
    const creditCost = phoneList.length * CREDIT_COSTS.mass_posting
    const creditRes  = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      setError(`${creditRes.error ?? 'Crédits insuffisants'} (requis : ${creditCost} crédits)`)
      setSubmitting(false)
      return
    }
    if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
    try {
      // In sequential mode only the first min(phones, videos) videos are used
      const toUpload = mode === 'random' ? videos : videos.slice(0, Math.min(phoneList.length, videos.length))
      const tokens: { token: string; title: string }[] = []
      for (let i = 0; i < toUpload.length; i++) {
        setProgress(`Upload vidéo ${i + 1}/${toUpload.length}…`)
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath: toUpload[i].url })
        if (!up.ok || !up.token) throw new Error(`Upload « ${toUpload[i].title} » échoué : ${up.error ?? '?'}`)
        tokens.push({ token: up.token, title: toUpload[i].title })
      }
      setProgress('Création de la programmation…')
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
      })
      onCreated()
    } catch (e: any) {
      // Échec après déduction → remboursement
      const refunded = await refundCredits(credits.ownerId, creditCost)
      if (refunded) credits.refresh()
      setError(`${e?.message ?? String(e)}${refunded ? ` — ${creditCost} crédits remboursés` : ''}`)
      setSubmitting(false)
      setProgress('')
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: GOLD, display: 'block', marginBottom: 8,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(6,6,8,0.9)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={() => !submitting && onClose()}>
      <div className="anim-scale-in" onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: 'calc(100vh - 48px)',
          background: '#0F1014', border: `1px solid ${HAIR}`,
          display: 'flex', flexDirection: 'column',
        }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '17px 22px', borderBottom: `1px solid ${HAIR}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: IVORY }}>
              Programmer une
            </span>
            <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 18, color: GOLD }}>publication</span>
          </div>
          <button onClick={() => !submitting && onClose()} className="cursor-pointer"
            style={{ background: 'none', border: 'none', color: FAINT, display: 'flex', padding: 4 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22, scrollbarWidth: 'thin' }}>

          {!bearer && (
            <div style={{ padding: '10px 14px', border: '1px solid rgba(217,185,127,0.35)', fontSize: 12, color: '#D9B97F' }}>
              Token GéeLark manquant — ajoute-le dans Paramètres → Connexions avant de programmer.
            </div>
          )}

          {/* ── Téléphones ─────────────────────────────────────────────────── */}
          <section>
            <span style={labelStyle}>
              Téléphones {phoneList.length > 0 && <span style={{ color: IVORY, letterSpacing: 'normal', fontSize: 11 }}>— {phoneList.length}</span>}
            </span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {groups.length > 1 && (
                <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="cursor-pointer"
                  style={{ height: 30, padding: '0 8px', fontSize: 12, background: 'transparent', color: IVORY, border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none' }}>
                  {groups.map(g => <option key={g} value={g} style={{ background: '#0F1014', color: IVORY }}>{g}</option>)}
                </select>
              )}
              <input type="text" placeholder="Rechercher…" value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                style={{ flex: 1, height: 30, padding: '0 2px', fontSize: 12, background: 'transparent', color: IVORY, border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none' }}
                onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(99,102,241,0.6)' }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = HAIR }}
              />
              <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))} className="cursor-pointer"
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: GOLD, background: 'none', border: 'none', padding: 0 }}>
                Tous
              </button>
              <button onClick={() => setSelPhones(new Set())} className="cursor-pointer"
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: FAINT, background: 'none', border: 'none', padding: 0 }}>
                Aucun
              </button>
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${HAIR}`, scrollbarWidth: 'thin' }}>
              {visiblePhones.length === 0 ? (
                <p style={{ padding: '20px 16px', fontSize: 12, color: MUTED, textAlign: 'center' }}>Aucun téléphone</p>
              ) : visiblePhones.map(phone => {
                const checked = selPhones.has(phone.id)
                return (
                  <button key={phone.id} onClick={() => togglePhone(phone.id)} className="cursor-pointer"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                      textAlign: 'left', border: 'none', borderBottom: '1px solid rgba(233,234,240,0.04)',
                      background: checked ? 'rgba(99,102,241,0.06)' : 'transparent', transition: 'background 0.15s',
                    }}>
                    <div style={{
                      width: 13, height: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: checked ? GOLD : 'transparent',
                      border: checked ? 'none' : '1px solid rgba(233,234,240,0.18)',
                    }}>
                      {checked && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: checked ? IVORY : 'rgba(233,234,240,0.6)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {phone.phone_name}
                    </span>
                    {phone.ig_username && <span style={{ fontSize: 10.5, color: checked ? 'rgba(99,102,241,0.7)' : FAINT }}>@{phone.ig_username}</span>}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Vidéos ─────────────────────────────────────────────────────── */}
          <section>
            <span style={labelStyle}>
              Vidéos {videos.length > 0 && <span style={{ color: IVORY, letterSpacing: 'normal', fontSize: 11 }}>— {videos.length}</span>}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {videos.map((v, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 9px',
                  border: `1px solid ${HAIR}`, fontSize: 11.5, color: 'rgba(233,234,240,0.7)',
                }}>
                  <span style={{ fontFamily: SERIF, fontStyle: 'normal', color: GOLD }}>{i + 1}</span>
                  {v.title.length > 28 ? v.title.slice(0, 28) + '…' : v.title}
                  <button onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))} className="cursor-pointer"
                    style={{ background: 'none', border: 'none', color: '#F0A0AB', display: 'flex', padding: 0 }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </button>
                </span>
              ))}
              <button onClick={() => setShowBankPicker(true)} className="cursor-pointer"
                style={{
                  padding: '6px 13px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: GOLD, color: '#fff', border: 'none', transition: 'background 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#818CF8' }}
                onMouseLeave={e => { e.currentTarget.style.background = GOLD }}>
                + Depuis la banque
              </button>
            </div>
          </section>

          {/* ── Légende ────────────────────────────────────────────────────── */}
          <section>
            <span style={labelStyle}>Légende</span>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
              placeholder="Description Instagram…"
              style={{
                width: '100%', minHeight: 72, padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
                background: 'rgba(233,234,240,0.02)', color: IVORY, resize: 'vertical',
                border: `1px solid ${HAIR}`, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = HAIR }}
            />
          </section>

          {/* ── Date + options ─────────────────────────────────────────────── */}
          <section style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={labelStyle}>Date &amp; heure</span>
              <input type="datetime-local" value={schedAt} onChange={e => setSchedAt(e.target.value)}
                style={{
                  height: 34, padding: '0 10px', fontSize: 13, colorScheme: 'dark',
                  background: 'rgba(233,234,240,0.02)', color: IVORY,
                  border: `1px solid ${dateValid ? HAIR : 'rgba(240,160,171,0.5)'}`, outline: 'none',
                }}
              />
              {!dateValid && <p style={{ fontSize: 10.5, color: '#F0A0AB', marginTop: 4 }}>Choisis une date future</p>}
            </div>
            <div>
              <span style={labelStyle}>Attribution</span>
              <div style={{ display: 'flex', border: `1px solid ${HAIR}` }}>
                {([{ k: 'seq', l: 'Séquentiel' }, { k: 'random', l: 'Aléatoire' }] as const).map(m => (
                  <button key={m.k} onClick={() => setMode(m.k)} className="cursor-pointer"
                    style={{
                      padding: '8px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      background: mode === m.k ? IVORY : 'transparent', color: mode === m.k ? '#0A0B0E' : MUTED,
                      border: 'none', transition: 'all 0.18s',
                    }}>
                    {m.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span style={labelStyle}>Délai entre comptes</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={0} max={120} value={delayMin}
                  onChange={e => setDelayMin(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                  style={{
                    width: 64, height: 34, padding: '0 10px', fontSize: 13, textAlign: 'center',
                    background: 'rgba(233,234,240,0.02)', color: IVORY, border: `1px solid ${HAIR}`, outline: 'none',
                  }}
                />
                <span style={{ fontSize: 11, color: MUTED }}>min</span>
              </div>
            </div>
            <div>
              <span style={labelStyle}>Essai Reels</span>
              <button onClick={() => setReelsTrial(v => !v)} className="cursor-pointer"
                style={{
                  height: 34, padding: '0 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: reelsTrial ? GOLD : 'transparent', color: reelsTrial ? '#0A0B0E' : MUTED,
                  border: reelsTrial ? 'none' : `1px solid ${HAIR}`, transition: 'all 0.18s',
                }}>
                {reelsTrial ? 'Activé' : 'Désactivé'}
              </button>
            </div>
          </section>

          {error && (
            <div style={{ padding: '10px 14px', border: '1px solid rgba(240,160,171,0.4)', fontSize: 12, color: '#F0A0AB' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
          padding: '13px 22px', borderTop: `1px solid ${HAIR}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: MUTED }}>
              <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 16, color: phoneList.length ? GOLD : FAINT }}>{phoneList.length}</span> tél.
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>
              <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 16, color: videos.length ? GOLD : FAINT }}>{videos.length}</span> vidéos
            </span>
            {progress && <span style={{ fontSize: 11.5, color: GOLD }}>{progress}</span>}
          </div>
          <button onClick={onClose} disabled={submitting} className="cursor-pointer"
            style={{
              padding: '10px 18px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'transparent', color: MUTED, border: `1px solid ${HAIR}`, opacity: submitting ? 0.4 : 1,
            }}>
            Annuler
          </button>
          <button onClick={submit} disabled={!canSubmit} className="cursor-pointer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 24px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
              background: canSubmit ? GOLD : 'rgba(233,234,240,0.08)', color: canSubmit ? '#fff' : FAINT,
              border: 'none', transition: 'all 0.18s',
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = '#818CF8' }}
            onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = GOLD }}>
            {submitting && <div className="sf-spinner" style={{ width: 12, height: 12 }} />}
            {submitting ? 'Programmation…' : 'Programmer'}
          </button>
        </div>
      </div>

      {/* Bank picker */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths) => {
            const newOnes = paths
              .filter(p => !videos.some(v => v.url === p))
              .map(p => ({ url: p, title: p.replace(/\\/g, '/').split('/').pop()?.split('?')[0] ?? p }))
            setVideos(prev => [...prev, ...newOnes])
            setShowBankPicker(false)
          }}
          onClose={() => setShowBankPicker(false)}
        />
      )}
    </div>
  )
}
