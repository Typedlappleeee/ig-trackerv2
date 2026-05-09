import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

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

function ToolCard({ title, subtitle, children, color = '#ffaa2a' }: {
  title: string; subtitle: string; children: React.ReactNode; color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="h-0.5" style={{ backgroundColor: color }} />
      <div className="p-5">
        <h2 className="text-sm font-bold text-text">{title}</h2>
        <p className="text-xs text-text2 mt-0.5 mb-4">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}

export function AiTools({ user }: AiToolsProps) {
  const [groqKey, setGroqKey]   = useState('')
  const [hasKey, setHasKey]     = useState(false)

  // Caption generator
  const [niche, setNiche]           = useState('')
  const [captionCount, setCaptionCount] = useState(5)
  const [captionResult, setCaptionResult] = useState('')
  const [loadingCaption, setLoadingCaption] = useState(false)

  // Hashtag generator
  const [hashtagTopic, setHashtagTopic] = useState('')
  const [hashtagCount, setHashtagCount] = useState(30)
  const [hashtagResult, setHashtagResult] = useState('')
  const [loadingHashtag, setLoadingHashtag] = useState(false)

  // Bio generator
  const [bioNiche, setBioNiche]     = useState('')
  const [bioUsername, setBioUsername] = useState('')
  const [bioResult, setBioResult]   = useState('')
  const [loadingBio, setLoadingBio] = useState(false)

  // Hook generator
  const [hookNiche, setHookNiche]   = useState('')
  const [hookResult, setHookResult] = useState('')
  const [loadingHook, setLoadingHook] = useState(false)

  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    supabase.from('app_config').select('groq_api_key, profile_niche').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data?.groq_api_key) { setGroqKey(data.groq_api_key); setHasKey(true) }
        if (data?.profile_niche) { setNiche(data.profile_niche); setHashtagTopic(data.profile_niche); setHookNiche(data.profile_niche); setBioNiche(data.profile_niche) }
      })
  }, [])

  async function run(fn: () => Promise<void>) {
    setError(null)
    if (!hasKey) { setError('Clé API Groq manquante — configure-la dans Paramètres.'); return }
    try { await fn() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur Groq') }
  }

  async function generateCaptions() {
    setLoadingCaption(true)
    await run(async () => {
      const result = await groqCall(groqKey,
        `Tu es un expert en marketing Instagram. Génère ${captionCount} captions virales pour un compte dans la niche "${niche || 'lifestyle'}".
        Chaque caption doit être engageante, inclure un call-to-action, et se terminer par des emojis pertinents.
        Format : numérotée 1. 2. 3. etc. Réponds uniquement avec les captions, en français.`,
        800
      )
      setCaptionResult(result)
    })
    setLoadingCaption(false)
  }

  async function generateHashtags() {
    setLoadingHashtag(true)
    await run(async () => {
      const result = await groqCall(groqKey,
        `Génère ${hashtagCount} hashtags Instagram pour la niche "${hashtagTopic || 'lifestyle'}".
        Mixe des hashtags populaires (1M+), moyens (100k-1M) et de niche (<100k) pour une portée optimale.
        Format : liste de hashtags séparés par des espaces, commençant par #. Réponds uniquement avec les hashtags.`,
        300
      )
      setHashtagResult(result)
    })
    setLoadingHashtag(false)
  }

  async function generateBio() {
    setLoadingBio(true)
    await run(async () => {
      const result = await groqCall(groqKey,
        `Génère 3 bios Instagram professionnelles et engageantes pour un compte @${bioUsername || 'username'} dans la niche "${bioNiche || 'lifestyle'}".
        Chaque bio doit faire max 150 caractères, inclure des emojis et un call-to-action.
        Format : numérotée 1. 2. 3. Réponds en français.`,
        400
      )
      setBioResult(result)
    })
    setLoadingBio(false)
  }

  async function generateHooks() {
    setLoadingHook(true)
    await run(async () => {
      const result = await groqCall(groqKey,
        `Génère 5 hooks d'accroche percutants pour des Reels Instagram dans la niche "${hookNiche || 'lifestyle'}".
        Les hooks doivent captiver l'attention dans les 3 premières secondes et donner envie de regarder la suite.
        Format : numérotée 1. 2. 3. etc. Réponds en français.`,
        500
      )
      setHookResult(result)
    })
    setLoadingHook(false)
  }

  if (!hasKey) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-text">Outils IA</h1>
        <p className="text-text2 text-sm mt-1">Génération de contenu Instagram via Groq (Llama 3)</p>
        <div className="mt-6 bg-card border border-border rounded-xl p-6 space-y-3">
          <p className="text-sm text-warn font-medium">⚠ Clé API Groq manquante</p>
          <p className="text-sm text-text2">
            Pour utiliser les outils IA, configure ta clé Groq dans <span className="text-text font-medium">Paramètres → Connexions</span>.
          </p>
          <p className="text-xs text-text2">
            Groq est gratuit (jusqu'à 14 400 requêtes/jour) — crée un compte sur <span className="text-accent">console.groq.com</span>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Outils IA</h1>
        <p className="text-text2 text-sm mt-1">Génération de contenu Instagram via Groq · Llama 3.3 70B</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* Caption generator */}
        <ToolCard title="✍ Générateur de captions" subtitle="Captions virales adaptées à ta niche" color="#4f9eff">
          <div className="space-y-3">
            <div className="flex gap-3">
              <input placeholder="Niche (ex: fitness, crypto…)" value={niche} onChange={e => setNiche(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none" />
              <select value={captionCount} onChange={e => setCaptionCount(+e.target.value)}
                className="bg-surface border border-border rounded-lg px-2 py-2 text-sm text-text focus:outline-none">
                {[3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <Button size="sm" onClick={generateCaptions} loading={loadingCaption}>Générer</Button>
            {captionResult && (
              <div className="relative">
                <textarea readOnly value={captionResult} rows={8}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text resize-none" />
                <div className="absolute top-2 right-2"><CopyButton text={captionResult} /></div>
              </div>
            )}
          </div>
        </ToolCard>

        {/* Hashtag generator */}
        <ToolCard title="# Générateur de hashtags" subtitle="Mix stratégique populaires + niche" color="#00ccaa">
          <div className="space-y-3">
            <div className="flex gap-3">
              <input placeholder="Sujet / niche" value={hashtagTopic} onChange={e => setHashtagTopic(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none" />
              <select value={hashtagCount} onChange={e => setHashtagCount(+e.target.value)}
                className="bg-surface border border-border rounded-lg px-2 py-2 text-sm text-text focus:outline-none">
                {[15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <Button size="sm" onClick={generateHashtags} loading={loadingHashtag}>Générer</Button>
            {hashtagResult && (
              <div className="relative">
                <textarea readOnly value={hashtagResult} rows={4}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text resize-none" />
                <div className="absolute top-2 right-2"><CopyButton text={hashtagResult} /></div>
              </div>
            )}
          </div>
        </ToolCard>

        {/* Bio generator */}
        <ToolCard title="👤 Générateur de bio" subtitle="Bio pro et engageante (150 chars)" color="#a56ef5">
          <div className="space-y-3">
            <div className="flex gap-3">
              <input placeholder="Niche" value={bioNiche} onChange={e => setBioNiche(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none" />
              <input placeholder="@username" value={bioUsername} onChange={e => setBioUsername(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none" />
            </div>
            <Button size="sm" onClick={generateBio} loading={loadingBio}>Générer</Button>
            {bioResult && (
              <div className="relative">
                <textarea readOnly value={bioResult} rows={6}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text resize-none" />
                <div className="absolute top-2 right-2"><CopyButton text={bioResult} /></div>
              </div>
            )}
          </div>
        </ToolCard>

        {/* Hook generator */}
        <ToolCard title="🎣 Générateur de hooks" subtitle="Accroches pour les 3 premières secondes" color="#f03d55">
          <div className="space-y-3">
            <input placeholder="Niche (ex: motivation, trading…)" value={hookNiche} onChange={e => setHookNiche(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none" />
            <Button size="sm" onClick={generateHooks} loading={loadingHook}>Générer</Button>
            {hookResult && (
              <div className="relative">
                <textarea readOnly value={hookResult} rows={8}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text resize-none" />
                <div className="absolute top-2 right-2"><CopyButton text={hookResult} /></div>
              </div>
            )}
          </div>
        </ToolCard>
      </div>
    </div>
  )
}
