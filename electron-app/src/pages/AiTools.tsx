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
    model: 'llama-3.3-70b-versatile',
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
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      className="rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all"
      style={{ background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)', color: copied ? '#34d399' : '#e2e8f0', border: `1px solid ${copied ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.09)'}` }}>
      {copied ? '✓ Copié' : '📋 Copier'}
    </button>
  )
}

function ResultBox({ value, rows = 8 }: { value: string; rows?: number }) {
  return (
    <textarea rows={rows} value={value} readOnly
      className="w-full rounded-xl px-4 py-3 text-[13px] font-mono text-white/80 resize-none focus:outline-none"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
  )
}

function FieldInput({ placeholder, value, onChange, textarea, rows }: {
  placeholder: string; value: string; onChange: (v: string) => void; textarea?: boolean; rows?: number
}) {
  const cls = "w-full rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-text2 focus:outline-none"
  const style = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }
  return textarea
    ? <textarea rows={rows ?? 4} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className={cls} style={style} />
    : <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className={cls} style={style} />
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
      {options.map(o => <option key={o} value={o} style={{ background: '#0c0e1a' }}>{o}</option>)}
    </select>
  )
}

function ToolShell({ title, icon, children, onBack, error }: {
  title: string; icon: string; children: React.ReactNode; onBack: () => void; error?: string | null
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onBack}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}>
          ← Retour
        </button>
        <span className="text-2xl">{icon}</span>
        <h1 className="text-[22px] font-black text-white leading-none">{title}</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-10 pb-10 pt-8">
        <div className="max-w-2xl space-y-5">
          {error && (
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <p className="text-[13px]">{error}</p>
            </div>
          )}
          {children}
        </div>
      </div>
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
    <ToolShell title="Stratégie Concurrente" icon="🔍" onBack={onBack} error={error}>
      <p className="text-[13px] text-text2">Entre un pseudo concurrent ou une niche pour obtenir une stratégie complète.</p>
      <FieldInput placeholder="@concurrent ou niche (ex: fitness, crypto)" value={handle} onChange={setHandle} />
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!handle.trim()}>🔍 Analyser</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Génère une caption complète avec hook, corps, CTA et hashtags.</p>
      <div className="grid grid-cols-2 gap-3">
        <FieldInput placeholder="Sujet du post" value={subject} onChange={setSubject} />
        <SelectInput value={tone} onChange={setTone} options={TONES} />
      </div>
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!subject.trim()}>✨ Générer</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Calendrier éditorial complet sur 7 jours pour ta niche.</p>
      <FieldInput placeholder="Niche (fitness, crypto, lifestyle…)" value={niche} onChange={setNiche} />
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!niche.trim()}>📅 Planifier</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Génère un script complet prêt à lire face caméra — hook, corps, CTA avec timings.</p>
      <FieldInput placeholder="Sujet de ta vidéo" value={subject} onChange={setSubject} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-wider font-bold mb-2 text-text2">Durée</p>
          <div className="flex gap-2">
            {['15s', '30s', '60s'].map(d => (
              <button key={d} onClick={() => setDuration(d)} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold"
                style={duration === d
                  ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
                }>{d}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-wider font-bold mb-2 text-text2">Ton</p>
          <SelectInput value={tone} onChange={setTone} options={TONES} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!subject.trim()}>🎬 Générer le script</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Génère 3 hooks radicalement différents pour tester lequel performe le mieux.</p>
      <FieldInput placeholder="Sujet de ta vidéo" value={subject} onChange={setSubject} />
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!subject.trim()}>🪝 Générer les hooks</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Réécrit ta bio Instagram pour maximiser les conversions selon ton objectif.</p>
      <FieldInput placeholder="Ta bio actuelle (colle-la ici)" value={bio} onChange={setBio} textarea rows={3} />
      <div className="grid grid-cols-2 gap-3">
        <FieldInput placeholder="Niche / domaine" value={niche} onChange={setNiche} />
        <SelectInput value={goal} onChange={setGoal} options={['Followers', 'Ventes', 'Trafic lien bio', 'DMs', 'Notoriété']} />
      </div>
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!bio.trim()}>👤 Optimiser la bio</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Colle jusqu'à 20 commentaires (un par ligne), l'IA génère une réponse personnalisée pour chacun.</p>
      <FieldInput placeholder={"Commentaire 1\nCommentaire 2\nCommentaire 3…"} value={comments} onChange={setComments} textarea rows={5} />
      <SelectInput value={tone} onChange={setTone} options={['Sympathique', 'Professionnel', 'Humoristique', 'Motivant', 'Mystérieux']} />
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!comments.trim()}>💬 Générer les réponses</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Adapte ta caption pour plusieurs marchés avec hashtags locaux — pas juste une traduction.</p>
      <FieldInput placeholder="Colle ta caption française ici…" value={caption} onChange={setCaption} textarea rows={4} />
      <div>
        <p className="text-[12px] uppercase tracking-wider font-bold mb-3 text-text2">Langues cibles</p>
        <div className="flex flex-wrap gap-2">
          {LANG_OPTIONS.map(l => (
            <button key={l} onClick={() => toggleLang(l)}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
              style={langs.includes(l)
                ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
              }>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!caption.trim() || !langs.length}>🌍 Traduire & adapter</Button>
        {result && <CopyButton text={result} />}
      </div>
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
      <p className="text-[13px] text-text2">Analyse complète d'un concurrent — ce qu'il fait bien, les gaps à exploiter et un plan d'action.</p>
      <div className="grid grid-cols-2 gap-3">
        <FieldInput placeholder="@concurrent ou compte" value={handle} onChange={setHandle} />
        <FieldInput placeholder="Niche (optionnel)" value={niche} onChange={setNiche} />
      </div>
      <div className="flex gap-2">
        <Button onClick={run} loading={loading} disabled={!handle.trim()}>🕵️ Analyser</Button>
        {result && <CopyButton text={result} />}
      </div>
      {result && <ResultBox value={result} rows={14} />}
    </ToolShell>
  )
}

// ── Hub ───────────────────────────────────────────────────────────────────────
const GROQ_TOOLS: { id: GroqToolId; icon: string; title: string; desc: string; tags: string[] }[] = [
  { id: 'script',     icon: '🎬', title: 'Script Reel',          desc: 'Script complet prêt à lire — hook, corps, CTA avec timings.',       tags: ['Script', 'Hook', 'CTA'] },
  { id: 'hooks',      icon: '🪝', title: '3 Hooks A/B/C',        desc: '3 hooks radicalement différents pour tester le meilleur.',          tags: ['A/B Test', 'Hook', 'Copywriting'] },
  { id: 'caption',    icon: '💬', title: 'Captions Virales',      desc: 'Caption complète : hook, corps, CTA et 15 hashtags.',               tags: ['Caption', 'Hashtags'] },
  { id: 'bio',        icon: '👤', title: 'Bio Optimizer',         desc: 'Réécrit ta bio pour maximiser follows, ventes ou trafic.',          tags: ['Bio', 'Profil', 'SEO'] },
  { id: 'replies',    icon: '💬', title: 'Réponses Commentaires', desc: 'Réponses personnalisées pour 20 commentaires en un clic.',          tags: ['Engagement', 'Commentaires'] },
  { id: 'translate',  icon: '🌍', title: 'Traducteur Multi-Marché',desc: 'Adapte ta caption pour EN/ES/PT/DE/IT avec hashtags locaux.',       tags: ['International', 'Traduction'] },
  { id: 'competitor', icon: '🕵️', title: 'Analyse Concurrent',   desc: 'Gaps, formules de hooks, plan d\'action pour dépasser un compte.',  tags: ['Concurrent', 'Stratégie'] },
  { id: 'strat',      icon: '🔍', title: 'Stratégie Niche',       desc: 'Fréquence, heures, hashtags et idées Reels pour une niche.',        tags: ['Niche', 'Planning'] },
  { id: 'plan',       icon: '📅', title: 'Planificateur 7 Jours', desc: 'Calendrier éditorial complet sur 7 jours avec heures et idées.',    tags: ['Calendrier', 'Contenu'] },
]

const VISION_TOOLS_META: { id: VisionToolId; icon: string; title: string; desc: string; tags: string[]; needsAnthopic: boolean }[] = [
  { id: 'vision-score',     icon: '🔥', title: 'Score Viral',          desc: 'Note 1-10 sur 5 critères : hook, rétention, texte, thumbnail, dynamisme.', tags: ['Vidéo', 'Score', 'Claude'], needsAnthopic: true },
  { id: 'vision-structure', icon: '🧬', title: 'Structure Virale',      desc: 'Décompose la timeline d\'une vidéo : hook, valeur, CTA, transitions.',      tags: ['Vidéo', 'Timeline', 'Claude'], needsAnthopic: true },
  { id: 'vision-thumb',     icon: '🖼', title: 'Audit Thumbnail',       desc: 'Score contraste, lisibilité, émotion, couleurs + corrections prioritaires.', tags: ['Image', 'CTR', 'Claude'], needsAnthopic: true },
]

function ToolCard({ icon, title, desc, tags, locked, onClick }: {
  icon: string; title: string; desc: string; tags: string[]; locked?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="rounded-2xl p-5 text-left space-y-3 transition-all hover:scale-[1.02] group"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', opacity: locked ? 0.5 : 1 }}>
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(236,72,153,0.15))', border: '1px solid rgba(255,255,255,0.07)' }}>
          {icon}
        </div>
        {locked && <span className="text-[11px] px-2 py-0.5 rounded font-bold"
          style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
          Clé Anthropic requise
        </span>}
      </div>
      <div>
        <p className="text-[13px] font-bold text-white group-hover:text-purple-300 transition-colors">{title}</p>
        <p className="text-[12px] mt-1 leading-relaxed text-text2">{desc}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(139,92,246,0.1)', color: 'rgba(196,181,253,0.6)' }}>{t}</span>
        ))}
      </div>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AiTools({ user }: AiToolsProps) {
  const [active, setActive] = useState<ActiveTool>('hub')
  const conns = useConnections(user)

  if (conns.loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-[13px] text-text2">Chargement des connexions…</span>
          </div>
        </div>
      </div>
    )
  }

  if (!conns.groq) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-[28px] font-black text-white leading-none">Outils IA</h1>
            <p className="text-[13px] text-text2 mt-0.5">Groq · Claude Vision · FFmpeg</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-10 pb-10 pt-8">
          <div className="max-w-lg rounded-2xl p-6" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <p className="text-[15px] font-bold text-warn mb-2">⚠ Clé Groq API manquante</p>
            <p className="text-[13px] text-text2 mb-1">Va dans <strong className="text-white">Paramètres → Connexions → Clés API</strong> et colle ta clé Groq.</p>
            <p className="text-[12px] text-text2">Gratuit sur <span className="text-accent">groq.com</span> → API Keys → Create</p>
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

  // Hub
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">Outils IA</h1>
          <p className="text-[13px] text-text2 mt-0.5">
            {GROQ_TOOLS.length + VISION_TOOLS_META.length + 2} outils · Groq · Claude Vision · FFmpeg
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 pb-10">
        <div className="pt-8 space-y-8">

          {/* Vidéo */}
          <div>
            <p className="text-[12px] uppercase tracking-widest font-black mb-4 text-text2">Vidéo</p>
            <div className="grid grid-cols-3 gap-4">
              <ToolCard icon="🏷" title="Changeur de Métadonnées"
                desc="Supprime toutes les métadonnées et injecte un timestamp aléatoire." tags={['FFmpeg', 'Instant', 'Stream copy']}
                onClick={() => setActive('metadata')} />
              <ToolCard icon="✍" title="Texte IA — Dupliquer"
                desc="Ajoute un texte sur tes vidéos avec plusieurs positions différentes pour créer des copies uniques." tags={['FFmpeg', 'Canvas', 'Mass']}
                onClick={() => setActive('textcopy')} />
            </div>
          </div>

          {/* Groq IA */}
          <div>
            <p className="text-[12px] uppercase tracking-widest font-black mb-4 text-text2">Groq IA — Texte & Stratégie</p>
            <div className="grid grid-cols-3 gap-4">
              {GROQ_TOOLS.map(t => (
                <ToolCard key={t.id} {...t} onClick={() => setActive(t.id)} />
              ))}
            </div>
          </div>

          {/* Vision IA */}
          <div>
            <p className="text-[12px] uppercase tracking-widest font-black mb-4 text-text2">
              Claude Vision — Analyse Vidéo & Image
              {!conns.anthropic && <span className="ml-2 text-warn/70 normal-case">⚠ Clé Anthropic manquante</span>}
            </p>
            <div className="grid grid-cols-3 gap-4">
              {VISION_TOOLS_META.map(t => (
                <ToolCard key={t.id} {...t} locked={!conns.anthropic} onClick={() => setActive(t.id)} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
