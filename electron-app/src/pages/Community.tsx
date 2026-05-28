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
import type { Page } from '@/components/Layout'
import { supabase }   from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
import { useOrg }     from '@/lib/orgContext'
import { useLicense } from '@/lib/license'
import { Spinner }    from '@/components/ui/Spinner'

interface CommunityProps { user: User; onNavigate?: (page: Page) => void }
type Channel = 'news' | 'chat' | 'support'
type Tab = 'news' | 'topics' | 'support'

interface Topic {
  id: string
  name: string
  description: string | null
  emoji: string
  created_by: string
  is_private: boolean
  created_at: string
}

interface TopicMessage {
  id: string
  topic_id: string
  user_id: string
  content: string
  display_name: string
  avatar_url: string | null
  org_name: string | null
  is_admin: boolean
  video_url: string | null
  created_at: string
}

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
  if (diff < 60)        return 'just now'
  if (diff < 3600)      return `${Math.floor(diff / 60)}min`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
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
  const t = useT()
  return (
    <div className={`flex gap-3 group ${compact ? 'mt-[2px]' : 'mt-4'}`}>
      <div style={{ width: 34, flexShrink: 0 }}>
        {!compact && <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={34} />}
      </div>
      <div className="flex-1 min-w-0">
        {!compact && (
          <div className="flex items-center gap-2 mb-[3px] flex-wrap">
            <span className="text-[13px] font-bold leading-none" style={{ color: isOwn ? '#c4b5fd' : '#e8e0ff' }}>
              {msg.display_name || t('communityAnonymous')}
            </span>
            {msg.is_admin && (
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full tracking-wide"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.25))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.25)' }}>
                {t('communityAdminLabel')}
              </span>
            )}
            {isOwn && !msg.is_admin && (
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full tracking-wide"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>{t('communityMeLabel')}</span>
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
                style={{ color: 'rgba(251,191,36,0.6)' }} title="Mute">🔇</button>
            )}
            {isAdmin && (
              <button onClick={() => onDelete(msg.id)}
                className="w-5 h-5 flex items-center justify-center rounded text-[11px]"
                style={{ color: 'rgba(239,68,68,0.6)' }} title="Delete">🗑</button>
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
  const t = useT()
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
              {msg.display_name || t('communityAnonymous')}
            </span>
            {isAdminMsg && (
              <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full"
                style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.25))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.25)' }}>
                {t('communityAdminLabel')}
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

// ── Mute modal ─────────────────────────────────────────────────────────────────

function MuteModal({ targetName, onMute, onClose }: {
  targetName: string; onMute: (minutes: number) => void; onClose: () => void
}) {
  const t = useT()
  const [custom, setCustom] = useState('')
  const DURATIONS = [
    { label: t('communityMute30min'), minutes: 30 },
    { label: t('communityMute2h'),    minutes: 120 },
    { label: t('communityMute24h'),   minutes: 1440 },
    { label: t('communityMute7d'),    minutes: 10080 },
    { label: t('communityMute30d'),   minutes: 43200 },
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
            <p className="font-black text-white text-[14px]">{t('communityMuteTitle')} {targetName}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(251,191,36,0.5)' }}>{t('communityMuteDuration')}</p>
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
              placeholder={t('communityMuteCustom')} min={1}
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
  const t = useT()
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
      if (error) { setUploadErr('Bucket "avatars" not found — create it as Public in Supabase → Storage'); return }
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
            <p className="font-black text-white text-[15px]">{t('communityProfileTitle')}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.45)' }}>{t('communityProfileVisible')}</p>
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
                {uploading ? <Spinner size="sm" /> : <><span className="text-lg">📷</span><span className="text-[9px] text-white font-bold">{t('communityProfileEdit')}</span></>}
              </div>
            </div>
            {uploadErr
              ? <p className="text-[10px] text-center max-w-[220px]" style={{ color: '#f87171' }}>{uploadErr}</p>
              : <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>{t('communityProfileClickToChange')}</p>
            }
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-[0.15em] font-black" style={{ color: 'rgba(139,92,246,0.6)' }}>
                {t('communityProfileUsername')}
              </label>
              {!canChangeName && !isAdmin && (
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: 'rgba(252,165,165,0.7)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  🔒 {t('communityProfileInDays').replace('{n}', String(daysLeft)).replace('{s}', daysLeft !== 1 ? 's' : '')}
                </span>
              )}
            </div>
            <input type="text" value={displayedName} onChange={e => canChangeName && setName(e.target.value)}
              disabled={!canChangeName} placeholder={t('communityProfileUsernamePlaceholder')} maxLength={32}
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
              <p className="text-[12px] font-bold text-white">{displayedName || t('communityCreateNameLabel')}</p>
              <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>{t('communityProfilePreview')}</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {t('cancel')}
          </button>
          <button onClick={save} disabled={saving || uploading}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all btn-sf-primary disabled:opacity-50">
            {saving ? t('communityProfileSaving') : t('communityProfileSave')}
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  )
}

// ── Create Topic modal ─────────────────────────────────────────────────────────

const TOPIC_EMOJIS = ['💬','📢','🚀','💡','📈','🎯','🎨','🎬','🎵','🤝','💪','🧠','🔥','⚡','🌟','👑','🏆','📸','💻','🎮','🌍','💰','📊','🎭','🌈','🏄','🎸','🍕','⚽','🎲']

function CreateTopicModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (topic: { name: string; description: string; emoji: string }) => Promise<void>
}) {
  const t = useT()
  const [name, setName]     = useState('')
  const [desc, setDesc]     = useState('')
  const [emoji, setEmoji]   = useState('💬')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setSaving(true)
    await onCreate({ name: name.trim(), description: desc.trim(), emoji })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[9980] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[360px] mx-4 rounded-2xl overflow-hidden anim-scale-in"
        style={{ background: '#0c0919', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'linear-gradient(135deg,rgba(139,92,246,0.09),rgba(236,72,153,0.04))' }}>
          <div>
            <p className="font-black text-white text-[15px]">{t('communityCreateTitle')}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.45)' }}>{t('communityCreateVisible')}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-white/[0.06]"
            style={{ color: 'rgba(196,181,253,0.5)' }}>✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] font-black block mb-2" style={{ color: 'rgba(139,92,246,0.6)' }}>{t('communityCreateIcon')}</label>
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_EMOJIS.map(e => (
                <button key={e} onClick={() => setEmoji(e)}
                  className="w-8 h-8 rounded-lg text-[17px] flex items-center justify-center transition-all"
                  style={emoji === e
                    ? { background: 'rgba(139,92,246,0.35)', border: '1.5px solid rgba(139,92,246,0.7)' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1.5px solid transparent' }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          {/* Name */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] font-black block mb-1.5" style={{ color: 'rgba(139,92,246,0.6)' }}>{t('communityCreateName')}</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={t('communityCreateNamePlaceholder')} maxLength={40}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none sf-input" />
            <div className="flex justify-end mt-1">
              <span className="text-[9px]" style={{ color: 'rgba(196,181,253,0.25)' }}>{name.length}/40</span>
            </div>
          </div>
          {/* Description */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] font-black block mb-1.5" style={{ color: 'rgba(139,92,246,0.6)' }}>{t('communityCreateDescription')}</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder={t('communityCreateDescPlaceholder')} maxLength={140} rows={2}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none resize-none sf-input" />
            <div className="flex justify-end mt-1">
              <span className="text-[9px]" style={{ color: 'rgba(196,181,253,0.25)' }}>{desc.length}/140</span>
            </div>
          </div>
          {/* Preview */}
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.15)' }}>{emoji}</div>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-white truncate">{name || t('communityCreateNameLabel')}</p>
              <p className="text-[10px] truncate" style={{ color: 'rgba(196,181,253,0.4)' }}>{desc || t('communityCreateDescLabel')}</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {t('cancel')}
          </button>
          <button onClick={submit} disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all btn-sf-primary disabled:opacity-40">
            {saving ? t('communityCreating') : t('communityCreate')}
          </button>
        </div>
      </div>
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
-- CREATE POLICY "community_delete" ON storage.objects FOR DELETE USING (bucket_id = 'community' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 8. Topics (communautés)
CREATE TABLE IF NOT EXISTS community_topics (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) <= 40),
  description text CHECK (description IS NULL OR char_length(description) <= 140),
  emoji       text NOT NULL DEFAULT '💬',
  created_by  uuid REFERENCES auth.users NOT NULL,
  is_private  boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE community_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topics_read"   ON community_topics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "topics_insert" ON community_topics FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "topics_delete" ON community_topics FOR DELETE USING (auth.uid() = created_by OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()));

-- 9. Topic members
CREATE TABLE IF NOT EXISTS community_topic_members (
  topic_id  uuid REFERENCES community_topics ON DELETE CASCADE NOT NULL,
  user_id   uuid REFERENCES auth.users NOT NULL,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)
);
ALTER TABLE community_topic_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topic_members_read"   ON community_topic_members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "topic_members_insert" ON community_topic_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "topic_members_delete" ON community_topic_members FOR DELETE USING (auth.uid() = user_id);

-- 10. Topic messages
CREATE TABLE IF NOT EXISTS topic_messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id     uuid REFERENCES community_topics ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users NOT NULL,
  content      text NOT NULL CHECK (char_length(content) <= 2000),
  display_name text NOT NULL DEFAULT '',
  avatar_url   text,
  org_name     text,
  is_admin     boolean NOT NULL DEFAULT false,
  video_url    text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE topic_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topic_messages_read"   ON topic_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "topic_messages_insert" ON topic_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "topic_messages_delete" ON topic_messages FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()));`

function SetupScreen({ onRetry }: { onRetry: () => void }) {
  const t = useT()
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
        <p className="text-lg font-black text-white">{t('communitySetupTitle')}</p>
        <p className="text-sm max-w-sm" style={{ color: 'rgba(196,181,253,0.5)' }}>
          {t('communitySetupDesc')} <strong className="text-accent">Supabase → SQL Editor</strong> to enable the community.
        </p>
      </div>
      <div className="w-full max-w-2xl rounded-xl overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.08)' }}>
          <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#a78bfa' }}>SQL</span>
          <button onClick={copy} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
            style={{ background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(139,92,246,0.15)', color: copied ? '#34d399' : '#a78bfa' }}>
            {copied ? t('communitySetupCopied') : t('communitySetupCopy')}
          </button>
        </div>
        <pre className="p-4 text-[11px] leading-relaxed overflow-auto max-h-56"
          style={{ color: 'rgba(196,181,253,0.65)', fontFamily: 'JetBrains Mono, monospace' }}>
          {SETUP_SQL}
        </pre>
      </div>
      <button onClick={onRetry} className="px-5 py-2.5 rounded-xl text-sm font-semibold btn-sf-primary">
        {t('communitySetupRetry')}
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function Community({ user, onNavigate }: CommunityProps) {
  const t = useT()
  const { currentOrg } = useOrg()
  useLicense()

  const [isAdmin, setIsAdmin]       = useState(false)
  const [tab, setTab]               = useState<Tab>('news')
  const [lastSeenSupportAt, setLastSeenSupportAt] = useState<string>(new Date().toISOString())

  // Topics state
  const [topics, setTopics]               = useState<Topic[]>([])
  const [joinedTopicIds, setJoinedTopicIds] = useState<Set<string>>(new Set())
  const [memberCounts, setMemberCounts]   = useState<Map<string, number>>(new Map())
  const [topicLastMsg, setTopicLastMsg]   = useState<Map<string, { content: string; at: string }>>(new Map())
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [topicsView, setTopicsView]       = useState<'list' | 'chat'>('list')
  const [topicMessages, setTopicMessages] = useState<TopicMessage[]>([])
  const [topicDraft, setTopicDraft]       = useState('')
  const [topicSending, setTopicSend]      = useState(false)
  const [topicVideo, setTopicVideo]       = useState<File | null>(null)
  const [showCreateTopic, setShowCreateTopic] = useState(false)
  const [topicSearch, setTopicSearch]     = useState('')
  const topicRef      = useRef<HTMLTextAreaElement>(null)
  const topicVideoRef = useRef<HTMLInputElement>(null)
  const topicBottomRef = useRef<HTMLDivElement>(null)
  const topicListRef   = useRef<HTMLDivElement>(null)
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
  const [selectedPost, setSelectedPost] = useState<Message | null>(null)

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
    void supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(!!data))
  }, [user.id])

  useEffect(() => {
    void supabase.from('community_mutes').select('muted_until')
      .eq('user_id', user.id).gt('muted_until', new Date().toISOString())
      .order('muted_until', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setMutedUntil(data?.muted_until ?? null))
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
        if (msg.user_id !== user.id && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const body = msg.content.slice(0, 80) + (msg.content.length > 80 ? '…' : '')
          if (msg.channel === 'support' && !msg.is_admin && isAdminRef.current) {
            new Notification(t('communityNotifNewTicket').replace('{name}', msg.display_name), { body, silent: false })
          } else if (msg.channel === 'support' && msg.is_admin && msg.thread_user_id === user.id) {
            new Notification(t('communityNotifReply'), { body: `${t('communityNotifAdminPrefix')}${body}`, silent: false })
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
    if (tab !== 'news' && tab !== 'support') return
    const el = listRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 220)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tab, selectedThread])

  useEffect(() => {
    if (!loading && (tab === 'news' || tab === 'support'))
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
    const opt: Message = { id: optId, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'chat', title: null, is_admin: isAdmin, thread_user_id: null, video_url: localVideoUrl, view_count: 0, created_at: new Date().toISOString() }
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
    const opt: Message = { id: optId, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'news', title: newsTitle.trim() || null, is_admin: true, thread_user_id: null, video_url: localVideoUrl, view_count: 0, created_at: new Date().toISOString() }
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
    const opt: Message = { id: optId, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'support', title: null, is_admin: isAdmin, thread_user_id: threadId, video_url: localVideoUrl, view_count: 0, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, opt])
    const video_url = videoFile ? await uploadVideo(videoFile) : null
    const { error, data } = await supabase.from('community_messages').insert({ user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, channel: 'support', title: null, is_admin: isAdmin, thread_user_id: threadId, video_url }).select().single()
    if (error) { setMessages(prev => prev.filter(m => m.id !== optId)); setChatDraft(content) }
    else if (data) setMessages(prev => prev.map(m => m.id === optId ? data as Message : m))
    setChatSend(false)
  }

  // ── Topics load ────────────────────────────────────────────────────────────

  const loadTopics = useCallback(async () => {
    const { data } = await supabase.from('community_topics').select('*').order('created_at', { ascending: true })
    if (data) setTopics(data as Topic[])
  }, [])

  const loadTopicMeta = useCallback(async () => {
    const { data: members } = await supabase.from('community_topic_members').select('topic_id, user_id')
    if (members) {
      const counts = new Map<string, number>()
      const joined = new Set<string>()
      for (const m of members) {
        counts.set(m.topic_id, (counts.get(m.topic_id) ?? 0) + 1)
        if (m.user_id === user.id) joined.add(m.topic_id)
      }
      setMemberCounts(counts)
      setJoinedTopicIds(joined)
    }
    const { data: lastMsgs } = await supabase.from('topic_messages').select('topic_id, content, created_at').order('created_at', { ascending: false }).limit(200)
    if (lastMsgs) {
      const map = new Map<string, { content: string; at: string }>()
      for (const m of lastMsgs) {
        if (!map.has(m.topic_id)) map.set(m.topic_id, { content: m.content, at: m.created_at })
      }
      setTopicLastMsg(map)
    }
  }, [user.id])

  const loadTopicMessages = useCallback(async (topicId: string) => {
    const { data } = await supabase.from('topic_messages').select('*').eq('topic_id', topicId).order('created_at', { ascending: true }).limit(300)
    if (data) setTopicMessages(data as TopicMessage[])
  }, [])

  async function joinTopic(topicId: string) {
    setJoinedTopicIds(prev => new Set([...prev, topicId]))
    setMemberCounts(prev => { const m = new Map(prev); m.set(topicId, (m.get(topicId) ?? 0) + 1); return m })
    await supabase.from('community_topic_members').insert({ topic_id: topicId, user_id: user.id })
  }

  async function leaveTopic(topicId: string) {
    setJoinedTopicIds(prev => { const s = new Set(prev); s.delete(topicId); return s })
    setMemberCounts(prev => { const m = new Map(prev); m.set(topicId, Math.max(0, (m.get(topicId) ?? 1) - 1)); return m })
    await supabase.from('community_topic_members').delete().eq('topic_id', topicId).eq('user_id', user.id)
  }

  async function createTopic({ name, description, emoji }: { name: string; description: string; emoji: string }) {
    if (!requirePseudo()) return
    const { data, error } = await supabase.from('community_topics')
      .insert({ name, description: description || null, emoji, created_by: user.id })
      .select().single()
    if (!error && data) {
      setTopics(prev => [...prev, data as Topic])
      setShowCreateTopic(false)
      await joinTopic(data.id)
    }
  }

  async function deleteTopic(topicId: string) {
    setTopics(prev => prev.filter(t => t.id !== topicId))
    if (selectedTopic?.id === topicId) { setTopicsView('list'); setSelectedTopic(null) }
    await supabase.from('topic_messages').delete().eq('topic_id', topicId)
    await supabase.from('community_topic_members').delete().eq('topic_id', topicId)
    await supabase.from('community_topics').delete().eq('id', topicId)
  }

  async function sendTopicMessage() {
    if (!requirePseudo() || isMuted || !selectedTopic) return
    const content = topicDraft.trim()
    if (!content && !topicVideo) return
    if (topicSending) return
    setTopicSend(true); setTopicDraft('')
    const videoFile = topicVideo; setTopicVideo(null)
    const localUrl = videoFile ? URL.createObjectURL(videoFile) : null
    const optId = crypto.randomUUID()
    const opt: TopicMessage = { id: optId, topic_id: selectedTopic.id, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, is_admin: isAdmin, video_url: localUrl, created_at: new Date().toISOString() }
    setTopicMessages(prev => [...prev, opt])
    const video_url = videoFile ? await uploadVideo(videoFile) : null
    const { error, data } = await supabase.from('topic_messages')
      .insert({ topic_id: selectedTopic.id, user_id: user.id, content: content || '', display_name: profile.display_name, avatar_url: profile.avatar_url, org_name: currentOrg?.name ?? null, is_admin: isAdmin, video_url })
      .select().single()
    if (error) { setTopicMessages(prev => prev.filter(m => m.id !== optId)); setTopicDraft(content) }
    else if (data) setTopicMessages(prev => prev.map(m => m.id === optId ? data as TopicMessage : m))
    setTopicSend(false)
    topicRef.current?.focus()
  }

  async function deleteTopicMessage(id: string) {
    setTopicMessages(prev => prev.filter(m => m.id !== id))
    await supabase.from('topic_messages').delete().eq('id', id)
  }

  useEffect(() => { loadTopics() }, [loadTopics])
  useEffect(() => { loadTopicMeta() }, [loadTopicMeta])

  useEffect(() => {
    if (!selectedTopic) return
    loadTopicMessages(selectedTopic.id)
  }, [selectedTopic, loadTopicMessages])

  useEffect(() => {
    if (!selectedTopic) return
    setTimeout(() => topicBottomRef.current?.scrollIntoView({ behavior: 'instant' as any }), 50)
  }, [selectedTopic])

  useEffect(() => {
    if (topicMessages.length === 0 || !selectedTopic) return
    const el = topicListRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200)
      topicBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [topicMessages, selectedTopic])

  // Real-time for topic messages
  useEffect(() => {
    if (!selectedTopic) return
    const ch = supabase.channel(`topic-${selectedTopic.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'topic_messages', filter: `topic_id=eq.${selectedTopic.id}` }, payload => {
        const msg = payload.new as TopicMessage
        setTopicMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'topic_messages' }, payload => {
        setTopicMessages(prev => prev.filter(m => m.id !== (payload.old as any).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedTopic?.id])

  // Real-time for topics list
  useEffect(() => {
    const ch = supabase.channel('community-topics-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_topics' }, payload => {
        setTopics(prev => prev.some(t => t.id === (payload.new as Topic).id) ? prev : [...prev, payload.new as Topic])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_topics' }, payload => {
        setTopics(prev => prev.filter(t => t.id !== (payload.old as any).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Messages ───────────────────────────────────────────────────────────────

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

  // Sidebar computed data
  const uniqueUserCount = new Set(messages.map(m => m.user_id)).size
  const actMap = new Map<string, { display_name: string; avatar_url: string | null; user_id: string; count: number }>()
  for (const m of messages) {
    if (!m.is_admin) {
      const ex = actMap.get(m.user_id)
      if (ex) ex.count++
      else actMap.set(m.user_id, { display_name: m.display_name, avatar_url: m.avatar_url, user_id: m.user_id, count: 1 })
    }
  }
  const topMembers = Array.from(actMap.values()).sort((a, b) => b.count - a.count).slice(0, 5)

  const featuredMsg = newsMessages[0] ?? null
  const [g1, g2] = gradientForId(user.id)

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#06040f' }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.95)', backdropFilter: 'blur(12px)' }}>
        <div>
          <h1 className="text-[18px] font-black text-white leading-tight">{t('communityTitle')}</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
            {t('communitySub')}
          </p>
        </div>
        <button onClick={() => setShowProfile(true)}
          className="flex items-center gap-2.5 pl-2.5 pr-3 py-2 rounded-xl transition-all hover:bg-white/[0.04] group"
          style={{ border: '1px solid rgba(139,92,246,0.12)' }}>
          <Avatar url={profile.avatar_url} name={profile.display_name || '?'} userId={user.id} size={28} />
          <div className="text-left">
            <p className="text-[11.5px] font-semibold leading-tight"
              style={{ color: profile.display_name ? 'white' : 'rgba(196,181,253,0.4)' }}>
              {profile.display_name || t('communitySetPseudo')}
            </p>
            {currentOrg && <p className="text-[9.5px] leading-tight" style={{ color: 'rgba(139,92,246,0.7)' }}>{currentOrg.name}</p>}
          </div>
          <span className="text-[10px] opacity-0 group-hover:opacity-50 transition-opacity ml-1" style={{ color: '#a78bfa' }}>✏</span>
        </button>
      </div>

      {/* ── Muted banner ─────────────────────────────────────────────────────── */}
      {isMuted && (
        <div className="flex-shrink-0 mx-5 mt-3 px-4 py-2 rounded-xl flex items-center gap-2"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <span className="text-sm">🔇</span>
          <p className="text-[11px]" style={{ color: 'rgba(251,191,36,0.8)' }}>
            {t('communityMutedBanner')} <strong>
              {new Date(mutedUntil!).toLocaleDateString('en-US', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </strong>
          </p>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex px-5 gap-1"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,5,20,0.7)' }}>
        {([
          { id: 'news'    as Tab, label: t('communityTabNews'),    icon: '📢' },
          { id: 'topics'  as Tab, label: t('communityTabTopics'),  icon: '🌐' },
          { id: 'support' as Tab, label: t('communityTabSupport'), icon: '🎫' },
        ]).map(tab_ => (
          <button key={tab_.id} onClick={() => {
              setTab(tab_.id)
              if (tab_.id === 'support') setLastSeenSupportAt(new Date().toISOString())
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-bold transition-all relative"
            style={tab === tab_.id
              ? { color: '#c4b5fd', borderBottom: '2px solid #8b5cf6', marginBottom: -1 }
              : { color: 'rgba(196,181,253,0.35)', borderBottom: '2px solid transparent', marginBottom: -1 }}>
            <span className="text-[14px]">{tab_.icon}</span>
            <span>{tab_.label}</span>
            {tab_.id === 'support' && !isAdmin && tab !== 'support' &&
              myThreadMessages.some(m => m.is_admin && new Date(m.created_at) > new Date(lastSeenSupportAt)) && (
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: '#ec4899', boxShadow: '0 0 6px #ec4899' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── NEWS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'news' && (
        <div className="flex flex-1 overflow-hidden">

          {/* Main feed */}
          <div ref={listRef} className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4 max-w-3xl">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Spinner size="lg" />
                </div>
              ) : (
                <>
                  {/* Featured / pinned card */}
                  {featuredMsg && (
                    <div className="rounded-2xl overflow-hidden cursor-pointer transition-all hover:border-purple-400/60"
                      style={{ background: 'linear-gradient(135deg,#120840 0%,#07102c 60%,#0a0626 100%)', border: '1px solid rgba(139,92,246,0.4)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
                      onClick={() => setSelectedPost(featuredMsg)}>
                      <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#7c3aed,#ec4899,#3b82f6)' }} />
                      <div className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                            style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.45),rgba(236,72,153,0.3))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.3)' }}>
                            {t('communityNewsPinned')}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.25)' }}>
                            {t('communityNewsScaleFlow')}
                          </span>
                        </div>
                        {featuredMsg.title && (
                          <h2 className="text-[22px] font-black text-white leading-tight mb-3">
                            {featuredMsg.title}
                          </h2>
                        )}
                        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap mb-5"
                          style={{ color: 'rgba(212,220,240,0.8)' }}>
                          {featuredMsg.content.length > 240
                            ? featuredMsg.content.slice(0, 240) + '…'
                            : featuredMsg.content}
                        </p>
                        {featuredMsg.video_url && (
                          <div className="mb-5"><MediaBlock url={featuredMsg.video_url} maxHeight={260} /></div>
                        )}
                        <div className="flex items-center justify-between pt-4"
                          style={{ borderTop: '1px solid rgba(139,92,246,0.12)' }}>
                          <div className="flex items-center gap-2.5">
                            <Avatar url={featuredMsg.avatar_url} name={featuredMsg.display_name} userId={featuredMsg.user_id} size={24} />
                            <div>
                              <span className="text-[11.5px] font-semibold" style={{ color: '#c4b5fd' }}>
                                {featuredMsg.display_name}
                              </span>
                              <span className="text-[10px] ml-2" style={{ color: 'rgba(196,181,253,0.35)' }}
                                title={fullDate(featuredMsg.created_at)}>
                                {timeAgo(featuredMsg.created_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button onClick={e => { e.stopPropagation(); toggleLike(featuredMsg.id) }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all"
                              style={myLikes.has(featuredMsg.id)
                                ? { background: 'rgba(236,72,153,0.15)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.25)' }
                                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                              ❤️ {reactions.get(featuredMsg.id) ?? 0}
                            </button>
                            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(196,181,253,0.3)' }}>
                              <span>👁</span>
                              <span className="tabular-nums">{featuredMsg.view_count}</span>
                            </div>
                            {isAdmin && (
                              <button onClick={e => { e.stopPropagation(); deleteMessage(featuredMsg.id) }}
                                className="text-[14px] transition-opacity hover:opacity-80"
                                style={{ color: 'rgba(239,68,68,0.5)' }} title="Delete">🗑</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Admin: new post button or form */}
                  {isAdmin && !showNewsForm && (
                    <button onClick={() => setShowNewsForm(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:border-purple-500/40"
                      style={{ background: 'rgba(139,92,246,0.05)', border: '1px dashed rgba(139,92,246,0.3)' }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: 'rgba(139,92,246,0.15)' }}>📢</div>
                      <span className="text-[12.5px] font-semibold" style={{ color: 'rgba(196,181,253,0.55)' }}>
                        {t('communityNewsNewPost')}
                      </span>
                      <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-lg"
                        style={{ background: 'rgba(124,58,237,0.25)', color: '#f0a8ff' }}>ADMIN</span>
                    </button>
                  )}

                  {isAdmin && showNewsForm && (
                    <div className="rounded-2xl overflow-hidden"
                      style={{ background: 'rgba(8,5,20,0.9)', border: '1px solid rgba(139,92,246,0.3)' }}>
                      <div className="px-4 py-3 flex items-center justify-between"
                        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.05))' }}>
                        <div className="flex items-center gap-2">
                          <span>📢</span>
                          <p className="text-[12px] font-black text-white">{t('communityNewsNewPost').replace('+ ', '')}</p>
                        </div>
                        <button onClick={() => setShowNewsForm(false)} style={{ color: 'rgba(196,181,253,0.4)' }}>✕</button>
                      </div>
                      <div className="p-4 space-y-3">
                        <input type="text" value={newsTitle} onChange={e => setNewsTitle(e.target.value)}
                          placeholder={t('communityNewsTitlePlaceholder')}
                          className="w-full rounded-xl px-3.5 py-2.5 text-sm font-bold text-white outline-none sf-input" />
                        <textarea value={newsContent} onChange={e => setNewsContent(e.target.value)}
                          placeholder={t('communityNewsContentPlaceholder')} rows={4} maxLength={2000}
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
                            <span className="text-[11px]">{t('communityNewsAttach')}</span>
                          </button>
                        )}
                        <input ref={newsVideoRef} type="file" accept="image/*,video/*" className="hidden"
                          onChange={e => { if (e.target.files?.[0]) { setNewsVideo(e.target.files[0]); e.target.value = '' } }} />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.3)' }}>{newsContent.length}/2000</span>
                          <div className="flex gap-2">
                            <button onClick={() => { setShowNewsForm(false); setNewsVideo(null) }}
                              className="px-4 py-2 rounded-xl text-[12px] font-semibold"
                              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
                              {t('cancel')}
                            </button>
                            <button onClick={sendNews} disabled={(!newsContent.trim() && !newsVideo) || newsSending}
                              className="px-4 py-2 rounded-xl text-[12px] font-semibold btn-sf-primary disabled:opacity-40">
                              {newsSending ? t('communityNewsPublishing') : t('communityNewsPublish')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Post list — all except featured */}
                  {newsMessages.length > 1 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[13px] font-black text-white">{t('communityNewsLatest')}</h2>
                      </div>
                      <div className="space-y-2">
                        {newsMessages.slice(1).map(msg => (
                          <div key={msg.id}
                            className="flex items-start gap-3 p-4 rounded-xl group transition-all cursor-pointer hover:border-purple-500/30"
                            style={{ background: 'rgba(8,5,20,0.8)', border: '1px solid rgba(139,92,246,0.12)' }}
                            onMouseEnter={() => trackView(msg.id)}
                            onClick={() => setSelectedPost(msg)}>
                            <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={38} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-[2px] rounded-full flex-shrink-0"
                                  style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.3),rgba(236,72,153,0.2))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.2)' }}>
                                  {t('communityNewsFeaturedBadge')}
                                </span>
                                {msg.title && (
                                  <p className="text-[13px] font-bold text-white truncate">{msg.title}</p>
                                )}
                              </div>
                              <p className="text-[12px] mb-2 line-clamp-2 leading-relaxed"
                                style={{ color: 'rgba(196,181,253,0.5)' }}>
                                {msg.content}
                              </p>
                              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                                <span className="font-semibold">{msg.display_name}</span>
                                <span>·</span>
                                <span>{timeAgo(msg.created_at)}</span>
                                <button onClick={e => { e.stopPropagation(); toggleLike(msg.id) }}
                                  className="flex items-center gap-1 transition-colors"
                                  style={{ color: myLikes.has(msg.id) ? '#f472b6' : 'rgba(196,181,253,0.35)' }}>
                                  ❤️ {reactions.get(msg.id) ?? 0}
                                </button>
                                <span className="flex items-center gap-1">👁 {msg.view_count}</span>
                              </div>
                            </div>
                            {isAdmin && (
                              <button onClick={e => { e.stopPropagation(); deleteMessage(msg.id) }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
                                style={{ color: 'rgba(239,68,68,0.5)', fontSize: 14 }}>🗑</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {newsMessages.length === 0 && !isAdmin && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)' }}>📢</div>
                      <div className="space-y-1">
                        <p className="font-bold text-white">{t('communityNewsEmpty')}</p>
                        <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                          {t('communityNewsEmptyHint')}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Right sidebar ─────────────────────────────────────────────────── */}
          <div className="w-[240px] flex-shrink-0 overflow-y-auto p-4 space-y-4"
            style={{ borderLeft: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,5,20,0.5)' }}>

            {/* About */}
            <div className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <div className="px-4 py-3"
                style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.07)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#a78bfa' }}>
                  {t('communityAbout')}
                </p>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(196,181,253,0.5)' }}>
                  {t('communityAboutDesc')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: t('communityAboutMembers'), value: uniqueUserCount > 0 ? uniqueUserCount : '—' },
                    { label: t('communityAboutOnline'), value: '🟢' },
                    { label: t('communityAboutPosts'), value: newsMessages.length },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg p-2 text-center"
                      style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.1)' }}>
                      <p className="text-[14px] font-black text-white">{s.value}</p>
                      <p className="text-[9px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                <a href="https://t.me/+drqJbwraMag5M2I0" target="_blank" rel="noreferrer"
                  className="w-full py-2 rounded-xl text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 hover:brightness-110"
                  style={{ background: 'rgba(34,150,243,0.12)', color: '#60b8f5', border: '1px solid rgba(34,150,243,0.2)' }}>
                  {t('communityTelegram')}
                </a>
              </div>
            </div>

            {/* Top members */}
            {topMembers.length > 0 && (
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <div className="px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.07)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#a78bfa' }}>
                    {t('communityTopMembers')}
                  </p>
                </div>
                <div className="p-3 space-y-2">
                  {topMembers.map((m, i) => (
                    <div key={m.user_id} className="flex items-center gap-2 py-1">
                      <span className="text-[11px] font-black w-5 text-center flex-shrink-0"
                        style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : 'rgba(196,181,253,0.25)' }}>
                        {i + 1}
                      </span>
                      <Avatar url={m.avatar_url} name={m.display_name} userId={m.user_id} size={24} />
                      <span className="flex-1 text-[11px] font-semibold text-white truncate">
                        {m.display_name || t('communityAnonymous')}
                      </span>
                      <span className="text-[10px] tabular-nums flex-shrink-0"
                        style={{ color: 'rgba(196,181,253,0.3)' }}>
                        {m.count}
                      </span>
                    </div>
                  ))}
                  <button className="w-full mt-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                    style={{ background: 'transparent', color: 'rgba(196,181,253,0.35)', border: '1px solid rgba(139,92,246,0.1)' }}>
                    {t('communityViewLeaderboard')}
                  </button>
                </div>
              </div>
            )}

            {/* Help section */}
            <div className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <div className="px-4 py-3"
                style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.07)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#a78bfa' }}>
                  {t('communityHelpTitle')}
                </p>
              </div>
              <div className="p-3 space-y-2">
                <button onClick={() => onNavigate?.('support')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-purple-500/10"
                  style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <span className="text-base flex-shrink-0">🎫</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white leading-tight">{t('communityOpenTicket')}</p>
                    <p className="text-[9.5px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>{t('communityOpenTicketSub')}</p>
                  </div>
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(196,181,253,0.3)' }}>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TOPICS TAB ───────────────────────────────────────────────────────── */}
      {tab === 'topics' && (
        <>
          {topicsView === 'list' ? (
            <div className="flex-1 overflow-y-auto">
              <div className="p-5 max-w-3xl">
                {/* Header row */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-[16px] font-black text-white">{t('communityTopicsHeader')}</h2>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>{topics.length} {t('communityTabTopics').toLowerCase()}</p>
                  </div>
                  <button onClick={() => { if (!requirePseudo()) return; setShowCreateTopic(true) }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all btn-sf-primary">
                    {t('communityTopicsCreate')}
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: 'rgba(196,181,253,0.3)' }}>🔍</span>
                  <input type="text" value={topicSearch} onChange={e => setTopicSearch(e.target.value)}
                    placeholder={t('communityTopicsSearch')}
                    className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm text-white outline-none sf-input" />
                </div>

                {topics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
                      style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.06))', border: '1px solid rgba(139,92,246,0.15)' }}>🌐</div>
                    <div className="space-y-1.5">
                      <p className="text-base font-black text-white">{t('communityTopicsEmpty')}</p>
                      <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>{t('communityTopicsEmptyHint')}</p>
                    </div>
                    <button onClick={() => { if (!requirePseudo()) return; setShowCreateTopic(true) }}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold btn-sf-primary">
                      {t('communityTopicsEmptyCreate')}
                    </button>
                  </div>
                ) : (() => {
                  const filtered = topics.filter(t =>
                    !topicSearch || t.name.toLowerCase().includes(topicSearch.toLowerCase()) || (t.description ?? '').toLowerCase().includes(topicSearch.toLowerCase())
                  )
                  const joined  = filtered.filter(t => joinedTopicIds.has(t.id))
                  const others  = filtered.filter(t => !joinedTopicIds.has(t.id))

                  function TopicCard({ t: topic }: { t: Topic }) {
                    const members = memberCounts.get(topic.id) ?? 0
                    const last    = topicLastMsg.get(topic.id)
                    const isJoined = joinedTopicIds.has(topic.id)
                    const canDelete = isAdmin || topic.created_by === user.id
                    return (
                      <div className="relative group flex flex-col gap-3 p-4 rounded-2xl cursor-pointer transition-all hover:border-purple-500/40"
                        style={{ background: isJoined ? 'rgba(139,92,246,0.08)' : 'rgba(8,5,20,0.8)', border: `1px solid ${isJoined ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.1)'}` }}
                        onClick={() => { setSelectedTopic(topic); setTopicsView('chat') }}>
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                            style={{ background: isJoined ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.08)' }}>{topic.emoji}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-[13.5px] font-black text-white truncate">{topic.name}</p>
                              {isJoined && <span className="text-[8px] font-black px-1.5 py-[2px] rounded-full flex-shrink-0"
                                style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd' }}>{t('communityTopicsJoinedBadge')}</span>}
                            </div>
                            {topic.description && (
                              <p className="text-[11.5px] leading-relaxed line-clamp-2" style={{ color: 'rgba(196,181,253,0.5)' }}>{topic.description}</p>
                            )}
                          </div>
                          {canDelete && (
                            <button onClick={e => { e.stopPropagation(); deleteTopic(topic.id) }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-[12px]"
                              style={{ color: 'rgba(239,68,68,0.6)' }} title="Delete">🗑</button>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                            <span>👥 {members} {members !== 1 ? t('communityMemberPlural') : t('communityMemberSingular')}</span>
                            {last && <><span>·</span><span className="truncate max-w-[140px]">{last.content.slice(0, 35)}{last.content.length > 35 ? '…' : ''}</span><span>·</span><span>{timeAgo(last.at)}</span></>}
                          </div>
                          <button onClick={e => {
                              e.stopPropagation()
                              if (isJoined) leaveTopic(topic.id)
                              else joinTopic(topic.id)
                            }}
                            className="flex-shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold transition-all"
                            style={isJoined
                              ? { background: 'rgba(239,68,68,0.1)', color: 'rgba(252,165,165,0.7)', border: '1px solid rgba(239,68,68,0.15)' }
                              : { background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.25)' }}>
                            {isJoined ? t('communityTopicsLeave') : t('communityTopicsJoin')}
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-5">
                      {joined.length > 0 && (
                        <div>
                          <p className="text-[9px] uppercase tracking-widest font-black mb-3 px-0.5" style={{ color: 'rgba(139,92,246,0.5)' }}>{t('communityTopicsMyCommunities')}</p>
                          <div className="space-y-2">
                            {joined.map(t => <TopicCard key={t.id} t={t} />)}
                          </div>
                        </div>
                      )}
                      {others.length > 0 && (
                        <div>
                          <p className="text-[9px] uppercase tracking-widest font-black mb-3 px-0.5" style={{ color: 'rgba(139,92,246,0.5)' }}>
                            {joined.length > 0 ? t('communityTopicsDiscover') : t('communityTopicsAll')}
                          </p>
                          <div className="space-y-2">
                            {others.map(t => <TopicCard key={t.id} t={t} />)}
                          </div>
                        </div>
                      )}
                      {filtered.length === 0 && topicSearch && (
                        <div className="flex flex-col items-center py-12 gap-2 text-center">
                          <p className="text-[13px] font-bold text-white">{t('communityTopicsNoResult')} « {topicSearch} »</p>
                          <button onClick={() => { setTopicSearch(''); setShowCreateTopic(true) }}
                            className="text-[11px] mt-1" style={{ color: '#a78bfa' }}>
                            {t('communityTopicsCreateThis')}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            /* ── Topic chat view ── */
            <>
              {/* Topic header */}
              <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.7)' }}>
                <button onClick={() => { setTopicsView('list'); setSelectedTopic(null) }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/[0.06]"
                  style={{ color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>←</button>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: 'rgba(139,92,246,0.15)' }}>{selectedTopic?.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-white leading-tight">{selectedTopic?.name}</p>
                  <p className="text-[9px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    {(() => { const cnt = memberCounts.get(selectedTopic?.id ?? '') ?? 0; return `${cnt} ${cnt !== 1 ? t('communityMemberPlural') : t('communityMemberSingular')}` })()}
                  </p>
                </div>
                {selectedTopic && (
                  joinedTopicIds.has(selectedTopic.id) ? (
                    <button onClick={() => leaveTopic(selectedTopic.id)}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
                      style={{ background: 'rgba(239,68,68,0.08)', color: 'rgba(252,165,165,0.7)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      {t('communityTopicsLeave')}
                    </button>
                  ) : (
                    <button onClick={() => joinTopic(selectedTopic.id)}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all btn-sf-primary">
                      {t('communityTopicsJoin')}
                    </button>
                  )
                )}
              </div>

              {/* Messages */}
              <div ref={topicListRef} className="flex-1 overflow-y-auto px-5 py-4">
                {topicMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                      style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)' }}>
                      {selectedTopic?.emoji}
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-bold text-white">{selectedTopic?.name}</p>
                      <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>{t('communityTopicsFirstWrite')}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.1)' }} />
                      <span className="text-[10px] font-semibold px-2" style={{ color: 'rgba(196,181,253,0.3)' }}>{t('communityTopicsStart')}</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.1)' }} />
                    </div>
                    {topicMessages.map((msg, i) => {
                      const prev    = topicMessages[i - 1]
                      const compact = prev?.user_id === msg.user_id &&
                        new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
                      return (
                        <div key={msg.id} className={`flex gap-3 group ${compact ? 'mt-[2px]' : 'mt-4'}`}>
                          <div style={{ width: 34, flexShrink: 0 }}>
                            {!compact && <Avatar url={msg.avatar_url} name={msg.display_name} userId={msg.user_id} size={34} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            {!compact && (
                              <div className="flex items-center gap-2 mb-[3px] flex-wrap">
                                <span className="text-[13px] font-bold" style={{ color: msg.user_id === user.id ? '#c4b5fd' : '#e8e0ff' }}>
                                  {msg.display_name || t('communityAnonymous')}
                                </span>
                                {msg.is_admin && (
                                  <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full"
                                    style={{ background: 'linear-gradient(130deg,rgba(124,58,237,0.35),rgba(236,72,153,0.25))', color: '#f0a8ff', border: '1px solid rgba(236,72,153,0.25)' }}>
                                    {t('communityAdminLabel')}
                                  </span>
                                )}
                                {msg.user_id === user.id && !msg.is_admin && (
                                  <span className="text-[8px] font-black uppercase px-1.5 py-[2px] rounded-full"
                                    style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>{t('communityMeLabel')}</span>
                                )}
                                <span className="ml-auto text-[10px] opacity-0 group-hover:opacity-60 transition-opacity tabular-nums"
                                  style={{ color: 'rgba(196,181,253,0.5)' }}>{timeAgo(msg.created_at)}</span>
                              </div>
                            )}
                            <div className="flex items-end gap-1.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-[13.5px] leading-relaxed break-words" style={{ color: 'rgba(212,220,240,0.9)' }}>{msg.content}</p>
                                {msg.video_url && <MediaBlock url={msg.video_url} maxHeight={260} />}
                              </div>
                              {(isAdmin || msg.user_id === user.id) && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pb-0.5">
                                  {compact && <span className="text-[9px] tabular-nums mr-1" style={{ color: 'rgba(196,181,253,0.35)' }}>{timeAgo(msg.created_at)}</span>}
                                  <button onClick={() => deleteTopicMessage(msg.id)}
                                    className="w-5 h-5 flex items-center justify-center rounded text-[11px]"
                                    style={{ color: 'rgba(239,68,68,0.6)' }}>🗑</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={topicBottomRef} className="h-1" />
                  </>
                )}
              </div>

              {/* Input */}
              <div className="flex-shrink-0 px-4 py-3"
                style={{ borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(6,4,15,0.95)' }}>
                {isMuted ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <span>🔇</span>
                    <p className="text-[12px]" style={{ color: 'rgba(251,191,36,0.7)' }}>{t('communityTopicsMuted')}</p>
                  </div>
                ) : (
                  <>
                    {topicVideo && (
                      <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg"
                        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <span className="text-sm">📎</span>
                        <span className="text-[11px] flex-1 truncate" style={{ color: '#c4b5fd' }}>{topicVideo.name}</span>
                        <button onClick={() => setTopicVideo(null)} className="text-[11px]" style={{ color: 'rgba(239,68,68,0.6)' }}>✕</button>
                      </div>
                    )}
                    <div className="flex items-end gap-3">
                      <Avatar url={profile.avatar_url} name={profile.display_name || '?'} userId={user.id} size={32} />
                      <div className="flex-1 flex items-end gap-2 rounded-xl px-3.5 py-2.5"
                        style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <textarea ref={topicRef} value={topicDraft} onChange={e => setTopicDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTopicMessage() } }}
                          onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
                          placeholder={profile.display_name ? `${selectedTopic?.name}… (⏎)` : t('communityTopicsSetPseudoFirst')}
                          rows={1} maxLength={1000}
                          className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                          style={{ minHeight: 22, maxHeight: 120 }} />
                        <button onClick={() => topicVideoRef.current?.click()} title={t('communityAttachVideo')}
                          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                          style={{ color: topicVideo ? '#a78bfa' : 'rgba(196,181,253,0.35)', background: topicVideo ? 'rgba(139,92,246,0.15)' : 'transparent' }}>
                          <span className="text-[15px]">📎</span>
                        </button>
                        <button onClick={sendTopicMessage} disabled={(!topicDraft.trim() && !topicVideo) || topicSending}
                          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30 active:scale-90"
                          style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)', boxShadow: '0 2px 12px rgba(124,58,237,0.4)' }}>
                          {topicSending ? <Spinner size="sm" /> : <span className="text-sm leading-none">↑</span>}
                        </button>
                      </div>
                    </div>
                    <input ref={topicVideoRef} type="file" accept="image/*,video/*" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) { setTopicVideo(e.target.files[0]); e.target.value = '' } }} />
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── SUPPORT TAB ──────────────────────────────────────────────────────── */}
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
                    {t('communityAdminTickets')} ({threadList.length})
                  </p>
                  {loading ? <div className="flex justify-center py-8"><Spinner size="sm" /></div>
                  : threadList.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2 text-center">
                      <span className="text-3xl">🎫</span>
                      <p className="text-[11px]" style={{ color: 'rgba(196,181,253,0.3)' }}>{t('communityAdminNoTickets')}</p>
                    </div>
                  ) : threadList.map(th => {
                    const hasUnread = !th.lastMsg.is_admin && selectedThread !== th.user_id
                    return (
                      <button key={th.user_id} onClick={() => setSelectedThread(th.user_id)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl mb-1 text-left transition-all"
                        style={selectedThread === th.user_id
                          ? { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.3)' }
                          : hasUnread
                          ? { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.22)' }
                          : { background: 'transparent', border: '1px solid transparent' }}>
                        <div className="relative flex-shrink-0">
                          <Avatar url={th.avatar_url} name={th.display_name} userId={th.user_id} size={28} />
                          {hasUnread && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                              style={{ background: '#ec4899', borderColor: '#080614' }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] truncate ${hasUnread ? 'font-black text-white' : 'font-bold text-white'}`}>
                            {th.display_name || t('communityAnonymous')}
                          </p>
                          <p className="text-[9px] truncate" style={{ color: hasUnread ? 'rgba(236,72,153,0.7)' : 'rgba(196,181,253,0.4)' }}>
                            {hasUnread && '● '}{th.lastMsg.content.slice(0, 24)}{th.lastMsg.content.length > 24 ? '…' : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[8px] tabular-nums" style={{ color: hasUnread ? 'rgba(236,72,153,0.6)' : 'rgba(196,181,253,0.3)' }}>
                            {timeAgo(th.lastMsg.created_at)}
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
                    <p className="font-bold text-white">{t('communityAdminSelectTicket')}</p>
                    <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>{t('communityAdminSelectTicketHint')}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex-shrink-0 px-4 py-2.5 flex items-center gap-2.5"
                      style={{ borderBottom: '1px solid rgba(139,92,246,0.1)', background: 'rgba(8,5,20,0.6)' }}>
                      {(() => { const th2 = threadList.find(th2 => th2.user_id === selectedThread); return th2 ? (
                        <>
                          <Avatar url={th2.avatar_url} name={th2.display_name} userId={th2.user_id} size={26} />
                          <div>
                            <p className="text-[12px] font-black text-white">{th2.display_name || t('communityAnonymous')}</p>
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
                            placeholder={t('communityAdminReplyPlaceholder')}
                            rows={1} maxLength={1000}
                            className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                            style={{ minHeight: 22, maxHeight: 120 }} />
                          <button onClick={() => chatVideoRef.current?.click()} title={t('communityAttachVideo')}
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
                      <p className="text-base font-black text-white">{t('communitySupportEmpty')}</p>
                      <p className="text-sm" style={{ color: 'rgba(196,181,253,0.4)' }}>
                        {t('communitySupportEmptyHint')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px" style={{ background: 'rgba(96,165,250,0.1)' }} />
                      <span className="text-[10px] font-semibold px-2" style={{ color: 'rgba(147,197,253,0.35)' }}>{t('communitySupportMyTicket')}</span>
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
                    <p className="text-[12px]" style={{ color: 'rgba(251,191,36,0.7)' }}>{t('communityMutedCantSend')}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-400/60" />
                      <span className="text-[10px]" style={{ color: 'rgba(196,181,253,0.35)' }}>
                        {t('communitySupportAskTeam')} <strong style={{ color: 'rgba(147,197,253,0.6)' }}>ScaleFlow</strong>
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
                          placeholder={profile.display_name ? t('communitySupportAskPlaceholder') : t('communityTopicsSetPseudoFirst')}
                          rows={1} maxLength={1000}
                          className="flex-1 bg-transparent text-[13px] text-white resize-none outline-none leading-relaxed"
                          style={{ minHeight: 22, maxHeight: 120 }} />
                        <button onClick={() => chatVideoRef.current?.click()} title={t('communityAttachVideo')}
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
                    <input ref={chatVideoRef} type="file" accept="image/*,video/*" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) { setChatVideo(e.target.files[0]); e.target.value = '' } }} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Post detail modal ─────────────────────────────────────────────────── */}
      {selectedPost && (
        <div className="fixed inset-0 z-[9980] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
          onClick={e => e.target === e.currentTarget && setSelectedPost(null)}>
          <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden anim-scale-in"
            style={{ background: '#0c0919', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
            {/* Modal header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.05))' }}>
              <div className="flex items-center gap-2.5">
                <Avatar url={selectedPost.avatar_url} name={selectedPost.display_name} userId={selectedPost.user_id} size={28} />
                <div>
                  <p className="text-[12px] font-bold text-white leading-tight">{selectedPost.display_name}</p>
                  <p className="text-[9.5px] leading-tight" style={{ color: 'rgba(196,181,253,0.4)' }}
                    title={fullDate(selectedPost.created_at)}>
                    {timeAgo(selectedPost.created_at)} · {fullDate(selectedPost.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button onClick={() => { deleteMessage(selectedPost.id); setSelectedPost(null) }}
                    className="text-[13px] opacity-50 hover:opacity-80 transition-opacity"
                    style={{ color: '#f87171' }}>🗑</button>
                )}
                <button onClick={() => setSelectedPost(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-white/[0.06]"
                  style={{ color: 'rgba(196,181,253,0.5)' }}>✕</button>
              </div>
            </div>
            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {selectedPost.title && (
                <h2 className="text-[18px] font-black text-white leading-tight">{selectedPost.title}</h2>
              )}
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap"
                style={{ color: 'rgba(212,220,240,0.85)' }}>
                {selectedPost.content}
              </p>
              {selectedPost.video_url && <MediaBlock url={selectedPost.video_url} maxHeight={320} />}
            </div>
            {/* Modal footer */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-3"
              style={{ borderTop: '1px solid rgba(139,92,246,0.1)', background: 'rgba(6,4,15,0.6)' }}>
              <button onClick={() => toggleLike(selectedPost.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all"
                style={myLikes.has(selectedPost.id)
                  ? { background: 'rgba(236,72,153,0.15)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.25)' }
                  : { background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                ❤️ {reactions.get(selectedPost.id) ?? 0} {myLikes.has(selectedPost.id) ? t('communityPostLiked') : t('communityPostLike')}
              </button>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(196,181,253,0.3)' }}>
                <span>👁</span>
                <span className="tabular-nums">{selectedPost.view_count} {t('communityPostViews')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <ProfileModal profile={profile} userId={user.id} isAdmin={isAdmin}
          onClose={() => setShowProfile(false)}
          onSaved={p => { setProfile(p); setShowProfile(false) }} />
      )}

      {showCreateTopic && (
        <CreateTopicModal
          onClose={() => setShowCreateTopic(false)}
          onCreate={createTopic} />
      )}

      {showMuteModal && muteTarget && (
        <MuteModal targetName={muteTarget.name}
          onMute={minutes => muteUser(muteTarget.id, minutes)}
          onClose={() => { setShowMuteModal(false); setMuteTarget(null) }} />
      )}
    </div>
  )
}
