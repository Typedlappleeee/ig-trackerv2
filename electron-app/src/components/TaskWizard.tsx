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
import { useTr } from '@/lib/i18n'

type Platform = 'instagram' | 'tiktok'
type TaskType = 'publication' | 'story'

type RecurUnit = 'minutes' | 'heures' | 'jours'

const RECUR_PRESETS: { label: string; en: string; value: number; unit: RecurUnit }[] = [
  { label: '1×/jour',           en: '1×/day',     value: 1,  unit: 'jours' },
  { label: '2×/jour',           en: '2×/day',     value: 12, unit: 'heures' },
  { label: '4×/jour',           en: '4×/day',     value: 6,  unit: 'heures' },
  { label: 'Toutes les heures', en: 'Every hour', value: 1,  unit: 'heures' },
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

// Étape de séquence ajoutée AVANT ou APRÈS l'action principale (warmup, story
// ou publication). Devient un élément de recurring_tasks.steps[].
type SeqStepType = 'publication' | 'story' | 'warmup'
interface SeqStep {
  id: string
  type: SeqStepType
  position: 'before' | 'after'
  media: { url: string; title: string }[]   // vidéos (publication) ou images (story)
  caption: string                            // légende (publication)
  warmupMinutes: number                      // durée warmup (natif, sans recherche)
  mode: 'seq' | 'random'                      // distribution du pool (story = aléatoire par défaut)
  storyTexts: string[]                        // pool de textes sticker (story)
  phoneLinks: Record<string, string>          // 1 lien CTA par téléphone (story)
  autoRemove: boolean                         // usage unique (retire les médias utilisés)
}

export function TaskWizard({ user, onSaved, onClose }: {
  user: User
  onSaved: () => void
  onClose: () => void
}) {
  const { currentOrg, role, perms } = useOrg()
  const tr = useTr()
  const [step, setStep] = useState(0)

  // Choix
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [type, setType]         = useState<TaskType>('publication')

  // Comptes
  const [phones, setPhones]     = useState<Phone[]>([])
  const [phonesLoading, setPhonesLoading] = useState(true)
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

  // Séquence : étapes supplémentaires avant/après l'action principale.
  const [seqSteps, setSeqSteps] = useState<SeqStep[]>([])
  const [stepPickerId, setStepPickerId] = useState<string | null>(null)
  const addSeqStep = (t: SeqStepType, pos: 'before' | 'after') => setSeqSteps(prev => [...prev, {
    id: Math.random().toString(36).slice(2), type: t, position: pos, media: [], caption: '',
    warmupMinutes: 5,
    mode: t === 'story' ? 'random' : 'seq',
    storyTexts: [],
    phoneLinks: t === 'story'
      ? phones.filter(p => selPhones.has(p.id)).reduce((a, p) => { const v = (links[p.id] ?? '').trim(); if (v) a[p.id] = v; return a }, {} as Record<string, string>)
      : {},
    autoRemove: false,
  }])
  const patchSeqStep = (id: string, patch: Partial<SeqStep>) =>
    setSeqSteps(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  const removeSeqStep = (id: string) => setSeqSteps(prev => prev.filter(e => e.id !== id))

  // Rend les cartes d'étapes d'une position donnée (avant / après l'action principale).
  function seqStepCards(pos: 'before' | 'after') {
    return seqSteps.filter(s => s.position === pos).map(s => (
      <div key={s.id} style={{ padding: '11px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: IVORY }}>
            {s.type === 'warmup' ? tr('🔥 Warmup', '🔥 Warmup') : s.type === 'story' ? tr('🔗 Story', '🔗 Story') : tr('🎬 Publication', '🎬 Post')} · {pos === 'before' ? tr('avant', 'before') : tr('après', 'after')}
          </span>
          <button onClick={() => removeSeqStep(s.id)} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 17, lineHeight: 1 }}>×</button>
        </div>

        {/* ── WARMUP : durée (natif, sans recherche) ── */}
        {s.type === 'warmup' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: MUTED }}>{tr('Durée', 'Duration')}</span>
            <input type="number" min={1} max={120} value={s.warmupMinutes} onChange={e => patchSeqStep(s.id, { warmupMinutes: Math.max(1, Number(e.target.value) || 1) })} style={{ ...input, width: 72, height: 32, textAlign: 'center' }} />
            <span style={{ fontSize: 11, color: MUTED }}>{tr('minutes', 'minutes')}</span>
          </div>
        )}

        {/* ── PUBLICATION / STORY : médias ── */}
        {s.type !== 'warmup' && (
          <>
            <div>
              <button onClick={() => setStepPickerId(s.id)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">+ {s.type === 'story' ? tr('Images', 'Images') : tr('Vidéos', 'Videos')} ({s.media.length})</button>
              {s.media.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {s.media.map((m, j) => (
                    <span key={j} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', border: `1px solid ${HAIR}`, color: ACCENT_L, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {m.title.slice(0, 14)}
                      <button onClick={() => patchSeqStep(s.id, { media: s.media.filter((_, k) => k !== j) })} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Distribution : séquentiel / aléatoire (photo story aléatoire dans le pool) + usage unique */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, color: MUTED }}>{tr('Distribution :', 'Distribution:')}</span>
              {(['seq', 'random'] as const).map(m => (
                <button key={m} onClick={() => patchSeqStep(s.id, { mode: m })} className="cursor-pointer"
                  style={{ padding: '4px 10px', fontSize: 10.5, fontWeight: 600, borderRadius: 6, border: `1px solid ${s.mode === m ? 'rgba(99,102,241,0.5)' : HAIR}`, background: s.mode === m ? 'rgba(99,102,241,0.15)' : 'transparent', color: s.mode === m ? ACCENT_L : MUTED }}>
                  {m === 'seq' ? tr('Séquentiel', 'Sequential') : tr('Aléatoire', 'Random')}
                </button>
              ))}
              <button onClick={() => patchSeqStep(s.id, { autoRemove: !s.autoRemove })} className="cursor-pointer"
                style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 10.5, fontWeight: 600, borderRadius: 6, border: `1px solid ${s.autoRemove ? 'rgba(245,158,11,0.45)' : HAIR}`, background: s.autoRemove ? 'rgba(245,158,11,0.12)' : 'transparent', color: s.autoRemove ? '#F59E0B' : MUTED }}>
                {tr('Usage unique', 'Single use')}
              </button>
            </div>
          </>
        )}

        {/* ── PUBLICATION : légende ── */}
        {s.type === 'publication' && (
          <input value={s.caption} onChange={e => patchSeqStep(s.id, { caption: e.target.value })} placeholder={tr('Légende (optionnel)', 'Caption (optional)')} style={{ ...input, height: 32 }} />
        )}

        {/* ── STORY : 1 lien CTA par téléphone ── */}
        {s.type === 'story' && (
          <div>
            <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 5px' }}>{tr('Lien CTA par compte (1 lien / téléphone)', 'CTA link per account (1 link / phone)')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 150, overflowY: 'auto' }}>
              {phones.filter(p => selPhones.has(p.id)).map(p => {
                const v = s.phoneLinks[p.id] ?? ''
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 10.5, color: MUTED, width: 92, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.ig_username ? `@${p.ig_username}` : p.phone_name}</span>
                    <input type="url" value={v} onChange={e => patchSeqStep(s.id, { phoneLinks: { ...s.phoneLinks, [p.id]: e.target.value } })} placeholder="https://…"
                      style={{ ...input, flex: 1, height: 28, fontSize: 11, borderColor: v.trim() ? 'rgba(52,211,153,0.4)' : 'rgba(245,158,11,0.4)' }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── STORY : pool de textes sticker ── */}
        {s.type === 'story' && (
          <div>
            <p style={{ fontSize: 10.5, color: MUTED, margin: '0 0 5px' }}>{tr('Textes sticker (pool, optionnel)', 'Sticker texts (pool, optional)')}</p>
            <input
              placeholder={tr('Tape un texte puis Entrée…', 'Type a text then Enter…')}
              onKeyDown={e => {
                const val = (e.target as HTMLInputElement).value.trim()
                if (e.key === 'Enter' && val) { e.preventDefault(); patchSeqStep(s.id, { storyTexts: [...s.storyTexts, val] }); (e.target as HTMLInputElement).value = '' }
              }}
              style={{ ...input, height: 32 }} />
            {s.storyTexts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {s.storyTexts.map((txt, k) => (
                  <span key={k} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', border: `1px solid ${HAIR}`, color: ACCENT_L, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {txt.slice(0, 20)}
                    <button onClick={() => patchSeqStep(s.id, { storyTexts: s.storyTexts.filter((_, j) => j !== k) })} className="cursor-pointer" style={{ background: 'none', border: 'none', color: MUTED }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    ))
  }

  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => {
      const ps = (data ?? []).filter(p => !role || canAccessPhoneGroup(role, perms, p.group_name)) as Phone[]
      setPhones(ps)
      setPhonesLoading(false)
      // Auto-remplissage du lien CTA par compte : on prend le lien déjà
      // enregistré sur le téléphone (colonne phones.link), sinon celui défini
      // depuis l'onglet Story (localStorage sf-story-link-<geelark_id|uuid>).
      setLinks(prev => {
        const n = { ...prev }
        for (const p of ps) {
          if ((n[p.id] ?? '').trim()) continue
          const fromDb = (p.link ?? '').trim()
          const fromLs = (localStorage.getItem(`sf-story-link-${p.geelark_id}`) ?? localStorage.getItem(`sf-story-link-${p.id}`) ?? '').trim()
          const v = fromDb || fromLs
          if (v) n[p.id] = v
        }
        return n
      })
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
    true,                                    // step 4 : finalisation
  ][step]

  async function save() {
    const badStep = seqSteps.find(s => s.type !== 'warmup' && s.media.length === 0)
    if (badStep) {
      setError(tr(`L'étape ${badStep.type === 'story' ? 'Story' : 'Publication'} ajoutée doit avoir au moins un média.`, `The added ${badStep.type === 'story' ? 'Story' : 'Post'} step must have at least one media.`)); return
    }
    setSaving(true); setError(null)
    try {
      const autoName = name.trim() || tr(`Tâche ${type === 'story' ? 'Story' : 'Reels'} ${platform === 'tiktok' ? 'TikTok' : 'IG'} — ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`, `${type === 'story' ? 'Story' : 'Reels'} ${platform === 'tiktok' ? 'TikTok' : 'IG'} task — ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`)
      // Séquence → recurring_tasks.steps[] (ordre : avant → principale → après).
      const linksByPhone = phoneList.reduce((acc, p) => { const v = (links[p.id] ?? '').trim(); if (v) acc[p.id] = v; return acc }, {} as Record<string, string>)
      const rnd = () => Math.random().toString(36).slice(2)
      const tokens = (m: { url: string; title: string }[]) => m.map(x => ({ token: x.url, title: x.title }))
      // Action principale (au centre de la séquence).
      const mainStep = type === 'story'
        ? { id: rnd(), type: 'story', images: tokens(media), story_texts: caption.trim() ? [caption.trim()] : [], phone_links: linksByPhone, mode, auto_remove_videos: autoRemove, caption: '', delay_minutes: 0, delay_after_minutes: 0 }
        : { id: rnd(), type: 'publication', videos: tokens(media), caption, reels_trial: false, mode, auto_remove_videos: autoRemove, delay_minutes: 0, delay_after_minutes: 0 }
      // Étapes ajoutées (warmup / story / publication) avec tous leurs champs.
      const mkExtra = (s: SeqStep) => {
        const base = { id: rnd(), type: s.type, mode: s.mode, delay_minutes: 0, delay_after_minutes: 0, auto_remove_videos: s.autoRemove }
        if (s.type === 'warmup') return { ...base, warmup_minutes: Math.max(1, s.warmupMinutes), caption: '' }
        if (s.type === 'story')  return { ...base, images: tokens(s.media), story_texts: s.storyTexts, phone_links: s.phoneLinks, caption: '' }
        return { ...base, videos: tokens(s.media), reels_trial: false, caption: s.caption }
      }
      const before = seqSteps.filter(s => s.position === 'before').map(mkExtra)
      const after  = seqSteps.filter(s => s.position === 'after').map(mkExtra)
      const steps = seqSteps.length > 0 ? [...before, mainStep, ...after] : []
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
        next_run_at: new Date(startAt).toISOString(),
        reels_trial: false,
        auto_remove_videos: autoRemove,
        steps,
      }
      // Insert avec repli si des colonnes récentes manquent (platform/steps/…)
      let { error: err } = await supabase.from('recurring_tasks').insert(payload)
      if (err && /platform/i.test(err.message)) {
        const { platform: _p, ...rest } = payload
        ;({ error: err } = await supabase.from('recurring_tasks').insert(rest))
        if (!err) setError(tr('⚠ Programmation TikTok limitée tant que la migration platform n\'est pas appliquée.', '⚠ TikTok scheduling is limited until the platform migration is applied.'))
      }
      if (err && /(steps|story_texts|auto_remove_videos)/i.test(err.message)) {
        const { steps: _s, story_texts: _st, auto_remove_videos: _a, platform: _p2, ...rest } = payload
        ;({ error: err } = await supabase.from('recurring_tasks').insert(rest))
        if (!err && seqSteps.length) setError(tr('⚠ Séquence non sauvegardée (migration steps manquante) — seule l\'action principale a été gardée.', '⚠ Sequence not saved (steps migration missing) — only the main action was kept.'))
      }
      if (err) throw err
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const STEPS = [tr('Type', 'Type'), tr('Comptes', 'Accounts'), tr('Contenu', 'Content'), tr('Récurrence', 'Recurrence'), tr('Finalisation', 'Finalization')]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(2,2,6,0.82)', backdropFilter: 'var(--blur-md, blur(20px) saturate(1.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={() => !saving && onClose()}>
      {showPicker && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            setMedia(prev => [...prev, ...paths.map((url, i) => ({ url, title: titles?.[i] ?? 'Média' }))])
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)} />
      )}
      {stepPickerId && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const add = paths.map((url, i) => ({ url, title: titles?.[i] ?? 'Média' }))
            setSeqSteps(prev => prev.map(e => e.id === stepPickerId ? { ...e, media: [...e.media, ...add] } : e))
            setStepPickerId(null)
          }}
          onClose={() => setStepPickerId(null)} />
      )}
      <div className="anim-scale-in" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 600, maxHeight: 'calc(100vh - 48px)', background: 'linear-gradient(180deg, var(--surface-2, #13141A), var(--surface, #0F1014))', border: `1px solid ${HAIR}`, borderRadius: 20, display: 'flex', flexDirection: 'column', boxShadow: 'var(--elev-3, 0 24px 80px -16px rgba(0,0,0,.8))' }}>

        {/* Header + steps */}
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${HAIR}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div className="sf-page-icon sf-page-icon-sm sf-anim-scale-spring" style={{ flexShrink: 0 }} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: IVORY }}>{tr('Nouvelle tâche automatique', 'New automatic task')}</span>
              <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 1 }}>{tr('Étape', 'Step')} {step + 1} / {STEPS.length} · {STEPS[step]}</span>
            </div>
            <button onClick={() => !saving && onClose()} className="sf-btn sf-btn-ghost sf-btn-icon cursor-pointer" aria-label={tr('Fermer', 'Close')} style={{ flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ flex: 1 }}>
                <div style={{ height: 3, borderRadius: 2, background: i <= step ? 'linear-gradient(90deg, #818CF8, #6366F1)' : 'rgba(255,255,255,0.08)', transition: 'background var(--t-base, 220ms cubic-bezier(.22,1,.36,1))' }} />
                <p style={{ fontSize: 10, fontWeight: 600, marginTop: 5, color: i === step ? ACCENT_L : i < step ? MUTED : FAINT, transition: 'color var(--t-fast, 150ms)' }}>{i + 1}. {s}</p>
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
                <p style={lbl}>{tr('Que veux-tu publier ?', 'What do you want to post?')}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([
                    { k: 'publication', emoji: '🎬', label: tr('Reels / Vidéo', 'Reels / Video'), desc: tr('Publication vidéo récurrente', 'Recurring video post') },
                    { k: 'story',       emoji: '🔗', label: tr('Story + lien', 'Story + link'),  desc: tr('Story avec sticker lien (Instagram)', 'Story with link sticker (Instagram)') },
                  ] as const).map(o => (
                    <button key={o.k} onClick={() => pickType(o.k)} className="cursor-pointer sf-press"
                      style={card(type === o.k)}>
                      <div style={{ fontSize: 30 }}>{o.emoji}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: IVORY, marginTop: 8 }}>{o.label}</div>
                      <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{o.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p style={lbl}>{tr('Plateforme', 'Platform')}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([
                    { k: 'instagram', emoji: '📸', label: 'Instagram' },
                    { k: 'tiktok',    emoji: '🎵', label: 'TikTok' },
                  ] as const).map(o => {
                    const disabled = isStory && o.k === 'tiktok'
                    return (
                      <button key={o.k} disabled={disabled} onClick={() => !disabled && setPlatform(o.k)}
                        className={disabled ? '' : 'cursor-pointer sf-press'}
                        style={{ ...card(platform === o.k), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                        <div style={{ fontSize: 26 }}>{o.emoji}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: IVORY, marginTop: 6 }}>{o.label}</div>
                        {disabled && <div style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>{tr('Story IG uniquement', 'IG Story only')}</div>}
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
              <p style={lbl}>{tr(`Comptes (${phoneList.length} sélectionné${phoneList.length > 1 ? 's' : ''})`, `Accounts (${phoneList.length} selected)`)}</p>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher…', 'Search…')}
                style={input} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
                <button onClick={() => setSel(new Set(visible.map(p => p.id)))} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{tr('Tout sélectionner', 'Select all')}</button>
              </div>
              {phonesLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="sf-skeleton" style={{ height: 46, borderRadius: 9 }} />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="sf-empty" style={{ padding: '28px 12px' }}>
                  <div className="sf-empty-icon" aria-hidden>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></svg>
                  </div>
                  <p className="sf-empty-title">{search ? tr('Aucun résultat', 'No results') : tr('Aucun compte disponible', 'No accounts available')}</p>
                  <p className="sf-empty-desc">{search ? tr('Aucun compte ne correspond à ta recherche.', 'No account matches your search.') : tr('Ajoute des téléphones dans l\'onglet Comptes pour créer une tâche.', 'Add phones in the Accounts tab to create a task.')}</p>
                </div>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                {visible.map(p => {
                  const on = selPhones.has(p.id)
                  return (
                    <button key={p.id} onClick={() => setSel(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                      className="cursor-pointer sf-press"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r-md, 11px)', textAlign: 'left', background: on ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'var(--border-accent-strong, rgba(99,102,241,0.28))' : HAIR}`, transition: 'background var(--t-fast, 150ms), border-color var(--t-fast, 150ms)' }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? ACCENT : 'transparent', border: on ? 'none' : `1px solid ${MUTED}` }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: IVORY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.phone_name}</p>
                        {p.ig_username && <p style={{ fontSize: 10.5, color: FAINT }}>@{p.ig_username}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
              )}
            </div>
          )}

          {/* STEP 2 — Contenu */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={lbl}>{isStory ? tr('Images', 'Images') : tr('Vidéos', 'Videos')} ({media.length})</p>
                <button onClick={() => setShowPicker(true)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">{tr('+ Depuis la banque', '+ From the bank')}</button>
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
                <p style={lbl}>{tr('Légende', 'Caption')} {isStory ? tr('(texte sticker, optionnel)', '(sticker text, optional)') : ''}</p>
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
                  placeholder={isStory ? tr('Texte du sticker…', 'Sticker text…') : tr('Légende de la publication…', 'Post caption…')} style={{ ...input, resize: 'vertical' }} />
              </div>
              {isStory && (
                <div>
                  <p style={lbl}>{tr('Lien par compte (story)', 'Link per account (story)')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {phoneList.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: MUTED, width: 110, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.ig_username ? `@${p.ig_username}` : p.phone_name}</span>
                        <input value={links[p.id] ?? ''} onChange={e => setLinks(prev => ({ ...prev, [p.id]: e.target.value }))} placeholder="https://…" style={{ ...input, flex: 1, height: 32 }} />
                      </div>
                    ))}
                  </div>
                  {!linksOk && <p className="sf-field-error" style={{ fontSize: 12, color: 'var(--warn, #FBBF24)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span aria-hidden>⚠</span>{tr('Chaque compte doit avoir un lien.', 'Each account must have a link.')}</p>}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — Récurrence */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={lbl}>{tr('Nom (optionnel)', 'Name (optional)')}</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Ex : Posts quotidiens…', 'e.g. Daily posts…')} style={input} />
              </div>
              <div>
                <p style={lbl}>{tr('Démarrage — 1er post', 'Start — 1st post')}</p>
                <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} style={input} />
                <p style={{ fontSize: 10.5, color: FAINT, margin: '6px 0 0' }}>{tr('Le tout premier post partira exactement à cette heure.', 'The very first post will go out exactly at this time.')}</p>
              </div>
              <div>
                <p style={lbl}>{tr('Répéter — fréquence', 'Repeat — frequency')}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {RECUR_PRESETS.map(r => {
                    const on = recurValue === r.value && recurUnit === r.unit
                    return (
                      <button key={r.label} onClick={() => { setRecurValue(r.value); setRecurUnit(r.unit) }} className="cursor-pointer"
                        style={{ padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: on ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(99,102,241,0.4)' : HAIR}`, color: on ? ACCENT_L : MUTED }}>
                        {tr(r.label, r.en)}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: MUTED }}>{tr('Toutes les', 'Every')}</span>
                  <input type="number" min={1} value={recurValue}
                    onChange={e => setRecurValue(Math.max(1, Number(e.target.value) || 1))}
                    style={{ ...input, width: 74, textAlign: 'center' }} />
                  <select value={recurUnit} onChange={e => setRecurUnit(e.target.value as RecurUnit)}
                    className="cursor-pointer" style={{ ...input, width: 130 }}>
                    <option value="minutes">{tr('minutes', 'minutes')}</option>
                    <option value="heures">{tr('heures', 'hours')}</option>
                    <option value="jours">{tr('jours', 'days')}</option>
                  </select>
                </div>
              </div>
              {!isStory && media.length > 1 && (
                <div>
                  <p style={lbl}>{tr('Distribution des vidéos', 'Video distribution')}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['seq', 'random'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)} className="cursor-pointer"
                        style={{ flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 600, background: mode === m ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.02)', border: `1px solid ${mode === m ? 'rgba(99,102,241,0.4)' : HAIR}`, color: mode === m ? ACCENT_L : MUTED }}>
                        {m === 'seq' ? tr('Séquentiel', 'Sequential') : tr('Aléatoire', 'Random')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setAutoRemove(v => !v)} className="cursor-pointer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}` }}>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: IVORY }}>{tr('Usage unique', 'Single use')}</p>
                  <p style={{ fontSize: 10.5, color: FAINT }}>{tr('Retire les médias après usage (pause quand vide)', 'Removes media after use (pauses when empty)')}</p>
                </div>
                <span style={{ width: 32, height: 18, borderRadius: 99, position: 'relative', background: autoRemove ? ACCENT : 'rgba(255,255,255,0.1)' }}>
                  <span style={{ position: 'absolute', top: 2, left: autoRemove ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
                </span>
              </button>

              <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', fontSize: 11.5, color: OK }}>
                {tr(
                  `Récap : ${type === 'story' ? 'Story' : 'Reels'} ${platform === 'tiktok' ? 'TikTok' : 'Instagram'} · ${phoneList.length} compte(s) · ${media.length} média(s) · départ ${new Date(startAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · toutes les ${recurValue} ${recurUnit}`,
                  `Summary: ${type === 'story' ? 'Story' : 'Reels'} ${platform === 'tiktok' ? 'TikTok' : 'Instagram'} · ${phoneList.length} account(s) · ${media.length} media · start ${new Date(startAt).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · every ${recurValue} ${recurUnit === 'minutes' ? 'minutes' : recurUnit === 'heures' ? 'hours' : 'days'}`,
                )}
              </div>
            </div>
          )}

          {/* STEP 4 — Finalisation : lancer ou ajouter des étapes (séquence) */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>
                {tr('Ta tâche est prête. Tu peux la lancer telle quelle, ou ajouter des étapes', 'Your task is ready. You can launch it as is, or add steps')}
                <b style={{ color: IVORY }}> {tr('avant', 'before')}</b> {tr('ou', 'or')} <b style={{ color: IVORY }}>{tr('après', 'after')}</b> {tr('(warmup, story, publication).', '(warmup, story, post).')}
              </p>

              {/* Séquence */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {seqStepCards('before')}

                {/* Action principale (toujours au centre) */}
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{type === 'story' ? '🔗' : '🎬'}</span>
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: IVORY, margin: 0 }}>{tr('Action principale —', 'Main action —')} {type === 'story' ? 'Story' : 'Reels'} {platform === 'tiktok' ? 'TikTok' : 'IG'}</p>
                      <p style={{ fontSize: 10.5, color: FAINT, margin: '2px 0 0' }}>{tr(`${media.length} média(s) · ${phoneList.length} compte(s)`, `${media.length} media · ${phoneList.length} account(s)`)}</p>
                    </div>
                  </div>
                </div>

                {seqStepCards('after')}
              </div>

              {/* Ajouter une étape */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px dashed ${HAIR}` }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT, margin: 0 }}>{tr('Ajouter une étape', 'Add a step')}</p>
                {([
                  { t: 'warmup' as const,      emoji: '🔥', label: tr('Warmup', 'Warmup') },
                  { t: 'story' as const,       emoji: '🔗', label: tr('Story', 'Story') },
                  { t: 'publication' as const, emoji: '🎬', label: tr('Publication', 'Post') },
                ]).map(o => (
                  <div key={o.t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: IVORY }}>{o.emoji} {o.label}</span>
                    <button onClick={() => addSeqStep(o.t, 'before')} className="cursor-pointer"
                      style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, color: MUTED }}>{tr('Avant', 'Before')}</button>
                    <button onClick={() => addSeqStep(o.t, 'after')} className="cursor-pointer"
                      style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, color: MUTED }}>{tr('Après', 'After')}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="sf-banner is-danger sf-anim-slide-up" role="alert" style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: 'var(--r-md, 11px)', background: 'var(--danger-dim, rgba(239,68,68,0.10))', border: '1px solid rgba(239,68,68,0.28)', color: 'var(--danger, #F87171)', fontSize: 12, lineHeight: 1.45 }}>
              <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 22px', borderTop: `1px solid ${HAIR}` }}>
          {step > 0 && <button onClick={() => setStep(s => s - 1)} className="sf-btn sf-btn-ghost cursor-pointer">{tr('Retour', 'Back')}</button>}
          <div style={{ flex: 1 }} />
          {step < 4
            ? <button onClick={() => canNext && setStep(s => s + 1)} disabled={!canNext} className="sf-btn sf-btn-primary cursor-pointer" style={{ opacity: canNext ? 1 : 0.4 }}>{tr('Continuer', 'Continue')}</button>
            : <button onClick={save} disabled={saving} className="sf-btn sf-btn-primary cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{saving && <span className="sf-spinner" aria-hidden />}{saving ? tr('Création…', 'Creating…') : tr('Terminer et lancer la tâche', 'Finish and launch task')}</button>}
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT, marginBottom: 10 }
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 13, color: IVORY, background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, borderRadius: 9, outline: 'none' }
function card(active: boolean): React.CSSProperties {
  return { flex: 1, padding: '18px 12px', borderRadius: 'var(--r-lg, 15px)', textAlign: 'center', background: active ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', border: `1.5px solid ${active ? 'var(--border-accent-strong, rgba(99,102,241,0.4))' : HAIR}`, boxShadow: active ? 'var(--glow-accent, 0 0 28px -6px rgba(99,102,241,.45))' : 'none', transition: 'background var(--t-fast, 150ms), border-color var(--t-fast, 150ms), box-shadow var(--t-base, 220ms)' }
}
