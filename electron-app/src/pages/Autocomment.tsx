import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { runIgCommentFlow } from '@/lib/geelark'
import { getBearer }       from '@/lib/phonePoller'

interface AutocommentProps { user: User }

interface IgComment {
  pk:       string
  username: string
  text:     string
  replied?: string | null   // our reply text if already answered
}

interface IgPost {
  id:        string
  shortcode: string
  caption:   string
  thumbnail: string
  taken_at:  number
  comment_count: number
  is_video:  boolean
  newCount?: number       // unanswered count
}

function IgThumbnail({ src, sessionid }: { src: string; sessionid?: string | null }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed]   = useState(false)
  useEffect(() => {
    setDataUrl(null); setFailed(false)
    if (!src || !window.electronAPI?.fetchImage) { setFailed(true); return }
    let cancelled = false
    const headers: Record<string, string> = {}
    if (sessionid) headers['Cookie'] = `sessionid=${sessionid}`
    window.electronAPI.fetchImage({ url: src, headers: Object.keys(headers).length ? headers : undefined })
      .then(r => { if (!cancelled) { if (r.ok && r.dataUrl) setDataUrl(r.dataUrl); else setFailed(true) } })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [src, sessionid])
  if (failed || !src) return <div className="w-11 h-11 rounded bg-surface3 flex items-center justify-center text-lg flex-shrink-0">🎥</div>
  if (!dataUrl)       return <div className="w-11 h-11 rounded bg-surface3 flex-shrink-0 animate-pulse" />
  return <img src={dataUrl} alt="" className="w-11 h-11 rounded object-cover flex-shrink-0" />
}

const DEFAULT_PERSONA = "Tu es un créateur de contenu Instagram sympathique. Réponds en français, de façon courte (1-2 phrases), chaleureuse et engageante."

export function Autocomment({ user }: AutocommentProps) {
  const [phones, setPhones]           = useState<Phone[]>([])
  const [selectedPhone, setSelected]  = useState<Phone | null>(null)
  const [posts, setPosts]             = useState<IgPost[]>([])
  const [selectedPost, setSelPost]    = useState<IgPost | null>(null)
  const [comments, setComments]       = useState<IgComment[]>([])
  const [postFilter, setPostFilter]   = useState<'all' | 'replied' | 'new'>('all')
  const [loading, setLoading]         = useState(false)
  const [loadingComments, setLoadingC]= useState(false)

  // Config
  const [groqKey, setGroqKey]     = useState('')
  const [interval, setInterval_]  = useState(5)
  const [persona, setPersona]     = useState(DEFAULT_PERSONA)
  const [running, setRunning]     = useState(false)
  const [logs, setLogs]           = useState<string[]>([])
  const stopRef                   = useRef(false)
  const [replyMode, setReplyMode] = useState<'ai' | 'manual'>('ai')
  const [manualReplies, setManualReplies] = useState<Record<string, string>>({})
  const [sendingReply, setSendingReply]   = useState<string | null>(null)
  // Send via GéeLark cloud-phone (RPA) instead of direct IG API → undetectable
  const [useGeelark, setUseGeelark] = useState(localStorage.getItem('autocomment-use-geelark') === 'true')
  const [flowId, setFlowId]         = useState(localStorage.getItem('autocomment-geelark-flow-id') ?? '')

  useEffect(() => {
    Promise.all([
      supabase.from('phones').select('*').eq('user_id', user.id).order('phone_name'),
      supabase.from('app_config').select('groq_api_key').eq('user_id', user.id).single(),
    ]).then(([ph, cfg]) => {
      setPhones((ph.data ?? []).filter(p => p.ig_username))
      if (cfg.data?.groq_api_key) setGroqKey(cfg.data.groq_api_key)
    })
  }, [])

  async function sendManualReply(comment: IgComment) {
    const text = manualReplies[comment.pk]?.trim()
    if (!text || !selectedPost || !selectedPhone) return
    setSendingReply(comment.pk)
    try {
      // Path A: route through the GéeLark cloud phone (recommended — undetectable)
      if (useGeelark) {
        if (!flowId) { log('❌ flowId GéeLark manquant — configure-le en bas'); setSendingReply(null); return }
        if (!selectedPhone.geelark_id) { log('❌ Téléphone sans geelark_id'); setSendingReply(null); return }
        const bearer = getBearer()
        if (!bearer) { log('❌ Bearer GéeLark non chargé'); setSendingReply(null); return }
        const postUrl = `https://www.instagram.com/reel/${selectedPost.shortcode}/`
        const gr = await runIgCommentFlow(bearer, selectedPhone.geelark_id, flowId, postUrl, text)
        if (gr.ok) {
          setComments(prev => prev.map(c => c.pk === comment.pk ? { ...c, replied: text } : c))
          setManualReplies(prev => { const n = { ...prev }; delete n[comment.pk]; return n })
          log(`✓ Tâche GéeLark lancée (id=${gr.taskId}) — vérifie sur le téléphone dans 30s`)
        } else {
          log(`❌ GéeLark: ${gr.error ?? 'unknown'}`)
        }
        setSendingReply(null)
        return
      }

      // Path B: direct Instagram API (legacy — risque de logout)
      if (!selectedPhone.ig_sessionid) { log('❌ Pas de sessionid sur ce téléphone'); setSendingReply(null); return }
      const r = await window.electronAPI?.postIgComment({
        mediaId: selectedPost.id,
        text,
        sessionid: selectedPhone.ig_sessionid,
      })
      if (r?.ok) {
        setComments(prev => prev.map(c => c.pk === comment.pk ? { ...c, replied: text } : c))
        setManualReplies(prev => { const n = { ...prev }; delete n[comment.pk]; return n })
        log(`✓ Réponse envoyée à @${comment.username}`)
      } else {
        log(`❌ Erreur envoi réponse: ${r?.error ?? 'unknown'}`)
        // If IG killed the session, mark phone as expired so the red badge shows
        if (r?.sessionExpired || /login_required|logout_reason|HTTP 401/.test(r?.error ?? '')) {
          if (selectedPhone) {
            await supabase.from('phones').update({ ig_status: 'expired' }).eq('id', selectedPhone.id)
            log(`⚠ Session Instagram expirée — re-login requis sur le téléphone`)
          }
        }
      }
    } catch (e) {
      log(`❌ Erreur: ${e instanceof Error ? e.message : String(e)}`)
    }
    setSendingReply(null)
  }

  function log(msg: string) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [...prev.slice(-99), `[${time}] ${msg}`])
  }

  async function loadPosts(phone: Phone) {
    setSelected(phone)
    setSelPost(null)
    setComments([])
    if (!phone.ig_sessionid) {
      log(`⚠ ${phone.ig_username}: pas de session ID configurée`)
      return
    }
    setLoading(true)
    try {
      // Use existing fetchInstagramBySession to get videos
      if (window.electronAPI?.fetchInstagramBySession) {
        const r = await window.electronAPI.fetchInstagramBySession({
          username:  phone.ig_username!,
          sessionid: phone.ig_sessionid,
        })
        if (r.ok && r.videos) {
          const ps: IgPost[] = r.videos.map(v => ({
            id:        v.id,
            shortcode: v.shortcode,
            caption:   '',  // not in current shape
            thumbnail: v.thumbnail,
            taken_at:  v.timestamp ? new Date(v.timestamp).getTime() / 1000 : 0,
            comment_count: v.comments,
            is_video:  true,
          }))
          setPosts(ps)
        } else {
          log(`❌ ${phone.ig_username}: ${r.error ?? 'erreur'}`)
          setPosts([])
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadComments(post: IgPost) {
    const sessionid = selectedPhone?.ig_sessionid
    if (!sessionid) {
      log('⚠ Aucune session IG configurée pour ce téléphone — va dans Téléphones → configurer session')
      setComments([])
      return
    }
    setLoadingC(true)
    try {
      const r = await window.electronAPI?.fetchIgComments({ mediaId: post.id, sessionid })
      if (r?.ok && r.comments) {
        setComments(r.comments.map(c => ({ pk: c.pk, username: c.username, text: c.text, replied: null })))
        log(`✓ ${r.comments.length} commentaire${r.comments.length !== 1 ? 's' : ''} chargé${r.comments.length !== 1 ? 's' : ''}`)
      } else {
        setComments([])
        log(`❌ Impossible de charger les commentaires : ${r?.error ?? 'erreur inconnue'}`)
      }
    } catch (e) {
      setComments([])
      log(`❌ Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
    setLoadingC(false)
  }

  function selectPost(p: IgPost) {
    setSelPost(p)
    loadComments(p)
  }

  function start() {
    if (!groqKey) { log('❌ Clé Groq manquante — configure-la dans Paramètres'); return }
    setRunning(true)
    stopRef.current = false
    log(`▶ Démarré — intervalle ${interval} min`)
    // Worker loop would go here; needs IPC for posting comments
    log('ℹ️ Worker Groq à brancher sur IPC backend (réponse + post comment)')
  }

  function stop() {
    stopRef.current = true
    setRunning(false)
    log('⏹ Arrêté')
  }

  const visiblePosts = posts.filter(p => {
    if (postFilter === 'all') return true
    if (postFilter === 'new') return (p.newCount ?? p.comment_count) > 0
    if (postFilter === 'replied') return (p.newCount ?? 0) === 0 && p.comment_count > 0
    return true
  })

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Top: account chips */}
      <div className="flex-shrink-0 bg-[#070a10] border-b border-border h-14 flex items-center gap-2 px-4 overflow-x-auto">
        {phones.length === 0 ? (
          <p className="text-text2 text-sm">Aucun compte Instagram lié — va dans Téléphones d'abord.</p>
        ) : phones.map((p, i) => {
          const palette = ['#4f8ef7','#22c55e','#f59e0b','#e0245e','#8b5cf6','#06b6d4','#f97316','#ec4899']
          const color = palette[i % palette.length]
          const active = selectedPhone?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => loadPosts(p)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all flex-shrink-0 ${
                active ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/40'
              }`}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: color }}>
                {(p.ig_username ?? p.phone_name)[0].toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-text leading-none">@{p.ig_username}</p>
                <p className="text-[9px] text-text2 leading-none mt-0.5 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${p.ig_sessionid ? 'bg-ok' : 'bg-danger'}`} />
                  {p.ig_sessionid ? 'session OK' : 'no session'}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: post list */}
        <aside className="w-[310px] flex-shrink-0 flex flex-col border-r border-border bg-sb-bg">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <p className="text-sm font-bold text-text flex-1">
              {selectedPhone ? `@${selectedPhone.ig_username}` : 'Sélectionne un compte'}
            </p>
            {selectedPhone && (
              <button
                onClick={() => loadPosts(selectedPhone)}
                className="text-text2 hover:text-accent text-sm"
                title="Recharger"
              >⟳</button>
            )}
          </div>
          {/* Filters */}
          <div className="px-3 py-2 border-b border-border flex gap-1">
            {([
              { k: 'all',     l: 'Tous'        },
              { k: 'replied', l: '✓ Commentés' },
              { k: 'new',     l: 'Nouveau'     },
            ] as const).map(f => (
              <button
                key={f.k}
                onClick={() => setPostFilter(f.k)}
                className={`px-2.5 py-1 rounded-full text-[10px] transition-colors ${
                  postFilter === f.k
                    ? f.k === 'replied' ? 'bg-ok/20 text-ok' : f.k === 'new' ? 'bg-danger/20 text-danger' : 'bg-accent/20 text-accent'
                    : 'text-text2 hover:bg-surface2'
                }`}
              >{f.l}</button>
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : visiblePosts.length === 0 ? (
              <p className="px-4 py-6 text-xs text-text2 text-center">
                {selectedPhone ? 'Aucune vidéo' : 'Choisis un compte au-dessus'}
              </p>
            ) : visiblePosts.map(p => (
              <button
                key={p.id}
                onClick={() => selectPost(p)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left border-b border-border/30 transition-colors ${
                  selectedPost?.id === p.id ? 'bg-surface2' : 'hover:bg-surface'
                }`}
              >
                <IgThumbnail src={p.thumbnail} sessionid={selectedPhone?.ig_sessionid} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-text2">
                    🎥 {p.taken_at ? new Date(p.taken_at * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                  <p className="text-xs text-text truncate">{p.caption || `Reel ${p.shortcode}`}</p>
                  <p className="text-[10px] text-text2 mt-0.5">💬 {p.comment_count}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right: comments + config */}
        <div className="flex-1 flex flex-col">
          {!selectedPost ? (
            <div className="flex-1 flex items-center justify-center text-text2">
              <div className="text-center space-y-2">
                <p className="text-5xl">✈️</p>
                <p className="text-sm">Sélectionne une vidéo pour commencer</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-6 py-3 border-b border-border flex items-center gap-2">
                <h2 className="text-sm font-semibold text-text">💬 Commentaires</h2>
                <span className="text-text2 text-xs">{comments.length}</span>
                <button onClick={() => loadComments(selectedPost)} className="ml-auto text-text2 hover:text-accent text-sm">⟳</button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {loadingComments ? (
                  <Spinner />
                ) : comments.length === 0 ? (
                  <p className="text-text2 text-sm text-center py-10">Aucun commentaire chargé.</p>
                ) : comments.map(c => (
                  <div key={c.pk} className="bg-card border border-border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-accent">@{c.username}</p>
                      {c.replied && <span className="text-[10px] text-ok bg-ok/10 px-1.5 py-0.5 rounded">✓ Répondu</span>}
                    </div>
                    <p className="text-sm text-text">{c.text}</p>
                    {c.replied && (
                      <p className="text-xs text-ok/80 flex items-start gap-1.5 border-l-2 border-ok/30 pl-2">
                        <span className="flex-1">{c.replied}</span>
                      </p>
                    )}
                    {replyMode === 'manual' && !c.replied && (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={manualReplies[c.pk] ?? ''}
                          onChange={e => setManualReplies(prev => ({ ...prev, [c.pk]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') sendManualReply(c) }}
                          placeholder="Écrire une réponse…"
                          className="flex-1 bg-bg border border-border rounded px-2 py-1 text-xs text-text placeholder:text-text2 focus:outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => sendManualReply(c)}
                          disabled={!manualReplies[c.pk]?.trim() || sendingReply === c.pk}
                          className="px-3 py-1 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-xs rounded transition-colors"
                        >
                          {sendingReply === c.pk ? '…' : '↑'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Config bar */}
          <div className="border-t border-border bg-[#070a10] p-4 space-y-3">
            {/* Mode toggle */}
            <div className="flex items-center gap-2 pb-1">
              <span className="text-[10px] uppercase tracking-wider text-text2 font-semibold">Mode réponse</span>
              <div className="flex rounded-lg overflow-hidden border border-border ml-2">
                <button
                  onClick={() => setReplyMode('ai')}
                  className={`px-3 py-1 text-xs transition-colors ${replyMode === 'ai' ? 'bg-accent text-white' : 'text-text2 hover:text-text'}`}
                >🤖 IA Auto</button>
                <button
                  onClick={() => setReplyMode('manual')}
                  className={`px-3 py-1 text-xs transition-colors ${replyMode === 'manual' ? 'bg-accent text-white' : 'text-text2 hover:text-text'}`}
                >✍️ Manuel</button>
              </div>
            </div>
            {replyMode === 'ai' && (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text2 font-semibold block mb-1">Clé Groq API</label>
                <input
                  type="password"
                  value={groqKey}
                  onChange={e => setGroqKey(e.target.value)}
                  placeholder="gsk_…"
                  className="w-full bg-bg border border-border rounded px-3 py-1.5 text-xs text-text placeholder:text-text2 focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text2 font-semibold block mb-1">Intervalle (min)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={interval}
                  onChange={e => setInterval_(parseInt(e.target.value) || 5)}
                  className="w-full bg-bg border border-border rounded px-3 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-text2 font-semibold block mb-1">Persona IA</label>
              <textarea
                value={persona}
                onChange={e => setPersona(e.target.value)}
                rows={3}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text resize-none focus:outline-none focus:border-accent"
              />
            </div>
            </>)}
            {replyMode === 'ai' ? (
              <div className="flex gap-2">
                {!running ? (
                  <Button size="sm" onClick={start} className="flex-1 !bg-ok hover:!bg-ok/80 !text-bg">▶ Démarrer</Button>
                ) : (
                  <Button size="sm" onClick={stop} variant="danger" className="flex-1">■ Arrêter</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setLogs([])}>🗑</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <p className="text-[10px] text-text2 flex-1">✍️ Mode manuel — écris ta réponse sous chaque commentaire puis clique sur ↑ Envoyer.</p>
                  <Button size="sm" variant="secondary" onClick={() => setLogs([])}>🗑</Button>
                </div>
                <div className="flex items-center gap-3 p-2 bg-bg border border-border rounded">
                  <label className="flex items-center gap-2 text-[11px] text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useGeelark}
                      onChange={e => { setUseGeelark(e.target.checked); localStorage.setItem('autocomment-use-geelark', String(e.target.checked)) }}
                    />
                    📱 Envoyer via téléphone GéeLark <span className="text-text2">(indétectable)</span>
                  </label>
                  {useGeelark && (
                    <input
                      type="text"
                      value={flowId}
                      onChange={e => { setFlowId(e.target.value); localStorage.setItem('autocomment-geelark-flow-id', e.target.value) }}
                      placeholder="flowId GéeLark (cf. RPA Flows)"
                      className="flex-1 bg-surface border border-border rounded px-2 py-1 text-[11px] text-text placeholder:text-text2 focus:outline-none focus:border-accent"
                    />
                  )}
                </div>
                {useGeelark && (
                  <p className="text-[10px] text-text2/80">
                    ℹ️ Crée un Custom Task Flow dans GéeLark: ouvrir IG → aller à <code>{'{postUrl}'}</code> → tap commentaire → taper <code>{'{commentText}'}</code> → envoyer. Colle son ID ci-dessus.
                  </p>
                )}
              </div>
            )}
            {/* Log */}
            <div className="bg-bg border border-border rounded p-2 max-h-24 overflow-auto font-mono text-[10px] text-text2 space-y-0.5">
              {logs.length === 0 ? <p className="text-text2/50">Aucun log</p> : logs.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
