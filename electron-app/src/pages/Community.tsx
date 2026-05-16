/*
 * ── Community ──────────────────────────────────────────────────────────────────
 *
 * SQL à exécuter dans Supabase SQL Editor :
 *
 * CREATE TABLE IF NOT EXISTS community_messages (
 *   id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id      uuid REFERENCES auth.users NOT NULL,
 *   content      text NOT NULL CHECK (char_length(content) <= 2000),
 *   display_name text NOT NULL DEFAULT '',
 *   avatar_url   text,
 *   org_name     text,
 *   channel      text NOT NULL DEFAULT 'chat',   -- 'news' | 'chat' | 'support'
 *   title        text,                            -- only for channel='news'
 *   is_admin     boolean NOT NULL DEFAULT false,
 *   created_at   timestamptz DEFAULT now()
 * );
 * ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "community_read"   ON community_messages
 *   FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "community_insert" ON community_messages
 *   FOR INSERT WITH CHECK (auth.uid() = user_id);
 *
 * CREATE TABLE IF NOT EXISTS user_profiles (
 *   user_id      uuid PRIMARY KEY REFERENCES auth.users,
 *   display_name text NOT NULL DEFAULT '',
 *   avatar_url   text,
 *   updated_at   timestamptz DEFAULT now()
 * );
 * ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "profiles_read" ON user_profiles
 *   FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "profiles_own"  ON user_profiles
 *   FOR ALL USING (auth.uid() = user_id);
 *
 * -- Storage bucket: "avatars" (public) via Supabase dashboard → Storage
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase }      from '@/lib/supabase'
import { useOrg }        from '@/lib/orgContext'
import { useLicense }    from '@/lib/license'
import { Spinner }       from '@/components/ui/Spinner'

interface CommunityProps { user: User }

type Channel = 'news' | 'chat' | 'support'

interface Message {
  id: string
  user_id: string
  content: string
  display_name: string
  avatar_url: string | null
  org_name: string | null
  channel: Channel
  title: string | null
  is_admin: boolean
  created_at: string
}

interface Profile {
  display_name: string
  avatar_url: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const GRADIENT_PAIRS: [string, string][] = [
  ['#7c3aed', '#ec4899'],
  ['#2563eb', '#7c3aed'],
  ['#059669', '#0ea5e9'],
  ['#ea580c', '#f59e0b'],
  ['#dc2626', '#f43f5e'],
  ['#0891b2', '#6366f1'],
  ['#7c3aed', '#0ea5e9'],
  ['#d97706', '#ec4899'],
]

function gradientForId(id: string): [string, string] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) >>> 0
  return GRADIENT_PAIRS[h % GRADIENT_PAIRS.length]
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return 'à l\'instant'
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ url, name, userId, size = 36, onClick }: {
  url: string | null; name: string; userId: string; size?: number; onClick?: () => void
}) {
  const [g1, g2] = gradientForId(userId)
  const r = Math.round(size * 0.3)
  const initials = (name || '?').slice(0, 2).toUpperCase()
  const base: React.CSSProperties = { width: size, height: size, borderRadius: r, flexShrink: 0 }
  const cls = onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''

  if (url) {
    return <img src={url} alt={name} onClick={onClick} className={cls}
      style={{ ...base, objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.1)' }} />
  }
  return (
    <div onClick={onClick} className={`flex items-center justify-center font-black select-none ${cls}`}
      style={{ ...base, background: `linear-gradient(135deg,${g1},${g2})`, fontSize: size * 0.34, color: '#fff', boxShadow: `0 2px 8px ${g1}55`, letterSpacing: '-0.02em' }}>
      {initials}
    </div>
  )
}

// ── Chat message row ───────────────────────────────────────────────────────────

function ChatRow({ msg, isOwn, compact }: { msg: Message; isOwn: boolean; compact: boolean }) {
  return (
    <div className={`flex gap-3 group ${compact ? 'mt-[2px]' : 'mt-4'}`}>
      <div style={{ width: 34, flexShrink: 0 }}>
        {!compact && <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={34} />}
      </div>
      <div className="flex-1 min-w-0">
        {!compact && (
          <div className="flex items-center gap-2 mb-[3px] flex-wrap">
            <span className="text-[13px] font-bold leading-none" style={{ color: isOwn ? '#c4b5fd' : '#e8e0ff' }}>
              {msg.display_name || 'Anonyme'}
            </span>
            {msg.is_admin && (
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full tracking-wide flex items-center gap-0.5"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.25))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.25)' }}>
                ⭐ ScaleFlow Admin
              </span>
            )}
            {isOwn && !msg.is_admin && (
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full tracking-wide"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>Moi</span>
            )}
            {msg.org_name && (
              <span className="text-[10px] font-semibold px-2 py-[2px] rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.65)', border: '1px solid rgba(139,92,246,0.15)' }}>
                {msg.org_name}
              </span>
            )}
            <span className="ml-auto text-[10px] opacity-0 group-hover:opacity-60 transition-opacity tabular-nums"
              style={{ color: 'rgba(196,181,253,0.5)' }}>
              {timeAgo(msg.created_at)}
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <p className="flex-1 text-[13.5px] leading-relaxed break-words" style={{ color: 'rgba(212,220,240,0.9)' }}>
            {msg.content}
          </p>
          {compact && (
            <span className="text-[9px] opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0 pb-0.5 tabular-nums"
              style={{ color: 'rgba(196,181,253,0.5)' }}>
              {timeAgo(msg.created_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── News card ──────────────────────────────────────────────────────────────────

function NewsCard({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = msg.content.length > 280
  const shown = !isLong || expanded ? msg.content : msg.content.slice(0, 280) + '…'

  return (
    <div className="rounded-2xl overflow-hidden transition-all hover:border-purple-500/30"
      style={{ background: 'rgba(8,5,20,0.8)', border: '1px solid rgba(139,92,246,0.18)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
      {/* Top accent bar */}
      <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.2)' }}>
            📢
          </div>
          <div className="flex-1 min-w-0">
            {msg.title && (
              <p className="text-base font-black text-white leading-tight mb-1">{msg.title}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={18} />
                <span className="text-[11px] font-semibold" style={{ color: '#c4b5fd' }}>{msg.display_name}</span>
              </div>
              <span className="text-[9px] font-black px-1.5 py-[2px] rounded-full uppercase tracking-wide"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.2))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.2)' }}>
                Admin
              </span>
              {msg.org_name && (
                <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.45)' }}>{msg.org_name}</span>
              )}
              <span className="ml-auto text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }} title={fullDate(msg.created_at)}>
                {timeAgo(msg.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(212,220,240,0.85)' }}>
          {shown}
        </p>
        {isLong && (
          <button onClick={() => setExpanded(v => !v)}
            className="mt-2 text-[11px] font-semibold transition-colors"
            style={{ color: '#a78bfa' }}>
            {expanded ? '▲ Réduire' : '▼ Lire la suite'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Profile modal ──────────────────────────────────────────────────────────────

function ProfileModal({ profile, userId, onClose, onSaved }: {
  profile: Profile; userId: string; onClose: () => void; onSaved: (p: Profile) => void
}) {
  const [name, setName]       = useState(profile.display_name)
  const [avatarUrl, setAUrl]  = useState(profile.avatar_url)
  const [uploading, setUpload] = useState(false)
  const [saving, setSaving]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUpload(true)
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`
      await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAUrl(data.publicUrl + `?t=${Date.now()}`)
    } finally { setUpload(false) }
  }

  async function save() {
    setSaving(true)
    const trimmed = name.trim() || profile.display_name
    await supabase.from('user_profiles').upsert({
      user_id: userId, display_name: trimmed, avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    onSaved({ display_name: trimmed, avatar_url: avatarUrl })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[9980] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[340px] mx-4 rounded-2xl overflow-hidden anim-scale-in"
        style={{ background: '#0c0919', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'linear-gradient(135deg,rgba(139,92,246,0.09),rgba(236,72,153,0.04))' }}>
          <div>
            <p className="font-black text-white text-[15px]">Mon profil</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.45)' }}>Visible par toute la communauté</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-white/[0.06]"
            style={{ color: 'rgba(196,181,253,0.5)' }}>✕</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <Avatar url={avatarUrl} name={name || profile.display_name} userId={userId} size={80} />
              <div onClick={() => fileRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.6)', borderRadius: Math.round(80 * 0.3) }}>
                {uploading ? <Spinner size="sm" /> : <><span className="text-lg">📷</span><span className="text-[9px] text-white font-bold">Modifier</span></>}
              </div>
            </div>
            <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>Clique pour changer ta photo</p>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.15em] font-black mb-2"
              style={{ color: 'rgba(139,92,246,0.6)' }}>Pseudo</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ton pseudo…" maxLength={32}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none sf-input" />
            <div className="flex justify-end mt-1">
              <span className="text-[9px]" style={{ color: 'rgba(196,181,253,0.25)' }}>{name.length}/32</span>
            </div>
          </div>
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <Avatar url={avatarUrl} name={name || '?'} userId={userId} size={36} />
            <div>
              <p className="text-[12px] font-bold text-white">{name || 'Ton pseudo'}</p>
              <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>Aperçu</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
            Annuler
          </button>
          <button onClick={save} disabled={saving || uploading}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all btn-sf-primary disabled:opacity-50">
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  )
}

// ── Setup screen ───────────────────────────────────────────────────────────────

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS community_messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users NOT NULL,
  content      text NOT NULL CHECK (char_length(content) <= 2000),
  display_name text NOT NULL DEFAULT '',
  avatar_url   text,
  org_name     text,
  channel      text NOT NULL DEFAULT 'chat',
  title        text,
  is_admin     boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_read"   ON community_messages
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "community_insert" ON community_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users,
  display_name text NOT NULL DEFAULT '',
  avatar_url   text,
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON user_profiles
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_own"  ON user_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Bucket "avatars" public → Supabase dashboard → Storage`

function SetupScreen({ onRetry }: { onRetry: () => void }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(SETUP_SQL)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 p-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
        style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>💬</div>
      <div className="text-center space-y-2">
        <p className="text-lg font-black text-white">Configuration requise</p>
        <p className="text-sm max-w-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>
          Lance ce SQL dans <strong className="text-accent">Supabase → SQL Editor</strong> pour activer la communauté.
        </p>
      </div>
      <div className="w-full max-w-2xl rounded-xl overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.08)' }}>
          <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#a78bfa' }}>SQL</span>
          <button onClick={copy} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
            style={{ background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(139,92,246,0.15)', color: copied ? '#34d399' : '#a78bfa' }}>
            {copied ? '✓ Copié' : '📋 Copier'}
          </button>
        </div>
        <pre className="p-4 text-[11px] leading-relaxed overflow-auto max-h-56"
          style={{ color: 'rgba(196,181,253,0.65)', fontFamily: 'JetBrains Mono, monospace' }}>
          {SETUP_SQL}
        </pre>
      </div>
      <button onClick={onRetry} className="px-5 py-2.5 rounded-xl text-sm font-semibold btn-sf-primary">
        ↺ Réessayer
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function Community({ user }: CommunityProps) {
  const { currentOrg, role }   = useOrg()
  const license                = useLicense()
  const isAdmin = license.isSuperAdmin || role === 'admin' || role === 'owner'

  const [tab, setTab]               = useState<Channel>('news')
  const [messages, setMessages]     = useState<Message[]>([])
  const [loading, setLoading]       = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [profile, setProfile]       = useState<Profile>({
    display_name: user.email?.split('@')[0] ?? 'Anonyme',
    avatar_url: null,
  })
  const [showProfile, setShowProfile] = useState(false)

  // Chat state
  const [chatDraft, setChatDraft]   = useState('')
  const [chatSending, setChatSend]  = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const listRef    = useRef<HTMLDivElement>(null)
  const chatRef    = useRef<HTMLTextAreaElement>(null)

  // News post state (admin only)
  const [newsTitle,   setNewsTitle]   = useState('')
  const [newsContent, setNewsContent] = useState('')
  const [newsSending, setNewsSend]    = useState(false)
  const [showNewsForm, setShowNewsForm] = useState(false)

  const loadProfile = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles').select('display_name, avatar_url')
      .eq('user_id', user.id).maybeSingle()
    if (data) setProfile({ display_name: data.display_name || user.email?.split('@')[0] || 'Anonyme', avatar_url: data.avatar_url })
  }, [user.id, user.email])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('community_messages')
      .select('id, user_id, content, display_name, avatar_url, org_name, channel, title, is_admin, created_at')
      .order('created_at', { ascending: tab === 'chat' })
      .limit(200)
    if (error) {
      if (error.code === '42P01') setNeedsSetup(true)
      setLoading(false); return
    }
    setNeedsSetup(false)
    setMessages(data ?? [])
    setLoading(false)
  }, [tab])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadMessages() }, [loadMessages])

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('community-v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, payload => {
        setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new as Message])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Auto-scroll (chat only)
  useEffect(() => {
    if (tab !== 'chat') return
    const el = listRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220
    if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tab])

  // Scroll to bottom instantly on initial load
  useEffect(() => {
    if (!loading && tab === 'chat') {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' as any }), 50)
    }
  }, [loading, tab])

  async function sendChat() {
    const content = chatDraft.trim()
    if (!content || chatSending) return
    setChatSend(true); setChatDraft('')
    const { error } = await supabase.from('community_messages').insert({
      user_id: user.id, content,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      org_name: currentOrg?.name ?? null,
      channel: 'chat', title: null,
      is_admin: isAdmin,
    })
    if (error) setChatDraft(content)
    setChatSend(false)
    chatRef.current?.focus()
  }

  async function sendNews() {
    const content = newsContent.trim()
    if (!content || newsSending) return
    setNewsSend(true)
    await supabase.from('community_messages').insert({
      user_id: user.id, content,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      org_name: currentOrg?.name ?? null,
      channel: 'news',
      title: newsTitle.trim() || null,
      is_admin: true,
    })
    setNewsTitle(''); setNewsContent(''); setShowNewsForm(false)
    setNewsSend(false)
  }

  if (needsSetup) return <SetupScreen onRetry={loadMessages} />

  const newsMessages    = messages.filter(m => m.channel === 'news').reverse()
  const chatMessages    = messages.filter(m => m.channel === 'chat')
  const supportMessages = messages.filter(m => m.channel === 'support')
  const [g1, g2] = gradientForId(user.id)

  return (
    <div className="h-full flex flex-col" style={{ background: '#06040f' }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.9)', backdropFilter: 'blur(12px)' }}>

        {/* Top row */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.25),rgba(236,72,153,0.12))', border: '1px solid rgba(139,92,246,0.25)' }}>
              <span className="text-base">💬</span>
            </div>
            <div>
              <p className="text-[14px] font-black text-white leading-tight">Communauté</p>
              <p className="text-[10px] leading-tight" style={{ color: 'rgba(196,181,253,0.4)' }}>
                {tab === 'news'
                  ? `${newsMessages.length} actualité${newsMessages.length > 1 ? 's' : ''}`
                  : `${chatMessages.length} message${chatMessages.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          {/* Profile button */}
          <button onClick={() => setShowProfile(true)}
            className="flex items-center gap-2.5 pl-2.5 pr-3 py-2 rounded-xl transition-all hover:bg-white/[0.04] group"
            style={{ border: '1px solid rgba(139,92,246,0.12)' }}>
            <Avatar url={profile.avatar_url} name={profile.display_name} userId={user.id} size={28} />
            <div className="text-left">
              <p className="text-[11.5px] font-semibold leading-tight text-white">{profile.display_name}</p>
              {currentOrg && <p className="text-[9.5px] leading-tight" style={{ color: 'rgba(139,92,246,0.7)' }}>{currentOrg.name}</p>}
            </div>
            <span className="text-[10px] opacity-0 group-hover:opacity-50 transition-opacity ml-1" style={{ color: '#a78bfa' }}>✏</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 gap-1 pb-0">
          {([
            { id: 'news'    as Channel, label: 'Actualités ScaleFlow', icon: '📢', badge: newsMessages.length > 0 ? String(newsMessages.length) : undefined },
            { id: 'chat'    as Channel, label: 'Discussion',           icon: '💬', badge: chatMessages.length > 0 ? String(chatMessages.length) : undefined },
            { id: 'support' as Channel, label: 'Support',              icon: '🎫', badge: supportMessages.length > 0 ? String(supportMessages.length) : undefined },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-bold transition-all relative"
              style={tab === t.id
                ? { color: '#c4b5fd', borderBottom: '2px solid #8b5cf6', marginBottom: -1 }
                : { color: 'rgba(196,181,253,0.35)', borderBottom: '2px solid transparent', marginBottom: -1 }}>
              <span className="text-[14px]">{t.icon}</span>
              <span>{t.label}</span>
              {t.badge && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  style={tab === t.id
                    ? { background: 'rgba(139,92,246,0.25)', color: '#a78bfa' }
                    : { background: 'rgba(255,255,255,0.06)', color: 'rgba(196,181,253,0.4)' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}

      {/* NEWS TAB */}
      {tab === 'news' && (
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {/* Admin post button */}
          {isAdmin && (
            <div className="px-5 pt-5">
              {!showNewsForm ? (
                <button onClick={() => setShowNewsForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all group"
                  style={{ background: 'rgba(139,92,246,0.07)', border: '1px dashed rgba(139,92,246,0.3)' }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>
                    📢
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-white group-hover:text-accent transition-colors">
                      Publier une actualité
                    </p>
                    <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
                      Visible par tous les membres
                    </p>
                  </div>
                  <span className="ml-auto text-[10px] font-black px-2 py-1 rounded-lg"
                    style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.2))', color: '#f0a8ff' }}>
                    ADMIN
                  </span>
                </button>
              ) : (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(8,5,20,0.9)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.05))' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">📢</span>
                      <p className="text-[12px] font-black text-white">Nouvelle actualité</p>
                    </div>
                    <button onClick={() => setShowNewsForm(false)}
                      className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(196,181,253,0.4)' }}>✕</button>
                  </div>
                  <div className="p-4 space-y-3">
                    <input
                      type="text" value={newsTitle} onChange={e => setNewsTitle(e.target.value)}
                      placeholder="Titre (optionnel)…"
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm font-bold text-white outline-none sf-input"
                    />
                    <textarea
                      value={newsContent} onChange={e => setNewsContent(e.target.value)}
                      placeholder="Contenu de l'actualité…"
                      rows={4} maxLength={2000}
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none resize-none sf-input"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.3)' }}>{newsContent.length}/2000</span>
                      <div className="flex gap-2">
                        <button onClick={() => setShowNewsForm(false)}
                          className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          Annuler
                        </button>
                        <button onClick={sendNews} disabled={!newsContent.trim() || newsSending}
                          className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all btn-sf-primary disabled:opacity-40">
                          {newsSending ? 'Publication…' : '📢 Publier'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* News list */}
          <div className="p-5 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
            ) : newsMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)' }}>📢</div>
                <div className="space-y-1">
                  <p className="font-bold text-white">Aucune actualité</p>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    {isAdmin ? 'Publie la première actualité !' : 'Les admins publieront bientôt des actualités.'}
                  </p>
                </div>
              </div>
            ) : (
              newsMessages.map(msg => <NewsCard key={msg.id} msg={msg} />)
            )}
          </div>
        </div>
      )}

      {/* CHAT TAB */}
      {tab === 'chat' && (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <Spinner size="md" />
                  </div>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>Chargement…</p>
                </div>
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
                  style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.06))', border: '1px solid rgba(139,92,246,0.15)' }}>
                  💬
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-base font-black text-white">Aucun message pour l'instant</p>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>Sois le premier à écrire !</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.1)' }} />
                  <span className="text-[10px] font-semibold px-2" style={{ color: 'rgba(196,181,253,0.3)' }}>
                    Début de la discussion
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.1)' }} />
                </div>
                {chatMessages.map((msg, i) => {
                  const prev = chatMessages[i - 1]
                  const compact = prev?.user_id === msg.user_id &&
                    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
                  return <ChatRow key={msg.id} msg={msg} isOwn={msg.user_id === user.id} compact={compact} />
                })}
                <div ref={bottomRef} className="h-1" />
              </>
            )}
          </div>

          {/* Chat input */}
          <div className="flex-shrink-0 px-4 py-3"
            style={{ borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(6,4,15,0.95)' }}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: `linear-gradient(135deg,${g1},${g2})` }} />
              <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                Tu écris en tant que <strong style={{ color: 'rgba(196,181,253,0.6)' }}>{profile.display_name}</strong>
                {currentOrg && <span style={{ color: 'rgba(139,92,246,0.6)' }}> · {currentOrg.name}</span>}
              </span>
            </div>
            <div className="flex items-end gap-3">
              <Avatar url={profile.avatar_url} name={profile.display_name} userId={user.id} size={32} />
              <div className="flex-1 flex items-end gap-2 rounded-xl px-3.5 py-2.5"
                style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <textarea
                  ref={chatRef}
                  value={chatDraft}
                  onChange={e => setChatDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
                  placeholder="Écrire un message… (⏎ pour envoyer)"
                  rows={1} maxLength={1000}
                  className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                  style={{ minHeight: 22, maxHeight: 120 }}
                />
                <button onClick={sendChat} disabled={!chatDraft.trim() || chatSending}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30 active:scale-90"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', boxShadow: '0 2px 12px rgba(124,58,237,0.4)' }}>
                  {chatSending ? <Spinner size="sm" /> : <span className="text-sm leading-none">↑</span>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SUPPORT TAB */}
      {tab === 'support' && (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
            ) : supportMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
                  style={{ background: 'linear-gradient(135deg,rgba(96,165,250,0.12),rgba(139,92,246,0.06))', border: '1px solid rgba(96,165,250,0.15)' }}>
                  🎫
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-base font-black text-white">Aucune question pour l'instant</p>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    Pose ta question — l'équipe te répondra ici.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px" style={{ background: 'rgba(96,165,250,0.15)' }} />
                  <span className="text-[10px] font-semibold px-2" style={{ color: 'rgba(147,197,253,0.4)' }}>Support ScaleFlow</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(96,165,250,0.15)' }} />
                </div>
                {supportMessages.map((msg, i) => {
                  const prev = supportMessages[i - 1]
                  const compact = prev?.user_id === msg.user_id &&
                    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
                  const msgIsAdmin = isAdmin && msg.user_id === user.id
                  return (
                    <div key={msg.id} className={`flex gap-3 group ${compact ? 'mt-[2px]' : 'mt-4'} ${msgIsAdmin ? 'flex-row-reverse' : ''}`}>
                      <div style={{ width: 34, flexShrink: 0 }}>
                        {!compact && <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={34} />}
                      </div>
                      <div className={`flex-1 min-w-0 ${msgIsAdmin ? 'text-right' : ''}`}>
                        {!compact && (
                          <div className={`flex items-center gap-2 mb-[3px] flex-wrap ${msgIsAdmin ? 'justify-end' : ''}`}>
                            <span className="text-[13px] font-bold leading-none" style={{ color: msgIsAdmin ? '#93c5fd' : '#e8e0ff' }}>
                              {msg.display_name || 'Anonyme'}
                            </span>
                            {msgIsAdmin && (
                              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full tracking-wide"
                                style={{ background: 'rgba(96,165,250,0.2)', color: '#93c5fd' }}>Support</span>
                            )}
                            {msg.org_name && (
                              <span className="text-[10px] font-semibold px-2 py-[2px] rounded-full"
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.65)', border: '1px solid rgba(139,92,246,0.15)' }}>
                                {msg.org_name}
                              </span>
                            )}
                            <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity tabular-nums ml-auto"
                              style={{ color: 'rgba(196,181,253,0.5)' }}>{timeAgo(msg.created_at)}</span>
                          </div>
                        )}
                        <p className={`text-[13.5px] leading-relaxed break-words inline-block px-3 py-2 rounded-xl ${msgIsAdmin ? 'ml-auto' : ''}`}
                          style={msgIsAdmin
                            ? { background: 'rgba(96,165,250,0.12)', color: 'rgba(212,230,255,0.9)', border: '1px solid rgba(96,165,250,0.2)' }
                            : { color: 'rgba(212,220,240,0.9)' }}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} className="h-1" />
              </>
            )}
          </div>
          {/* Support input */}
          <div className="flex-shrink-0 px-4 py-3"
            style={{ borderTop: '1px solid rgba(96,165,250,0.1)', background: 'rgba(6,4,15,0.95)' }}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-400" />
              <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                {isAdmin
                  ? <><strong style={{ color: 'rgba(147,197,253,0.7)' }}>Mode support</strong> — ta réponse sera mise en avant</>
                  : <>Pose ta question à l'équipe <strong style={{ color: 'rgba(147,197,253,0.6)' }}>ScaleFlow</strong></>}
              </span>
            </div>
            <div className="flex items-end gap-3">
              <Avatar url={profile.avatar_url} name={profile.display_name} userId={user.id} size={32} />
              <div className="flex-1 flex items-end gap-2 rounded-xl px-3.5 py-2.5"
                style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <textarea
                  value={chatDraft}
                  onChange={e => setChatDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      const content = chatDraft.trim()
                      if (!content || chatSending) return
                      setChatSend(true); setChatDraft('')
                      supabase.from('community_messages').insert({
                        user_id: user.id, content,
                        display_name: profile.display_name, avatar_url: profile.avatar_url,
                        org_name: currentOrg?.name ?? null, channel: 'support', title: null,
                        is_admin: isAdmin,
                      }).then(({ error }) => { if (error) setChatDraft(content); setChatSend(false) })
                    }
                  }}
                  onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
                  placeholder={isAdmin ? 'Répondre à la communauté…' : 'Pose ta question ici…'}
                  rows={1} maxLength={1000}
                  className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                  style={{ minHeight: 22, maxHeight: 120 }}
                />
                <button
                  onClick={() => {
                    const content = chatDraft.trim()
                    if (!content || chatSending) return
                    setChatSend(true); setChatDraft('')
                    supabase.from('community_messages').insert({
                      user_id: user.id, content,
                      display_name: profile.display_name, avatar_url: profile.avatar_url,
                      org_name: currentOrg?.name ?? null, channel: 'support', title: null,
                      is_admin: isAdmin,
                    }).then(({ error }) => { if (error) setChatDraft(content); setChatSend(false) })
                  }}
                  disabled={!chatDraft.trim() || chatSending}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30 active:scale-90"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 12px rgba(37,99,235,0.35)' }}>
                  {chatSending ? <Spinner size="sm" /> : <span className="text-sm leading-none">↑</span>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Profile modal */}
      {showProfile && (
        <ProfileModal
          profile={profile} userId={user.id}
          onClose={() => setShowProfile(false)}
          onSaved={p => { setProfile(p); setShowProfile(false) }}
        />
      )}
    </div>
  )
}
