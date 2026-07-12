/**
 * Générateur de masse (superadmin ScaleFlow uniquement).
 *
 * 1 vidéo source → N variantes VISUELLEMENT uniques (crop/zoom/couleur/teinte via
 * le moteur repurpose existant) + un TEXTE incrusté propre à chaque variante,
 * décliné par l'IA (Groq) à partir d'un THÈME que tu donnes — donc un texte qui a
 * un rapport avec la vidéo (Option A). Tout est auto-enregistré dans la banque.
 *
 * Réutilise l'infra testée : runRepurposeViaServer / runRepurposeNative (variantes),
 * window.electronAPI.runFfmpegMixOverlay (incrustation texte), groqRequest (spin).
 */
import { useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { useLicense } from '@/lib/license'
import { useTr } from '@/lib/i18n'
import { getSignedUrl } from '@/lib/storage'
import { runRepurposeViaServer, runRepurposeNative } from '@/lib/ffmpeg-web'
import { BankPicker } from './Bank'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { useToast } from '@/components/Toast'
import {
  ACCENT, ACCENT_L, TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR, OK, ERR,
} from '@/lib/theme'

type Intensity = 'subtle' | 'medium' | 'aggressive' | 'vener'
type Format = '9:16' | '1:1' | '16:9' | 'keep'
type Position = 'top' | 'middle' | 'bottom'

interface VariantJob {
  key:      string
  source:   string          // titre source
  index:    number
  text:     string | null
  status:   'pending' | 'visual' | 'text' | 'saving' | 'done' | 'error'
  error?:   string
}

const IS_WEB = (window as unknown as { __IS_WEB?: boolean }).__IS_WEB === true

// Exécute `worker(i)` pour i∈[0,n[ avec au plus `limit` en parallèle.
async function runPool(n: number, limit: number, worker: (i: number) => Promise<void>): Promise<void> {
  let idx = 0
  await Promise.all(Array.from({ length: Math.min(limit, n) }, async () => {
    while (idx < n) { const i = idx++; await worker(i) }
  }))
}

// Décline N textes courts d'incrustation à partir d'un thème (Groq).
async function spinTexts(apiKey: string, theme: string, n: number, lang: 'fr' | 'en'): Promise<string[]> {
  const api = window.electronAPI?.groqRequest
  if (!api) return []
  const sys = lang === 'en'
    ? 'You write ultra-short punchy on-screen hook texts for Instagram Reels. Each ≤ 60 characters, no hashtags, no quotes, no numbering. One per line.'
    : 'Tu écris des textes-accroche ULTRA courts à incruster sur des Reels Instagram. Chacun ≤ 60 caractères, sans hashtags, sans guillemets, sans numérotation. Un par ligne.'
  const usr = lang === 'en'
    ? `Theme: "${theme}". Give ${n} DIFFERENT short on-screen hooks about this theme. Only the ${n} lines, nothing else.`
    : `Thème : "${theme}". Donne ${n} accroches courtes DIFFÉRENTES à incruster, en rapport avec ce thème. Uniquement les ${n} lignes, rien d'autre.`
  try {
    const r = await api({
      apiKey, model: 'llama-3.1-8b-instant', maxTokens: 500,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
    })
    const content = (r?.data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? ''
    return content.split(/\r?\n/).map(s => s.replace(/^\s*\d+[.)\-\s]+/, '').replace(/^["'«»]|["'«»]$/g, '').trim()).filter(Boolean)
  } catch { return [] }
}

export function MassUnique({ user }: { user: User }) {
  const tr = useTr()
  const { currentOrg } = useOrg()
  const conns = useConnections(user)
  const lic = useLicense()
  const toast = useToast()

  const [sources, setSources]   = useState<ContentItem[]>([])
  const [showPicker, setPicker] = useState(false)
  const [theme, setTheme]       = useState('')
  const [useText, setUseText]   = useState(true)
  const [count, setCount]       = useState(10)
  const [intensity, setInt]     = useState<Intensity>('aggressive')
  const [format, setFormat]     = useState<Format>('9:16')
  const [position, setPosition] = useState<Position>('top')
  const [fontSize, setFontSize] = useState(56)
  const [fontColor, setColor]   = useState('#ffffff')
  const [saveFolder, setFolder] = useState<string | null>(null)
  const [running, setRunning]   = useState(false)
  const [jobs, setJobs]         = useState<VariantJob[]>([])
  const abortRef = useRef(false)

  const groqKey = conns.groq || (import.meta as unknown as { env?: { VITE_DEFAULT_GROQ_KEY?: string } }).env?.VITE_DEFAULT_GROQ_KEY || ''
  const lang: 'fr' | 'en' = tr('fr', 'en') as 'fr' | 'en'

  // Réservé au superadmin ScaleFlow.
  if (!lic?.isSuperAdmin) {
    return (
      <div className="sf-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="sf-card" style={{ padding: 32, textAlign: 'center', maxWidth: 420 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: IVORY, marginBottom: 8 }}>{tr('Accès réservé', 'Restricted access')}</p>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{tr('Cet outil est réservé au superadmin ScaleFlow.', 'This tool is reserved for the ScaleFlow superadmin.')}</p>
        </div>
      </div>
    )
  }

  const done = jobs.filter(j => j.status === 'done').length
  const errored = jobs.filter(j => j.status === 'error').length
  const total = jobs.length

  function setJob(key: string, patch: Partial<VariantJob>) {
    setJobs(prev => prev.map(j => j.key === key ? { ...j, ...patch } : j))
  }

  async function generate() {
    if (sources.length === 0) { toast.show({ title: tr('Aucune source', 'No source'), body: tr('Choisis au moins une vidéo.', 'Pick at least one video.'), kind: 'warn' }); return }
    if (useText && !theme.trim()) { toast.show({ title: tr('Thème manquant', 'Missing theme'), body: tr('Entre un thème pour générer les textes.', 'Enter a theme to generate the texts.'), kind: 'warn' }); return }
    if (useText && !groqKey) { toast.show({ title: tr('Clé Groq manquante', 'Groq key missing'), body: tr('Ajoute-la dans les Paramètres.', 'Add it in Settings.'), kind: 'error' }); return }

    abortRef.current = false
    setRunning(true)
    // Prépare la liste des jobs (source × count)
    const initial: VariantJob[] = []
    for (const s of sources) for (let i = 0; i < count; i++) {
      initial.push({ key: `${s.id}-${i}`, source: s.title, index: i, text: null, status: 'pending' })
    }
    setJobs(initial)

    try {
      // 1. Décline les textes une fois (réutilisés/cyclés par variante).
      let texts: string[] = []
      if (useText) {
        texts = await spinTexts(groqKey, theme.trim(), Math.max(count, 8), lang)
        if (texts.length === 0) texts = [theme.trim()]
      }

      // 2. Par vidéo source → N variantes visuelles → texte → banque.
      for (const s of sources) {
        const src = s.storage_path ?? s.file_url
        const sourceUrl = src ? (await getSignedUrl(src).catch(() => null)) ?? s.file_url : s.file_url
        if (!sourceUrl) {
          for (let i = 0; i < count; i++) setJob(`${s.id}-${i}`, { status: 'error', error: tr('Source introuvable', 'Source not found') })
          continue
        }
        const seeds = Array.from({ length: count }, (_, i) => Math.floor(Math.random() * 1e9) + i)
        for (let i = 0; i < count; i++) setJob(`${s.id}-${i}`, { status: 'visual' })

        // Variantes visuelles (moteur existant, testé).
        let variants
        try {
          variants = IS_WEB
            ? await runRepurposeViaServer({ sourceUrl, userId: user.id, seeds, intensity, format })
            : await runRepurposeNative({ sourcePath: sourceUrl, seeds, intensity, format })
        } catch (e) {
          for (let i = 0; i < count; i++) setJob(`${s.id}-${i}`, { status: 'error', error: e instanceof Error ? e.message : String(e) })
          continue
        }

        // Traitement des variantes EN PARALLÈLE (pool borné à 4) — sinon les N
        // incrustations texte s'enchaînent une par une = très lent (15 min+).
        await runPool(count, 4, async (i) => {
          if (abortRef.current) return
          const key = `${s.id}-${i}`
          const v = variants[i]
          if (!v?.ok || !v.outputPath) { setJob(key, { status: 'error', error: v?.error ?? tr('Variante échouée', 'Variant failed') }); return }

          let finalStorage = v.storagePath
          let finalThumb   = v.thumbnailPath ?? null
          const text = useText && texts.length ? texts[i % texts.length] : null

          // Incrustation texte (optionnelle) → nouvel MP4.
          if (text && !abortRef.current) {
            setJob(key, { status: 'text', text })
            const ov = await window.electronAPI?.runFfmpegMixOverlay?.({
              sourcePath: v.outputPath, caption: text, position, fontSize, fontColor,
            })
            if (ov?.ok && ov.storagePath) {
              if (v.storagePath && v.storagePath !== ov.storagePath) supabase.storage.from('content').remove([v.storagePath]).catch(() => {})
              finalStorage = ov.storagePath
              finalThumb = null
            }
            // Si l'overlay échoue, on garde la variante visuelle (pas de texte).
          }

          if (abortRef.current) { setJob(key, { status: 'error', error: tr('Annulé', 'Cancelled') }); return }
          if (!finalStorage) { setJob(key, { status: 'error', error: tr('Pas de fichier de sortie', 'No output file') }); return }

          // Enregistrement en banque.
          setJob(key, { status: 'saving', text })
          const base = {
            user_id: user.id, org_id: currentOrg?.id ?? null,
            title: `Unique — ${s.title} #${i + 1}`,
            file_url: null, storage_path: finalStorage, thumbnail_path: finalThumb,
            folder: saveFolder,
            tags: ['mass-unique', ...(text ? ['texte'] : [])],
            notes: '',
          }
          const { error } = await supabase.from('content_bank').insert(base)
          setJob(key, error ? { status: 'error', error: error.message } : { status: 'done', text })
        })
        if (abortRef.current) break
      }
      toast.show({ title: tr('Génération terminée', 'Generation complete'), body: tr('Vidéos enregistrées dans la banque.', 'Videos saved to the bank.'), kind: 'ok' })
    } catch (e) {
      toast.show({ title: tr('Erreur', 'Error'), body: e instanceof Error ? e.message : String(e), kind: 'error' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="sf-page" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: IVORY, margin: 0 }}>{tr('Générateur de masse', 'Mass generator')}</h1>
          <span className="sf-badge sf-badge-accent" style={{ fontSize: 10 }}>SUPERADMIN</span>
        </div>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
          {tr('1 vidéo → N variantes uniques (image retravaillée) + un texte différent par variante, décliné par l\'IA à partir de ton thème.',
              '1 video → N unique variants (reworked image) + a different text per variant, generated by AI from your theme.')}
        </p>
      </div>

      {/* Étape 1 — sources */}
      <section className="sf-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="sf-section-label" style={{ margin: 0 }}>{tr('1 · Vidéos sources', '1 · Source videos')}</span>
          <button onClick={() => setPicker(true)} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">{tr('Choisir depuis la banque', 'Pick from bank')}</button>
        </div>
        {sources.length === 0
          ? <p style={{ fontSize: 12.5, color: FAINT }}>{tr('Aucune vidéo sélectionnée.', 'No video selected.')}</p>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sources.map(s => (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 11px', borderRadius: 20, background: 'rgba(99,102,241,0.08)', border: `1px solid ${HAIR}`, fontSize: 12, color: IVORY, maxWidth: 240 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <button onClick={() => setSources(prev => prev.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', color: FAINT, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>}
      </section>

      {/* Étape 2 — texte (Option A) */}
      <section className="sf-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="sf-section-label" style={{ margin: 0 }}>{tr('2 · Texte incrusté (IA)', '2 · Burned-in text (AI)')}</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED, cursor: 'pointer' }}>
            <input type="checkbox" checked={useText} onChange={e => setUseText(e.target.checked)} className="accent-accent" />
            {tr('Activer', 'Enable')}
          </label>
        </div>
        {useText && (
          <>
            <textarea value={theme} onChange={e => setTheme(e.target.value)} rows={2}
              placeholder={tr('Thème / sujet de tes vidéos (ex. « perte de poids sans sport »)…', 'Theme / topic of your videos (e.g. "lose weight without the gym")…')}
              className="sf-input" style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} />
            <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>{tr('L\'IA génère un texte-accroche DIFFÉRENT par variante, en rapport avec ce thème.', 'AI generates a DIFFERENT hook text per variant, related to this theme.')}</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {tr('Position', 'Position')}
                <select value={position} onChange={e => setPosition(e.target.value as Position)} className="sf-input" style={{ height: 30, fontSize: 12 }}>
                  <option value="top">{tr('Haut', 'Top')}</option>
                  <option value="middle">{tr('Milieu', 'Middle')}</option>
                  <option value="bottom">{tr('Bas', 'Bottom')}</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {tr('Taille', 'Size')}
                <input type="range" min={32} max={90} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} />
                <span style={{ fontVariantNumeric: 'tabular-nums', width: 26 }}>{fontSize}</span>
              </label>
              <label style={{ fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {tr('Couleur', 'Color')}
                <input type="color" value={fontColor} onChange={e => setColor(e.target.value)} style={{ width: 32, height: 26, border: 'none', background: 'none', cursor: 'pointer' }} />
              </label>
            </div>
          </>
        )}
      </section>

      {/* Étape 3 — réglages */}
      <section className="sf-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="sf-section-label" style={{ margin: 0 }}>{tr('3 · Réglages', '3 · Settings')}</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {tr('Variantes / vidéo', 'Variants / video')}
            <input type="number" min={1} max={50} value={count} onChange={e => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="sf-input" style={{ width: 70, height: 32, fontSize: 13 }} />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tr('Intensité', 'Intensity')}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['subtle', 'medium', 'aggressive', 'vener'] as Intensity[]).map(lv => (
                <button key={lv} onClick={() => setInt(lv)} className="cursor-pointer" style={{
                  padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                  background: intensity === lv ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${intensity === lv ? 'rgba(129,140,248,0.5)' : HAIR}`,
                  color: intensity === lv ? ACCENT_L : MUTED,
                }}>{lv === 'subtle' ? tr('Subtil', 'Subtle') : lv === 'medium' ? tr('Moyen', 'Medium') : lv === 'aggressive' ? tr('Fort', 'Strong') : tr('Véner', 'Extreme')}</button>
              ))}
            </div>
          </div>
          <label style={{ fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {tr('Format', 'Format')}
            <select value={format} onChange={e => setFormat(e.target.value as Format)} className="sf-input" style={{ height: 32, fontSize: 13 }}>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="16:9">16:9</option>
              <option value="keep">{tr('Garder', 'Keep')}</option>
            </select>
          </label>
          <div style={{ minWidth: 180 }}>
            <span style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{tr('Dossier de destination', 'Destination folder')}</span>
            <BankFolderSelect userId={user.id} orgId={currentOrg?.id ?? null} value={saveFolder} onChange={setFolder} />
          </div>
        </div>
      </section>

      {/* Action + progression */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {running ? (
          <button onClick={() => { abortRef.current = true }} className="sf-btn sf-btn-danger sf-btn-lg cursor-pointer">
            {tr('Arrêter', 'Stop')}
          </button>
        ) : (
          <button onClick={generate} disabled={sources.length === 0} className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer"
            style={{ opacity: sources.length === 0 ? 0.5 : 1 }}>
            {tr(`Générer ${sources.length * count} vidéo(s)`, `Generate ${sources.length * count} video(s)`)}
          </button>
        )}
        {running && (
          <span style={{ fontSize: 11.5, color: FAINT }}>{tr('~4 en parallèle · garde l\'onglet ouvert', '~4 in parallel · keep the tab open')}</span>
        )}
        {total > 0 && (
          <span style={{ fontSize: 12.5, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: OK }}>{done}</span> / {total} {tr('terminées', 'done')}{errored > 0 && <span style={{ color: ERR }}> · {errored} {tr('échec', 'failed')}</span>}
          </span>
        )}
      </div>

      {jobs.length > 0 && (
        <section className="sf-card" style={{ padding: 14, maxHeight: 320, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
            {jobs.map(j => {
              const color = j.status === 'done' ? OK : j.status === 'error' ? ERR : ACCENT_L
              const label = j.status === 'pending' ? tr('En attente', 'Pending')
                : j.status === 'visual' ? tr('Image…', 'Image…')
                : j.status === 'text' ? tr('Texte…', 'Text…')
                : j.status === 'saving' ? tr('Enreg.…', 'Saving…')
                : j.status === 'done' ? tr('OK', 'OK') : tr('Échec', 'Failed')
              return (
                <div key={j.key} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}` }}>
                  <p style={{ fontSize: 11, color: IVORY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{j.source} #{j.index + 1}</p>
                  {j.text && <p style={{ fontSize: 10.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0' }}>“{j.text}”</p>}
                  <p style={{ fontSize: 10.5, color, margin: '4px 0 0', fontWeight: 600 }} title={j.error}>{label}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {showPicker && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(_paths, _titles, _descs, items) => { if (items) setSources(prev => { const ids = new Set(prev.map(p => p.id)); return [...prev, ...items.filter(i => !ids.has(i.id))] }); setPicker(false) }}
          onClose={() => setPicker(false)} />
      )}
    </div>
  )
}
