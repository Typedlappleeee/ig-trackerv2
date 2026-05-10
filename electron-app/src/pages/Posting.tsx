import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Phone } from '@/lib/supabase'
import { Button }  from '@/components/ui/Button'
import { VideoPreview } from '@/components/VideoPreview'
import { BankPicker } from './Bank'

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
  const [phones, setPhones]            = useState<Phone[]>([])
  const [selectedPhones, setSelPhones] = useState<Set<string>>(new Set())
  const [filePath, setFilePath]        = useState<string | null>(null)
  const [bearer, setBearer]            = useState('')
  const [groupFilter, setGroup]        = useState('Tous')
  const [groups, setGroups]            = useState<string[]>(['Tous'])
  const [posting, setPosting]          = useState(false)
  const [logs, setLogs]                = useState<TaskLog[]>([])
  const [progress, setProgress]        = useState(0)
  const [showBankPicker, setShowBankPicker] = useState(false)
  const logEndRef                      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('app_config').select('bearer_token').eq('user_id', user.id).single(),
      supabase.from('phones').select('*').eq('user_id', user.id).order('phone_name'),
    ]).then(([cfg, ph]) => {
      if (cfg.data?.bearer_token) setBearer(cfg.data.bearer_token)
      const ps = ph.data ?? []
      setPhones(ps)
      const grps = [...new Set(ps.map(p => p.group_name).filter(Boolean) as string[])].sort()
      setGroups(['Tous', ...grps])
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
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function pickLocalFile() {
    const p = await window.electronAPI?.pickVideoFile()
    if (p) setFilePath(p)
  }

  async function post() {
    if (!bearer)               { log('Token GéeLark manquant — Paramètres', 'error'); return }
    if (selectedPhones.size === 0) { log('Sélectionne au moins un téléphone', 'warn'); return }
    if (!filePath)             { log('Sélectionne une vidéo', 'warn'); return }

    setPosting(true); setLogs([]); setProgress(0)
    const phoneList = phones.filter(p => selectedPhones.has(p.id))
    const total     = phoneList.length

    try {
      log('📤 Upload de la vidéo vers GéeLark…')
      setProgress(5)
      const up = await window.electronAPI!.uploadVideoGeelark({ bearer, filePath })
      if (!up.ok || !up.token) { log(`❌ Upload échoué: ${up.error}`, 'error'); setPosting(false); return }
      const videoToken = up.token
      log(`✅ Vidéo uploadée (token: ${videoToken.slice(0, 12)}…)`, 'ok')
      setProgress(20)

      const geelarkIds = phoneList.map(p => p.geelark_id)
      log(`📱 Démarrage de ${total} téléphone${total > 1 ? 's' : ''}…`)
      const startRes = await geelark(bearer, '/phone/start', { ids: geelarkIds })
      const started  = (startRes['data'] as Record<string, number>)?.['successAmount'] ?? 0
      log(`  ${started} démarré(s)`, started > 0 ? 'ok' : 'warn')
      setProgress(35)

      log('⏳ Attente 30s (boot)…')
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000))
        setProgress(35 + Math.round((i / 30) * 25))
      }

      setProgress(60)
      log('🎬 Création des tâches de post…')
      const taskIds: Record<string, string> = {}

      for (const phone of phoneList) {
        const taskRes = await geelark(bearer, '/rpa/task/instagramPubReels', {
          phoneId: phone.geelark_id,
          videoId: videoToken,
          caption: '',
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

      if (Object.keys(taskIds).length === 0) {
        log('❌ Aucune tâche créée.', 'error')
      } else {
        log(`⏳ Suivi de ${Object.keys(taskIds).length} tâche(s)…`)
        const pending  = new Set(Object.values(taskIds))
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

      log('🛑 Arrêt des téléphones…')
      await geelark(bearer, '/phone/stop', { ids: geelarkIds })
      setProgress(100)
      log('🎉 Terminé !', 'ok')

    } catch (e: unknown) {
      log(`❌ Erreur: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }

    setPosting(false)
  }

  const visiblePhones = groupFilter === 'Tous' ? phones : phones.filter(p => p.group_name === groupFilter)
  const fileName = filePath ? filePath.replace(/\\/g, '/').split('/').pop() ?? filePath : null

  return (
    <div className="flex h-full min-h-screen">
      {/* Left: phone selector */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border" style={{ background: '#0a0d15' }}>
        <div className="px-4 py-4 border-b border-border">
          <p className="text-sm font-bold text-text">Comptes</p>
          <select value={groupFilter} onChange={e => setGroup(e.target.value)}
            className="mt-2 w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent">
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="px-4 py-2 flex gap-3 border-b border-border">
          <button onClick={() => setSelPhones(new Set(visiblePhones.map(p => p.id)))}
            className="text-xs text-accent hover:text-text">Tout</button>
          <button onClick={() => setSelPhones(new Set())}
            className="text-xs text-text2 hover:text-text">Aucun</button>
          <span className="ml-auto text-xs text-text2">{selectedPhones.size} sél.</span>
        </div>
        <div className="flex-1 overflow-auto">
          {visiblePhones.map(phone => {
            const checked = selectedPhones.has(phone.id)
            return (
              <button key={phone.id} onClick={() => togglePhone(phone.id)}
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
                  {phone.ig_username && <p className="text-[10px] text-accent truncate">@{phone.ig_username}</p>}
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

      {/* Right: form */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Nouveau post</h1>
          <p className="text-text2 text-sm mt-1">Poste un Reel sur tes téléphones GéeLark</p>
        </div>

        {/* Video selector + preview */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text mb-4">Vidéo</h2>
          <div className="flex gap-5">
            {/* 9:16 preview */}
            <div className="w-32 flex-shrink-0">
              <div className="aspect-[9/16] rounded-xl overflow-hidden">
                <VideoPreview filePath={filePath} />
              </div>
            </div>

            {/* Source buttons */}
            <div className="flex-1 space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={pickLocalFile}>
                  💻 Depuis le PC
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowBankPicker(true)}>
                  🗂 Depuis la banque
                </Button>
                {filePath && (
                  <Button variant="secondary" size="sm" onClick={() => setFilePath(null)}>
                    ✕ Retirer
                  </Button>
                )}
              </div>
              {fileName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-surface2 rounded-lg">
                  <span className="text-ok text-xs">✓</span>
                  <span className="text-xs text-text truncate flex-1">{fileName}</span>
                </div>
              )}
              {!filePath && (
                <p className="text-xs text-text2">Aucune vidéo sélectionnée.</p>
              )}
            </div>
          </div>
        </div>

        {!bearer && (
          <div className="px-4 py-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-sm">
            ⚠ Token GéeLark manquant — configure-le dans Paramètres.
          </div>
        )}

        <Button
          onClick={post}
          loading={posting}
          disabled={!bearer || selectedPhones.size === 0 || !filePath}
          size="lg"
        >
          Poster sur {selectedPhones.size || '?'} téléphone{selectedPhones.size !== 1 ? 's' : ''}
        </Button>

        {/* Progress bar */}
        {posting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-text2">
              <span>Publication en cours…</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-surface2 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 max-h-64 overflow-auto font-mono text-xs space-y-1">
              {logs.map((l, i) => (
                <div key={i} className={`flex gap-3 ${
                  l.level === 'ok'    ? 'text-ok'     :
                  l.level === 'error' ? 'text-danger'  :
                  l.level === 'warn'  ? 'text-warn'    : 'text-text2'
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

      {/* Bank picker modal */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="single"
          onSelect={([path]) => { if (path) setFilePath(path); setShowBankPicker(false) }}
          onClose={() => setShowBankPicker(false)}
        />
      )}
    </div>
  )
}
