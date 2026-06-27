/**
 * TaskWizard — assistant guidé et simple pour créer une tâche automatique.
 * Flux : 1) Plateforme + Type → 2) Comptes → 3) Contenu → 4) Récurrence.
 * Couvre le cas courant (1 plateforme, 1 type). Les séquences multi-étapes
 * restent dans le modal avancé. Sauvegarde dans recurring_tasks (colonnes plates).
 */
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { canAccessPhoneGroup } from '@/lib/permissions'
import { BankPicker } from '@/pages/Bank'
import { ACCENT, ACCENT_L, TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR, OK } from '@/lib/theme'

type Platform = 'instagram' | 'tiktok'
type TaskType = 'publication' | 'story'

type RecurUnit = 'minutes' | 'heures' | 'jours'

const RECUR_PRESETS: { label: string; value: number; unit: RecurUnit }[] = [
  { label: '1×/jour',           value: 1,  unit: 'jours' },
  { label: '2×/jour',           value: 12, unit: 'heures' },
  { label: '4×/jour',           value: 6,  unit: 'heures' },
  { label: 'Toutes les heures', value: 1,  unit: 'heures' },
]

// Convertit valeur + unité → heures (ce que consomme le cron via recur_hours).
function toHours(value: number, unit: RecurUnit): number {
  const v = Math.max(1, value || 1)
  return unit === 'minutes' ? v / 60 : unit === 'jours' ? v * 24 : v
}

// Valeur datetime-local par défaut : maintenant (arrondi à la minute).
function defaultStart(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Action supplémentaire (même type que l'action principale) : son propre lot de
// médias, sa propre heure de départ et son propre intervalle → un « segment ».
interface ExtraAction {
  id: string
  media: { url: string; title: string }[]
  caption: string
  recurValue: number
  recurUnit: RecurUnit
  startAt: string
}

export function TaskWizard({ user, onSaved, onClose }: {
  user: User
  onSaved: () => void
  onClose: () => void
}) {
  const { currentOrg, role, perms } = useOrg()
  const [step, setStep] = useState(0)

  // Choix
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [type, setType]         = useState<TaskType>('publication')

  // Comptes
  const [phones, setPhones]     = useState<Phone[]>([])
  const [selPhones, setSel]     = useState<Set<string>>(new Set())
  const [search, setSearch]     = useState('')

  // Contenu
  const [media, setMedia]       = useState<{ url: string; title: string }[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [caption, setCaption]   = useState('')
  const [links, setLinks]       = useState<Record<string, string>>({})

  // Récurrence
  const [name, setName]         = useState('')
  const [recurValue, setRecurValue] = useState(1)
  const [recurUnit, setRecurUnit]   = useState<RecurUnit>('jours')
  const [startAt, setStartAt]       = useState(defaultStart)
  const [mode, setMode]         = useState<'seq' | 'random'>('seq')
  const [autoRemove, setAutoRemove] = useState(false)
  const recurHours = toHours(recurValue, recurUnit)

  // Actions supplémentaires (segments) — vide = tâche simple à une action.
  const [extras, setExtras]     = useState<ExtraAction[]>([])
  const [extraPickerId, setExtraPickerId] = useState<string | null>(null)
  const addExtra = () => setExtras(prev => [...prev, {
    id: Math.random().toString(36).slice(2), media: [], caption: '',
    recurValue, recurUnit, startAt,
  }])
  const patchExtra = (id: string, patch: Partial<ExtraAction>) =>
    setExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  const removeExtra = (id: string) => setExtras(prev => prev.filter(e => e.id !== id))

  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      const ps = (data ?? []).filter(p => !role || canAccessPhoneGroup(role, perms, p.group_name)) as Phone[]
      setPhones(ps)
      // pré-remplir les liens story depuis la DB
      setLinks(prev => { const n = { ...prev }; for (const p of ps) if (p.link && !(p.id in n)) n[p.id] = p.link; return n })
    })
  }, [currentOrg?.id, user.id])

  // Story = Instagram uniquement
  function pickType(t: TaskType) {
    setType(t)
    if (t === 'story') setPlatform('instagram')
  }

  const phoneList = phones.filter(p => selPhones.has(p.id))
  const visible = phones.filter(p => !search || p.phone_name?.toLowerCase().includes(search.toLowerCase()) || p.ig_username?.toLowerCase().includes(search.toLowerCase()))
  const isStory = type === 'story'
  const linksOk = !isStory || phoneList.every(p => (links[p.id] ?? '').trim())

  const canNext = [
    true,                                    // step 0 : toujours
    phoneList.length > 0,                    // step 1 : comptes
    media.length > 0 && linksOk,             // step 2 : contenu (+ liens story)
    true,                                    // step 3 : récurrence
  ][step]

  async function save() {
    if (extras.some(e => e.media.length === 0)) {
      setError('Chaque action ajoutée doit avoir au moins un média.'); return
    }
    setSaving(true); setError(null)
    try {
      const autoName = name.trim() || `Tâche ${type === 'story' ? 'Story' : 'Reels'} ${platform === 'tiktok' ? 'TikTok' : 'IG'} — ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`
      // Plusieurs actions → segments (chaque action = un segment indépendant).
      const buildSeg = (m: { url: string; title: string }[], cap: string, rv: number, ru: RecurUnit, st: string) => ({
        id: Math.random().toString(36).slice(2),
        type, videos: m.map(x => ({ token: x.url, title: x.title })), caption: cap,
        story_texts: [], mode, delay_minutes: 0, reels_trial: false,
        auto_remove_videos: autoRemove, recur_hours: toHours(rv, ru),
        next_run_at: new Date(st).toISOString(),
      })
      const segments = extras.length > 0
        ? [buildSeg(media, caption, recurValue, recurUnit, startAt),
           ...extras.map(e => buildSeg(e.media, e.caption, e.recurValue, e.recurUnit, e.startAt))]
        : []
      const minNext = segments.length
        ? Math.min(...segments.map(s => new Date(s.next_run_at).getTime()))
        : new Date(startAt).getTime()
      const payload: Record<string, unknown> = {
        user_id: user.id,
        org_id:  currentOrg?.id ?? null,
        name:    autoName,
        status:  'active',
        task_type: type,
        platform,
        phones:  phoneList.map(p => ({
          id: p.id, geelark_id: p.geelark_id, phone_name: p.phone_name, ig_username: p.ig_username ?? null,
          ...(isStory ? { link: (links[p.id] ?? '').trim() } : {}),
        })),
        videos:  media.map(m => ({ token: m.url, title: m.title })),
        caption,
        story_texts: [],
        mode,
        delay_minutes: 0,
        recur_hours: recurHours,
        next_run_at: new Date(isFinite(minNext) ? minNext : Date.now()).toISOString(),
        reels_trial: false,
        auto_remove_videos: autoRemove,
        steps: [],
        segments,
      }
      // Insert avec repli si des colonnes récentes manquent (platform/segments/steps/…)
      let { error: err } = await supabase.from('recurring_tasks').insert(payload)
      if (err && /platform/i.test(err.message)) {
        const { platform: _p, ...rest } = payload
        ;({ error: err } = await supabase.from('recurring_tasks').insert(rest))
        if (!err) setError('⚠ Programmation TikTok limitée tant que la migration platform n\'est pas appliquée.')
      }
      if (err && /segments/i.test(err.message) && /column|schema|cache/i.test(err.message)) {
        const { segments: _sg, ...rest } = payload
        ;({ error: err } = await supabase.from('recurring_tasks').insert(rest))
        if (!err && extras.length) setError('⚠ Actions multiples non sauvegardées (migration segments manquante) — seule la 1ʳᵉ action a été gardée.')
      }
      if (err && /(steps|story_texts|auto_remove_videos)/i.test(err.message)) {
        const { steps: _s, story_texts: _st, auto_remove_videos: _a, platform: _p2, segments: _sg2, ...rest } = payload
        ;({ error: err } = await supabase.from('recurring_tasks').insert(rest))
      }
      if (err) throw err
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const STEPS = ['Type', 'Comptes', 'Contenu', 'Récurrence']

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(6,6,8,0.9)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={() => !saving && onClose()}>
      {showPicker && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            setMedia(prev => [...prev, ...paths.map((url, i) => ({ url, title: titles?.[i] ?? 'Média' }))])
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)} />
      )}
      {extraPickerId && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const add = paths.map((url, i) => ({ url, title: titles?.[i] ?? 'Média' }))
            setExtras(prev => prev.map(e => e.id === extraPickerId ? { ...e, media: [...e.media, ...add] } : e))
            setExtraPickerId(null)
          }}
          onClose={() => setExtraPickerId(null)} />
      )}
      <div className="anim-scale-in" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 600, maxHeight: 'calc(100vh - 48px)', background: '#0F1014', border: `1px solid ${HAIR}`, borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.65)' }}>

        {/* Header + steps */}
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${HAIR}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: IVORY }}>Nouvelle tâche automatique</span>
            <button onClick={() => !saving && onClose()} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ flex: 1 }}>
                <div style={{ height: 3, borderRadius: 2, background: i <= step ? ACCENT : 'rgba(255,255,255,0.08)', transition: 'background 0.2s' }} />
                <p style={{ fontSize: 10, fontWeight: 600, marginTop: 5, color: i === step ? ACCENT_L : i < step ? MUTED : FAINT }}>{i + 1}. {s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', minHeight: 220 }}>

          {/* STEP 0 — Type + plateforme */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <p style={lbl}>Que veux-tu publier ?</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([
                    { k: 'publication', emoji: '🎬', label: 'Reels / Vidéo', desc: 'Publication vidéo récurrente' },
                    { k: 'story',       emoji: '🔗', label: 'Story + lien',  desc: 'Story avec sticker lien (Instagram)' },
                  ] as const).map(o => (
                    <button key={o.k} onClick={() => pickType(o.k)} className="cursor-pointer"
                      style={card(type === o.k)}>
                      <div style={{ fontSize: 30 }}>{o.emoji}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: IVORY, marginTop: 8 }}>{o.label}</div>
                      <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{o.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p style={lbl}>Plateforme</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([
                    { k: 'instagram', emoji: '📸', label: 'Instagram' },
                    { k: 'tiktok',    emoji: '🎵', label: 'TikTok' },
                  ] as const).map(o => {
                    const disabled = isStory && o.k === 'tiktok'
                    return (
                      <button key={o.k} disabled={disabled} onClick={() => !disabled && setPlatform(o.k)}
                        className={disabled ? '' : 'cursor-pointer'}
                        style={{ ...card(platform === o.k), opacity: disabled ? 0.4 : 1 }}>
                        <div style={{ fontSize: 26 }}>{o.emoji}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: IVORY, marginTop: 6 }}>{o.label}</div>
                        {disabled && <div style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>Story IG uniquement</div>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 1 — Comptes */}
          {step === 1 && (
            <div>
              <p style={lbl}>Comptes ({phoneList.length} sélectionné{phoneList.length > 1 ? 's' : ''})</p>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                style={input} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
                <button onClick={() => setSel(new Set(visible.map(p => p.id)))} className="cursor-pointer" style={{ fontSize: 11, color: ACCENT_L, background: 'none', border: 'none' }}>Tout sélectionner</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                {visible.map(p => {
                  const on = selPhones.has(p.id)
                  return (
                    <button key={p.id} onClick={() => setSel(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                      className="cursor-pointer"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, textAlign: 'left', background: on ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(99,102,241,0.3)' : HAIR}` }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? ACCENT : 'transparent', border: on ? 'none' : `1px solid ${MUTED}` }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.phone_name}</p>
                        {p.ig_username && <p style={{ fontSize: 10.5, color: FAINT }}>@{p.ig_username}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* STEP 2 — Contenu */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={lbl}>{isStory ? 'Images' : 'Vidéos'} ({media.length})</p>
                <button onClick={() => setShowPicker(true)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">+ Depuis la banque</button>
                {media.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {media.map((m, i) => (
                      <span key={i} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 7, background: 'rgba(99,102,241,0.1)', border: `1px solid ${HAIR}`, color: ACCENT_L, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.title.slice(0, 18)}
                        <button onClick={() => setMedia(prev => prev.filter((_, j) => j !== i))} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p style={lbl}>Légende {isStory ? '(texte sticker, optionnel)' : ''}</p>
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
                  placeholder={isStory ? 'Texte du sticker…' : 'Légende de la publication…'} style={{ ...input, resize: 'vertical' }} />
              </div>
              {isStory && (
                <div>
                  <p style={lbl}>Lien par compte (story)</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {phoneList.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: MUTED, width: 110, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.ig_username ? `@${p.ig_username}` : p.phone_name}</span>
                        <input value={links[p.id] ?? ''} onChange={e => setLinks(prev => ({ ...prev, [p.id]: e.target.value }))} placeholder="https://…" style={{ ...input, flex: 1, height: 32 }} />
                      </div>
                    ))}
                  </div>
                  {!linksOk && <p style={{ fontSize: 11, color: '#FBBF24', marginTop: 6 }}>Chaque compte doit avoir un lien.</p>}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — Récurrence */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={lbl}>Nom (optionnel)</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Posts quotidiens…" style={input} />
              </div>
              <div>
                <p style={lbl}>Démarrage — 1er post</p>
                <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} style={input} />
                <p style={{ fontSize: 10.5, color: FAINT, margin: '6px 0 0' }}>Le tout premier post partira exactement à cette heure.</p>
              </div>
              <div>
                <p style={lbl}>Répéter — fréquence</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {RECUR_PRESETS.map(r => {
                    const on = recurValue === r.value && recurUnit === r.unit
                    return (
                      <button key={r.label} onClick={() => { setRecurValue(r.value); setRecurUnit(r.unit) }} className="cursor-pointer"
                        style={{ padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: on ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(99,102,241,0.4)' : HAIR}`, color: on ? ACCENT_L : MUTED }}>
                        {r.label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: MUTED }}>Toutes les</span>
                  <input type="number" min={1} value={recurValue}
                    onChange={e => setRecurValue(Math.max(1, Number(e.target.value) || 1))}
                    style={{ ...input, width: 74, textAlign: 'center' }} />
                  <select value={recurUnit} onChange={e => setRecurUnit(e.target.value as RecurUnit)}
                    className="cursor-pointer" style={{ ...input, width: 130 }}>
                    <option value="minutes">minutes</option>
                    <option value="heures">heures</option>
                    <option value="jours">jours</option>
                  </select>
                </div>
              </div>
              {!isStory && media.length > 1 && (
                <div>
                  <p style={lbl}>Distribution des vidéos</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['seq', 'random'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)} className="cursor-pointer"
                        style={{ flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 600, background: mode === m ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.02)', border: `1px solid ${mode === m ? 'rgba(99,102,241,0.4)' : HAIR}`, color: mode === m ? ACCENT_L : MUTED }}>
                        {m === 'seq' ? 'Séquentiel' : 'Aléatoire'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setAutoRemove(v => !v)} className="cursor-pointer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}` }}>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: IVORY }}>Usage unique</p>
                  <p style={{ fontSize: 10.5, color: FAINT }}>Retire les médias après usage (pause quand vide)</p>
                </div>
                <span style={{ width: 32, height: 18, borderRadius: 99, position: 'relative', background: autoRemove ? ACCENT : 'rgba(255,255,255,0.1)' }}>
                  <span style={{ position: 'absolute', top: 2, left: autoRemove ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
                </span>
              </button>

              {/* Actions supplémentaires (segments) */}
              <div>
                <p style={lbl}>Autres actions (optionnel)</p>
                <p style={{ fontSize: 11, color: FAINT, margin: '-4px 0 10px' }}>
                  Ajoute d'autres {isStory ? 'stories' : 'posts'} à d'autres heures (ex : un le matin, un le soir).
                </p>
                {extras.map((e, i) => (
                  <div key={e.id} style={{ padding: '11px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}`, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: IVORY }}>Action {i + 2}</span>
                      <button onClick={() => removeExtra(e.id)} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 17, lineHeight: 1 }}>×</button>
                    </div>
                    <button onClick={() => setExtraPickerId(e.id)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">+ {isStory ? 'Images' : 'Vidéos'} ({e.media.length})</button>
                    {e.media.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {e.media.map((m, j) => (
                          <span key={j} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', border: `1px solid ${HAIR}`, color: ACCENT_L, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {m.title.slice(0, 14)}
                            <button onClick={() => patchExtra(e.id, { media: e.media.filter((_, k) => k !== j) })} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input value={e.caption} onChange={ev => patchExtra(e.id, { caption: ev.target.value })}
                      placeholder={isStory ? 'Texte sticker (optionnel)' : 'Légende (optionnel)'} style={{ ...input, marginTop: 8, height: 32 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: MUTED }}>Départ</span>
                      <input type="datetime-local" value={e.startAt} onChange={ev => patchExtra(e.id, { startAt: ev.target.value })} style={{ ...input, height: 32, flex: 1, minWidth: 165 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: MUTED }}>Toutes les</span>
                      <input type="number" min={1} value={e.recurValue} onChange={ev => patchExtra(e.id, { recurValue: Math.max(1, Number(ev.target.value) || 1) })} style={{ ...input, width: 64, height: 32, textAlign: 'center' }} />
                      <select value={e.recurUnit} onChange={ev => patchExtra(e.id, { recurUnit: ev.target.value as RecurUnit })} className="cursor-pointer" style={{ ...input, width: 110, height: 32 }}>
                        <option value="minutes">minutes</option>
                        <option value="heures">heures</option>
                        <option value="jours">jours</option>
                      </select>
                    </div>
                  </div>
                ))}
                <button onClick={addExtra} className="cursor-pointer"
                  style={{ width: '100%', padding: '10px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.35)', color: ACCENT_L }}>
                  + Ajouter une action
                </button>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', fontSize: 11.5, color: OK }}>
                Récap : {type === 'story' ? 'Story' : 'Reels'} {platform === 'tiktok' ? 'TikTok' : 'Instagram'} · {phoneList.length} compte(s) · {media.length} média(s) · départ {new Date(startAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · toutes les {recurValue} {recurUnit}{extras.length > 0 ? ` · +${extras.length} action(s)` : ''}
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: 12, color: '#F87171', marginTop: 14 }}>{error}</p>}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 22px', borderTop: `1px solid ${HAIR}` }}>
          {step > 0 && <button onClick={() => setStep(s => s - 1)} className="sf-btn sf-btn-ghost cursor-pointer">Retour</button>}
          <div style={{ flex: 1 }} />
          {step < 3
            ? <button onClick={() => canNext && setStep(s => s + 1)} disabled={!canNext} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: canNext ? 1 : 0.4 }}>Continuer</button>
            : <button onClick={save} disabled={saving} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Création…' : 'Créer la tâche'}</button>}
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT, marginBottom: 10 }
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 13, color: IVORY, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, borderRadius: 9, outline: 'none' }
function card(active: boolean): React.CSSProperties {
  return { flex: 1, padding: '18px 12px', borderRadius: 12, textAlign: 'center', background: active ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', border: `1.5px solid ${active ? 'rgba(99,102,241,0.4)' : HAIR}` }
}
