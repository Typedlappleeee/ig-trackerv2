import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { replyToIgCommentViaPhone } from '@/lib/geelark'
import { getBearer }                from '@/lib/phonePoller'

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
  if (failed || !src) return <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>🎥</div>
  if (!dataUrl)       return <div className="w-12 h-12 rounded-xl flex-shrink-0 animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
  return <img src={dataUrl} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
}

const DEFAULT_PERSONA = "Tu es un créateur de contenu Instagram sympathique. Réponds en français, de façon courte (1-2 phrases), chaleureuse et engageante."

export function Autocomment({ user }: AutocommentProps) {
  const { currentOrg }                = useOrg()
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
  // Send via GéeLark cloud-phone (shell-exec) instead of direct IG API → undetectable
  const [useGeelark, setUseGeelark] = useState(localStorage.getItem('autocomment-use-geelark') !== 'false')

  // Groq key from active connection (org or solo)
  const conns = useConnections(user)
  useEffect(() => { if (conns.groq) setGroqKey(conns.groq) }, [conns.groq])

  useEffect(() => {
    if (!conns.bearer) { setPhones([]); return }
    let q = supabase.from('phones').select('*').order('phone_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q.then(ph => setPhones((ph.data ?? []).filter(p => p.ig_username)))
  }, [currentOrg?.id, user.id, conns.bearer])

  async function sendManualReply(comment: IgComment) {
    const text = manualReplies[comment.pk]?.trim()
    if (!text || !selectedPost || !selectedPhone) return
    setSendingReply(comment.pk)
    try {
      // Path A: drive the GéeLark cloud phone directly via shell exec (undetectable)
      if (useGeelark) {
        if (!selectedPhone.geelark_id) { log('❌ Téléphone sans geelark_id'); setSendingReply(null); return }
        const bearer = getBearer()
        if (!bearer) { log('❌ Bearer GéeLark non chargé'); setSendingReply(null); return }
        log(`📱 Envoi via téléphone @${comment.username}…`)
        const gr = await replyToIgCommentViaPhone(
          bearer,
          selectedPhone.geelark_id,
          selectedPost.shortcode,
          comment.username,
          text,
          (m: string) => log(`  ${m}`),
        )
        if (gr.ok) {
          setComments(prev => prev.map(c => c.pk === comment.pk ? { ...c, replied: text } : c))
          setManualReplies(prev => { const n = { ...prev }; delete n[comment.pk]; return n })
          log(`✓ Réponse envoyée à @${comment.username} via téléphone`)
        } else {
          log(`❌ Téléphone: ${gr.error ?? 'unknown'}`)
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
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">Auto-Commentaires</h1>
          <p className="text-[13px] text-text2 mt-0.5">Réponse IA ou manuelle aux commentaires Instagram</p>
        </div>
      </div>

      {/* Account chips bar */}
      <div className="flex-shrink-0 px-6 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {phones.length === 0 ? (
          <p className="text-[13px] text-text2">Aucun compte Instagram lié — va dans Téléphones d'abord.</p>
        ) : phones.map((p, i) => {
          const palette = ['#4f8ef7','#22c55e','#f59e0b','#e0245e','#8b5cf6','#06b6d4','#f97316','#ec4899']
          const color = palette[i % palette.length]
          const active = selectedPhone?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => loadPosts(p)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all flex-shrink-0"
              style={active
                ? { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                {(p.ig_username ?? p.phone_name)[0].toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-[13px] font-semibold text-white leading-none">@{p.ig_username}</p>
                <p className="text-[11px] text-text2 leading-none mt-0.5 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${p.ig_sessionid ? 'bg-ok' : 'bg-danger'}`} />
                  {p.ig_sessionid ? 'session OK' : 'no session'}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: post list ──────────────────────────────────────────────── */}
        <aside className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[13px] font-bold text-white flex-1">
              {selectedPhone ? `@${selectedPhone.ig_username}` : 'Sélectionne un compte'}
            </p>
            {selectedPhone && (
              <button
                onClick={() => loadPosts(selectedPhone)}
                className="text-text2 hover:text-white text-[15px] transition-colors"
                title="Recharger"
              >⟳</button>
            )}
          </div>

          {/* Filters */}
          <div className="px-4 py-2.5 flex gap-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {([
              { k: 'all',     l: 'Tous'        },
              { k: 'replied', l: '✓ Commentés' },
              { k: 'new',     l: 'Nouveau'     },
            ] as const).map(f => (
              <button
                key={f.k}
                onClick={() => setPostFilter(f.k)}
                className="px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors"
                style={postFilter === f.k
                  ? f.k === 'replied'
                    ? { background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
                    : f.k === 'new'
                    ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                    : { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
                  : { background: 'transparent', color: 'rgba(196,181,253,0.4)', border: '1px solid transparent' }}
              >{f.l}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : visiblePosts.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-3xl mb-3">🎬</p>
                <p className="text-[13px] text-text2">
                  {selectedPhone ? 'Aucune vidéo' : 'Choisis un compte au-dessus'}
                </p>
              </div>
            ) : visiblePosts.map(p => (
              <button
                key={p.id}
                onClick={() => selectPost(p)}
                className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors"
                style={selectedPost?.id === p.id
                  ? { background: 'rgba(139,92,246,0.1)', borderBottom: '1px solid rgba(255,255,255,0.05)' }
                  : { borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <IgThumbnail src={p.thumbnail} sessionid={selectedPhone?.ig_sessionid} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-text2">
                    🎥 {p.taken_at ? new Date(p.taken_at * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                  <p className="text-[13px] text-white truncate mt-0.5">{p.caption || `Reel ${p.shortcode}`}</p>
                  <p className="text-[12px] text-text2 mt-0.5">💬 {p.comment_count}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Right: comments + config ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedPost ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-5xl mb-4">✈️</div>
                <p className="text-base font-bold text-white">Sélectionne une vidéo</p>
                <p className="text-[13px] text-text2 mt-1">Choisis une vidéo dans la liste pour commencer</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 px-6 py-3.5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <h2 className="text-[15px] font-bold text-white">💬 Commentaires</h2>
                <span className="text-[13px] text-text2">{comments.length}</span>
                <button onClick={() => loadComments(selectedPost)} className="ml-auto text-text2 hover:text-white text-[15px] transition-colors">⟳</button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                {loadingComments ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : comments.length === 0 ? (
                  <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-3xl mb-3">💬</p>
                    <p className="text-[13px] text-text2">Aucun commentaire chargé.</p>
                  </div>
                ) : comments.map(c => (
                  <div key={c.pk} className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-bold text-accent">@{c.username}</p>
                      {c.replied && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>✓ Répondu</span>}
                    </div>
                    <p className="text-[13px] text-white">{c.text}</p>
                    {c.replied && (
                      <p className="text-[13px] flex items-start gap-2 pl-3 pt-1" style={{ borderLeft: '2px solid rgba(52,211,153,0.3)', color: '#34d399' }}>
                        <span className="flex-1">{c.replied}</span>
                      </p>
                    )}
                    {replyMode === 'manual' && !c.replied && (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          name="manual-reply"
                          value={manualReplies[c.pk] ?? ''}
                          onChange={e => setManualReplies(prev => ({ ...prev, [c.pk]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') sendManualReply(c) }}
                          placeholder="Écrire une réponse…"
                          className="flex-1 rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                        />
                        <button
                          onClick={() => sendManualReply(c)}
                          disabled={!manualReplies[c.pk]?.trim() || sendingReply === c.pk}
                          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-40 transition-colors"
                          style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }}
                        >
                          {sendingReply === c.pk ? '…' : '↑ Envoyer'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Config bar */}
          <div className="flex-shrink-0 px-6 py-5 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
            {/* Mode toggle */}
            <div className="flex items-center gap-3">
              <span className="text-[12px] uppercase tracking-wider text-text2 font-semibold">Mode réponse</span>
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.09)' }}>
                <button
                  onClick={() => setReplyMode('ai')}
                  className="px-4 py-2 text-[13px] font-semibold transition-colors"
                  style={replyMode === 'ai'
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                    : { background: 'transparent', color: 'rgba(196,181,253,0.5)' }}
                >🤖 IA Auto</button>
                <button
                  onClick={() => setReplyMode('manual')}
                  className="px-4 py-2 text-[13px] font-semibold transition-colors"
                  style={replyMode === 'manual'
                    ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                    : { background: 'transparent', color: 'rgba(196,181,253,0.5)' }}
                >✍️ Manuel</button>
              </div>
            </div>

            {replyMode === 'ai' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12px] uppercase tracking-wider text-text2 font-semibold block mb-2">Clé Groq API</label>
                    <input
                      type="password"
                      name="groq-key"
                      value={groqKey}
                      onChange={e => setGroqKey(e.target.value)}
                      placeholder="gsk_…"
                      className="w-full rounded-xl px-4 py-2.5 text-[13px] placeholder:text-text2 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] uppercase tracking-wider text-text2 font-semibold block mb-2">Intervalle (min)</label>
                    <input
                      type="number"
                      name="interval"
                      min={1}
                      max={120}
                      value={interval}
                      onChange={e => setInterval_(parseInt(e.target.value) || 5)}
                      className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[12px] uppercase tracking-wider text-text2 font-semibold block mb-2">Persona IA</label>
                  <textarea
                    name="persona"
                    value={persona}
                    onChange={e => setPersona(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl px-4 py-2.5 text-[13px] resize-none focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
                  />
                </div>
                <div className="flex gap-2">
                  {!running ? (
                    <Button size="sm" onClick={start} className="flex-1 !bg-ok hover:!bg-ok/80 !text-bg">▶ Démarrer</Button>
                  ) : (
                    <Button size="sm" onClick={stop} variant="danger" className="flex-1">■ Arrêter</Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setLogs([])}>🗑 Logs</Button>
                </div>
              </>
            )}

            {replyMode === 'manual' && (
              <div className="space-y-3">
                <p className="text-[13px] text-text2">✍️ Mode manuel — écris ta réponse sous chaque commentaire puis clique sur Envoyer.</p>
                <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <label className="flex items-center gap-2.5 text-[13px] text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useGeelark}
                      onChange={e => { setUseGeelark(e.target.checked); localStorage.setItem('autocomment-use-geelark', String(e.target.checked)) }}
                    />
                    📱 Envoyer via téléphone GéeLark <span className="text-text2">(indétectable, ~15s)</span>
                  </label>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setLogs([])}>🗑 Effacer logs</Button>
              </div>
            )}

            {/* Log */}
            <div className="rounded-xl p-3 max-h-20 overflow-y-auto font-mono text-[11px] text-text2 space-y-0.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {logs.length === 0 ? <p className="opacity-40">Aucun log</p> : logs.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
