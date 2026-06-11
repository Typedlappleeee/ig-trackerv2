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
  replied?: string | null
}

interface IgPost {
  id:            string
  shortcode:     string
  caption:       string
  thumbnail:     string
  taken_at:      number
  comment_count: number
  is_video:      boolean
  newCount?:     number
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
  if (failed || !src) return (
    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: 'rgba(255,255,255,0.05)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-3)' }}><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
    </div>
  )
  if (!dataUrl) return <div className="w-12 h-12 rounded-xl flex-shrink-0 sf-skeleton" />
  return <img src={dataUrl} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
}

const DEFAULT_PERSONA = "Tu es un créateur de contenu Instagram sympathique. Réponds en français, de façon courte (1-2 phrases), chaleureuse et engageante."

export function Autocomment({ user }: AutocommentProps) {
  const { currentOrg }               = useOrg()
  const [phones, setPhones]          = useState<Phone[]>([])
  const [selectedPhone, setSelected] = useState<Phone | null>(null)
  const [posts, setPosts]            = useState<IgPost[]>([])
  const [selectedPost, setSelPost]   = useState<IgPost | null>(null)
  const [comments, setComments]      = useState<IgComment[]>([])
  const [postFilter, setPostFilter]  = useState<'all' | 'replied' | 'new'>('all')
  const [loading, setLoading]        = useState(false)
  const [loadingComments, setLoadingC] = useState(false)

  const [groqKey, setGroqKey]     = useState('')
  const [interval, setInterval_]  = useState(5)
  const [persona, setPersona]     = useState(DEFAULT_PERSONA)
  const [running, setRunning]     = useState(false)
  const [logs, setLogs]           = useState<string[]>([])
  const stopRef                   = useRef(false)
  const [replyMode, setReplyMode] = useState<'ai' | 'manual'>('ai')
  const [manualReplies, setManualReplies] = useState<Record<string, string>>({})
  const [sendingReply, setSendingReply]   = useState<string | null>(null)
  const [useGeelark, setUseGeelark] = useState(localStorage.getItem('autocomment-use-geelark') !== 'false')

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
      if (useGeelark) {
        if (!selectedPhone.geelark_id) { log('No geelark_id on this phone'); setSendingReply(null); return }
        const bearer = getBearer()
        if (!bearer) { log('GéeLark bearer not loaded'); setSendingReply(null); return }
        log(`Sending via phone @${comment.username}…`)
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
          log(`Reply sent to @${comment.username} via phone`)
        } else {
          log(`Phone error: ${gr.error ?? 'unknown'}`)
        }
        setSendingReply(null)
        return
      }

      if (!selectedPhone.ig_sessionid) { log('No sessionid on this phone'); setSendingReply(null); return }
      const r = await window.electronAPI?.postIgComment({
        mediaId: selectedPost.id,
        text,
        sessionid: selectedPhone.ig_sessionid,
      })
      if (r?.ok) {
        setComments(prev => prev.map(c => c.pk === comment.pk ? { ...c, replied: text } : c))
        setManualReplies(prev => { const n = { ...prev }; delete n[comment.pk]; return n })
        log(`Reply sent to @${comment.username}`)
      } else {
        log(`Error sending reply: ${r?.error ?? 'unknown'}`)
        if (r?.sessionExpired || /login_required|logout_reason|HTTP 401/.test(r?.error ?? '')) {
          if (selectedPhone) {
            await supabase.from('phones').update({ ig_status: 'expired' }).eq('id', selectedPhone.id)
            log(`Instagram session expired — re-login required on the phone`)
          }
        }
      }
    } catch (e) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`)
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
      log(`${phone.ig_username}: no session ID configured`)
      return
    }
    setLoading(true)
    try {
      if (window.electronAPI?.fetchInstagramBySession) {
        const r = await window.electronAPI.fetchInstagramBySession({
          username:  phone.ig_username!,
          sessionid: phone.ig_sessionid,
        })
        if (r.ok && r.videos) {
          const ps: IgPost[] = r.videos.map(v => ({
            id:            v.id,
            shortcode:     v.shortcode,
            caption:       '',
            thumbnail:     v.thumbnail,
            taken_at:      v.timestamp ? new Date(v.timestamp).getTime() / 1000 : 0,
            comment_count: v.comments,
            is_video:      true,
          }))
          setPosts(ps)
        } else {
          log(`${phone.ig_username}: ${r.error ?? 'error'}`)
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
      log('No IG session configured for this phone — go to Phones → configure session')
      setComments([])
      return
    }
    setLoadingC(true)
    try {
      const r = await window.electronAPI?.fetchIgComments({ mediaId: post.id, sessionid })
      if (r?.ok && r.comments) {
        setComments(r.comments.map(c => ({ pk: c.pk, username: c.username, text: c.text, replied: null })))
        log(`${r.comments.length} comment${r.comments.length !== 1 ? 's' : ''} loaded`)
      } else {
        setComments([])
        log(`Failed to load comments: ${r?.error ?? 'unknown error'}`)
      }
    } catch (e) {
      setComments([])
      log(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setLoadingC(false)
  }

  function selectPost(p: IgPost) {
    setSelPost(p)
    loadComments(p)
  }

  function start() {
    if (!groqKey) { log('Missing Groq key — configure it in Settings'); return }
    setRunning(true)
    stopRef.current = false
    log(`Started — interval ${interval} min`)
    log('Groq worker to be connected to IPC backend (reply + post comment)')
  }

  function stop() {
    stopRef.current = true
    setRunning(false)
    log('Stopped')
  }

  const visiblePosts = posts.filter(p => {
    if (postFilter === 'all')     return true
    if (postFilter === 'new')     return (p.newCount ?? p.comment_count) > 0
    if (postFilter === 'replied') return (p.newCount ?? 0) === 0 && p.comment_count > 0
    return true
  })

  return (
    <div className="h-full flex flex-col overflow-hidden anim-page">

      {/* ── Premium page header ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-7 pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg,rgba(201,181,132,0.2),rgba(243,241,236,0.12))',
              border: '1px solid rgba(201,181,132,0.3)',
              boxShadow: '0 0 20px -4px rgba(201,181,132,0.4)',
            }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D4C499" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-black leading-none sf-text-gradient">Auto-Comments</h1>
            <p className="text-[13px] text-text3 mt-1">AI or manual replies to Instagram comments via GéeLark phones</p>
          </div>
        </div>
      </div>

      {/* ── Account chips bar ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        {phones.length === 0 ? (
          <p className="text-[13px] text-text3">No Instagram account linked — go to Phones first.</p>
        ) : phones.map((p, i) => {
          const palette = ['#4f8ef7','#22c55e','#f59e0b','#e0245e','#C9B584','#06b6d4','#f97316','#D4C499']
          const color  = palette[i % palette.length]
          const active = selectedPhone?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => loadPosts(p)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all flex-shrink-0 cursor-pointer"
              style={active
                ? { background: 'rgba(201,181,132,0.15)', border: '1px solid rgba(201,181,132,0.4)' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-md)' }}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                style={{ background: color }}>
                {(p.ig_username ?? p.phone_name)[0].toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-[13px] font-semibold text-text leading-none">@{p.ig_username}</p>
                <p className="text-[11px] text-text3 leading-none mt-0.5 flex items-center gap-1">
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
        <aside className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>

          {/* Aside header */}
          <div className="px-4 py-3.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-[13px] font-bold text-text flex-1">
              {selectedPhone ? `@${selectedPhone.ig_username}` : 'Select an account'}
            </p>
            {selectedPhone && (
              <button
                onClick={() => loadPosts(selectedPhone)}
                className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer text-text2"
                title="Reload"
                aria-label="Reload posts"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="px-3 py-2.5 flex gap-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
            {([
              { k: 'all',     l: 'All'       },
              { k: 'replied', l: 'Replied'   },
              { k: 'new',     l: 'New'       },
            ] as const).map(f => (
              <button
                key={f.k}
                onClick={() => setPostFilter(f.k)}
                className="px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors cursor-pointer"
                style={postFilter === f.k
                  ? f.k === 'replied'
                    ? { background: 'rgba(34,197,94,0.12)', color: 'var(--ok)',     border: '1px solid rgba(34,197,94,0.25)' }
                    : f.k === 'new'
                    ? { background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }
                    : { background: 'rgba(201,181,132,0.12)', color: 'var(--accent-glow)', border: '1px solid rgba(201,181,132,0.25)' }
                  : { background: 'transparent', color: 'var(--text-3)', border: '1px solid transparent' }}
              >{f.l}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : visiblePosts.length === 0 ? (
              <div className="sf-empty">
                <div className="sf-empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent-glow)' }}><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                </div>
                <p className="sf-empty-desc">
                  {selectedPhone ? 'No video found' : 'Choose an account above'}
                </p>
              </div>
            ) : visiblePosts.map(p => (
              <button
                key={p.id}
                onClick={() => selectPost(p)}
                className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors cursor-pointer hover:bg-white/[0.025]"
                style={selectedPost?.id === p.id
                  ? { background: 'rgba(201,181,132,0.08)', borderBottom: '1px solid var(--border)' }
                  : { borderBottom: '1px solid var(--border)' }}
              >
                <IgThumbnail src={p.thumbnail} sessionid={selectedPhone?.ig_sessionid} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-text3 flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                    {p.taken_at ? new Date(p.taken_at * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                  <p className="text-[13px] text-text truncate mt-0.5">{p.caption || `Reel ${p.shortcode}`}</p>
                  <p className="text-[12px] text-text3 mt-0.5 flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    {p.comment_count}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Right: comments + config ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedPost ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="sf-empty">
                <div className="sf-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent-glow)' }}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
                </div>
                <p className="sf-empty-title">Select a video</p>
                <p className="sf-empty-desc">Choose a video from the list to manage its comments</p>
              </div>
            </div>
          ) : (
            <>
              {/* Comment list header */}
              <div className="flex-shrink-0 px-6 py-3.5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="text-[14px] font-bold text-text flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent-glow)' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Comments
                </h2>
                <span className="sf-badge sf-badge-muted">{comments.length}</span>
                <button
                  onClick={() => loadComments(selectedPost)}
                  className="ml-auto sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer text-text2"
                  title="Reload comments"
                  aria-label="Reload comments"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                </button>
              </div>

              {/* Comments */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                {loadingComments ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : comments.length === 0 ? (
                  <div className="sf-empty">
                    <div className="sf-empty-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent-glow)' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <p className="sf-empty-desc">No comments loaded.</p>
                  </div>
                ) : comments.map(c => (
                  <div key={c.pk} className="sf-card p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-bold text-accent">@{c.username}</p>
                      {c.replied && (
                        <span className="sf-badge sf-badge-ok">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                          Replied
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-text">{c.text}</p>
                    {c.replied && (
                      <p className="text-[13px] flex items-start gap-2 pl-3 pt-1 text-ok" style={{ borderLeft: '2px solid rgba(34,197,94,0.3)' }}>
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
                          placeholder="Write a reply…"
                          className="sf-input flex-1"
                        />
                        <button
                          onClick={() => sendManualReply(c)}
                          disabled={!manualReplies[c.pk]?.trim() || sendingReply === c.pk}
                          className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-40"
                        >
                          {sendingReply === c.pk ? <span className="sf-spinner" /> : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/></svg>
                          )}
                          Send
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Config bar ─────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-6 py-4 space-y-4" style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)' }}>

            {/* Mode toggle */}
            <div className="flex items-center gap-3">
              <span className="sf-section-label">Reply mode</span>
              <div className="sf-tabs">
                <button
                  onClick={() => setReplyMode('ai')}
                  className={`sf-tab cursor-pointer inline-flex items-center gap-2${replyMode === 'ai' ? ' sf-tab-active' : ''}`}
                  style={replyMode === 'ai'
                    ? { background: 'rgba(201,181,132,0.15)', color: 'var(--accent-glow)', border: '1px solid rgba(201,181,132,0.3)' }
                    : {}}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8V4H8M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM2 14h2M20 14h2M15 13v2M9 13v2"/></svg>
                  AI Auto
                </button>
                <button
                  onClick={() => setReplyMode('manual')}
                  className={`sf-tab cursor-pointer inline-flex items-center gap-2${replyMode === 'manual' ? ' sf-tab-active' : ''}`}
                  style={replyMode === 'manual'
                    ? { background: 'rgba(201,181,132,0.15)', color: 'var(--accent-glow)', border: '1px solid rgba(201,181,132,0.3)' }
                    : {}}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                  Manual
                </button>
              </div>
            </div>

            {replyMode === 'ai' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="sf-section-label block mb-1.5">Groq API Key</label>
                    <input
                      type="password"
                      name="groq-key"
                      value={groqKey}
                      onChange={e => setGroqKey(e.target.value)}
                      placeholder="gsk_…"
                      className="sf-input"
                    />
                  </div>
                  <div>
                    <label className="sf-section-label block mb-1.5">Interval (min)</label>
                    <input
                      type="number"
                      name="interval"
                      min={1}
                      max={120}
                      value={interval}
                      onChange={e => setInterval_(parseInt(e.target.value) || 5)}
                      className="sf-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="sf-section-label block mb-1.5">AI Persona</label>
                  <textarea
                    name="persona"
                    value={persona}
                    onChange={e => setPersona(e.target.value)}
                    rows={2}
                    className="sf-input sf-textarea"
                  />
                </div>

                <div className="flex gap-2">
                  {!running ? (
                    <button onClick={start} className="sf-btn sf-btn-primary flex-1 cursor-pointer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      Start
                    </button>
                  ) : (
                    <button onClick={stop} className="sf-btn sf-btn-danger flex-1 cursor-pointer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                      Stop
                    </button>
                  )}
                  <button onClick={() => setLogs([])} className="sf-btn sf-btn-secondary cursor-pointer">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    Logs
                  </button>
                </div>
              </>
            )}

            {replyMode === 'manual' && (
              <div className="space-y-3">
                <div className="sf-card p-3 flex items-center gap-3" style={{ borderColor: 'rgba(201,181,132,0.2)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                  <p className="text-[13px] text-text2">Manual mode — write your reply under each comment then click Send.</p>
                </div>
                <label className="sf-card p-3 flex items-center gap-3 cursor-pointer" style={{ borderColor: useGeelark ? 'rgba(201,181,132,0.3)' : undefined }}>
                  <input
                    type="checkbox"
                    checked={useGeelark}
                    onChange={e => { setUseGeelark(e.target.checked); localStorage.setItem('autocomment-use-geelark', String(e.target.checked)) }}
                    className="cursor-pointer"
                  />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent-glow)', flexShrink: 0 }}><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                  <span className="text-[13px] text-text">
                    Send via GéeLark phone <span className="text-text3">(undetectable, ~15s)</span>
                  </span>
                </label>
                <button onClick={() => setLogs([])} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Clear logs
                </button>
              </div>
            )}

            {/* Log area */}
            <div className="sf-card p-3 max-h-20 overflow-y-auto font-mono text-[11px] text-text3 space-y-0.5"
              style={{ background: 'rgba(0,0,0,0.3)' }}>
              {logs.length === 0
                ? <p className="opacity-40">No logs</p>
                : logs.map((l, i) => <p key={i}>{l}</p>)
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
