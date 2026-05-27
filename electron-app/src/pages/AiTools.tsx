import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { Button } from '@/components/ui/Button'
import { MetadataChanger } from './MetadataChanger'
import { VisionTools, type VisionToolId } from './VisionTools'
import { TextCopy } from './TextCopy'

interface AiToolsProps { user: User }

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      className="rounded-xl px-4 py-2.5 text-[12px] font-bold font-mono uppercase tracking-wider transition-all flex items-center gap-2"
      style={{
        background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(139,92,246,0.08)',
        color: copied ? '#22C55E' : '#a78bfa',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.25)' : 'rgba(139,92,246,0.2)'}`,
      }}>
      <span>{copied ? '✓' : '⎘'}</span>
      <span>{copied ? 'COPIÉ' : 'COPIER'}</span>
    </button>
  )
}

function ResultBox({ value, rows = 8 }: { value: string; rows?: number }) {
  return (
    <div className="relative rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(139,92,246,0.15)' }}>
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(239,68,68,0.5)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(245,158,11,0.5)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(34,197,94,0.5)' }} />
        </div>
        <span className="text-[10px] font-mono text-text3 uppercase tracking-widest ml-2">Output IA</span>
        <div className="ml-auto">
          <div className="w-1.5 h-1.5 rounded-full sf-live-dot" style={{ position: 'relative' }} />
        </div>
      </div>
      <textarea
        rows={rows}
        value={value}
        readOnly
        className="w-full px-5 py-4 text-[12px] font-mono resize-none focus:outline-none leading-relaxed"
        style={{ background: 'transparent', color: '#c4b5fd' }}
      />
    </div>
  )
}

function FieldInput({ placeholder, value, onChange, textarea, rows }: {
  placeholder: string; value: string; onChange: (v: string) => void; textarea?: boolean; rows?: number
}) {
  const cls = "sf-search w-full rounded-xl px-4 py-2.5 text-[13px] font-mono"
  return textarea
    ? <textarea rows={rows ?? 4} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className={cls} />
    : <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className={cls} />
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="sf-search w-full rounded-xl px-4 py-2.5 text-[13px] font-mono focus:outline-none">
      {options.map(o => <option key={o} value={o} style={{ background: '#0E0E16' }}>{o}</option>)}
    </select>
  )
}

function ToolShell({ title, icon, children, onBack, error }: {
  title: string; icon: string; children: React.ReactNode; onBack: () => void; error?: string | null
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6 sf-topbar">
        <div className="flex items-center gap-4">
          <button onClick={onBack}
            className="rounded-xl px-4 py-2.5 text-[12px] font-bold font-mono uppercase tracking-wider flex-shrink-0 transition-all"
            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
            ← Retour
          </button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.3)' }}>
            {icon}
          </div>
          <div>
            <h1 className="text-[20px] font-black text-text leading-none">{title}</h1>
            <p className="text-[11px] text-text3 font-mono mt-0.5 uppercase tracking-widest">Outils IA — Studio</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-7">
        <div className="max-w-2xl space-y-4">
          {error && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-danger text-sm flex-shrink-0">⚠</span>
              <p className="text-[12px] font-mono text-danger">{error}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Form section wrapper ───────────────────────────────────────────────────────
function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sf-card rounded-2xl p-5 space-y-3">
      <p className="text-[10px] uppercase tracking-widest font-bold text-text3 font-mono">{label}</p>
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
        `Expert Instagram growth hacking. Analyse la stratégie pour la niche/compte : ${handle.trim()}. Recommandations structurées : 1) Type de contenu à créer, 2) Fréquence idéale, 3) Heures de publication optimales, 4) Stratégie hashtags, 5) Idées Reels viraux, 6) Tactiques d'engagement. Bullet points clairs.`,
        700)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Stratégie Niche" icon="🔍" onBack={onBack} error={error}>
      <FormSection label="Niche ou compte concurrent">
        <p className="text-[12px] text-text2 font-mono">Entre un pseudo concurrent ou une niche pour une stratégie complète.</p>
        <FieldInput placeholder="@concurrent ou niche (ex: fitness, crypto)" value={handle} onChange={setHandle} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!handle.trim()}>🔍 Analyser la niche</Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={12} />}
    </ToolShell>
  )
}

function CaptionsVirales({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const TONES = ['Engageant', 'Humoristique', 'Informatif', 'Mystérieux', 'Inspirant', 'Provocateur']
  const [subject, setSubject] = useState('')
  const [tone, setTone] = useState('Engageant')
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
    <ToolShell title="Captions Virales" icon="💬" onBack={onBack} error={error}>
      <FormSection label="Configuration de la caption">
        <p className="text-[12px] text-text2 font-mono">Hook + corps + CTA + 15 hashtags générés automatiquement.</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput placeholder="Sujet du post" value={subject} onChange={setSubject} />
          <SelectInput value={tone} onChange={setTone} options={TONES} />
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!subject.trim()}>✨ Générer la caption</Button>
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
    <ToolShell title="Planificateur 7 Jours" icon="📅" onBack={onBack} error={error}>
      <FormSection label="Niche éditoriale">
        <p className="text-[12px] text-text2 font-mono">Calendrier éditorial complet — 7 jours avec heures, types et idées.</p>
        <FieldInput placeholder="Niche (fitness, crypto, lifestyle…)" value={niche} onChange={setNiche} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!niche.trim()}>📅 Générer le planning</Button>
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
  const [tone, setTone] = useState('Engageant')
  const TONES = ['Engageant', 'Humoristique', 'Informatif', 'Inspirant', 'Provocateur', 'Éducatif']
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
🚀 CTA (dernières secondes) : appel à l'action précis (follow, like, commentaire)

Format le script comme si c'était prêt à lire face caméra. Inclus les indications de timing. Maximum ${duration === '15s' ? '80' : duration === '30s' ? '150' : '280'} mots.`,
        600)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Script Reel Complet" icon="🎬" onBack={onBack} error={error}>
      <FormSection label="Paramètres du Reel">
        <p className="text-[12px] text-text2 font-mono">Script prêt à lire face caméra — hook, corps, CTA avec timings précis.</p>
        <FieldInput placeholder="Sujet de ta vidéo" value={subject} onChange={setSubject} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-2.5 text-text3 font-mono">Durée cible</p>
            <div className="flex gap-2">
              {['15s', '30s', '60s'].map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold font-mono transition-all"
                  style={duration === d
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 14px -4px rgba(124,58,237,0.5)' }
                    : { background: 'rgba(139,92,246,0.06)', color: 'rgba(139,92,246,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
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
          <Button onClick={run} loading={loading} disabled={!subject.trim()}>🎬 Générer le script</Button>
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
        `Tu es expert en copywriting Instagram. Pour le sujet : "${subject.trim()}", génère exactement 3 hooks d'accroche radicalement différents pour un Reel.

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
    <ToolShell title="3 Hooks A/B/C" icon="🪝" onBack={onBack} error={error}>
      <FormSection label="Sujet de ta vidéo">
        <p className="text-[12px] text-text2 font-mono">3 styles radicalement différents — trouve celui qui performe le mieux.</p>
        <FieldInput placeholder="Sujet de ta vidéo" value={subject} onChange={setSubject} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!subject.trim()}>🪝 Générer les hooks</Button>
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
    <ToolShell title="Bio Optimizer" icon="👤" onBack={onBack} error={error}>
      <FormSection label="Bio et objectif">
        <p className="text-[12px] text-text2 font-mono">Réécrit ta bio pour maximiser les conversions selon ton objectif.</p>
        <FieldInput placeholder="Ta bio actuelle (colle-la ici)" value={bio} onChange={setBio} textarea rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput placeholder="Niche / domaine" value={niche} onChange={setNiche} />
          <SelectInput value={goal} onChange={setGoal} options={['Followers', 'Ventes', 'Trafic lien bio', 'DMs', 'Notoriété']} />
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!bio.trim()}>👤 Optimiser la bio</Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={10} />}
    </ToolShell>
  )
}

function CommentReplies({ groqKey, onBack }: { groqKey: string; onBack: () => void }) {
  const [comments, setComments] = useState('')
  const [tone, setTone] = useState('Sympathique')
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
    <ToolShell title="Réponses Commentaires" icon="💬" onBack={onBack} error={error}>
      <FormSection label="Commentaires à traiter">
        <p className="text-[12px] text-text2 font-mono">Jusqu'à 20 commentaires (un par ligne) — réponse personnalisée pour chacun.</p>
        <FieldInput placeholder={"Commentaire 1\nCommentaire 2\nCommentaire 3…"} value={comments} onChange={setComments} textarea rows={5} />
        <SelectInput value={tone} onChange={setTone} options={['Sympathique', 'Professionnel', 'Humoristique', 'Motivant', 'Mystérieux']} />
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!comments.trim()}>💬 Générer les réponses</Button>
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
    <ToolShell title="Traducteur Multi-Marché" icon="🌍" onBack={onBack} error={error}>
      <FormSection label="Caption et marchés cibles">
        <p className="text-[12px] text-text2 font-mono">Adaptation culturelle + hashtags locaux — pas juste une traduction.</p>
        <FieldInput placeholder="Colle ta caption française ici…" value={caption} onChange={setCaption} textarea rows={4} />
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold mb-2.5 text-text3 font-mono">Langues cibles</p>
          <div className="flex flex-wrap gap-2">
            {LANG_OPTIONS.map(l => (
              <button key={l} onClick={() => toggleLang(l)}
                className="px-3.5 py-2 rounded-xl text-[12px] font-semibold font-mono transition-all"
                style={langs.includes(l)
                  ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff', boxShadow: '0 2px 12px -4px rgba(124,58,237,0.5)' }
                  : { background: 'rgba(139,92,246,0.06)', color: 'rgba(139,92,246,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                }>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!caption.trim() || !langs.length}>🌍 Traduire & adapter</Button>
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
[les patterns de hooks qu'ils utilisent le plus]

📊 POINTS FORTS À COPIER
[ce qu'ils font bien et que tu peux répliquer]

💥 GAPS & OPPORTUNITÉS
[ce qu'ils ne font pas et que tu peux exploiter pour les dépasser]

🎯 PLAN D'ACTION
[3 actions concrètes à mettre en place cette semaine]`,
        800)
      setResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <ToolShell title="Analyse Concurrent" icon="🕵️" onBack={onBack} error={error}>
      <FormSection label="Compte à analyser">
        <p className="text-[12px] text-text2 font-mono">Gaps, formules de hooks, plan d'action — pour dépasser un concurrent.</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput placeholder="@concurrent ou compte" value={handle} onChange={setHandle} />
          <FieldInput placeholder="Niche (optionnel)" value={niche} onChange={setNiche} />
        </div>
        <div className="flex gap-2.5">
          <Button onClick={run} loading={loading} disabled={!handle.trim()}>🕵️ Analyser le concurrent</Button>
          {result && <CopyButton text={result} />}
        </div>
      </FormSection>
      {result && <ResultBox value={result} rows={14} />}
    </ToolShell>
  )
}

// ── Hub tool metadata ─────────────────────────────────────────────────────────
const GROQ_TOOLS: { id: GroqToolId; icon: string; title: string; desc: string; tags: string[] }[] = [
  { id: 'script',     icon: '🎬', title: 'Script Reel',           desc: 'Script complet prêt à lire — hook, corps, CTA avec timings.',       tags: ['Script', 'Hook', 'CTA'] },
  { id: 'hooks',      icon: '🪝', title: '3 Hooks A/B/C',         desc: '3 hooks radicalement différents pour tester le meilleur.',          tags: ['A/B Test', 'Hook', 'Copywriting'] },
  { id: 'caption',    icon: '💬', title: 'Captions Virales',       desc: 'Caption complète : hook, corps, CTA et 15 hashtags.',               tags: ['Caption', 'Hashtags'] },
  { id: 'bio',        icon: '👤', title: 'Bio Optimizer',          desc: 'Réécrit ta bio pour maximiser follows, ventes ou trafic.',          tags: ['Bio', 'Profil', 'SEO'] },
  { id: 'replies',    icon: '💬', title: 'Réponses Commentaires',  desc: 'Réponses personnalisées pour 20 commentaires en un clic.',          tags: ['Engagement', 'Commentaires'] },
  { id: 'translate',  icon: '🌍', title: 'Traducteur Multi-Marché',desc: 'Adapte ta caption pour EN/ES/PT/DE/IT avec hashtags locaux.',       tags: ['International', 'Traduction'] },
  { id: 'competitor', icon: '🕵️', title: 'Analyse Concurrent',    desc: 'Gaps, formules de hooks, plan d\'action pour dépasser un compte.',  tags: ['Concurrent', 'Stratégie'] },
  { id: 'strat',      icon: '🔍', title: 'Stratégie Niche',        desc: 'Fréquence, heures, hashtags et idées Reels pour une niche.',        tags: ['Niche', 'Planning'] },
  { id: 'plan',       icon: '📅', title: 'Planificateur 7 Jours',  desc: 'Calendrier éditorial complet sur 7 jours avec heures et idées.',    tags: ['Calendrier', 'Contenu'] },
]

const VISION_TOOLS_META: { id: VisionToolId; icon: string; title: string; desc: string; tags: string[]; needsAnthopic: boolean }[] = [
  { id: 'vision-score',     icon: '🔥', title: 'Score Viral',     desc: 'Note 1-10 sur 5 critères : hook, rétention, texte, thumbnail, dynamisme.', tags: ['Vidéo', 'Score', 'Claude'], needsAnthopic: true },
  { id: 'vision-structure', icon: '🧬', title: 'Structure Virale', desc: 'Décompose la timeline d\'une vidéo : hook, valeur, CTA, transitions.',      tags: ['Vidéo', 'Timeline', 'Claude'], needsAnthopic: true },
  { id: 'vision-thumb',     icon: '🖼', title: 'Audit Thumbnail',  desc: 'Score contraste, lisibilité, émotion, couleurs + corrections prioritaires.',  tags: ['Image', 'CTR', 'Claude'], needsAnthopic: true },
]

// ── Premium tool card ─────────────────────────────────────────────────────────
function ToolCard({ icon, title, desc, tags, locked, onClick }: {
  icon: string; title: string; desc: string; tags: string[]; locked?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="sf-card rounded-2xl p-4 text-left space-y-3 transition-all card-lift group"
      style={{ opacity: locked ? 0.55 : 1 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 transition-all group-hover:scale-110"
          style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.18),rgba(168,85,247,0.08))', border: '1px solid rgba(139,92,246,0.2)' }}>
          {icon}
        </div>
        {locked && (
          <span className="text-[9px] px-2 py-1 rounded-lg font-bold font-mono uppercase tracking-wider flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.18)' }}>
            Clé Anthropic
          </span>
        )}
      </div>
      <div>
        <p className="text-[13px] font-bold text-text group-hover:text-accent-glow transition-colors">{title}</p>
        <p className="text-[11px] mt-1 leading-relaxed text-text2">{desc}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-bold font-mono uppercase tracking-wider"
            style={{ background: 'rgba(139,92,246,0.08)', color: 'rgba(167,139,250,0.6)', border: '1px solid rgba(139,92,246,0.12)' }}>
            {t}
          </span>
        ))}
      </div>
    </button>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-[10px] uppercase tracking-widest font-black text-text3 font-mono">{label}</p>
      {badge && (
        <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded-md uppercase tracking-wider"
          style={{ background: 'rgba(245,158,11,0.08)', color: 'rgba(245,158,11,0.7)', border: '1px solid rgba(245,158,11,0.15)' }}>
          {badge}
        </span>
      )}
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.2), transparent)' }} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AiTools({ user }: AiToolsProps) {
  const [active, setActive] = useState<ActiveTool>('hub')
  const conns = useConnections(user)

  if (conns.loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.08))', border: '1px solid rgba(139,92,246,0.2)' }}>
              <span className="relative z-10">✨</span>
              <div className="absolute inset-0 animate-pulse rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(236,72,153,0.06))' }} />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-text2">Chargement des outils IA…</p>
              <p className="text-[11px] text-text3 font-mono mt-1">Connexion au studio</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!conns.groq) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">
        <div className="flex-shrink-0 px-8 pt-8 pb-6 sf-topbar">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>
              ✨
            </div>
            <div>
              <h1 className="text-[22px] font-black text-text leading-none">Outils IA</h1>
              <p className="text-[12px] text-text3 font-mono mt-0.5 tracking-widest uppercase">AI Creative Studio</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 pb-10 pt-8">
          <div className="max-w-lg sf-card rounded-2xl p-6 border border-warn/20" style={{ background: 'rgba(245,158,11,0.04)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>⚠</div>
              <p className="text-[14px] font-bold text-warn">Clé Groq API manquante</p>
            </div>
            <p className="text-[13px] text-text2 mb-2">Va dans <strong className="text-text">Paramètres → Connexions → Clés API</strong> et colle ta clé Groq.</p>
            <p className="text-[11px] font-mono" style={{ color: 'rgba(139,92,246,0.6)' }}>Gratuit sur groq.com → API Keys → Create</p>
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

  // ── Hub ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg anim-page">

      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6 sf-topbar">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(236,72,153,0.12))', border: '1px solid rgba(139,92,246,0.3)' }}>
            <span className="relative z-10">✨</span>
            <div className="absolute inset-0 anim-glow rounded-2xl" />
          </div>
          <div>
            <h1 className="text-[26px] font-black leading-none sf-text-gradient">Outils IA</h1>
            <p className="text-[12px] text-text3 font-mono mt-1 tracking-widest uppercase">AI Creative Studio</p>
          </div>
          {!conns.anthropic && (
            <div className="ml-4 rounded-xl px-3 py-1.5 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <span className="text-warn text-xs">⚠</span>
              <p className="text-[11px] font-mono" style={{ color: 'rgba(245,158,11,0.75)' }}>Clé Anthropic manquante</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-10">
        <div className="pt-7 space-y-8 max-w-6xl">

          {/* ── Vidéo section ── */}
          <div>
            <SectionHeader label="Traitement Vidéo" badge="FFmpeg" />
            <div className="grid grid-cols-3 gap-4 anim-stagger">
              <ToolCard
                icon="🏷"
                title="Changeur de Métadonnées"
                desc="Supprime toutes les métadonnées et injecte un timestamp aléatoire."
                tags={['FFmpeg', 'Stream copy', 'Instant']}
                onClick={() => setActive('metadata')}
              />
              <ToolCard
                icon="✍"
                title="Texte IA — Dupliquer"
                desc="Ajoute un texte sur tes vidéos avec plusieurs positions pour créer des copies uniques."
                tags={['FFmpeg', 'Canvas', 'Mass']}
                onClick={() => setActive('textcopy')}
              />
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}
