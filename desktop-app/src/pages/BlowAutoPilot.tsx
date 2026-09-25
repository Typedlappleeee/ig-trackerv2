// ── Pilote Auto (iRemoTech) ──────────────────────────────────────────────────
// Interface propre pour automatiser le posting sur les vrais iPhones iRemoTech :
//   • on choisit des téléphones + leurs containers Crane,
//   • on charge un POOL de vidéos (+ un pool de légendes),
//   • chaque container reçoit une vidéo tirée ALÉATOIREMENT du pool,
//   • exécution par vision (ouverture container → injection → publication du Reel),
//     avec rotation d'IP (mode avion) optionnelle, en série ou en parallèle.
// Conçu pour accueillir d'autres automatisations (Story CTA, Warmup) ensuite.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { useIremotech, listDevices, fetchUsage, uploadMedia, type IrtDevice, type IrtUsage } from '@/lib/iremotech'
import { selectContainerByVision, postReelByVision, airplaneReset } from '@/lib/iremotechVision'
import { loadDevContainers, addDevContainer, removeDevContainer } from '@/lib/irtContainers'
import { startRun, cancelRun } from '@/lib/runStore'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { themeFor } from '@/lib/theme'

const BLOW_THEME = themeFor('blowsome')

const GOLD = '#E9C46A', INK = '#ECE9F5', MUTED = '#A79FBD', DIM = '#6b6478', SERIF = "'Space Grotesk',sans-serif"
type VidRef = { id: string; title: string; storage_path: string | null; file_url: string | null }

const card: CSSProperties = { background: 'linear-gradient(168deg,rgba(24,20,44,0.5),rgba(12,10,22,0.6))', border: '1px solid rgba(216,180,254,0.12)', borderRadius: 16, padding: 18, marginBottom: 14 }
const btn: CSSProperties = { height: 34, padding: '0 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(216,180,254,0.16)', color: INK }
const gold: CSSProperties = { ...btn, background: GOLD, color: '#1a1206', border: 'none', fontWeight: 800 }
const inp: CSSProperties = { height: 34, padding: '0 11px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }

function H({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 7, background: 'rgba(233,196,106,0.12)', border: '1px solid rgba(233,196,106,0.35)', color: GOLD, fontSize: 10, fontWeight: 800, marginBottom: 9 }}>✦ iRemoTech · Pilote Auto</div>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: INK }}>{title}</h1>
        {sub && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55, maxWidth: 720 }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}
function Toggle({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', padding: '10px 12px', borderRadius: 11, background: on ? 'rgba(233,196,106,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(233,196,106,0.28)' : 'rgba(216,180,254,0.12)'}` }}>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 38, height: 22, padding: 2, borderRadius: 99, background: on ? GOLD : 'rgba(255,255,255,0.12)', transition: 'background .15s' }}>
        <span style={{ width: 18, height: 18, borderRadius: 99, background: '#fff' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: DIM, marginTop: 1 }}>{sub}</span>}
      </span>
    </div>
  )
}

export function BlowAutoPilot({ user, org }: { user: User; org: OrgState }) {
  const { currentOrg } = org
  const irt = useIremotech(user, org)
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [usage, setUsage] = useState<IrtUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [sel, setSel] = useState<Set<string>>(new Set())            // téléphones sélectionnés
  const [conts, setConts] = useState<Record<string, string[]>>({})   // containers connus par téléphone
  const [selConts, setSelConts] = useState<Record<string, Set<string>>>({}) // containers cochés par téléphone
  const [newC, setNewC] = useState<Record<string, string>>({})       // saisie « ajouter container »

  const [videoPool, setVideoPool] = useState<VidRef[]>([])
  const [captionPool, setCaptionPool] = useState('')
  const [picker, setPicker] = useState(false)

  const [airplaneOn, setAirplaneOn] = useState(true)
  const [uniqueUse, setUniqueUse] = useState(false)
  const [parallel, setParallel] = useState(false)

  const [running, setRunning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const load = useCallback(() => {
    if (!irt.key) return
    setLoading(true); setErr(null)
    Promise.all([listDevices(irt.key), fetchUsage(irt.key)])
      .then(([d, u]) => {
        setDevices(d); setUsage(u)
        const c: Record<string, string[]> = {}
        for (const dev of d) c[dev.public_id] = loadDevContainers(dev.public_id)
        setConts(c)
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Connexion iRemoTech échouée'))
      .finally(() => setLoading(false))
  }, [irt.key])
  useEffect(() => { load() }, [load])

  const budget = usage?.actions ?? { remaining: usage?.remaining, budget: usage?.budget }

  const togglePhone = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else { n.add(id); setSelConts(sc => sc[id] ? sc : { ...sc, [id]: new Set() }) } return n })
  const toggleCont = (dev: string, name: string) => setSelConts(sc => { const cur = new Set(sc[dev] ?? []); if (cur.has(name)) cur.delete(name); else cur.add(name); return { ...sc, [dev]: cur } })
  const addC = (dev: string) => {
    const name = (newC[dev] ?? '').trim(); if (!name) return
    const list = addDevContainer(dev, name)
    setConts(c => ({ ...c, [dev]: list }))
    setSelConts(sc => ({ ...sc, [dev]: new Set([...(sc[dev] ?? []), name]) }))
    setNewC(v => ({ ...v, [dev]: '' }))
  }
  const removeC = (dev: string, name: string) => {
    const list = removeDevContainer(dev, name)
    setConts(c => ({ ...c, [dev]: list }))
    setSelConts(sc => { const cur = new Set(sc[dev] ?? []); cur.delete(name); return { ...sc, [dev]: cur } })
  }

  async function applyPicker(r: PickerResult) {
    setPicker(false)
    if (r.kind !== 'videos' || r.ids.length === 0) return
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', r.ids)
    const vids = (data ?? []) as VidRef[]
    setVideoPool(p => { const ex = new Set(p.map(v => v.id)); return [...p, ...vids.filter(v => !ex.has(v.id))] })
  }
  async function signedUrlFor(v: VidRef): Promise<string | undefined> {
    if (v.storage_path) { const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600); return data?.signedUrl ?? undefined }
    return v.file_url ?? undefined
  }

  // Total de containers cochés (= nb de publications).
  const totalJobs = [...sel].reduce((n, d) => n + (selConts[d]?.size ?? 0), 0)
  const captions = captionPool.split('\n').map(s => s.trim()).filter(Boolean)

  async function run() {
    if (!irt.key || running) return
    if (totalJobs === 0) { setLogs(['⚠ Sélectionne au moins un container.']); return }
    if (videoPool.length === 0) { setLogs(['⚠ Ajoute au moins une vidéo au pool.']); return }
    setRunning(true); setLogs([])
    const key = irt.key
    const push = (m: string) => setLogs(l => [...l.slice(-600), m])
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // Tirage aléatoire (avec ou sans doublon selon « usage unique »).
    const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }
    let vidQueue = uniqueUse ? shuffle(videoPool) : []
    let capQueue = uniqueUse ? shuffle(captions) : []
    const pickVid = (): VidRef => { if (uniqueUse) { if (!vidQueue.length) vidQueue = shuffle(videoPool); return vidQueue.pop()! } return videoPool[Math.floor(Math.random() * videoPool.length)] }
    const pickCap = (): string => { if (!captions.length) return ''; if (uniqueUse) { if (!capQueue.length) capQueue = shuffle(captions); return capQueue.pop()! } return captions[Math.floor(Math.random() * captions.length)] }

    // Construit les jobs par téléphone (une vidéo aléatoire par container).
    const byPhone = [...sel].map(dev => ({
      dev,
      name: devices.find(d => d.public_id === dev)?.name ?? dev,
      jobs: [...(selConts[dev] ?? [])].map(container => ({ container, vid: pickVid(), caption: pickCap() })),
    })).filter(p => p.jobs.length)

    push(`▶ Pilote Auto : ${byPhone.length} iPhone(s) · ${totalJobs} publication(s) · pool ${videoPool.length} vidéo(s)${airplaneOn ? ' · rotation avion' : ''}${parallel ? ' · parallèle' : ' · série'}`)
    const R = startRun('farm', `Pilote Auto · ${byPhone.length} tel × ${totalJobs}`, totalJobs)
    setRunId(R.id)

    const runPhone = async (p: typeof byPhone[number]) => {
      const tag = `[${p.name}]`
      for (const job of p.jobs) {
        if (R.isCancelled()) break
        push(`\n${tag} 📦 container « ${job.container} » · ${job.vid.title}`)
        if (airplaneOn) await airplaneReset(key, p.dev, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
        const ok = await selectContainerByVision(key, p.dev, job.container, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
        if (!ok) { push(`${tag} ⏭ container « ${job.container} » non atteint → suivant`); R.tick(false); continue }
        await sleep(1200)
        const url = await signedUrlFor(job.vid)
        if (!url) { push(`${tag} ❌ URL vidéo introuvable → suivant`); R.tick(false); continue }
        push(`${tag} ⬆ injection de la vidéo…`)
        await uploadMedia(key, p.dev, url, (job.vid.title || 'video') + '.mp4')
        push(`${tag} ⏳ 10 s (indexation)…`)
        await sleep(10000)
        const posted = await postReelByVision(key, p.dev, { caption: job.caption }, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
        push(posted ? `${tag} ✅ « ${job.container} » publié` : `${tag} ⚠ « ${job.container} » interrompu`)
        R.tick(posted)
      }
    }

    if (parallel) await Promise.all(byPhone.map(runPhone))
    else for (const p of byPhone) { if (R.isCancelled()) break; await runPhone(p) }

    R.finish()
    push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Terminé — toutes les publications traitées.')
    setRunning(false); setRunId(null)
  }

  if (!irt.key) {
    return (
      <div>
        <H title="Pilote Auto" />
        {irt.loading
          ? <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>Chargement…</div>
          : <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>iRemoTech pas encore branché. Colle ta clé API dans <b style={{ color: GOLD }}>Phone Farm → ⚙</b>.</div>}
      </div>
    )
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <H title="Pilote Auto" sub="Choisis tes iPhones et leurs containers, charge un pool de vidéos : chaque container reçoit une vidéo tirée au hasard et publie un Reel (vision), avec rotation d'IP optionnelle."
        right={budget?.budget != null ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: GOLD }}>{budget.remaining ?? '—'} / {budget.budget ?? '—'} actions</span> : undefined} />

      {err && <div style={{ ...card, color: '#F87171', fontSize: 13, textAlign: 'center' }}>{err}</div>}
      {loading && <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center' }}>Connexion à iRemoTech…</div>}

      {/* 1 · Téléphones & containers */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 3 }}>1 · Téléphones & containers</div>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED }}>Coche les iPhones, puis les containers à publier sur chacun ({totalJobs} sélectionné{totalJobs > 1 ? 's' : ''}).</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {devices.map(d => {
            const on = sel.has(d.public_id)
            const list = conts[d.public_id] ?? []
            const picked = selConts[d.public_id] ?? new Set()
            return (
              <div key={d.public_id} style={{ padding: 12, borderRadius: 12, background: on ? 'rgba(233,196,106,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(233,196,106,0.28)' : 'rgba(216,180,254,0.12)'}` }}>
                <div onClick={() => togglePhone(d.public_id)} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, flexShrink: 0, background: on ? GOLD : 'transparent', border: on ? 'none' : '1px solid rgba(216,180,254,0.3)', color: '#1a1206', fontSize: 12, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name ?? d.public_id}</div>
                    <div style={{ fontSize: 10.5, color: DIM }}>{d.model ?? 'iPhone'} · {list.length} container(s)</div>
                  </span>
                </div>
                {on && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {list.map(c => {
                        const cp = picked.has(c)
                        return (
                          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: cp ? GOLD : 'rgba(255,255,255,0.04)', color: cp ? '#1a1206' : MUTED, border: cp ? 'none' : '1px solid rgba(216,180,254,0.14)' }}>
                            <span onClick={() => toggleCont(d.public_id, c)}>{c}</span>
                            <span onClick={() => removeC(d.public_id, c)} title="Retirer" style={{ opacity: 0.6, fontWeight: 900 }}>×</span>
                          </span>
                        )
                      })}
                      {list.length === 0 && <span style={{ fontSize: 11, color: DIM }}>Aucun container — ajoute-les ↓</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={newC[d.public_id] ?? ''} onChange={e => setNewC(v => ({ ...v, [d.public_id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addC(d.public_id) }} placeholder="Nom du container (ex. 6)" style={{ ...inp, flex: 1, height: 30, fontSize: 11.5 }} />
                      <button style={{ ...btn, height: 30 }} onClick={() => addC(d.public_id)}>+</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ ...btn, height: 26, fontSize: 11, padding: '0 9px' }} onClick={() => setSelConts(sc => ({ ...sc, [d.public_id]: new Set(list) }))}>Tout</button>
                      <button style={{ ...btn, height: 26, fontSize: 11, padding: '0 9px' }} onClick={() => setSelConts(sc => ({ ...sc, [d.public_id]: new Set() }))}>Aucun</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 2 · Pool de contenu */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 3 }}>2 · Pool de vidéos & légendes</div>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED }}>Chaque container reçoit une vidéo tirée <b>au hasard</b> de ce pool.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <button style={gold} onClick={() => setPicker(true)}>+ Ajouter des vidéos</button>
          <span style={{ fontSize: 12, color: MUTED }}>{videoPool.length} vidéo(s) dans le pool</span>
          {videoPool.length > 0 && <button style={btn} onClick={() => setVideoPool([])}>Vider</button>}
        </div>
        {videoPool.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {videoPool.map(v => (
              <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, fontSize: 11.5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK }}>
                🎞 {v.title.slice(0, 26)}
                <span onClick={() => setVideoPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 900 }}>×</span>
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '0 0 6px' }}>Légendes (une par ligne, tirées au hasard)</div>
        <textarea value={captionPool} onChange={e => setCaptionPool(e.target.value)} rows={3} placeholder={'Ma légende 1\nMa légende 2\n…'} style={{ ...inp, width: '100%', height: 'auto', minHeight: 60, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
      </div>

      {/* 3 · Options */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 12 }}>3 · Options</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          <Toggle on={airplaneOn} onClick={() => setAirplaneOn(v => !v)} label="Rotation d'IP (mode avion)" sub="Cycle avion entre chaque container" />
          <Toggle on={uniqueUse} onClick={() => setUniqueUse(v => !v)} label="Usage unique" sub="Pas de doublon tant que le pool n'est pas épuisé" />
          <Toggle on={parallel} onClick={() => setParallel(v => !v)} label="Téléphones en parallèle" sub="Plus rapide (lecture d'écran sérialisée)" />
        </div>
      </div>

      {/* 4 · Lancer */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: MUTED }}>{totalJobs} publication(s) · {videoPool.length} vidéo(s) · {captions.length} légende(s)</span>
          {running && runId && <button style={{ ...btn, marginLeft: 'auto', color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => cancelRun(runId)}>■ Arrêter</button>}
          <button style={{ ...gold, height: 44, padding: '0 22px', marginLeft: running ? 0 : 'auto', fontSize: 14, opacity: totalJobs && videoPool.length && !running ? 1 : 0.5 }} disabled={!totalJobs || !videoPool.length || running} onClick={run}>
            {running ? 'En cours…' : `Lancer ${totalJobs} publication(s)`}
          </button>
        </div>
        {logs.length > 0 && <div style={{ marginTop: 14, padding: 11, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(216,180,254,0.1)', maxHeight: 300, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.6, color: MUTED, whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</div>}
      </div>

      {picker && (
        <BankPicker theme={BLOW_THEME} user={user} org={org} kind="videos" multi
          title="Ajouter des vidéos au pool" onClose={() => setPicker(false)} onApply={applyPicker} />
      )}
    </div>
  )
}
