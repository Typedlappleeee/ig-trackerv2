import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone, type ContentItem } from '@/lib/supabase'
import { Button }  from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface PostingProps { user: User }

interface TaskLog {
  message: string
  level:   'info' | 'ok' | 'error' | 'warn'
  time:    string
}

const GEELARK = 'https://openapi.geelark.com/open/v1'

async function geelark(bearer: string, path: string, body: unknown) {
  const r = await window.electronAPI!.geelarkRequest({
    method: 'POST', url: `${GEELARK}${path}`,
    headers: { Authorization: `Bearer ${bearer}` }, body,
  })
  return r.data as Record<string, unknown>
}

export function Posting({ user }: PostingProps) {
  const [phones, setPhones]         = useState<Phone[]>([])
  const [bank, setBank]             = useState<ContentItem[]>([])
  const [selectedPhones, setSelPhones] = useState<Set<string>>(new Set())
  const [selectedVideo, setSelVideo]  = useState<ContentItem | null>(null)
  const [localFilePath, setLocalPath] = useState<string | null>(null)
  const [caption, setCaption]       = useState('')
  const [bearer, setBearer]         = useState('')
  const [groupFilter, setGroup]     = useState('Tous')
  const [groups, setGroups]         = useState<string[]>(['Tous'])
  const [posting, setPosting]       = useState(false)
  const [logs, setLogs]             = useState<TaskLog[]>([])
  const [progress, setProgress]     = useState(0)
  const logEndRef                   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('app_config').select('bearer_token').eq('user_id', user.id).single(),
      supabase.from('phones').select('*').eq('user_id', user.id).order('phone_name'),
      supabase.from('content_bank').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]).then(([cfg, ph, bk]) => {
      if (cfg.data?.bearer_token) setBearer(cfg.data.bearer_token)
      const ps = ph.data ?? []
      setPhones(ps)
      const grps = [...new Set(ps.map(p => p.group_name).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
      setBank(bk.data ?? [])
    })
  }, [])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  function log(message: string, level: TaskLog['level'] = 'info') {
    setLogs(prev => [...prev, {
      message, level,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }])
  }

  function togglePhone(id: string) {
    setSelPhones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function pickLocalFile() {
    const path = await window.electronAPI?.pickVideoFile()
    if (path) { setLocalPath(path); setSelVideo(null) }
  }

  async function post() {
    if (!bearer)                              { log('Token GéeLark manquant — Paramètres', 'error'); return }
    if (selectedPhones.size === 0)            { log('Sélectionne au moins un téléphone', 'warn'); return }
    if (!selectedVideo && !localFilePath)     { log('Sélectionne une vidéo', 'warn'); return }
    if (!caption.trim())                      { log('La caption est obligatoire', 'warn'); return }

    setPosting(true); setLogs([]); setProgress(0)
    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    const total     = phoneList.length

    try {
      // ── Step 1: upload video ──────────────────────────────────────────────
      log('📤 Upload de la vidéo vers GéeLark…')
      setProgress(5)
      let videoToken: string

      if (localFilePath) {
        const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath: localFilePath })
        if (!up.ok || !up.token) { log(`❌ Upload échoué: ${up.error}`, 'error'); setPosting(false); return }
        videoToken = up.token
      } else {
        // Bank video: upload via URL (GéeLark imports from URL)
        const d = await geelark(bearer, '/upload/getUrl', { fileType: 'video', url: selectedVideo!.file_url })
        if (d['code'] !== 0) { log(`❌ Upload URL: ${d['msg'] ?? d['code']}`, 'error'); setPosting(false); return }
        videoToken = (d['data'] as Record<string, unknown>)?.['token'] as string
      }
      log(`✅ Vidéo uploadée (token: ${videoToken.slice(0, 12)}…)`, 'ok')
      setProgress(20)

      // ── Step 2: start phones ──────────────────────────────────────────────
      const geelarkIds = phoneList.map(p => p.geelark_id)
      log(`📱 Démarrage de ${total} téléphone${total > 1 ? 's' : ''}…`)
      const startRes = await geelark(bearer, '/phone/start', { ids: geelarkIds })
      const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
      log(`  ${started} démarré(s)`, started > 0 ? 'ok' : 'warn')
      setProgress(35)

      // Wait 30s for boot
      log('⏳ Attente 30s (boot)…')
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000))
        setProgress(35 + Math.round((i / 30) * 25))
      }

      // ── Step 3: create RPA tasks ──────────────────────────────────────────
      setProgress(60)
      log('🎬 Création des tâches de post…')
      const taskIds: Record<string, string> = {}  // geelark_id → task_id

      for (const phone of phoneList) {
        const taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
          phoneId:  phone.geelark_id,
          videoId:  videoToken,
          caption:  caption.trim(),
        })
        if (taskRes['code'] === 0) {
          const tid = (taskRes['data'] as Record<string, unknown>)?.['id'] as string
          taskIds[phone.geelark_id] = tid
          log(`  ✅ Tâche créée pour ${phone.phone_name}`, 'ok')
        } else {
          log(`  ❌ ${phone.phone_name}: ${taskRes['msg'] ?? taskRes['code']}`, 'error')
        }
      }
      setProgress(70)

      // ── Step 4: poll until done (max 8 min) ──────────────────────────────
      if (Object.keys(taskIds).length === 0) {
        log('❌ Aucune tâche créée.', 'error')
      } else {
        log(`⏳ Suivi de ${Object.keys(taskIds).length} tâche(s)…`)
        const pending = new Set(Object.values(taskIds))
        const deadline = Date.now() + 8 * 60 * 1000
        const STATUS: Record<number, string> = { 1: '⏳ En attente', 2: '🔄 En cours', 3: '✅ Terminé', 4: '❌ Échoué', 7: '🚫 Annulé' }

        while (pending.size > 0 && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 15000))
          const qRes = await geelark(bearer, '/task/query', { ids: [...pending] })
          const items = ((qRes['data'] as Record<string, unknown>)?.['items'] ?? []) as Array<Record<string, unknown>>
          for (const item of items) {
            const tid    = item['id'] as string
            const status = item['status'] as number
            const phone  = phoneList.find(p => taskIds[p.geelark_id] === tid)
            const name   = phone?.phone_name ?? tid
            if ([3, 4, 7].includes(status)) {
              pending.delete(tid)
              const level = status === 3 ? 'ok' : 'error'
              const fail  = item['failDesc'] ? ` — ${item['failDesc']}` : ''
              log(`${STATUS[status] ?? status} ${name}${fail}`, level)
            }
          }
          const done = Object.keys(taskIds).length - pending.size
          setProgress(70 + Math.round((done / Object.keys(taskIds).length) * 25))
        }
        if (pending.size > 0) log(`⏳ ${pending.size} tâche(s) toujours en cours — vérifie GéeLark`, 'warn')
      }

      // ── Step 5: stop phones ──────────────────────────────────────────────
      log('🛑 Arrêt des téléphones…')
      await geelark(bearer, '/phone/stop', { ids: geelarkIds })
      setProgress(100)
      log('🎉 Terminé !', 'ok')

    } catch (e: unknown) {
      log(`❌ Erreur: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }

    setPosting(false)
  }

  const visiblePhones = groupFilter === 'Tous'
    ? phones
    : phones.filter(p => p.group_name === groupFilter)

  return (
    <div className="flex h-full min-h-screen">
      {/* Left: phone selector */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-border" style={{ background: '#0a0d15' }}>
        <div className="px-4 py-4 border-b border-border">
          <p className="text-sm font-bold text-text">📱 Comptes</p>
          <select
            value={groupFilter}
            onChange={e => setGroup(e.target.value)}
            className="mt-2 w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
          >
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Select all / none */}
        <div className="px-4 py-2 flex gap-3 border-b border-border">
          <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
            className="text-xs text-accent hover:text-text transition-colors">Tout</button>
          <button onClick={() => setSelPhones(new Set())}
            className="text-xs text-text2 hover:text-text transition-colors">Aucun</button>
          <span className="ml-auto text-xs text-text2">{selectedPhones.size} sélectionné{selectedPhones.size !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex-1 overflow-auto">
          {visiblePhones.map(phone => {
            const checked = selectedPhones.has(phone.id)
            return (
              <button
                key={phone.id}
                onClick={() => togglePhone(phone.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 ${
                  checked ? 'bg-accent/10' : 'hover:bg-surface2'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  checked ? 'bg-accent text-white' : 'bg-surface2 text-text2'
                }`}>
                  {phone.ig_username ? phone.ig_username[0].toUpperCase() : phone.phone_name[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text truncate">{phone.phone_name}</p>
                  {phone.ig_username && (
                    <p className="text-[10px] text-accent truncate">@{phone.ig_username}</p>
                  )}
                </div>
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  checked ? 'bg-accent border-accent' : 'border-border'
                }`}>
                  {checked && <span className="text-white text-[10px]">✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Right: post form */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Nouveau post</h1>
          <p className="text-text2 text-sm mt-1">Poste un Reel sur tes téléphones GéeLark</p>
        </div>

        {/* Video picker */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text">🎬 Vidéo</h2>

          {/* Local file */}
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={pickLocalFile}>
              💾 Depuis le PC
            </Button>
            {localFilePath && (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ok truncate">✓ {localFilePath.split(/[\\/]/).pop()}</p>
                <button onClick={() => setLocalPath(null)} className="text-[10px] text-text2 hover:text-danger">Retirer</button>
              </div>
            )}
          </div>

          {/* Bank picker */}
          <div>
            <p className="text-xs text-text2 mb-2">ou depuis la banque :</p>
            {bank.length === 0 ? (
              <p className="text-xs text-text2">Aucune vidéo dans la banque.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-auto">
                {bank.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { setSelVideo(item); setLocalPath(null) }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                      selectedVideo?.id === item.id ? 'bg-accent/20 border border-accent/40 text-text' : 'hover:bg-surface2 text-text2'
                    }`}
                  >
                    <span>🎬</span>
                    <span className="flex-1 truncate">{item.title}</span>
                    {selectedVideo?.id === item.id && <span className="text-accent">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Caption */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text">📝 Caption</h2>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Écris ta caption ici…&#10;&#10;#hashtag1 #hashtag2"
            rows={6}
            className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text placeholder:text-text2 focus:border-accent focus:outline-none resize-none transition-colors"
          />
          <p className="text-xs text-text2 text-right">{caption.length} caractères</p>
        </div>

        {/* Post button */}
        {!bearer && (
          <div className="px-4 py-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-sm">
            ⚠ Token GéeLark manquant — configure-le dans Paramètres.
          </div>
        )}

        <Button
          onClick={post}
          loading={posting}
          disabled={!bearer || selectedPhones.size === 0 || (!selectedVideo && !localFilePath)}
          size="lg"
        >
          🚀 Poster sur {selectedPhones.size || '?'} téléphone{selectedPhones.size !== 1 ? 's' : ''}
        </Button>

        {/* Progress + logs */}
        {logs.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {posting && (
              <div className="h-1 bg-surface2">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            <div className="p-4 max-h-64 overflow-auto font-mono text-xs space-y-1">
              {logs.map((l, i) => (
                <div key={i} className={`flex gap-3 ${
                  l.level === 'ok'    ? 'text-ok'     :
                  l.level === 'error' ? 'text-danger'  :
                  l.level === 'warn'  ? 'text-warn'    :
                  'text-text2'
                }`}>
                  <span className="text-text2 flex-shrink-0">{l.time}</span>
                  <span>{l.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
