import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { Button } from '@/components/ui/Button'
import { MetadataChanger } from './MetadataChanger'
import { VisionTools, type VisionToolId } from './VisionTools'
import { TextCopy } from './TextCopy'
import { useT, useLang } from '@/lib/i18n'

interface AiToolsProps { user: User }

// ── Inline Lucide-style SVG icons (no emoji UI chrome) ─────────────────────────
type IconName =
  | 'search' | 'message-square' | 'calendar' | 'clapperboard' | 'anchor'
  | 'user' | 'globe' | 'search-check' | 'sparkles' | 'tag' | 'pen-line'
  | 'flame' | 'dna' | 'image' | 'arrow-left' | 'copy' | 'check' | 'zap'
  | 'alert-triangle' | 'eye' | 'eye-off' | 'cpu' | 'layers' | 'video'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    'search': <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    'message-square': <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    'calendar': <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    'clapperboard': <><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
    'anchor': <><circle cx="12" cy="5" r="3" /><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3" /></>,
    'user': <><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></>,
    'globe': <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" /></>,
    'search-check': <><path d="m8 11 2 2 4-4" /><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    'sparkles': <path d="M9.94 14.34A2 2 0 0 0 8.66 13l-6.13-1.9a.5.5 0 0 1 0-.95l6.13-1.9a2 2 0 0 0 1.28-1.28l1.9-6.13a.5.5 0 0 1 .95 0l1.9 6.13a2 2 0 0 0 1.28 1.28l6.13 1.9a.5.5 0 0 1 0 .95l-6.13 1.9a2 2 0 0 0-1.28 1.28l-1.9 6.13a.5.5 0 0 1-.95 0z" />,
    'tag': <><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></>,
    'pen-line': <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    'flame': <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
    'dna': <><path d="M2 15c6.667-6 13.333 0 20-6" /><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" /><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" /><path d="m17 6-2.5-2.5M14 8l-1-1M7 18l2.5 2.5M10 16l1 1M5 14l-3-3M22 13l-3-3" /></>,
    'image': <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
    'arrow-left': <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
    'copy': <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
    'check': <path d="M20 6 9 17l-5-5" />,
    'zap': <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
    'alert-triangle': <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    'eye': <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    'eye-off': <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></>,
    'cpu': <><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" /></>,
    'layers': <><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></>,
    'video': <><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

type GroqToolId =
  | 'strat' | 'caption' | 'plan'
  | 'script' | 'hooks' | 'bio' | 'replies' | 'translate' | 'competitor'

type ActiveTool = 'hub' | 'metadata' | 'textcopy' | GroqToolId | VisionToolId

// ── Helpers ───────────────────────────────────────────────────────────────────
async function groqCall(apiKey: string, prompt: string, maxTokens = 600): Promise<string> {
  const result = await window.electronAPI?.groqRequest({
    apiKey,
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.1-8b-instant',
    maxTokens,
  })
  if (!result?.ok) throw new Error(result?.error ?? 'Erreur Groq')
  const data = result.data as Record<string, unknown>
  const choices = data?.['choices'] as Array<Record<string, unknown>>
  return ((choices?.[0]?.['message'] as Record<string, unknown>)?.['content'] as string) ?? ''
}

// ── Copy Button ────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      className="cursor-pointer inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-bold font-mono uppercase tracking-wider transition-all"
      style={{
        background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.08)',
        color: copied ? '#22C55E' : '#818CF8',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.25)' : 'rgba(99,102,241,0.2)'}`,
      }}>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      <span>{copied ? t('copied').toUpperCase() : t('copy').toUpperCase()}</span>
    </button>
  )
}

// ── Result Box ─────────────────────────────────────────────────────────────────
function ResultBox({ value, rows = 8 }: { value: string; rows?: number }) {
  const charCount = value.length
  return (
    <div className="relative rounded-2xl overflow-hidden anim-scale-in"
      style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(99,102,241,0.18)' }}>
      {/* Terminal header */}
      <div className="flex items-center gap-3 px-4 py-2.5"
        style={{ borderBottom: '1px solid rgba(99,102,241,0.1)', background: 'rgba(99,102,241,0.04)' }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(239,68,68,0.45)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(245,158,11,0.45)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(34,197,94,0.45)' }} />
        </div>
        <span className="text-[10px] font-mono text-text3 uppercase tracking-widest ml-1">Output IA</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] font-mono text-text3">{charCount} chars</span>
          <div className="w-1.5 h-1.5 rounded-full sf-live-dot" />
        </div>
      </div>
      <textarea
        rows={rows}
        value={value}
        readOnly
        className="w-full px-5 py-4 text-[12px] font-mono resize-none focus:outline-none leading-relaxed"
        style={{ background: 'transparent', color: '#818CF8' }}
      />
    </div>
  )
}

// ── Field Input ────────────────────────────────────────────────────────────────
function FieldInput({ placeholder, value, onChange, textarea, rows }: {
  placeholder: string; value: string; onChange: (v: string) => void; textarea?: boolean; rows?: number
}) {
  const cls = "sf-input w-full rounded-xl px-4 py-2.5 text-[13px] font-mono"
  return textarea
    ? <textarea rows={rows ?? 4} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className={cls} />
    : <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className={cls} />
}

// ── Select Input ───────────────────────────────────────────────────────────────
function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="sf-input w-full rounded-xl px-4 py-2.5 text-[13px] font-mono cursor-pointer focus:outline-none">
      {options.map(o => <option key={o} value={o} style={{ background: '#0E0E16' }}>{o}</option>)}
    </select>
  )
}

// ── Tool Shell (individual tool page wrapper) ──────────────────────────────────
function ToolShell({ title, icon, children, onBack, error }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; onBack: () => void; error?: string | null
}) {
  const t = useT()
  return (
    <div className="h-full flex flex-col overflow-y-auto bg-bg anim-page">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-7 pb-5 sf-topbar">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cursor-pointer inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[11px] font-bold font-mono uppercase tracking-wider transition-all flex-shrink-0"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)', color: '#818CF8' }}>
            <Icon name="arrow-left" size={13} />
            {t('back')}
          </button>

          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 sf-anim-scale-spring sf-d50"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.1))', border: '1px solid rgba(99,102,241,0.28)', color: '#818CF8' }}>
            {icon}
          </div>

          <div className="sf-anim-slide-up sf-d100">
            <h1 className="text-[19px] font-black text-text leading-none">{title}</h1>
            <p className="text-[10px] text-text3 font-mono mt-0.5 uppercase tracking-widest">{t('aiToolsTitle')} — Studio</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-8 pb-10 pt-6">
        <div className="max-w-2xl space-y-4">
          {error && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3 anim-scale-in"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)' }}>
              <span className="text-danger flex-shrink-0"><Icon name="alert-triangle" size={15} /></span>
              <p className="text-[12px] font-mono text-danger">{error}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Form Section wrapper ───────────────────────────────────────────────────────
function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sf-card rounded-2xl p-5 space-y-3">
      <p className="text-[10px] uppercase tracking-widest font-black text-text3 font-mono">{label}</p>
      {children}
    </div>
  )
}

// ── Groq tool pages ───────────────────────────────────────────────────────────

function StratConcurrente({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [handle, setHandle] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Expert Instagram growth hacking. Analyse la stratégie pour la niche/compte : ${handle.trim()}. Recommandations structurées : 1) Type de contenu à créer, 2) Fréquence idéale, 3) Heures de publication optimales, 4) Stratégie hashtags, 5) Idées Reels viraux, 6) Tactiques d’engagement. Bullet points clairs.`,
        700)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Niche Strategy" icon={<Icon name="search" />} onBack={onBack} error={error}>
      <FormSection label="Niche ou compte concurrent">
        <p className="text-[12px] text-text2 font-mono">Enter a competitor handle or niche for a complete strategy.</p>
        <FieldInput placeholder="@concurrent ou niche (ex: fitness, crypto)" value={handle} onChange={setHandle} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!handle.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="search" size={15} />Analyser la niche</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={12} />}
    </ToolShell>
  )
}

function CaptionsVirales({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const TONES = ['Engaging', 'Humorous', 'Informative', 'Mysterious', 'Inspiring', 'Provocative']
  const [subject, setSubject] = useState('')
  const [tone, setTone] = useState('Engaging')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Génère une caption Instagram virale en français pour : ${subject.trim()}. Ton : ${tone}. Structure : Hook accrocheur (première ligne), body engageant (2-4 lignes), CTA clair, puis 15 hashtags pertinents. Maximum 250 mots.`,
        500)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Captions Virales" icon={<Icon name="message-square" />} onBack={onBack} error={error}>
      <FormSection label="Configuration de la caption">
        <p className="text-[12px] text-text2 font-mono">Hook + body + CTA + 15 hashtags generated automatically.</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput placeholder="Sujet du post" value={subject} onChange={setSubject} />
          <SelectInput value={tone} onChange={setTone} options={TONES} />
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!subject.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="sparkles" size={15} />Générer la caption</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={10} />}
    </ToolShell>
  )
}

function Planificateur({ groqKey, onBack, userId }: { groqKey: string; onBack: () => void; userId: string }) {
  const [niche, setNiche] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('app_config').select('profile_niche').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data?.profile_niche) setNiche(data.profile_niche) })
  }, [userId])

  async function run() {
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Crée un calendrier éditorial Instagram pour 7 jours sur la niche : ${niche.trim()}. Pour chaque jour : Heure optimale / Type de contenu (Reel/Carousel/Story) / Idée précise / Titre accrocheur / 5 hashtags pertinents. Format structuré jour par jour.`,
        900)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="7-Day Planner" icon={<Icon name="calendar" />} onBack={onBack} error={error}>
      <FormSection label="Editorial Niche">
        <p className="text-[12px] text-text2 font-mono">Full editorial calendar — 7 days with times, types and ideas.</p>
        <FieldInput placeholder="Niche (fitness, crypto, lifestyle…)" value={niche} onChange={setNiche} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!niche.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="calendar" size={15} />Générer le planning</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={14} />}
    </ToolShell>
  )
}

function ScriptReel({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [subject, setSubject] = useState('')
  const [duration, setDuration] = useState('30s')
  const [tone, setTone] = useState('Engaging')
  const TONES = ['Engaging', 'Humorous', 'Informative', 'Inspiring', 'Provocative', 'Éducatif']
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Tu es expert en création de contenu Instagram viral. Génère un script Reel complet en français.
Sujet : ${subject.trim()}
Durée cible : ${duration}
Ton : ${tone}

Structure obligatoire :
🎣 HOOK (0-3s) : phrase choc ou question qui arrête le scroll
📖 CORPS (corps principal) : développement en étapes claires, chaque point sur une nouvelle ligne
🚀 CTA (dernières secondes) : appel à l’action précis (follow, like, commentaire)

Format le script comme si c’était prêt à lire face caméra. Inclus les indications de timing. Maximum ${duration === '15s' ? '80' : duration === '30s' ? '150' : '280'} mots.`,
        600)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Script Reel Complet" icon={<Icon name="clapperboard" />} onBack={onBack} error={error}>
      <FormSection label="Reel Settings">
        <p className="text-[12px] text-text2 font-mono">Camera-ready script — hook, body, CTA with precise timings.</p>
        <FieldInput placeholder="Video topic" value={subject} onChange={setSubject} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-2.5 text-text3 font-mono">Target Duration</p>
            <div className="flex gap-2">
              {['15s', '30s', '60s'].map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className="cursor-pointer flex-1 py-2.5 rounded-xl text-[12px] font-bold font-mono transition-all"
                  style={duration === d
                    ? { background: 'linear-gradient(130deg,#6366F1,#6366F1)', color: '#fff', boxShadow: '0 2px 14px -4px rgba(99,102,241,0.5)' }
                    : { background: 'rgba(99,102,241,0.06)', color: 'rgba(99,102,241,0.5)', border: '1px solid rgba(99,102,241,0.12)' }
                  }>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-2.5 text-text3 font-mono">Ton</p>
            <SelectInput value={tone} onChange={setTone} options={TONES} />
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!subject.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="clapperboard" size={15} />Générer le script</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={14} />}
    </ToolShell>
  )
}

function HooksAB({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [subject, setSubject] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Tu es expert en copywriting Instagram. Pour le sujet : "${subject.trim()}", génère exactement 3 hooks d’accroche radicalement différents pour un Reel.

HOOK A — Style CURIOSITÉ : crée une tension, donne envie de savoir la suite
HOOK B — Style CHOC/CONTRADICTION : affirmation surprenante ou contre-intuitive
HOOK C — Style QUESTION DIRECTE : question personnelle qui touche le viewer

Chaque hook doit faire maximum 2 lignes. Format :

🔵 HOOK A (Curiosité)
[texte du hook]

🔴 HOOK B (Choc)
[texte du hook]

🟢 HOOK C (Question)
[texte du hook]

💡 Lequel choisir : [conseil rapide]`,
        400)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="3 Hooks A/B/C" icon={<Icon name="anchor" />} onBack={onBack} error={error}>
      <FormSection label="Video Topic">
        <p className="text-[12px] text-text2 font-mono">3 radically different hooks to test the best one.</p>
        <FieldInput placeholder="Video topic" value={subject} onChange={setSubject} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!subject.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="anchor" size={15} />Générer les hooks</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={12} />}
    </ToolShell>
  )
}

function BioOptimizer({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [bio, setBio] = useState('')
  const [niche, setNiche] = useState('')
  const [goal, setGoal] = useState('Followers')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Tu es expert en optimisation de profil Instagram. Optimise cette bio pour maximiser : ${goal}.
Niche : ${niche.trim() || 'non précisée'}
Bio actuelle : "${bio.trim()}"

Réponds avec :
✅ BIO OPTIMISÉE :
[nouvelle bio max 150 caractères, avec emojis stratégiques et mots-clés SEO]

📊 AMÉLIORATIONS APPORTÉES :
[liste des changements et pourquoi]

💡 BONUS — Suggestions pour le nom de profil et le lien en bio :
[recommandations]`,
        500)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Bio Optimizer" icon={<Icon name="user" />} onBack={onBack} error={error}>
      <FormSection label="Bio et objectif">
        <p className="text-[12px] text-text2 font-mono">Rewrites your bio to maximize conversions based on your goal.</p>
        <FieldInput placeholder="Ta bio actuelle (colle-la ici)" value={bio} onChange={setBio} textarea rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput placeholder="Niche / domaine" value={niche} onChange={setNiche} />
          <SelectInput value={goal} onChange={setGoal} options={['Followers', 'Sales', 'Bio link traffic', 'DMs', 'Brand awareness']} />
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!bio.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="user" size={15} />Optimiser la bio</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={10} />}
    </ToolShell>
  )
}

function CommentReplies({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [comments, setComments] = useState('')
  const [tone, setTone] = useState('Friendly')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult('')
    const lines = comments.trim().split('\n').filter(l => l.trim()).slice(0, 20)
    try {
      const text = await groqCall(groqKey,
        `Tu gères un compte Instagram. Génère une réponse personnalisée pour chaque commentaire ci-dessous. Ton de marque : ${tone}. Chaque réponse doit être courte (1-2 lignes max), naturelle, engageante et avec 1 emoji.

${lines.map((c, i) => `Commentaire ${i + 1}: ${c}`).join('\n')}

Format de réponse :
Commentaire 1 → [réponse]
Commentaire 2 → [réponse]
...`,
        600)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Comment Replies" icon={<Icon name="message-square" />} onBack={onBack} error={error}>
      <FormSection label="Comments to process">
        <p className="text-[12px] text-text2 font-mono">Up to 20 comments (one per line) — personalized reply for each.</p>
        <FieldInput placeholder={"Commentaire 1\nCommentaire 2\nCommentaire 3…"} value={comments} onChange={setComments} textarea rows={5} />
        <SelectInput value={tone} onChange={setTone} options={['Friendly', 'Professional', 'Humorous', 'Motivating', 'Mysterious']} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!comments.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="message-square" size={15} />Générer les réponses</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={10} />}
    </ToolShell>
  )
}

function ContentTranslator({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [caption, setCaption] = useState('')
  const [langs, setLangs] = useState<string[]>(['Anglais (US)', 'Espagnol'])
  const LANG_OPTIONS = ['Anglais (US)', 'Espagnol', 'Portugais (BR)', 'Allemand', 'Italien', 'Arabe']
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleLang(l: string) {
    setLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  }

  async function run() {
    if (!langs.length) return
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Tu es expert en marketing Instagram international. Adapte cette caption (pas juste une traduction — adapte le ton, les expressions, la culture) pour chaque marché demandé. Inclus des hashtags locaux pertinents pour chaque langue.

Caption originale (français) :
"${caption.trim()}"

Marchés cibles : ${langs.join(', ')}

Pour chaque langue, format :
🌍 [LANGUE]
[caption adaptée]
[hashtags locaux]
`,
        800)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Multi-Market Translator" icon={<Icon name="globe" />} onBack={onBack} error={error}>
      <FormSection label="Caption and target markets">
        <p className="text-[12px] text-text2 font-mono">Adaptation culturelle + hashtags locaux — pas juste une traduction.</p>
        <FieldInput placeholder="Paste your caption here…" value={caption} onChange={setCaption} textarea rows={4} />
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold mb-2.5 text-text3 font-mono">Langues cibles</p>
          <div className="flex flex-wrap gap-2">
            {LANG_OPTIONS.map(l => (
              <button key={l} onClick={() => toggleLang(l)}
                className="cursor-pointer px-3.5 py-2 rounded-xl text-[12px] font-semibold font-mono transition-all"
                style={langs.includes(l)
                  ? { background: 'linear-gradient(130deg,#6366F1,#6366F1)', color: '#fff', boxShadow: '0 2px 12px -4px rgba(99,102,241,0.5)' }
                  : { background: 'rgba(99,102,241,0.06)', color: 'rgba(99,102,241,0.5)', border: '1px solid rgba(99,102,241,0.12)' }
                }>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!caption.trim() || !langs.length}><span className="inline-flex items-center gap-1.5"><Icon name="globe" size={15} />Traduire & adapter</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={14} />}
    </ToolShell>
  )
}

function CompetitorAnalysis({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [handle, setHandle] = useState('')
  const [niche, setNiche] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult('')
    try {
      const text = await groqCall(groqKey,
        `Tu es un expert en espionnage concurrentiel Instagram. Analyse en profondeur le compte/niche : "${handle.trim()}"${niche.trim() ? ` (niche: ${niche.trim()})` : ''}.

Produis une analyse complète :

🕵️ POSITIONNEMENT
[comment ils se positionnent, leur proposition de valeur unique]

📹 STRATÉGIE CONTENU
[types de vidéos, formats, fréquence, longueur, style]

🪝 FORMULES DE HOOKS
[les patterns de hooks qu’ils utilisent le plus]

📊 POINTS FORTS À COPIER
[ce qu’ils font bien et que tu peux répliquer]

💥 GAPS & OPPORTUNITÉS
[ce qu’ils ne font pas et que tu peux exploiter pour les dépasser]

🎯 PLAN D’ACTION
[3 actions concrètes à mettre en place cette semaine]`,
        800)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Competitor Analysis" icon={<Icon name="search-check" />} onBack={onBack} error={error}>
      <FormSection label="Account to analyze">
        <p className="text-[12px] text-text2 font-mono">Gaps, hook formulas, action plan — to outperform a competitor.</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput placeholder="@concurrent ou compte" value={handle} onChange={setHandle} />
          <FieldInput placeholder="Niche (optionnel)" value={niche} onChange={setNiche} />
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!handle.trim()}><span className="inline-flex items-center gap-1.5"><Icon name="search-check" size={15} />Analyser le concurrent</span></Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={14} />}
    </ToolShell>
  )
}

// ── Hub tool metadata ─────────────────────────────────────────────────────────
const GROQ_TOOLS: { id: GroqToolId; icon: React.ReactNode; title: string; desc: string; tags: string[] }[] = [
  { id: 'script',     icon: <Icon name="clapperboard" />,   title: 'Script Reel',            desc: 'Full camera-ready script — hook, body, CTA with timings.',              tags: ['Script', 'Hook', 'CTA'] },
  { id: 'hooks',      icon: <Icon name="anchor" />,         title: '3 Hooks A/B/C',          desc: '3 radically different hooks to test the best one.',                     tags: ['A/B Test', 'Hook', 'Copywriting'] },
  { id: 'caption',    icon: <Icon name="message-square" />, title: 'Captions Virales',        desc: 'Full caption: hook, body, CTA and 15 hashtags.',                        tags: ['Caption', 'Hashtags'] },
  { id: 'bio',        icon: <Icon name="user" />,           title: 'Bio Optimizer',           desc: 'Rewrites your bio to maximize follows, sales or traffic.',              tags: ['Bio', 'Profil', 'SEO'] },
  { id: 'replies',    icon: <Icon name="message-square" />, title: 'Comment Replies',         desc: 'Personalized replies for 20 comments in one click.',                   tags: ['Engagement', 'Commentaires'] },
  { id: 'translate',  icon: <Icon name="globe" />,          title: 'Multi-Market Translator', desc: 'Adapts your caption for EN/ES/PT/DE/IT with local hashtags.',          tags: ['International', 'Traduction'] },
  { id: 'competitor', icon: <Icon name="search-check" />,   title: 'Competitor Analysis',    desc: 'Gaps, hook formulas, action plan to outperform an account.',           tags: ['Concurrent', 'Stratégie'] },
  { id: 'strat',      icon: <Icon name="search" />,         title: 'Niche Strategy',          desc: 'Frequency, times, hashtags and Reels ideas for a niche.',              tags: ['Niche', 'Planning'] },
  { id: 'plan',       icon: <Icon name="calendar" />,       title: '7-Day Planner',           desc: 'Full 7-day editorial calendar with times and ideas.',                  tags: ['Calendrier', 'Contenu'] },
]

const VISION_TOOLS_META: { id: VisionToolId; icon: React.ReactNode; title: string; desc: string; tags: string[]; needsAnthopic: boolean }[] = [
  { id: 'vision-score',     icon: <Icon name="flame" />, title: 'Viral Score',      desc: 'Score 1-10 on 5 criteria: hook, retention, text, thumbnail, dynamism.', tags: ['Vidéo', 'Score', 'Claude'], needsAnthopic: true },
  { id: 'vision-structure', icon: <Icon name="dna" />,   title: 'Viral Structure',  desc: 'Breaks down a video’s timeline: hook, value, CTA, transitions.',        tags: ['Vidéo', 'Timeline', 'Claude'], needsAnthopic: true },
  { id: 'vision-thumb',     icon: <Icon name="image" />, title: 'Audit Thumbnail',   desc: 'Score contrast, readability, emotion, colors + priority fixes.',         tags: ['Image', 'CTR', 'Claude'], needsAnthopic: true },
]

// ── Premium bento tool card ────────────────────────────────────────────────────
function ToolCard({ icon, title, desc, tags, locked, onClick }: {
  icon: React.ReactNode; title: string; desc: string; tags: string[]; locked?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} className="cursor-pointer text-left w-full group relative rounded-2xl p-4 transition-all card-lift sf-card-lift sf-spotlight overflow-hidden"
      style={{
        background: '#0E0E16',
        border: '1px solid rgba(99,102,241,0.12)',
        opacity: locked ? 0.6 : 1,
      }}>
      {/* Hover glow overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ background: 'radial-gradient(ellipse 160px 100px at 20% 30%, rgba(99,102,241,0.08), transparent)' }} />

      <div className="relative space-y-3">
        {/* Icon row */}
        <div className="flex items-start justify-between gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
            style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.08))', border: '1px solid rgba(99,102,241,0.22)', color: '#818CF8' }}>
            {icon}
          </div>
          {locked && (
            <span className="text-[9px] px-2 py-1 rounded-lg font-bold font-mono uppercase tracking-wider flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.18)' }}>
              Anthropic Key
            </span>
          )}
        </div>

        {/* Text */}
        <div>
          <p className="text-[13px] font-bold text-text group-hover:text-accent transition-colors duration-200">{title}</p>
          <p className="text-[11px] mt-1 leading-relaxed text-text2">{desc}</p>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="sf-badge sf-badge-muted text-[9px] px-2 py-0.5 rounded-full font-bold font-mono uppercase tracking-wider">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

// ── Section header with divider line ──────────────────────────────────────────
function SectionHeader({ label, badge, icon }: { label: string; badge?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4 sf-anim-slide-up">
      {icon && (
        <span className="text-text3" style={{ opacity: 0.7 }}>{icon}</span>
      )}
      <p className="text-[10px] uppercase tracking-widest font-black text-text3 font-mono whitespace-nowrap">{label}</p>
      {badge && (
        <span className="sf-badge sf-badge-warn text-[9px] font-bold font-mono px-2 py-0.5 rounded-md uppercase tracking-wider">
          {badge}
        </span>
      )}
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.2), transparent)' }} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AiTools({ user }: AiToolsProps) {
  const t = useT()
  const { lang } = useLang()
  const [active, setActive] = useState<ActiveTool>('hub')
  const conns = useConnections(user)

  // Loading state
  if (conns.loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-5">
            <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.08))', border: '1px solid rgba(99,102,241,0.2)' }}>
              <span className="relative z-10 text-accent"><Icon name="sparkles" size={24} /></span>
              <div className="absolute inset-0 animate-pulse rounded-2xl"
                style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.06))' }} />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-text2">{t('loading')}</p>
              <p className="text-[11px] text-text3 font-mono mt-1 tracking-wider">Connecting to studio</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No Groq key state
  if (!conns.groq) {
    return (
      <div className="h-full flex flex-col overflow-y-auto bg-bg anim-page">
        {/* Page header */}
        <div className="flex-shrink-0 px-8 pt-8 pb-6 sf-topbar">
          <div className="flex items-center gap-4">
            <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 sf-anim-scale-spring"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.12))', border: '1px solid rgba(99,102,241,0.28)' }}>
              <span className="text-accent relative z-10"><Icon name="sparkles" size={22} /></span>
              <div className="absolute inset-0 anim-glow rounded-2xl" />
            </div>
            <div className="sf-anim-slide-up sf-d50">
              <h1 className="text-[22px] font-black leading-none sf-text-gradient">{t('aiToolsTitle')}</h1>
              <p className="text-[11px] text-text3 font-mono mt-0.5 tracking-widest uppercase">AI Creative Studio</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-8 pb-10 pt-8">
          <div className="max-w-lg">
            <div className="sf-card rounded-2xl p-6 anim-scale-in"
              style={{ background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.18)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.22)' }}>
                  <span className="text-warn"><Icon name="alert-triangle" size={16} /></span>
                </div>
                <p className="text-[14px] font-bold text-warn">{t('noGroqKey')}</p>
              </div>
              <p className="text-[13px] text-text2 mb-2">{t('configureGroq')}</p>
              <p className="text-[11px] font-mono" style={{ color: 'rgba(99,102,241,0.6)' }}>
                Free on groq.com → API Keys → Create
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Route — metadata
  if (active === 'metadata') return <MetadataChanger user={user} onBack={() => setActive('hub')} />

  // Route — text copy
  if (active === 'textcopy') return <TextCopy user={user} onBack={() => setActive('hub')} />

  // Route — vision tools
  if (active === 'vision-score' || active === 'vision-structure' || active === 'vision-thumb') {
    return <VisionTools user={user} tool={active} anthropicKey={conns.anthropic} onBack={() => setActive('hub')} />
  }

  // Route — groq tools
  const back = () => setActive('hub')
  if (active === 'strat')      return <StratConcurrente  groqKey={conns.groq} onBack={back} />
  if (active === 'caption')    return <CaptionsVirales   groqKey={conns.groq} onBack={back} />
  if (active === 'plan')       return <Planificateur     groqKey={conns.groq} onBack={back} userId={user.id} />
  if (active === 'script')     return <ScriptReel        groqKey={conns.groq} onBack={back} />
  if (active === 'hooks')      return <HooksAB           groqKey={conns.groq} onBack={back} />
  if (active === 'bio')        return <BioOptimizer      groqKey={conns.groq} onBack={back} />
  if (active === 'replies')    return <CommentReplies    groqKey={conns.groq} onBack={back} />
  if (active === 'translate')  return <ContentTranslator groqKey={conns.groq} onBack={back} />
  if (active === 'competitor') return <CompetitorAnalysis groqKey={conns.groq} onBack={back} />

  // ── Hub ────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-y-auto bg-bg anim-page">

      {/* ── Premium page header ── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6 sf-topbar">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Icon with glow */}
            <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden sf-anim-scale-spring"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(99,102,241,0.13))', border: '1px solid rgba(99,102,241,0.3)' }}>
              <span className="relative z-10 text-accent"><Icon name="sparkles" size={22} /></span>
              <div className="absolute inset-0 anim-glow rounded-2xl" />
            </div>

            <div className="sf-anim-slide-up sf-d50">
              <h1 className="text-[26px] font-black leading-none sf-text-gradient">{t('aiToolsTitle')}</h1>
              <p className="text-[11px] text-text3 font-mono mt-1 tracking-widest uppercase">AI Creative Studio</p>
            </div>
          </div>

          {/* Anthropic key warning badge */}
          {!conns.anthropic && (
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-2 flex-shrink-0 sf-anim-scale-in sf-d150"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
              <span className="text-warn"><Icon name="alert-triangle" size={13} /></span>
              <p className="text-[11px] font-mono font-semibold" style={{ color: 'rgba(245,158,11,0.8)' }}>Missing Anthropic key</p>
            </div>
          )}
        </div>

        {/* Subtitle / description */}
        <p className="mt-4 text-[13px] text-text2 max-w-xl leading-relaxed sf-anim-slide-up sf-d100">
          Supercharge your content with AI-powered tools — from viral scripts and captions to competitor intelligence.
        </p>
      </div>

      {/* ── Content (scrolls with the page) ── */}
      <div className="flex-1 px-8 pb-10">
        <div className="pt-7 space-y-10 max-w-6xl">

          {/* ── Video Processing section ── */}
          <section>
            <SectionHeader label="Video Processing" badge="FFmpeg" icon={<Icon name="video" size={13} />} />
            <div className="grid grid-cols-3 gap-4 anim-stagger">
              <ToolCard
                icon={<Icon name="tag" />}
                title="Metadata Changer"
                desc="Removes all metadata and injects a random timestamp."
                tags={['FFmpeg', 'Stream copy', 'Instant']}
                onClick={() => setActive('metadata')}
              />
              <ToolCard
                icon={<Icon name="pen-line" />}
                title="Texte IA"
                desc="Add text at multiple positions to create unique video copies."
                tags={['FFmpeg', 'Texte', 'Anti-ban']}
                onClick={() => setActive('textcopy')}
              />
            </div>
          </section>

          {/* ── Vision / Claude tools section ── */}
          <section>
            <SectionHeader label="Vision Analysis" badge="Claude AI" icon={<Icon name="cpu" size={13} />} />
            <div className="grid grid-cols-3 gap-4 anim-stagger">
              {VISION_TOOLS_META.map(tool => (
                <ToolCard
                  key={tool.id}
                  icon={tool.icon}
                  title={tool.title}
                  desc={tool.desc}
                  tags={tool.tags}
                  locked={tool.needsAnthopic && !conns.anthropic}
                  onClick={() => setActive(tool.id)}
                />
              ))}
            </div>
          </section>

          {/* ── Groq / LLM tools section ── */}
          <section>
            <SectionHeader label="Content Generation" badge="Groq LLM" icon={<Icon name="zap" size={13} />} />
            <div className="grid grid-cols-3 gap-4 anim-stagger">
              {GROQ_TOOLS.map(tool => (
                <ToolCard
                  key={tool.id}
                  icon={tool.icon}
                  title={tool.title}
                  desc={tool.desc}
                  tags={tool.tags}
                  onClick={() => setActive(tool.id)}
                />
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
