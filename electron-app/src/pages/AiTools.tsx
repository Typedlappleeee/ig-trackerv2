import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { Button } from '@/components/ui/Button'
import { MetadataChanger } from './MetadataChanger'

interface AiToolsProps { user: User }

async function groqCall(apiKey: string, prompt: string, maxTokens = 500): Promise<string> {
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
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} className="text-xs text-text2 hover:text-accent transition-colors px-2 py-1 rounded">
      {copied ? '✓ Copié' : '📋 Copier'}
    </button>
  )
}

// Card helper matching Python `card()` (CARD bg, 1px BORDER, 2px top accent WARN)
function ToolCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="h-[2px] bg-warn" />
      <div className="p-5 space-y-3">
        <h2 className="text-sm font-bold text-text">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const TONES = ['Engageant', 'Humoristique', 'Informatif', 'Mystérieux', 'Inspirant', 'Provocateur'] as const

export function AiTools({ user }: AiToolsProps) {
  const [activeTool, setActiveTool] = useState<'hub' | 'metadata' | 'groq'>('hub')
  const [groqKey, setGroqKey] = useState('')
  const [hasKey, setHasKey]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // 1. Stratégie Concurrente
  const [stratHandle, setStratHandle] = useState('')
  const [stratResult, setStratResult] = useState('')
  const [stratLoading, setStratLoading] = useState(false)

  // 2. Légendes & Captions Virales
  const [capSubject, setCapSubject] = useState('')
  const [capTone, setCapTone]       = useState<typeof TONES[number]>('Engageant')
  const [capResult, setCapResult]   = useState('')
  const [capLoading, setCapLoading] = useState(false)

  // 3. Planificateur de Contenu
  const [planNiche, setPlanNiche]     = useState('')
  const [planResult, setPlanResult]   = useState('')
  const [planLoading, setPlanLoading] = useState(false)

  // Groq key comes from the active connection (org or solo).
  const conns = useConnections(user)
  useEffect(() => {
    if (conns.groq) { setGroqKey(conns.groq); setHasKey(true) }
    else            { setHasKey(false) }
  }, [conns.groq])

  // profile_niche stays user-level
  useEffect(() => {
    supabase.from('app_config').select('profile_niche').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.profile_niche) setPlanNiche(data.profile_niche) })
  }, [user.id])

  async function runStrat() {
    if (!stratHandle.trim()) return
    setStratLoading(true); setError(null); setStratResult('')
    try {
      const text = await groqCall(groqKey,
        `Expert Instagram growth hacking. Analyse la stratégie pour la niche/compte : ${stratHandle.trim()}. Recommandations sur : 1) Type de contenu, 2) Fréquence, 3) Heures de publication, 4) Stratégie hashtags, 5) Idées Reels viraux, 6) Engagement tactics. Liste structurée avec bullet points.`,
        600,
      )
      setStratResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setStratLoading(false)
  }

  async function runCap() {
    if (!capSubject.trim()) return
    setCapLoading(true); setError(null); setCapResult('')
    try {
      const text = await groqCall(groqKey,
        `Génère une caption Instagram virale en français pour : ${capSubject.trim()}. Ton : ${capTone}. Structure : Hook accrocheur en première ligne, body engageant (2-4 lignes), CTA clair, puis 15 hashtags pertinents max. Maximum 250 mots.`,
        500,
      )
      setCapResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setCapLoading(false)
  }

  async function runPlan() {
    if (!planNiche.trim()) return
    setPlanLoading(true); setError(null); setPlanResult('')
    try {
      const text = await groqCall(groqKey,
        `Crée un calendrier éditorial Instagram pour 7 jours sur la niche : ${planNiche.trim()}. Pour chaque jour, donne : Heure optimale de publication / Type de contenu (Reel/Carousel/Story) / Idée précise / Titre accrocheur / 5 hashtags pertinents. Format clair, structuré jour par jour.`,
        800,
      )
      setPlanResult(text)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setPlanLoading(false)
  }

  if (conns.loading) {
    return (
      <div className="p-8 max-w-2xl flex items-center gap-3">
        <div className="animate-spin w-5 h-5 rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-sm text-text2">Chargement des connexions…</span>
      </div>
    )
  }

  if (!hasKey) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-xl font-bold text-text mb-4">🔧 Outils IA</h1>
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-5 space-y-2">
          <p className="text-warn font-semibold">⚠ Clé Groq API manquante</p>
          <p className="text-sm text-text2">Va dans <span className="text-text font-semibold">Paramètres → Connexions → Clés API</span> et colle ta clé Groq.</p>
          <p className="text-xs text-text2/70">Gratuit sur <span className="text-accent">groq.com</span> → API Keys → Create</p>
        </div>
      </div>
    )
  }

  // Route to sub-tools
  if (activeTool === 'metadata') return <MetadataChanger user={user} onBack={() => setActiveTool('hub')} />
  if (activeTool === 'groq') return (
    <div className="flex flex-col h-full" style={{ background: '#06040f' }}>
      <div className="flex-shrink-0 px-6 py-4 flex items-center gap-3"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.6)' }}>
        <button onClick={() => setActiveTool('hub')} className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
          ← Retour
        </button>
        <p className="text-sm font-black text-white">Outils Groq IA</p>
      </div>
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        {groqContent()}
      </div>
    </div>
  )

  // Hub
  return (
    <div className="flex flex-col h-full" style={{ background: '#06040f' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.6)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>🔧</div>
          <div>
            <h1 className="text-sm font-black text-white">Outils IA</h1>
            <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>Vidéo · Contenu · Automatisation</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          {/* Tool 1 — Metadata Changer */}
          <button onClick={() => setActiveTool('metadata')}
            className="rounded-2xl p-5 text-left space-y-3 transition-all hover:scale-[1.02] group"
            style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>🏷</div>
            <div>
              <p className="text-sm font-black text-white group-hover:text-purple-300 transition-colors">Changeur de Métadonnées</p>
              <p className="text-[11px] mt-1" style={{ color: 'rgba(196,181,253,0.5)' }}>
                Supprime toutes les métadonnées d'une vidéo et injecte un timestamp aléatoire. Sans ré-encodage, instantané.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['🎬 Vidéo', '⚡ Rapide', '🔒 Copie stream'].map(t => (
                <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(139,92,246,0.1)', color: 'rgba(196,181,253,0.6)' }}>{t}</span>
              ))}
            </div>
          </button>

          {/* Tool 2 — Groq AI content */}
          <button onClick={() => setActiveTool('groq')}
            className="rounded-2xl p-5 text-left space-y-3 transition-all hover:scale-[1.02] group"
            style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>✨</div>
            <div>
              <p className="text-sm font-black text-white group-hover:text-purple-300 transition-colors">Contenu IA (Groq)</p>
              <p className="text-[11px] mt-1" style={{ color: 'rgba(196,181,253,0.5)' }}>
                Génère stratégies, captions virales et plannings de contenu via Llama 3.3 70B.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['📝 Captions', '📅 Planning', '🔍 Stratégie'].map(t => (
                <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(139,92,246,0.1)', color: 'rgba(196,181,253,0.6)' }}>{t}</span>
              ))}
            </div>
          </button>
        </div>
      </div>
    </div>
  )

  // eslint-disable-next-line no-unreachable
  function groqContent() { return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text">✨ Outils Groq IA</h1>
        <p className="text-text2 text-xs mt-0.5">Génération de contenu via Groq Llama 3.3 70B</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      {/* 1. Stratégie Concurrente */}
      <ToolCard title="🔍 Stratégie Concurrente">
        <p className="text-xs text-text2 mb-2">Analyse la stratégie Instagram d'un compte ou d'une niche</p>
        <input
          type="text"
          placeholder="Pseudo concurrent ou niche"
          value={stratHandle}
          onChange={e => setStratHandle(e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none"
        />
        <textarea
          rows={8}
          value={stratResult}
          readOnly
          placeholder="Le résultat apparaîtra ici…"
          className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text resize-none focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <Button onClick={runStrat} loading={stratLoading} disabled={!stratHandle.trim()}>🔍 Analyser</Button>
          {stratResult && <CopyButton text={stratResult} />}
        </div>
      </ToolCard>

      {/* 2. Légendes & Captions Virales */}
      <ToolCard title="💬 Légendes & Captions Virales">
        <p className="text-xs text-text2 mb-2">Crée des captions Instagram qui convertissent</p>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Sujet du post"
            value={capSubject}
            onChange={e => setCapSubject(e.target.value)}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none"
          />
          <select
            value={capTone}
            onChange={e => setCapTone(e.target.value as typeof TONES[number])}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            {TONES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <textarea
          rows={6}
          value={capResult}
          readOnly
          placeholder="Caption générée apparaîtra ici…"
          className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text resize-none focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <Button onClick={runCap} loading={capLoading} disabled={!capSubject.trim()}>✨ Générer</Button>
          {capResult && <CopyButton text={capResult} />}
        </div>
      </ToolCard>

      {/* 3. Planificateur de Contenu */}
      <ToolCard title="📅 Planificateur de Contenu">
        <p className="text-xs text-text2 mb-2">Calendrier éditorial 7 jours pour ta niche</p>
        <input
          type="text"
          placeholder="Niche (fitness, crypto, lifestyle…)"
          value={planNiche}
          onChange={e => setPlanNiche(e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none"
        />
        <textarea
          rows={10}
          value={planResult}
          readOnly
          placeholder="Calendrier 7 jours apparaîtra ici…"
          className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text resize-none focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <Button onClick={runPlan} loading={planLoading} disabled={!planNiche.trim()}>📅 Planifier</Button>
          {planResult && <CopyButton text={planResult} />}
        </div>
      </ToolCard>
    </div>
  ) }
}
