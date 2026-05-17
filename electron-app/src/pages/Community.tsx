/*
 * SQL à exécuter dans Supabase SQL Editor :
 *
 * CREATE TABLE IF NOT EXISTS community_messages (
 *   id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id        uuid REFERENCES auth.users NOT NULL,
 *   content        text NOT NULL CHECK (char_length(content) <= 2000),
 *   display_name   text NOT NULL DEFAULT '',
 *   avatar_url     text,
 *   org_name       text,
 *   channel        text NOT NULL DEFAULT 'chat',
 *   title          text,
 *   is_admin       boolean NOT NULL DEFAULT false,
 *   thread_user_id uuid,
 *   video_url      text,
 *   created_at     timestamptz DEFAULT now()
 * );
 * -- Si la table existe déjà :
 * -- ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS video_url text;
 * ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "community_read"   ON community_messages FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "community_insert" ON community_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
 * CREATE POLICY "community_delete" ON community_messages FOR DELETE USING (
 *   auth.uid() = user_id OR
 *   EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
 * );
 *
 * CREATE TABLE IF NOT EXISTS user_profiles (
 *   user_id         uuid PRIMARY KEY REFERENCES auth.users,
 *   display_name    text NOT NULL DEFAULT '',
 *   avatar_url      text,
 *   name_updated_at timestamptz,
 *   updated_at      timestamptz DEFAULT now()
 * );
 * ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "profiles_read" ON user_profiles FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "profiles_own"  ON user_profiles FOR ALL USING (auth.uid() = user_id);
 *
 * CREATE TABLE IF NOT EXISTS platform_admins (
 *   user_id uuid PRIMARY KEY REFERENCES auth.users
 * );
 * ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "platform_admins_read" ON platform_admins FOR SELECT USING (auth.role() = 'authenticated');
 * -- INSERT INTO platform_admins (user_id) VALUES ('TON-USER-ID-ICI');
 *
 * CREATE TABLE IF NOT EXISTS community_mutes (
 *   id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id     uuid REFERENCES auth.users NOT NULL,
 *   muted_by    uuid REFERENCES auth.users NOT NULL,
 *   muted_until timestamptz NOT NULL,
 *   created_at  timestamptz DEFAULT now()
 * );
 * ALTER TABLE community_mutes ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "mutes_read"   ON community_mutes FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "mutes_insert" ON community_mutes FOR INSERT WITH CHECK (
 *   EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
 * );
 *
 * ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
 *
 * CREATE TABLE IF NOT EXISTS community_reactions (
 *   user_id    uuid REFERENCES auth.users NOT NULL,
 *   message_id uuid REFERENCES community_messages NOT NULL,
 *   PRIMARY KEY (user_id, message_id)
 * );
 * ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "reactions_read"   ON community_reactions FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "reactions_insert" ON community_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
 * CREATE POLICY "reactions_delete" ON community_reactions FOR DELETE USING (auth.uid() = user_id);
 *
 * CREATE OR REPLACE FUNCTION increment_view(msg_id uuid) RETURNS void
 * LANGUAGE sql SECURITY DEFINER AS $$
 *   UPDATE community_messages SET view_count = view_count + 1 WHERE id = msg_id;
 * $$;
 *
 * -- Bucket "avatars" public → Supabase dashboard → Storage
 *
 * -- Bucket "community" public pour les vidéos → Supabase dashboard → Storage → New bucket → "community" → Public
 * -- Puis policies Storage :
 * -- CREATE POLICY "community_select" ON storage.objects FOR SELECT USING (bucket_id = 'community');
 * -- CREATE POLICY "community_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'community' AND auth.role() = 'authenticated');
 * -- CREATE POLICY "community_delete" ON storage.objects FOR DELETE USING (bucket_id = 'community' AND auth.uid()::text = (storage.foldername(name))[1]);
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase }   from '@/lib/supabase'
import { useOrg }     from '@/lib/orgContext'
import { useLicense } from '@/lib/license'
import { Spinner }    from '@/components/ui/Spinner'

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
  thread_user_id: string | null
  video_url: string | null
  view_count: number
  created_at: string
}

interface Profile {
  display_name: string
  avatar_url: string | null
  name_updated_at: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isImageMedia(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|$)/i.test(url)
}

function MediaBlock({ url, maxHeight = 280 }: { url: string; maxHeight?: number }) {
  if (isImageMedia(url)) {
    return <img src={url} alt="" className="mt-2 rounded-xl max-w-full object-contain"
      style={{ maxHeight, background: 'rgba(0,0,0,0.3)' }} />
  }
  return (
    <video controls className="mt-2 rounded-xl max-w-full" style={{ maxHeight, background: '#000' }}>
      <source src={url} />
    </video>
  )
}

const GRADIENT_PAIRS: [string, string][] = [
  ['#7c3aed', '#ec4899'], ['#2563eb', '#7c3aed'], ['#059669', '#0ea5e9'],
  ['#ea580c', '#f59e0b'], ['#dc2626', '#f43f5e'], ['#0891b2', '#6366f1'],
  ['#7c3aed', '#0ea5e9'], ['#d97706', '#ec4899'],
]

function gradientForId(id: string): [string, string] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) >>> 0
  return GRADIENT_PAIRS[h % GRADIENT_PAIRS.length]
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)        return 'à l\'instant'
  if (diff < 3600)      return `${Math.floor(diff / 60)}min`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h`
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
  const [g1, g2]            = gradientForId(userId)
  const [broken, setBroken] = useState(false)
  const r                   = Math.round(size * 0.3)
  const initials            = (name || '?').slice(0, 2).toUpperCase()
  const base: React.CSSProperties = { width: size, height: size, borderRadius: r, flexShrink: 0 }
  const cls = onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''

  // Reset broken state if URL changes (e.g. after re-upload)
  useEffect(() => { setBroken(false) }, [url])

  if (url && !broken) {
    return <img src={url} alt={name} onClick={onClick} className={cls}
      onError={() => setBroken(true)}
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

function ChatRow({ msg, isOwn, compact, isAdmin, likeCount, liked, onLike, onDelete, onMute }: {
  msg: Message; isOwn: boolean; compact: boolean; isAdmin: boolean
  likeCount: number; liked: boolean; onLike: (id: string) => void
  onDelete: (id: string) => void; onMute?: (uid: string, name: string) => void
}) {
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
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full tracking-wide"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.25))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.25)' }}>
                ⭐ ScaleFlow Admin
              </span>
            )}
            {isOwn && !msg.is_admin && (
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full tracking-wide"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>Moi</span>
            )}
            {msg.org_name && !msg.is_admin && (
              <span className="text-[10px] font-semibold px-2 py-[2px] rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.65)', border: '1px solid rgba(139,92,246,0.15)' }}>
                {msg.org_name}
              </span>
            )}
            <span className="ml-auto text-[10px] opacity-0 group-hover:opacity-60 transition-opacity tabular-nums"
              style={{ color: 'rgba(196,181,253,0.5)' }}>{timeAgo(msg.created_at)}</span>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] leading-relaxed break-words" style={{ color: 'rgba(212,220,240,0.9)' }}>
              {msg.content}
            </p>
            {msg.video_url && <MediaBlock url={msg.video_url} maxHeight={260} />}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pb-0.5">
            {compact && (
              <span className="text-[9px] tabular-nums mr-1" style={{ color: 'rgba(196,181,253,0.35)' }}>
                {timeAgo(msg.created_at)}
              </span>
            )}
            <button onClick={() => onLike(msg.id)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg text-[11px] transition-all"
              style={{ color: liked ? '#f472b6' : 'rgba(196,181,253,0.4)', background: liked ? 'rgba(236,72,153,0.12)' : 'transparent' }}>
              ❤️ {likeCount > 0 && <span className="text-[10px] tabular-nums">{likeCount}</span>}
            </button>
            {isAdmin && !isOwn && onMute && (
              <button onClick={() => onMute(msg.user_id, msg.display_name)}
                className="w-5 h-5 flex items-center justify-center rounded text-[11px]"
                style={{ color: 'rgba(251,191,36,0.6)' }} title="Muter">🔇</button>
            )}
            {isAdmin && (
              <button onClick={() => onDelete(msg.id)}
                className="w-5 h-5 flex items-center justify-center rounded text-[11px]"
                style={{ color: 'rgba(239,68,68,0.6)' }} title="Supprimer">🗑</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Support message row ────────────────────────────────────────────────────────

function SupportMsgRow({ msg, isAdmin, compact, onDelete }: {
  msg: Message; isAdmin: boolean; compact: boolean; onDelete: (id: string) => void
}) {
  const isAdminMsg = msg.is_admin
  return (
    <div className={`flex gap-3 group ${compact ? 'mt-[2px]' : 'mt-4'} ${isAdminMsg ? 'flex-row-reverse' : ''}`}>
      <div style={{ width: 34, flexShrink: 0 }}>
        {!compact && <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={34} />}
      </div>
      <div className={`flex-1 min-w-0 ${isAdminMsg ? 'flex flex-col items-end' : ''}`}>
        {!compact && (
          <div className={`flex items-center gap-2 mb-[3px] flex-wrap ${isAdminMsg ? 'justify-end' : ''}`}>
            <span className="text-[13px] font-bold" style={{ color: isAdminMsg ? '#93c5fd' : '#e8e0ff' }}>
              {msg.display_name || 'Anonyme'}
            </span>
            {isAdminMsg && (
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.25))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.25)' }}>
                ⭐ ScaleFlow Admin
              </span>
            )}
            <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity ml-auto tabular-nums"
              style={{ color: 'rgba(196,181,253,0.5)' }}>{timeAgo(msg.created_at)}</span>
            {isAdmin && (
              <button onClick={() => onDelete(msg.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px]"
                style={{ color: 'rgba(239,68,68,0.6)' }}>🗑</button>
            )}
          </div>
        )}
        <div className="inline-block px-3 py-2 rounded-xl max-w-[85%]"
          style={isAdminMsg
            ? { background: 'linear-gradient(135deg,rgba(124,58,237,0.18),rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.22)' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[13.5px] leading-relaxed break-words"
            style={{ color: isAdminMsg ? 'rgba(230,220,255,0.95)' : 'rgba(212,220,240,0.9)' }}>
            {msg.content}
          </p>
          {msg.video_url && <MediaBlock url={msg.video_url} maxHeight={240} />}
        </div>
      </div>
    </div>
  )
}

// ── News card ──────────────────────────────────────────────────────────────────

function NewsCard({ msg, isAdmin, likeCount, liked, onLike, onView, onDelete }: {
  msg: Message; isAdmin: boolean
  likeCount: number; liked: boolean; onLike: (id: string) => void; onView: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = msg.content.length > 280
  const shown  = !isLong || expanded ? msg.content : msg.content.slice(0, 280) + '…'

  useEffect(() => { onView(msg.id) }, [msg.id])
  return (
    <div className="rounded-2xl overflow-hidden transition-all hover:border-purple-500/30 group"
      style={{ background: 'rgba(8,5,20,0.8)', border: '1px solid rgba(139,92,246,0.18)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
      <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#7c3aed,#ec4899)' }} />
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.2)' }}>
            📢
          </div>
          <div className="flex-1 min-w-0">
            {msg.title && <p className="text-base font-black text-white leading-tight mb-1">{msg.title}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={18} />
                <span className="text-[11px] font-semibold" style={{ color: '#c4b5fd' }}>{msg.display_name}</span>
              </div>
              <span className="text-[9px] font-black px-1.5 py-[2px] rounded-full uppercase tracking-wide"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.2))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.2)' }}>
                Admin
              </span>
              {msg.org_name && !msg.is_admin && <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.45)' }}>{msg.org_name}</span>}
              <span className="ml-auto text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }} title={fullDate(msg.created_at)}>
                {timeAgo(msg.created_at)}
              </span>
              {isAdmin && (
                <button onClick={() => onDelete(msg.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[12px]"
                  style={{ color: 'rgba(239,68,68,0.6)' }}>🗑</button>
              )}
            </div>
          </div>
        </div>
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(212,220,240,0.85)' }}>{shown}</p>
        {isLong && (
          <button onClick={() => setExpanded(v => !v)} className="mt-2 text-[11px] font-semibold" style={{ color: '#a78bfa' }}>
            {expanded ? '▲ Réduire' : '▼ Lire la suite'}
          </button>
        )}
        {msg.video_url && <div className="mt-3"><MediaBlock url={msg.video_url} maxHeight={320} /></div>}
        <div className="flex items-center gap-3 mt-4 pt-3" style={{ borderTop: '1px solid rgba(139,92,246,0.08)' }}>
          <button onClick={() => onLike(msg.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all"
            style={liked
              ? { background: 'rgba(236,72,153,0.15)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.25)' }
              : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
            ❤️ <span>{likeCount > 0 ? likeCount : ''} {liked ? 'Aimé' : 'J\'aime'}</span>
          </button>
          <div className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(196,181,253,0.3)' }}>
            <span>👁</span>
            <span className="tabular-nums">{msg.view_count}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mute modal ─────────────────────────────────────────────────────────────────

function MuteModal({ targetName, onMute, onClose }: {
  targetName: string; onMute: (minutes: number) => void; onClose: () => void
}) {
  const [custom, setCustom] = useState('')
  const DURATIONS = [
    { label: '30 minutes', minutes: 30 },
    { label: '2 heures',   minutes: 120 },
    { label: '24 heures',  minutes: 1440 },
    { label: '7 jours',    minutes: 10080 },
    { label: '30 jours',   minutes: 43200 },
  ]
  return (
    <div className="fixed inset-0 z-[9980] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[300px] mx-4 rounded-2xl overflow-hidden anim-scale-in"
        style={{ background: '#0c0919', border: '1px solid rgba(251,191,36,0.3)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(251,191,36,0.1)', background: 'rgba(251,191,36,0.04)' }}>
          <div>
            <p className="font-black text-white text-[14px]">🔇 Muter {targetName}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(251,191,36,0.5)' }}>Durée du mute</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-white/[0.06]"
            style={{ color: 'rgba(196,181,253,0.5)' }}>✕</button>
        </div>
        <div className="p-4 space-y-1.5">
          {DURATIONS.map(d => (
            <button key={d.minutes} onClick={() => onMute(d.minutes)}
              className="w-full text-left px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:bg-yellow-400/10"
              style={{ color: 'rgba(251,191,36,0.8)', border: '1px solid rgba(251,191,36,0.1)' }}>
              {d.label}
            </button>
          ))}
          <div className="flex gap-2 pt-1">
            <input type="number" value={custom} onChange={e => setCustom(e.target.value)}
              placeholder="Durée custom (min)…" min={1}
              className="flex-1 rounded-xl px-3 py-2.5 text-sm text-white outline-none sf-input" />
            <button onClick={() => { const m = parseInt(custom); if (m > 0) onMute(m) }}
              disabled={!custom || parseInt(custom) <= 0}
              className="px-3 py-2.5 rounded-xl text-sm font-semibold btn-sf-primary disabled:opacity-40">OK</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Profile modal ──────────────────────────────────────────────────────────────

function ProfileModal({ profile, userId, isAdmin, onClose, onSaved }: {
  profile: Profile; userId: string; isAdmin: boolean; onClose: () => void; onSaved: (p: Profile) => void
}) {
  const [name, setName]        = useState(profile.display_name)
  const [avatarUrl, setAUrl]   = useState(profile.avatar_url)
  const [uploading, setUpload]   = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [saving, setSaving]      = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const daysSince   = profile.name_updated_at
    ? Math.floor((Date.now() - new Date(profile.name_updated_at).getTime()) / 86400000)
    : 999
  const canChangeName = isAdmin || daysSince >= 90
  const daysLeft      = Math.max(0, 90 - daysSince)

  async function handleFile(file: File) {
    setUpload(true); setUploadErr('')
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) { setUploadErr('Bucket "avatars" introuvable — crée-le en Public dans Supabase → Storage'); return }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAUrl(data.publicUrl + `?t=${Date.now()}`)
    } finally { setUpload(false) }
  }

  async function save() {
    setSaving(true)
    const trimmed     = name.trim()
    const nameChanged = canChangeName && trimmed && trimmed !== profile.display_name
    await supabase.from('user_profiles').upsert({
      user_id: userId,
      display_name: canChangeName && trimmed ? trimmed : profile.display_name,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
      ...(nameChanged ? { name_updated_at: new Date().toISOString() } : {}),
    })
    onSaved({
      display_name: canChangeName && trimmed ? trimmed : profile.display_name,
      avatar_url: avatarUrl,
      name_updated_at: nameChanged ? new Date().toISOString() : profile.name_updated_at,
    })
    setSaving(false)
  }

  const displayedName = canChangeName ? name : profile.display_name

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
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-white/[0.06]"
            style={{ color: 'rgba(196,181,253,0.5)' }}>✕</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <Avatar url={avatarUrl} name={displayedName || '?'} userId={userId} size={80} />
              <div onClick={() => fileRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.6)', borderRadius: Math.round(80 * 0.3) }}>
                {uploading ? <Spinner size="sm" /> : <><span className="text-lg">📷</span><span className="text-[9px] text-white font-bold">Modifier</span></>}
              </div>
            </div>
            {uploadErr
              ? <p className="text-[10px] text-center max-w-[220px]" style={{ color: '#f87171' }}>{uploadErr}</p>
              : <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>Clique pour changer ta photo</p>
            }
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-[0.15em] font-black" style={{ color: 'rgba(139,92,246,0.6)' }}>
                Pseudo
              </label>
              {!canChangeName && !isAdmin && (
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: 'rgba(252,165,165,0.7)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  🔒 Dans {daysLeft} jour{daysLeft > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <input type="text" value={displayedName} onChange={e => canChangeName && setName(e.target.value)}
              disabled={!canChangeName} placeholder="Ton pseudo…" maxLength={32}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none sf-input disabled:opacity-50 disabled:cursor-not-allowed" />
            {canChangeName && (
              <div className="flex justify-end mt-1">
                <span className="text-[9px]" style={{ color: 'rgba(196,181,253,0.25)' }}>{name.length}/32</span>
              </div>
            )}
          </div>
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <Avatar url={avatarUrl} name={displayedName || '?'} userId={userId} size={36} />
            <div>
              <p className="text-[12px] font-bold text-white">{displayedName || 'Ton pseudo'}</p>
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

const SETUP_SQL = `-- 1. Messages
CREATE TABLE IF NOT EXISTS community_messages (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid REFERENCES auth.users NOT NULL,
  content        text NOT NULL CHECK (char_length(content) <= 2000),
  display_name   text NOT NULL DEFAULT '',
  avatar_url     text,
  org_name       text,
  channel        text NOT NULL DEFAULT 'chat',
  title          text,
  is_admin       boolean NOT NULL DEFAULT false,
  thread_user_id uuid,
  video_url      text,
  created_at     timestamptz DEFAULT now()
);
-- Si la table existe déjà : ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_read"   ON community_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "community_insert" ON community_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_delete" ON community_messages FOR DELETE USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
);

-- 2. Profils
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id         uuid PRIMARY KEY REFERENCES auth.users,
  display_name    text NOT NULL DEFAULT '',
  avatar_url      text,
  name_updated_at timestamptz,
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON user_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_own"  ON user_profiles FOR ALL USING (auth.uid() = user_id);

-- 3. Admins ScaleFlow
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admins_read" ON platform_admins FOR SELECT USING (auth.role() = 'authenticated');
-- Ajoute ton user_id :
-- INSERT INTO platform_admins (user_id) VALUES ('TON-USER-ID-ICI');

-- 4. Mutes
CREATE TABLE IF NOT EXISTS community_mutes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users NOT NULL,
  muted_by    uuid REFERENCES auth.users NOT NULL,
  muted_until timestamptz NOT NULL,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE community_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mutes_read"   ON community_mutes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "mutes_insert" ON community_mutes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
);

-- 5. Réactions (likes)
CREATE TABLE IF NOT EXISTS community_reactions (
  user_id    uuid REFERENCES auth.users NOT NULL,
  message_id uuid REFERENCES community_messages NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_read"   ON community_reactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "reactions_insert" ON community_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions_delete" ON community_reactions FOR DELETE USING (auth.uid() = user_id);

-- Colonne vues + fonction RPC
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION increment_view(msg_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE community_messages SET view_count = view_count + 1 WHERE id = msg_id;
$$;

-- 6. Bucket "avatars" public → Supabase dashboard → Storage

-- 7. Bucket "community" public → Supabase dashboard → Storage → New bucket → "community" → Public
-- Policies Storage (dans SQL Editor) :
-- CREATE POLICY "community_select" ON storage.objects FOR SELECT USING (bucket_id = 'community');
-- CREATE POLICY "community_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'community' AND auth.role() = 'authenticated');
-- CREATE POLICY "community_delete" ON storage.objects FOR DELETE USING (bucket_id = 'community' AND auth.uid()::text = (storage.foldername(name))[1]);`

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
  const { currentOrg } = useOrg()
  useLicense() // keep context warm

  const [isAdmin, setIsAdmin]       = useState(false)
  const [tab, setTab]               = useState<Channel>('news')
  const [lastSeenSupportAt, setLastSeenSupportAt] = useState<string>(new Date().toISOString())
  const [messages, setMessages]     = useState<Message[]>([])
  const [loading, setLoading]       = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [profile, setProfile]       = useState<Profile>({ display_name: '', avatar_url: null, name_updated_at: null })
  const [showProfile, setShowProfile]   = useState(false)
  const [mutedUntil, setMutedUntil]     = useState<string | null>(null)
  const [showMuteModal, setShowMuteModal] = useState(false)
  const [muteTarget, setMuteTarget]     = useState<{ id: string; name: string } | null>(null)
  const [selectedThread, setSelectedThread] = useState<string | null>(null)

  const [chatDraft, setChatDraft]  = useState('')
  const [chatSending, setChatSend] = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const chatRef     = useRef<HTMLTextAreaElement>(null)
  const isAdminRef  = useRef(false)
  const chatVideoRef = useRef<HTMLInputElement>(null)
  const newsVideoRef = useRef<HTMLInputElement>(null)

  const [chatVideo, setChatVideo]   = useState<File | null>(null)
  const [newsVideo, setNewsVideo]   = useState<File | null>(null)
  const [reactions, setReactions]   = useState<Map<string, number>>(new Map())
  const [myLikes, setMyLikes]       = useState<Set<string>>(new Set())
  const viewedRef = useRef<Set<string>>(new Set())

  const [newsTitle, setNewsTitle]     = useState('')
  const [newsContent, setNewsContent] = useState('')
  const [newsSending, setNewsSend]    = useState(false)
  const [showNewsForm, setShowNewsForm] = useState(false)

  const loadProfile = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles').select('display_name, avatar_url, name_updated_at')
      .eq('user_id', user.id).maybeSingle()
    if (data) setProfile({ display_name: data.display_name || '', avatar_url: data.avatar_url, name_updated_at: data.name_updated_at })
  }, [user.id])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('community_messages')
      .select('id, user_id, content, display_name, avatar_url, org_name, channel, title, is_admin, thread_user_id, video_url, view_count, created_at')
      .order('created_at', { ascending: true })
      .limit(300)
    if (error) { if (error.code === '42P01') setNeedsSetup(true); setLoading(false); return }
    setNeedsSetup(false)
    setMessages(data ?? [])
    setLoading(false)
  }, [])

  const loadReactions = useCallback(async () => {
    const { data } = await supabase.from('community_reactions').select('user_id, message_id')
    if (!data) return
    const counts = new Map<string, number>()
    const mine   = new Set<string>()
    for (const r of data) {
      counts.set(r.message_id, (counts.get(r.message_id) ?? 0) + 1)
      if (r.user_id === user.id) mine.add(r.message_id)
    }
    setReactions(counts)
    setMyLikes(mine)
  }, [user.id])

  async function toggleLike(messageId: string) {
    if (myLikes.has(messageId)) {
      setMyLikes(prev => { const s = new Set(prev); s.delete(messageId); return s })
      setReactions(prev => { const m = new Map(prev); m.set(messageId, Math.max(0, (m.get(messageId) ?? 1) - 1)); return m })
      await supabase.from('community_reactions').delete().eq('user_id', user.id).eq('message_id', messageId)
    } else {
      setMyLikes(prev => new Set([...prev, messageId]))
      setReactions(prev => { const m = new Map(prev); m.set(messageId, (m.get(messageId) ?? 0) + 1); return m })
      await supabase.from('community_reactions').insert({ user_id: user.id, message_id: messageId })
    }
  }

  async function trackView(messageId: string) {
    if (viewedRef.current.has(messageId)) return
    viewedRef.current.add(messageId)
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, view_count: m.view_count + 1 } : m))
    await supabase.rpc('increment_view', { msg_id: messageId })
  }

  async function uploadVideo(file: File): Promise<string | null> {
    const ext  = file.name.split('.').pop() ?? 'mp4'
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('community').upload(path, file)
    if (error) return null
    const { data } = supabase.storage.from('community').getPublicUrl(path)
    return data.publicUrl
  }

  useEffect(() => {
    supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(!!data))
      .catch(() => {})
  }, [user.id])

  useEffect(() => {
    supabase.from('community_mutes').select('muted_until')
      .eq('user_id', user.id).gt('muted_until', new Date().toISOString())
      .order('muted_until', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setMutedUntil(data?.muted_until ?? null))
      .catch(() => {})
  }, [user.id])

  useEffect(() => { isAdminRef.current = isAdmin }, [isAdmin])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadMessages() }, [loadMessages])
  useEffect(() => { loadReactions() }, [loadReactions])

  useEffect(() => {
    const ch = supabase.channel('community-v3')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, payload => {
        const msg = payload.new as Message
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        // Notifications (only for messages from others)
        if (msg.user_id !== user.id && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const body = msg.content.slice(0, 80) + (msg.content.length > 80 ? '…' : '')
          if (msg.channel === 'support' && !msg.is_admin && isAdminRef.current) {
            // Admin: new ticket message received
            new Notification(`🎫 Nouveau ticket — ${msg.display_name}`, { body, silent: false })
          } else if (msg.channel === 'support' && msg.is_admin && msg.thread_user_id === user.id) {
            // User: admin replied to their ticket
            new Notification('💬 Réponse à ton ticket', { body: `ScaleFlow Admin : ${body}`, silent: false })
          }
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_messages' }, payload => {
        setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    if (tab !== 'chat' && tab !== 'support') return
    const el = listRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 220)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tab, selectedThread])

  useEffect(() => {
    if (!loading && (tab === 'chat' || tab === 'support'))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' as any }), 50)
  }, [loading, tab, selectedThread])

  const isMuted = mutedUntil !== null && new Date(mutedUntil) > new Date()

  function requirePseudo(): boolean {
    if (!profile.display_name) { setShowProfile(true); return false }
    return true
  }

  async function sendChat() {
    if (!requirePseudo() || isMuted) return
    const content = chatDraft.trim()
    if (!content && !chatVideo) return
    if (chatSending) return
    setChatSend(true); setChatDraft('')
    const videoFile = chatVideo; setChatVideo(null)
    const localVideoUrl = videoFile ? URL.createObjectURL(videoFile) : null
    const optId = crypto.randomUUID()
    const opt: Message = { id: optId, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'chat', title: null, is_admin: isAdmin, thread_user_id: null, video_url: localVideoUrl, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, opt])
    const video_url = videoFile ? await uploadVideo(videoFile) : null
    const { error, data } = await supabase.from('community_messages').insert({ user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'chat', title: null, is_admin: isAdmin, thread_user_id: null, video_url }).select().single()
    if (error) { setMessages(prev => prev.filter(m => m.id !== optId)); setChatDraft(content) }
    else if (data) setMessages(prev => prev.map(m => m.id === optId ? data as Message : m))
    setChatSend(false)
    chatRef.current?.focus()
  }

  async function sendNews() {
    const content = newsContent.trim()
    if (!content && !newsVideo) return
    if (newsSending) return
    setNewsSend(true)
    const videoFile = newsVideo; setNewsVideo(null)
    const localVideoUrl = videoFile ? URL.createObjectURL(videoFile) : null
    const optId = crypto.randomUUID()
    const opt: Message = { id: optId, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'news', title: newsTitle.trim() || null, is_admin: true, thread_user_id: null, video_url: localVideoUrl, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, opt])
    const video_url = videoFile ? await uploadVideo(videoFile) : null
    const { error, data } = await supabase.from('community_messages').insert({ user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'news', title: newsTitle.trim() || null, is_admin: true, thread_user_id: null, video_url }).select().single()
    if (error) setMessages(prev => prev.filter(m => m.id !== optId))
    else if (data) setMessages(prev => prev.map(m => m.id === optId ? data as Message : m))
    setNewsTitle(''); setNewsContent(''); setShowNewsForm(false)
    setNewsSend(false)
  }

  async function sendSupport() {
    if (!requirePseudo() || isMuted) return
    const content = chatDraft.trim()
    if (!content && !chatVideo) return
    if (chatSending) return
    if (isAdmin && !selectedThread) return
    setChatSend(true); setChatDraft('')
    const videoFile = chatVideo; setChatVideo(null)
    const localVideoUrl = videoFile ? URL.createObjectURL(videoFile) : null
    const threadId = isAdmin ? selectedThread! : user.id
    const optId = crypto.randomUUID()
    const opt: Message = { id: optId, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'support', title: null, is_admin: isAdmin, thread_user_id: threadId, video_url: localVideoUrl, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, opt])
    const video_url = videoFile ? await uploadVideo(videoFile) : null
    const { error, data } = await supabase.from('community_messages').insert({ user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'support', title: null, is_admin: isAdmin, thread_user_id: threadId, video_url }).select().single()
    if (error) { setMessages(prev => prev.filter(m => m.id !== optId)); setChatDraft(content) }
    else if (data) setMessages(prev => prev.map(m => m.id === optId ? data as Message : m))
    setChatSend(false)
  }

  async function deleteMessage(id: string) {
    setMessages(prev => prev.filter(m => m.id !== id))
    await supabase.from('community_messages').delete().eq('id', id)
  }

  async function muteUser(userId: string, minutes: number) {
    const muted_until = new Date(Date.now() + minutes * 60000).toISOString()
    await supabase.from('community_mutes').insert({ user_id: userId, muted_by: user.id, muted_until })
    setShowMuteModal(false); setMuteTarget(null)
  }

  if (needsSetup) return <SetupScreen onRetry={loadMessages} />

  const newsMessages    = messages.filter(m => m.channel === 'news').reverse()
  const chatMessages    = messages.filter(m => m.channel === 'chat')
  const supportMessages = messages.filter(m => m.channel === 'support')

  const myThreadMessages = supportMessages
    .filter(m => m.thread_user_id === user.id || (!m.thread_user_id && m.user_id === user.id))

  const threadMap = new Map<string, { user_id: string; display_name: string; avatar_url: string | null; lastMsg: Message }>()
  for (const msg of supportMessages) {
    const tid = msg.thread_user_id ?? msg.user_id
    const ex  = threadMap.get(tid)
    if (!ex || new Date(msg.created_at) > new Date(ex.lastMsg.created_at)) {
      threadMap.set(tid, {
        user_id: tid,
        display_name: !msg.is_admin ? msg.display_name : (ex?.display_name ?? msg.display_name),
        avatar_url:   !msg.is_admin ? msg.avatar_url   : (ex?.avatar_url   ?? msg.avatar_url),
        lastMsg: msg,
      })
    }
  }
  const threadList = Array.from(threadMap.values())
    .sort((a, b) => new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime())
  const threadMessages = selectedThread
    ? supportMessages.filter(m => (m.thread_user_id ?? m.user_id) === selectedThread)
    : []

  const [g1, g2] = gradientForId(user.id)

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#06040f' }}>

      {/* Header */}
      <div className="flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.9)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.25),rgba(236,72,153,0.12))', border: '1px solid rgba(139,92,246,0.25)' }}>
              <span className="text-base">💬</span>
            </div>
            <div>
              <p className="text-[14px] font-black text-white leading-tight">Communauté</p>
              <p className="text-[10px] leading-tight" style={{ color: 'rgba(196,181,253,0.4)' }}>
                {tab === 'news' ? `${newsMessages.length} actualité${newsMessages.length > 1 ? 's' : ''}` :
                 tab === 'chat' ? `${chatMessages.length} message${chatMessages.length > 1 ? 's' : ''}` :
                 isAdmin ? `${threadList.length} ticket${threadList.length > 1 ? 's' : ''}` :
                 `${myThreadMessages.length} message${myThreadMessages.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={() => setShowProfile(true)}
            className="flex items-center gap-2.5 pl-2.5 pr-3 py-2 rounded-xl transition-all hover:bg-white/[0.04] group"
            style={{ border: '1px solid rgba(139,92,246,0.12)' }}>
            <Avatar url={profile.avatar_url} name={profile.display_name || '?'} userId={user.id} size={28} />
            <div className="text-left">
              <p className="text-[11.5px] font-semibold leading-tight" style={{ color: profile.display_name ? 'white' : 'rgba(196,181,253,0.4)' }}>
                {profile.display_name || 'Définir pseudo'}
              </p>
              {currentOrg && <p className="text-[9.5px] leading-tight" style={{ color: 'rgba(139,92,246,0.7)' }}>{currentOrg.name}</p>}
            </div>
            <span className="text-[10px] opacity-0 group-hover:opacity-50 transition-opacity ml-1" style={{ color: '#a78bfa' }}>✏</span>
          </button>
        </div>

        {isMuted && (
          <div className="mx-5 mb-3 px-4 py-2 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <span className="text-sm">🔇</span>
            <p className="text-[11px]" style={{ color: 'rgba(251,191,36,0.8)' }}>
              Tu es muté jusqu'au <strong>
                {new Date(mutedUntil!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              </strong>
            </p>
          </div>
        )}

        <div className="flex px-5 gap-1 pb-0">
          {([
            { id: 'news'    as Channel, label: 'Actualités ScaleFlow', icon: '📢' },
            { id: 'chat'    as Channel, label: 'Discussion',           icon: '💬' },
            { id: 'support' as Channel, label: 'Support',              icon: '🎫' },
          ]).map(t => (
            <button key={t.id} onClick={() => {
                setTab(t.id)
                if (t.id === 'support') setLastSeenSupportAt(new Date().toISOString())
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-bold transition-all relative"
              style={tab === t.id
                ? { color: '#c4b5fd', borderBottom: '2px solid #8b5cf6', marginBottom: -1 }
                : { color: 'rgba(196,181,253,0.35)', borderBottom: '2px solid transparent', marginBottom: -1 }}>
              <span className="text-[14px]">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'support' && !isAdmin && tab !== 'support' &&
                myThreadMessages.some(m => m.is_admin && new Date(m.created_at) > new Date(lastSeenSupportAt)) && (
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: '#ec4899', boxShadow: '0 0 6px #ec4899' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* NEWS TAB */}
      {tab === 'news' && (
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {isAdmin && (
            <div className="px-5 pt-5">
              {!showNewsForm ? (
                <button onClick={() => setShowNewsForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all group"
                  style={{ background: 'rgba(139,92,246,0.07)', border: '1px dashed rgba(139,92,246,0.3)' }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>📢</div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-white group-hover:text-accent transition-colors">Publier une actualité</p>
                    <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>Visible par tous les membres</p>
                  </div>
                  <span className="ml-auto text-[10px] font-black px-2 py-1 rounded-lg"
                    style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.2))', color: '#f0a8ff' }}>ADMIN</span>
                </button>
              ) : (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(8,5,20,0.9)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.05))' }}>
                    <div className="flex items-center gap-2"><span>📢</span><p className="text-[12px] font-black text-white">Nouvelle actualité</p></div>
                    <button onClick={() => setShowNewsForm(false)} style={{ color: 'rgba(196,181,253,0.4)' }}>✕</button>
                  </div>
                  <div className="p-4 space-y-3">
                    <input type="text" value={newsTitle} onChange={e => setNewsTitle(e.target.value)}
                      placeholder="Titre (optionnel)…" className="w-full rounded-xl px-3.5 py-2.5 text-sm font-bold text-white outline-none sf-input" />
                    <textarea value={newsContent} onChange={e => setNewsContent(e.target.value)}
                      placeholder="Contenu…" rows={4} maxLength={2000}
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none resize-none sf-input" />
                    {newsVideo ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <span className="text-sm">📎</span>
                        <span className="text-[11px] flex-1 truncate" style={{ color: '#c4b5fd' }}>{newsVideo.name}</span>
                        <button onClick={() => setNewsVideo(null)} className="text-[11px]" style={{ color: 'rgba(239,68,68,0.6)' }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => newsVideoRef.current?.click()}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                        style={{ background: 'rgba(139,92,246,0.04)', border: '1px dashed rgba(139,92,246,0.2)', color: 'rgba(196,181,253,0.5)' }}>
                        <span className="text-sm">📎</span>
                        <span className="text-[11px]">Joindre une vidéo (optionnel)</span>
                      </button>
                    )}
                    <input ref={newsVideoRef} type="file" accept="image/*,video/*" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) { setNewsVideo(e.target.files[0]); e.target.value = '' } }} />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.3)' }}>{newsContent.length}/2000</span>
                      <div className="flex gap-2">
                        <button onClick={() => { setShowNewsForm(false); setNewsVideo(null) }} className="px-4 py-2 rounded-xl text-[12px] font-semibold"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>Annuler</button>
                        <button onClick={sendNews} disabled={(!newsContent.trim() && !newsVideo) || newsSending}
                          className="px-4 py-2 rounded-xl text-[12px] font-semibold btn-sf-primary disabled:opacity-40">
                          {newsSending ? 'Publication…' : '📢 Publier'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="p-5 space-y-4">
            {loading ? <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
            : newsMessages.length === 0 ? (
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
            ) : newsMessages.map(msg => <NewsCard key={msg.id} msg={msg} isAdmin={isAdmin}
                likeCount={reactions.get(msg.id) ?? 0} liked={myLikes.has(msg.id)}
                onLike={toggleLike} onView={trackView} onDelete={deleteMessage} />)}
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
                  style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.06))', border: '1px solid rgba(139,92,246,0.15)' }}>💬</div>
                <div className="text-center space-y-1.5">
                  <p className="text-base font-black text-white">Aucun message pour l'instant</p>
                  <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>Sois le premier à écrire !</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.1)' }} />
                  <span className="text-[10px] font-semibold px-2" style={{ color: 'rgba(196,181,253,0.3)' }}>Début de la discussion</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.1)' }} />
                </div>
                {chatMessages.map((msg, i) => {
                  const prev    = chatMessages[i - 1]
                  const compact = prev?.user_id === msg.user_id &&
                    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
                  return <ChatRow key={msg.id} msg={msg} isOwn={msg.user_id === user.id} compact={compact}
                    isAdmin={isAdmin} likeCount={reactions.get(msg.id) ?? 0} liked={myLikes.has(msg.id)}
                    onLike={toggleLike} onDelete={deleteMessage}
                    onMute={(uid, name) => { setMuteTarget({ id: uid, name }); setShowMuteModal(true) }} />
                })}
                <div ref={bottomRef} className="h-1" />
              </>
            )}
          </div>
          <div className="flex-shrink-0 px-4 py-3"
            style={{ borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(6,4,15,0.95)' }}>
            {isMuted ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                <span>🔇</span>
                <p className="text-[12px]" style={{ color: 'rgba(251,191,36,0.7)' }}>Tu es muté — impossible d'envoyer des messages.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: `linear-gradient(135deg,${g1},${g2})` }} />
                  <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                    Tu écris en tant que{' '}
                    <strong style={{ color: profile.display_name ? 'rgba(196,181,253,0.6)' : '#a78bfa' }}>
                      {profile.display_name || '→ définis ton pseudo d\'abord'}
                    </strong>
                    {currentOrg && profile.display_name && <span style={{ color: 'rgba(139,92,246,0.6)' }}> · {currentOrg.name}</span>}
                  </span>
                </div>
                {chatVideo && (
                  <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <span className="text-sm">📎</span>
                    <span className="text-[11px] flex-1 truncate" style={{ color: '#c4b5fd' }}>{chatVideo.name}</span>
                    <button onClick={() => setChatVideo(null)} className="text-[11px]" style={{ color: 'rgba(239,68,68,0.6)' }}>✕</button>
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <Avatar url={profile.avatar_url} name={profile.display_name || '?'} userId={user.id} size={32} />
                  <div className="flex-1 flex items-end gap-2 rounded-xl px-3.5 py-2.5"
                    style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <textarea ref={chatRef} value={chatDraft} onChange={e => setChatDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                      onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
                      placeholder={profile.display_name ? 'Écrire un message… (⏎ pour envoyer)' : 'Clique sur ton avatar pour définir ton pseudo…'}
                      rows={1} maxLength={1000}
                      className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                      style={{ minHeight: 22, maxHeight: 120 }} />
                    <button onClick={() => chatVideoRef.current?.click()} title="Joindre une vidéo"
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
                      style={{ color: chatVideo ? '#a78bfa' : 'rgba(196,181,253,0.35)', background: chatVideo ? 'rgba(139,92,246,0.15)' : 'transparent' }}>
                      <span className="text-[15px]">📎</span>
                    </button>
                    <button onClick={sendChat} disabled={(!chatDraft.trim() && !chatVideo) || chatSending}
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30 active:scale-90"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', boxShadow: '0 2px 12px rgba(124,58,237,0.4)' }}>
                      {chatSending ? <Spinner size="sm" /> : <span className="text-sm leading-none">↑</span>}
                    </button>
                  </div>
                </div>
                <input ref={chatVideoRef} type="file" accept="image/*,video/*" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) { setChatVideo(e.target.files[0]); e.target.value = '' } }} />
              </>
            )}
          </div>
        </>
      )}

      {/* SUPPORT TAB */}
      {tab === 'support' && (
        <div className="flex-1 flex overflow-hidden">
          {isAdmin ? (
            <>
              {/* Thread list */}
              <div className="w-56 flex-shrink-0 overflow-y-auto"
                style={{ borderRight: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,5,20,0.4)' }}>
                <div className="px-3 pt-3 pb-2">
                  <p className="text-[9px] uppercase tracking-widest font-black mb-3 px-1"
                    style={{ color: 'rgba(139,92,246,0.5)' }}>
                    🎫 Tickets ({threadList.length})
                  </p>
                  {loading ? <div className="flex justify-center py-8"><Spinner size="sm" /></div>
                  : threadList.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2 text-center">
                      <span className="text-3xl">🎫</span>
                      <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.3)' }}>Aucun ticket</p>
                    </div>
                  ) : threadList.map(t => {
                    const hasUnread = !t.lastMsg.is_admin && selectedThread !== t.user_id
                    return (
                      <button key={t.user_id} onClick={() => setSelectedThread(t.user_id)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl mb-1 text-left transition-all"
                        style={selectedThread === t.user_id
                          ? { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.3)' }
                          : hasUnread
                          ? { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.22)' }
                          : { background: 'transparent', border: '1px solid transparent' }}>
                        <div className="relative flex-shrink-0">
                          <Avatar url={t.avatar_url} name={t.display_name} userId={t.user_id} size={28} />
                          {hasUnread && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                              style={{ background: '#ec4899', borderColor: '#080614' }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] truncate ${hasUnread ? 'font-black text-white' : 'font-bold text-white'}`}>
                            {t.display_name || 'Anonyme'}
                          </p>
                          <p className="text-[9px] truncate" style={{ color: hasUnread ? 'rgba(236,72,153,0.7)' : 'rgba(196,181,253,0.4)' }}>
                            {hasUnread && '● '}{t.lastMsg.content.slice(0, 24)}{t.lastMsg.content.length > 24 ? '…' : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[8px] tabular-nums" style={{ color: hasUnread ? 'rgba(236,72,153,0.6)' : 'rgba(196,181,253,0.3)' }}>
                            {timeAgo(t.lastMsg.created_at)}
                          </span>
                          {hasUnread && (
                            <span className="text-[7px] font-black px-1 py-0.5 rounded"
                              style={{ background: 'rgba(236,72,153,0.2)', color: '#f472b6' }}>NEW</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Selected thread */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {!selectedThread ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
                    <span className="text-5xl opacity-20">💬</span>
                    <p className="font-bold text-white">Sélectionne un ticket</p>
                    <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>Clique sur un utilisateur à gauche</p>
                  </div>
                ) : (
                  <>
                    <div className="flex-shrink-0 px-4 py-2.5 flex items-center gap-2.5"
                      style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,5,20,0.6)' }}>
                      {(() => { const t = threadList.find(t => t.user_id === selectedThread); return t ? (
                        <>
                          <Avatar url={t.avatar_url} name={t.display_name} userId={t.user_id} size={26} />
                          <div>
                            <p className="text-[12px] font-black text-white">{t.display_name || 'Anonyme'}</p>
                            <p className="text-[9px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                              {threadMessages.length} message{threadMessages.length > 1 ? 's' : ''}
                            </p>
                          </div>
                        </>
                      ) : null })()}
                    </div>
                    <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
                      {threadMessages.map((msg, i) => {
                        const prev    = threadMessages[i - 1]
                        const compact = prev?.user_id === msg.user_id &&
                          new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
                        return <SupportMsgRow key={msg.id} msg={msg} isAdmin={isAdmin} compact={compact} onDelete={deleteMessage} />
                      })}
                      <div ref={bottomRef} className="h-2" />
                    </div>
                    <div className="flex-shrink-0 px-4 py-3"
                      style={{ borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(6,4,15,0.95)' }}>
                      {chatVideo && (
                        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg"
                          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                          <span className="text-sm">📎</span>
                          <span className="text-[11px] flex-1 truncate" style={{ color: '#c4b5fd' }}>{chatVideo.name}</span>
                          <button onClick={() => setChatVideo(null)} className="text-[11px]" style={{ color: 'rgba(239,68,68,0.6)' }}>✕</button>
                        </div>
                      )}
                      <div className="flex items-end gap-3">
                        <Avatar url={profile.avatar_url} name={profile.display_name || '?'} userId={user.id} size={32} />
                        <div className="flex-1 flex items-end gap-2 rounded-xl px-3.5 py-2.5"
                          style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.08),rgba(236,72,153,0.04))', border: '1px solid rgba(139,92,246,0.25)' }}>
                          <textarea value={chatDraft} onChange={e => setChatDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSupport() } }}
                            onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
                            placeholder="Répondre en tant qu'admin…"
                            rows={1} maxLength={1000}
                            className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                            style={{ minHeight: 22, maxHeight: 120 }} />
                          <button onClick={() => chatVideoRef.current?.click()} title="Joindre une vidéo"
                            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                            style={{ color: chatVideo ? '#a78bfa' : 'rgba(196,181,253,0.35)', background: chatVideo ? 'rgba(139,92,246,0.15)' : 'transparent' }}>
                            <span className="text-[15px]">📎</span>
                          </button>
                          <button onClick={sendSupport} disabled={(!chatDraft.trim() && !chatVideo) || chatSending}
                            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30 active:scale-90"
                            style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', boxShadow: '0 2px 12px rgba(124,58,237,0.4)' }}>
                            {chatSending ? <Spinner size="sm" /> : <span className="text-sm">↑</span>}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            /* User view */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
                {loading ? <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
                : myThreadMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
                      style={{ background: 'linear-gradient(135deg,rgba(96,165,250,0.12),rgba(139,92,246,0.06))', border: '1px solid rgba(96,165,250,0.15)' }}>🎫</div>
                    <div className="text-center space-y-1.5">
                      <p className="text-base font-black text-white">Ouvre un ticket de support</p>
                      <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                        Pose ta question — l'équipe ScaleFlow te répondra ici.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px" style={{ background: 'rgba(96,165,250,0.1)' }} />
                      <span className="text-[10px] font-semibold px-2" style={{ color: 'rgba(147,197,253,0.35)' }}>Ton ticket de support</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(96,165,250,0.1)' }} />
                    </div>
                    {myThreadMessages.map((msg, i) => {
                      const prev    = myThreadMessages[i - 1]
                      const compact = prev?.user_id === msg.user_id &&
                        new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
                      return <SupportMsgRow key={msg.id} msg={msg} isAdmin={isAdmin} compact={compact} onDelete={deleteMessage} />
                    })}
                    <div ref={bottomRef} className="h-1" />
                  </>
                )}
              </div>
              <div className="flex-shrink-0 px-4 py-3"
                style={{ borderTop: '1px solid rgba(96,165,250,0.1)', background: 'rgba(6,4,15,0.95)' }}>
                {isMuted ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <span>🔇</span>
                    <p className="text-[12px]" style={{ color: 'rgba(251,191,36,0.7)' }}>Tu es muté — impossible d'envoyer des messages.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-400/60" />
                      <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                        Pose ta question à l'équipe <strong style={{ color: 'rgba(147,197,253,0.6)' }}>ScaleFlow</strong>
                      </span>
                    </div>
                    {chatVideo && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg"
                        style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                        <span className="text-sm">📎</span>
                        <span className="text-[11px] flex-1 truncate" style={{ color: '#93c5fd' }}>{chatVideo.name}</span>
                        <button onClick={() => setChatVideo(null)} className="text-[11px]" style={{ color: 'rgba(239,68,68,0.6)' }}>✕</button>
                      </div>
                    )}
                    <div className="flex items-end gap-3">
                      <Avatar url={profile.avatar_url} name={profile.display_name || '?'} userId={user.id} size={32} />
                      <div className="flex-1 flex items-end gap-2 rounded-xl px-3.5 py-2.5"
                        style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                        <textarea value={chatDraft} onChange={e => setChatDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSupport() } }}
                          onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
                          placeholder={profile.display_name ? 'Pose ta question… (⏎ pour envoyer)' : 'Définis ton pseudo d\'abord…'}
                          rows={1} maxLength={1000}
                          className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                          style={{ minHeight: 22, maxHeight: 120 }} />
                        <button onClick={() => chatVideoRef.current?.click()} title="Joindre une vidéo"
                          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                          style={{ color: chatVideo ? '#93c5fd' : 'rgba(147,197,253,0.35)', background: chatVideo ? 'rgba(96,165,250,0.15)' : 'transparent' }}>
                          <span className="text-[15px]">📎</span>
                        </button>
                        <button onClick={sendSupport} disabled={(!chatDraft.trim() && !chatVideo) || chatSending}
                          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30 active:scale-90"
                          style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 12px rgba(37,99,235,0.3)' }}>
                          {chatSending ? <Spinner size="sm" /> : <span className="text-sm">↑</span>}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showProfile && (
        <ProfileModal profile={profile} userId={user.id} isAdmin={isAdmin}
          onClose={() => setShowProfile(false)}
          onSaved={p => { setProfile(p); setShowProfile(false) }} />
      )}

      {showMuteModal && muteTarget && (
        <MuteModal targetName={muteTarget.name}
          onMute={minutes => muteUser(muteTarget.id, minutes)}
          onClose={() => { setShowMuteModal(false); setMuteTarget(null) }} />
      )}
    </div>
  )
}
