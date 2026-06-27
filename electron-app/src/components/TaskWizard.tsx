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

const RECUR_PRESETS: { label: string; hours: number }[] = [
  { label: '1×/jour',     hours: 24 },
  { label: '2×/jour',     hours: 12 },
  { label: '4×/jour',     hours: 6 },
  { label: 'Toutes les heures', hours: 1 },
]

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
  const [recurHours, setRecurHours] = useState(24)
  const [mode, setMode]         = useState<'seq' | 'random'>('seq')
  const [autoRemove, setAutoRemove] = useState(false)

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
    setSaving(true); setError(null)
    try {
      const autoName = name.trim() || `Tâche ${type === 'story' ? 'Story' : 'Reels'} ${platform === 'tiktok' ? 'TikTok' : 'IG'} — ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`
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
        next_run_at: new Date().toISOString(),
        reels_trial: false,
        auto_remove_videos: autoRemove,
        steps: [],
      }
      // Insert avec repli si des colonnes récentes manquent (platform/steps/…)
      let { error: err } = await supabase.from('recurring_tasks').insert(payload)
      if (err && /platform/i.test(err.message)) {
        const { platform: _p, ...rest } = payload
        ;({ error: err } = await supabase.from('recurring_tasks').insert(rest))
        if (!err) setError('⚠ Programmation TikTok limitée tant que la migration platform n\'est pas appliquée.')
      }
      if (err && /(steps|story_texts|auto_remove_videos)/i.test(err.message)) {
        const { steps: _s, story_texts: _st, auto_remove_videos: _a, platform: _p2, ...rest } = payload
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
                <p style={lbl}>Fréquence</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {RECUR_PRESETS.map(r => (
                    <button key={r.hours} onClick={() => setRecurHours(r.hours)} className="cursor-pointer"
                      style={{ padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: recurHours === r.hours ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.02)', border: `1px solid ${recurHours === r.hours ? 'rgba(99,102,241,0.4)' : HAIR}`, color: recurHours === r.hours ? ACCENT_L : MUTED }}>
                      {r.label}
                    </button>
                  ))}
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
              <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', fontSize: 11.5, color: OK }}>
                Récap : {type === 'story' ? 'Story' : 'Reels'} {platform === 'tiktok' ? 'TikTok' : 'Instagram'} · {phoneList.length} compte(s) · {media.length} média(s) · {RECUR_PRESETS.find(r => r.hours === recurHours)?.label ?? `${recurHours}h`}
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
