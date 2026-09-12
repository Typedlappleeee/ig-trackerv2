import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { themeFor } from '@/lib/theme'
import {
  useIremotech, listDevices, fetchUsage, loadSequences, saveSequence, deleteSequence, replaySequence,
  type IrtDevice, type IrtUsage, type IrtSequence, type SeqStep,
} from '@/lib/iremotech'
import LiveDevice from '@/components/LiveDevice'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { useConnections } from '@/lib/connections'
import { getFFmpeg, isFfmpegReady } from '@/lib/ffmpeg'
import { resolveSourceBytes, saveOutputToBank, runAutoVariant, GPS_CITIES, gpsFor, type SpoofIntensity, type CaptionPos, type CaptionStyle } from '@/lib/studioTools'
import { generateCaption } from '@/lib/ai'
import { startRun } from '@/lib/runStore'

// ── Design system Blowsome (mauve/or) ────────────────────────────────────────
const GRAD = 'linear-gradient(100deg,#EC4899,#A855F7,#6366F1)'
const GOLD = '#E9C46A'
const INK = '#ECE9F5'
const MUTED = '#A79FBD'
const SERIF = "'Space Grotesk',sans-serif"
const selStyle: CSSProperties = { height: 32, padding: '0 8px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.18)', color: INK, fontSize: 12.5, outline: 'none', cursor: 'pointer' }
const optStyle: CSSProperties = { background: '#17111F' }

// Durée d'une vidéo (secondes) depuis ses octets — via un <video> caché (rapide, natif).
function videoDurationFromBytes(bytes: Uint8Array): Promise<number> {
  return new Promise(resolve => {
    try {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' }))
      const v = document.createElement('video')
      v.preload = 'metadata'; v.muted = true
      const done = (d: number) => { try { URL.revokeObjectURL(url) } catch { /* noop */ } resolve(d) }
      v.onloadedmetadata = () => done(isFinite(v.duration) ? v.duration : 0)
      v.onerror = () => done(0)
      setTimeout(() => done(isFinite(v.duration) ? v.duration : 0), 8000)
      v.src = url
    } catch { resolve(0) }
  })
}
const numInp: CSSProperties = { width: 62, height: 30, padding: '0 8px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.18)', color: INK, fontSize: 12.5, outline: 'none', textAlign: 'right' }

// ── Composants d'options réutilisables (Auto-contenu) ────────────────────────
function Grp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 14, border: '1px solid rgba(216,180,254,0.1)', background: 'rgba(255,255,255,0.015)', padding: 15, marginTop: 12 }}>
      <p style={{ margin: '0 0 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: '#C9A9F0' }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}
function Sw({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  return (
    <div onClick={() => !disabled && onChange(!on)} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 38, height: 22, padding: 2, borderRadius: 99, background: on ? GRAD : 'rgba(255,255,255,0.12)', transition: 'background .15s ease' }}>
        <span style={{ width: 18, height: 18, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.45)' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
    </div>
  )
}
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 9, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(216,180,254,0.14)' }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{ height: 26, padding: '0 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: value === o.v ? GRAD : 'transparent', color: value === o.v ? '#fff' : MUTED }}>{o.label}</button>
      ))}
    </span>
  )
}
function Fld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: MUTED, minWidth: 96 }}>{label}</span>
      {children}
    </div>
  )
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ borderRadius: 16, background: 'linear-gradient(168deg,#17111F,#120C19)', border: '1px solid rgba(216,180,254,0.12)', boxShadow: '0 20px 50px -30px rgba(168,85,247,0.5)', ...style }}>{children}</div>
}
function Head({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 7, background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.4)', color: '#D8B4FE', fontSize: 10, fontWeight: 800, marginBottom: 10 }}>✦ Blowsome VIP</span>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: INK }}>{title}</h1>
        {sub && <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.55, color: MUTED, maxWidth: 560 }}>{sub}</p>}
      </div>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  )
}
function BlowBtn({ label, onClick, ghost }: { label: string; onClick?: () => void; ghost?: boolean }) {
  return (
    <button onClick={onClick} className={ghost ? 'blow-tap' : 'blow-cta'} style={{
      height: 38, padding: '0 18px', borderRadius: 11, cursor: 'pointer', fontSize: 13, fontWeight: 700,
      background: ghost ? 'rgba(255,255,255,0.03)' : GRAD, color: ghost ? '#D8B4FE' : '#fff',
      border: ghost ? '1px solid rgba(216,180,254,0.2)' : 'none', boxShadow: ghost ? 'none' : '0 12px 30px -12px rgba(168,85,247,0.8)',
    }}>{label}</button>
  )
}
function ConnectIrt({ title }: { title: string }) {
  return (
    <Card style={{ padding: 34, textAlign: 'center' }}>
      <div style={{ fontSize: 34 }}>📱</div>
      <div style={{ marginTop: 14, fontSize: 15, fontWeight: 700, color: INK }}>{title}</div>
      <p style={{ margin: '8px auto 0', maxWidth: 460, fontSize: 12.5, lineHeight: 1.6, color: MUTED }}>
        Le Parc VIP pilote tes vrais iPhones via iRemoTech. Renseigne ta clé API iRemoTech dans <code>iremotech_config</code> (app_config/org_config) et le parc apparaîtra ici — comme la connexion Meta, c'est prêt côté app.
      </p>
    </Card>
  )
}

// ── Parc VIP / Phone Farm (iRemoTech) ─────────────────────────────────────────
const BLOW_THEME = themeFor('blowsome')

export function BlowParc({ user, org }: { user: User; org: OrgState }) {
  const { currentOrg } = org
  const irt = useIremotech(user, org)
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [usage, setUsage] = useState<IrtUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [live, setLive] = useState<IrtDevice | null>(null)
  const [sequences, setSequences] = useState<IrtSequence[]>([])

  // Sauvegarde d'une séquence enregistrée en direct.
  const [pendingSteps, setPendingSteps] = useState<SeqStep[] | null>(null)
  const [seqName, setSeqName] = useState('')

  // Lancement d'un posting (rejeu de séquence sur le parc).
  const [runSeq, setRunSeq] = useState<IrtSequence | null>(null)
  const [runSel, setRunSel] = useState<Set<string>>(new Set())
  const [runVid, setRunVid] = useState<{ id: string; title: string; storage_path: string | null; file_url: string | null } | null>(null)
  const [runCaption, setRunCaption] = useState('')
  const [picker, setPicker] = useState(false)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const loadSeq = useCallback(async () => { setSequences(await loadSequences(currentOrg?.id ?? null, user.id)) }, [currentOrg?.id, user.id])

  useEffect(() => {
    if (!irt.key) return
    setLoading(true); setErr(null)
    Promise.all([listDevices(irt.key), fetchUsage(irt.key)])
      .then(([d, u]) => { setDevices(d); setUsage(u) })
      .catch(e => setErr(e instanceof Error ? e.message : 'Connexion iRemoTech échouée'))
      .finally(() => setLoading(false))
    loadSeq()
  }, [irt.key, loadSeq])

  const budget = usage?.actions ?? { remaining: usage?.remaining, budget: usage?.budget }
  const toggleRun = (id: string) => setRunSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function saveRecorded() {
    if (!pendingSteps || !seqName.trim()) return
    await saveSequence(currentOrg?.id ?? null, user.id, seqName.trim(), pendingSteps)
    setPendingSteps(null); setSeqName(''); loadSeq()
  }

  async function applyPicker(r: PickerResult) {
    if (r.kind !== 'videos' || r.ids.length === 0) return
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', [r.ids[0]])
    const v = (data ?? [])[0]
    if (v) setRunVid(v)
  }

  async function launchRun() {
    if (!irt.key || !runSeq || runSel.size === 0 || running) return
    setRunning(true); setLogs([])
    const push = (m: string) => setLogs(l => [...l.slice(-200), m])
    let videoUrl: string | undefined, videoName: string | undefined
    if (runVid) {
      videoName = runVid.title + '.mp4'
      if (runVid.storage_path) { const { data } = await supabase.storage.from('content').createSignedUrl(runVid.storage_path, 3600); videoUrl = data?.signedUrl ?? undefined }
      else videoUrl = runVid.file_url ?? undefined
    }
    push(`▶ « ${runSeq.name} » sur ${runSel.size} iPhone(s)…`)
    const R = startRun('farm', `${runSeq.name} · ${runSel.size} iPhone(s)`, runSeq.steps.length)
    await replaySequence(irt.key, [...runSel], runSeq.steps, { videoUrl, videoName, caption: runCaption }, {
      onStep: (i, t) => { R.tick(true); push(`· étape ${i + 1}/${t}`) }, log: push, shouldStop: () => R.isCancelled(),
    })
    R.finish()
    push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Terminé.')
    setRunning(false)
  }

  const btn: CSSProperties = { height: 32, padding: '0 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(216,180,254,0.14)', color: INK }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Head title="Phone Farm" sub="Tes vrais iPhones pilotés à distance. Clique un appareil pour le contrôler en direct, enregistre une séquence, puis publie sur tout le parc."
        right={budget?.budget != null ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: GOLD }}>{budget.remaining ?? '—'} / {budget.budget ?? '—'} actions</span> : undefined} />

      {irt.loading ? <Card style={{ padding: 34, textAlign: 'center', color: MUTED, fontSize: 13 }}>Chargement…</Card>
        : !irt.key ? <ConnectIrt title="iRemoTech pas encore branché" />
        : err ? <Card style={{ padding: 30, textAlign: 'center', color: '#F87171', fontSize: 13 }}>{err}</Card>
        : loading ? <Card style={{ padding: 34, textAlign: 'center', color: MUTED, fontSize: 13 }}>Connexion à iRemoTech…</Card>
        : devices.length === 0 ? <Card style={{ padding: 34, textAlign: 'center', color: MUTED, fontSize: 13 }}>Aucun iPhone renvoyé par ton compte iRemoTech.</Card>
        : (
          <>
            {/* Posting : rejeu de séquence sur le parc */}
            <Card style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 10 }}>Publier sur le parc</div>
              {sequences.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.55 }}>Aucune séquence enregistrée. Ouvre un iPhone ci-dessous, clique <b style={{ color: GOLD }}>● Rec</b>, fais une publication à la main une fois, puis enregistre-la — tu pourras la rejouer sur tout le parc.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {sequences.map(s => (
                      <button key={s.id} onClick={() => setRunSeq(s)} style={{ ...btn, background: runSeq?.id === s.id ? GOLD : 'rgba(255,255,255,0.04)', color: runSeq?.id === s.id ? '#1a1206' : INK, border: 'none' }}>{s.name} · {s.steps.length}</button>
                    ))}
                    {runSeq?.id && <button style={{ ...btn, color: '#F87171' }} onClick={() => { deleteSequence(runSeq.id!); setRunSeq(null); loadSeq() }}>Supprimer</button>}
                  </div>
                  {runSeq && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(216,180,254,0.12)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button style={btn} onClick={() => setPicker(true)}>{runVid ? `Vidéo : ${runVid.title}` : 'Choisir une vidéo'}</button>
                        <span style={{ fontSize: 11, color: MUTED }}>{runSel.size} iPhone(s) coché(s)</span>
                        <button style={{ ...btn, marginLeft: 'auto', background: GOLD, color: '#1a1206', border: 'none', opacity: runSel.size && !running ? 1 : 0.5 }} disabled={!runSel.size || running} onClick={launchRun}>{running ? 'Envoi…' : 'Lancer la publication'}</button>
                      </div>
                      <input value={runCaption} onChange={e => setRunCaption(e.target.value)} placeholder="Légende (remplace l'étape marquée « comme légende »)"
                        style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 11px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK, fontSize: 12, outline: 'none' }} />
                      {logs.length > 0 && <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(216,180,254,0.1)', maxHeight: 150, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.6, color: MUTED, whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</div>}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Grille des appareils */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
              {devices.map(d => {
                const on = (d.status ?? '').toLowerCase().includes('on') || d.status === 'reachable'
                const checked = runSel.has(d.public_id)
                return (
                  <Card key={d.public_id} style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#D8B4FE', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}>📱
                        <span style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 99, background: on ? '#34D399' : '#EF4444', boxShadow: '0 0 0 2px #17111F' }} /></span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name ?? d.public_id}</div>
                        <div style={{ fontSize: 11, color: MUTED }}>{d.model ?? 'iPhone'}</div>
                      </span>
                      {runSeq && <span onClick={() => toggleRun(d.public_id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, cursor: 'pointer', flexShrink: 0, background: checked ? GOLD : 'transparent', border: checked ? 'none' : '1px solid rgba(216,180,254,0.3)', color: '#1a1206', fontSize: 11, fontWeight: 900 }}>{checked ? '✓' : ''}</span>}
                    </div>
                    <button onClick={() => setLive(d)} style={{ ...btn, width: '100%', marginTop: 12, background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.3)', color: '#D8B4FE' }}>Contrôler en direct</button>
                  </Card>
                )
              })}
            </div>
          </>
        )}

      {live && irt.key && (
        <LiveDevice apiKey={irt.key} device={live} onClose={() => setLive(null)}
          onSaveSequence={(steps) => { setLive(null); setPendingSteps(steps) }} />
      )}

      {pendingSteps && createPortal(
        <div onClick={() => setPendingSteps(null)} style={{ position: 'fixed', inset: 0, zIndex: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,3,8,0.78)', backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 380, maxWidth: '92vw', padding: 20, borderRadius: 16, background: 'linear-gradient(168deg,#17111F,#120C19)', border: '1px solid rgba(216,180,254,0.14)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 4 }}>Enregistrer la séquence</div>
            <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED }}>{pendingSteps.length} étapes capturées.</p>
            <input value={seqName} onChange={e => setSeqName(e.target.value)} placeholder="Nom (ex. Publier Reel Insta)" autoFocus
              style={{ width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK, fontSize: 12.5, outline: 'none', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btn} onClick={() => setPendingSteps(null)}>Annuler</button>
              <button style={{ ...btn, background: GOLD, color: '#1a1206', border: 'none' }} onClick={saveRecorded}>Enregistrer</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {picker && (
        <BankPicker theme={BLOW_THEME} user={user} org={org} kind="videos" multi={false}
          title="Choisir une vidéo" onClose={() => setPicker(false)} onApply={applyPicker} />
      )}
    </div>
  )
}

// ── Contenu auto ──────────────────────────────────────────────────────────────
export function BlowContent({ user, org, onNavigate }: { user: User; org: OrgState; onNavigate?: (p: string) => void }) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const [count, setCount] = useState<number | null>(null)
  const [folders, setFolders] = useState<string[]>([])
  const load = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { count: c } = await scope(supabase.from('content_bank').select('id', { count: 'exact', head: true }))
    setCount(c ?? 0)
    const { data: fd } = await scope(supabase.from('content_bank').select('folder'))
    setFolders([...new Set(((fd ?? []) as { folder: string | null }[]).map(r => r.folder).filter((f): f is string => !!f))].sort())
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])

  // ── Générateur auto : sources banque → N variantes uniques (spoof) + légende IA ──
  const [picker, setPicker] = useState(false)
  const [sources, setSources] = useState<{ id: string; title: string; storage_path: string | null; file_url: string | null }[]>([])
  const [variants, setVariants] = useState(3)
  // Anti-détection : intensité du spoof + localisation GPS (métadonnées mp4).
  const [intensity, setIntensity] = useState<SpoofIntensity>('normal')
  const [gpsCity, setGpsCity] = useState('none')
  // Légendes : pool (une par ligne) distribué seq/aléatoire, format + placement.
  const [burnCap, setBurnCap] = useState(false)  // incruster une légende ?
  const [capPool, setCapPool] = useState('')     // pool de légendes (1 par ligne)
  const [capMode, setCapMode] = useState<'seq' | 'random'>('random')
  const [capStyle, setCapStyle] = useState<CaptionStyle>('snapchat')
  const [withCap, setWithCap] = useState(false)  // compléter le pool par une légende IA
  const [capManual, setCapManual] = useState(false)
  const [capPos, setCapPos] = useState<'top' | 'center' | 'bottom'>('bottom')
  const [capX, setCapX] = useState(50)
  const [capY, setCapY] = useState(60)
  // Timing : coupe (début/fin) et/ou micro-vitesse aléatoire (0,98–1,02×).
  const [useTrim, setUseTrim] = useState(false)
  const [trimRandom, setTrimRandom] = useState(true)         // coupe aléatoire (par vidéo)
  const [trimRandMin, setTrimRandMin] = useState('0.1')      // début : min
  const [trimRandMax, setTrimRandMax] = useState('1.5')      // début : max
  const [trimEndMin, setTrimEndMin] = useState('0.1')        // fin : min
  const [trimEndMax, setTrimEndMax] = useState('0.3')        // fin : max
  const [trimStart, setTrimStart] = useState('0')
  const [trimEnd, setTrimEnd] = useState('')
  const [showCapPicker, setShowCapPicker] = useState(false)  // picker captions (banque)
  const [uploading, setUploading] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [useSpeed, setUseSpeed] = useState(false)
  const [speedMin, setSpeedMin] = useState('0.98')
  const [speedMax, setSpeedMax] = useState('1.02')
  // Dossier de destination des sorties (banque).
  const [destFolder, setDestFolder] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [made, setMade] = useState(0)
  const push = (m: string) => setLogs(l => [...l.slice(-160), m])

  async function applyPicker(r: PickerResult) {
    if (r.kind !== 'videos' || r.ids.length === 0) return
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', r.ids)
    setSources((data ?? []) as any[])
  }

  // Import « Mon PC » : upload vers le bucket content + content_bank, puis ajout aux sources.
  async function importFromPC(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith('video')); if (list.length === 0) return
    const scopeFolder = currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`
    const added: { id: string; title: string; storage_path: string | null; file_url: string | null }[] = []
    let done = 0
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        const ext = (file.name.split('.').pop() ?? 'mp4').toLowerCase()
        const id = crypto.randomUUID()
        const storagePath = `videos/${scopeFolder}/${id}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
        if (up.error) continue
        const title = file.name.replace(/\.[a-z0-9]+$/i, '')
        const ins = await supabase.from('content_bank').insert({ user_id: user.id, org_id: currentOrg?.id ?? null, title, storage_path: storagePath, file_url: null, folder: destFolder || null, tags: [], notes: null, used_count: 0 }).select('id').single()
        added.push({ id: (ins.data as any)?.id ?? id, title, storage_path: storagePath, file_url: null })
      } catch { /* ignore */ }
    }
    setUploading(null)
    if (added.length) setSources(prev => [...prev, ...added])
    load()
  }

  async function generate() {
    if (running || sources.length === 0) return
    setRunning(true); setLogs([]); setMade(0); setProgress(0)
    const per = Math.max(1, Math.min(12, variants))
    const R = startRun('auto', `${sources.length} vidéo${sources.length > 1 ? 's' : ''} × ${per}`, sources.length * per)
    // Pool de légendes (une par ligne, vides ignorées).
    const pool = capPool.split('\n').map(s => s.trim()).filter(Boolean)
    const sMin = Math.max(0.5, Number(speedMin) || 0.98)
    const sMax = Math.min(2, Number(speedMax) || 1.02)
    const tStart = Number(trimStart) || 0
    const tEnd = trimEnd.trim() ? Number(trimEnd) : null
    try {
      if (!isFfmpegReady()) { push('⏳ Chargement du moteur (~30 Mo, une fois)…'); await getFFmpeg(); push('✅ Moteur prêt.') }
      // Plages de coupe aléatoire (début / fin), tirées par vidéo.
      const rand = (lo: number, hi: number) => lo + Math.random() * Math.max(0, hi - lo)
      const sLo = Math.max(0, Number(trimRandMin) || 0.1), sHi = Math.max(sLo, Number(trimRandMax) || 1.5)
      const eLo = Math.max(0, Number(trimEndMin) || 0.1), eHi = Math.max(eLo, Number(trimEndMax) || 0.3)
      let done = 0
      for (const v of sources) {
        if (R.isCancelled()) { push('⏹ Annulé.'); break }
        push(`— ${v.title} —`)
        const bytes = await resolveSourceBytes(v)
        // Durée réelle (pour la coupe de fin aléatoire) — lue une fois par vidéo.
        const dur = (useTrim && trimRandom) ? await videoDurationFromBytes(bytes) : 0
        // Légende IA : complète le pool si activé (une seule génération / vidéo).
        let aiCap: string | null = null
        if (burnCap && withCap && conns.groq) { aiCap = await generateCaption(conns.groq, v.title); if (aiCap) push('  ✍ légende IA générée') }
        for (let i = 0; i < per; i++) {
          if (R.isCancelled()) break
          setProgress(0)
          push(`  · variante ${i + 1}/${per}…`)
          const hooks = { onProgress: setProgress, onLog: () => {} }
          // Choix de la légende : pool (seq/aléatoire) sinon IA.
          let capText: string | null = null
          if (burnCap) {
            if (pool.length) capText = capMode === 'random' ? pool[Math.floor(Math.random() * pool.length)] : pool[i % pool.length]
            else if (aiCap) capText = aiCap
          }
          const pos: CaptionPos = capManual ? { x: capX, y: capY } : capPos
          const speed = useSpeed ? sMin + Math.random() * Math.max(0, sMax - sMin) : null
          // Coupe : aléatoire (début + fin, unique par variante) OU fixe (début/fin).
          let vStart: number | null = null, vEnd: number | null = null
          if (useTrim) {
            if (trimRandom) {
              vStart = +rand(sLo, sHi).toFixed(2)
              const end = dur > 0 ? dur - rand(eLo, eHi) : 0
              vEnd = end > vStart + 0.3 ? +end.toFixed(2) : null
            } else { vStart = tStart; vEnd = tEnd }
          }
          const out = await runAutoVariant(bytes, {
            seed: Math.random() * 1000,
            intensity, gps: gpsFor(gpsCity),
            trimStart: vStart,
            trimEnd: vEnd,
            speed,
            caption: capText ? { text: capText, pos, style: capStyle } : null,
          }, hooks)
          await saveOutputToBank(user.id, currentOrg?.id ?? null, out, `${v.title} · auto ${i + 1}`, 'mp4', destFolder || null)
          done++; setMade(done); R.tick(true)
        }
      }
      push(R.isCancelled() ? '⏹ Arrêté.' : `✔ ${done} variantes générées — dans la banque.`)
      R.finish()
      load()
    } catch (e) { push(`❌ ${e instanceof Error ? e.message : 'Échec'}`); R.finish('error') }
    setRunning(false); setProgress(0)
  }

  const shortcuts = [
    { t: 'Ouvrir le Studio', d: 'Contrôle fin : remix, spoof, sous-titres, mixer, incrustation, montage.', go: 'blowTools' },
    { t: 'Voir la banque', d: 'Tout ton contenu VIP, prêt à publier.', go: 'bank' },
    { t: 'Publier maintenant', d: 'Envoie une vidéo sur tes comptes en un parcours guidé.', go: 'publish' },
  ]

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Head title="Auto-contenu" sub="Choisis des vidéos → X variantes uniques : légende (pool + style Snapchat), coupe, micro-vitesse, spoof + GPS."
        right={<BlowBtn label={running ? `Génération… ${Math.round(progress * 100)}%` : 'Générer'} onClick={generate} />} />

      <Card style={{ padding: 18, marginBottom: 12 }}>
        {/* Source */}
        <Grp title="Source">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <BlowBtn ghost label={sources.length ? `${sources.length} vidéo(s)` : 'Choisir dans la banque'} onClick={() => setPicker(true)} />
            <button onClick={() => fileRef.current?.click()} disabled={!!uploading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', borderRadius: 11, cursor: uploading ? 'default' : 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.2)', color: '#D8B4FE', fontSize: 13, fontWeight: 700, opacity: uploading ? 0.6 : 1 }}>⬆ Mon PC</button>
            <input ref={fileRef} type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) importFromPC(e.target.files); e.target.value = '' }} />
            {uploading && <span style={{ fontSize: 11, color: GOLD }}>Envoi : {uploading}</span>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>{made > 0 ? `${made} générées` : `${count ?? '…'} médias`}</span>
          </div>
          <Fld label="Variantes / vidéo"><input type="number" min={1} max={12} value={variants} onChange={e => setVariants(Number(e.target.value))} style={{ ...numInp, width: 70, textAlign: 'center' }} /></Fld>
          <Fld label="Dossier destination"><select value={destFolder} onChange={e => setDestFolder(e.target.value)} style={selStyle}><option value="" style={optStyle}>Racine (aucun)</option>{folders.map(f => <option key={f} value={f} style={optStyle}>{f}</option>)}</select></Fld>
        </Grp>

        {/* Légende */}
        <Grp title="Légende">
          <Sw on={burnCap} onChange={setBurnCap} label="Incruster une légende sur la vidéo" sub="Texte gravé sur chaque variante (style Snapchat ou contour)" />
          {burnCap && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginLeft: 49 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setShowCapPicker(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(216,180,254,0.18)', background: 'rgba(255,255,255,0.03)', color: INK, fontSize: 12, fontWeight: 700 }}>📁 Choisir dans la banque</button>
                {capPool.trim() && <button onClick={() => setCapPool('')} style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(216,180,254,0.18)', background: 'transparent', color: MUTED, fontSize: 12, fontWeight: 700 }}>Vider</button>}
              </div>
              <textarea value={capPool} onChange={e => setCapPool(e.target.value)} rows={3} placeholder={'Une légende par ligne (distribuées entre les variantes)…\nEx : Sérieux là ?'} style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.18)', color: INK, fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
              <Fld label="Format"><Seg value={capStyle} onChange={setCapStyle} options={[{ v: 'snapchat', label: 'Snapchat' }, { v: 'outline', label: 'Contour' }]} /></Fld>
              <Fld label="Distribution"><Seg value={capMode} onChange={setCapMode} options={[{ v: 'seq', label: 'Séquentiel' }, { v: 'random', label: 'Aléatoire' }]} /></Fld>
              <Fld label="Position">
                {!capManual ? <Seg value={capPos} onChange={setCapPos} options={[{ v: 'top', label: 'Haut' }, { v: 'center', label: 'Centre' }, { v: 'bottom', label: 'Bas' }]} />
                  : <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED }}>X <input type="range" min={0} max={100} value={capX} onChange={e => setCapX(Number(e.target.value))} style={{ width: 90, accentColor: '#A855F7' }} /><span style={{ width: 30, color: INK }}>{capX}%</span></label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED }}>Y <input type="range" min={0} max={100} value={capY} onChange={e => setCapY(Number(e.target.value))} style={{ width: 90, accentColor: '#A855F7' }} /><span style={{ width: 30, color: INK }}>{capY}%</span></label>
                  </span>}
              </Fld>
              <Sw on={capManual} onChange={setCapManual} label="Placement manuel" />
              <Sw on={withCap} onChange={setWithCap} disabled={!conns.groq} label={`Compléter par l'IA${conns.groq ? '' : ' (clé Groq requise)'}`} sub="Génère une légende si le pool est vide" />
            </div>
          )}
        </Grp>

        {/* Anti-détection & montage */}
        <Grp title="Anti-détection & montage">
          <Fld label="Anti-détection"><Seg value={intensity} onChange={setIntensity} options={[{ v: 'subtle', label: 'Subtile' }, { v: 'normal', label: 'Normale' }, { v: 'strong', label: 'Forte' }]} /></Fld>
          <Fld label="Localisation GPS"><select value={gpsCity} onChange={e => setGpsCity(e.target.value)} style={selStyle}>{GPS_CITIES.map(c => <option key={c.k} value={c.k} style={optStyle}>{c.label}</option>)}</select></Fld>
          <Sw on={useTrim} onChange={setUseTrim} label="Couper la vidéo" sub="Retire un bout au début ET à la fin (unique par variante)" />
          {useTrim && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 49 }}>
              <Seg value={trimRandom ? 'rand' : 'fixed'} onChange={v => setTrimRandom(v === 'rand')} options={[{ v: 'rand', label: 'Aléatoire' }, { v: 'fixed', label: 'Fixe' }]} />
              {trimRandom ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
                  début <input type="number" min={0} step={0.1} value={trimRandMin} onChange={e => setTrimRandMin(e.target.value)} style={numInp} />→<input type="number" min={0} step={0.1} value={trimRandMax} onChange={e => setTrimRandMax(e.target.value)} style={numInp} />
                  fin <input type="number" min={0} step={0.1} value={trimEndMin} onChange={e => setTrimEndMin(e.target.value)} style={numInp} />→<input type="number" min={0} step={0.1} value={trimEndMax} onChange={e => setTrimEndMax(e.target.value)} style={numInp} /> s
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: MUTED }}>
                  début <input type="number" min={0} step={0.1} value={trimStart} onChange={e => setTrimStart(e.target.value)} style={numInp} /> fin <input type="number" min={0} step={0.1} value={trimEnd} onChange={e => setTrimEnd(e.target.value)} placeholder="—" style={numInp} /> s
                </span>
              )}
            </div>
          )}
          <Sw on={useSpeed} onChange={setUseSpeed} label="Micro-vitesse aléatoire" sub="Vitesse légèrement différente par variante" />
          {useSpeed && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: MUTED, marginLeft: 49 }}>
              <input type="number" min={0.5} max={2} step={0.01} value={speedMin} onChange={e => setSpeedMin(e.target.value)} style={numInp} /> × → <input type="number" min={0.5} max={2} step={0.01} value={speedMax} onChange={e => setSpeedMax(e.target.value)} style={numInp} /> ×
            </span>
          )}
        </Grp>
        {running && <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 14 }}><div className="blow-prog" style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundImage: 'linear-gradient(100deg,#EC4899,#A855F7,#6366F1,#EC4899)', transition: 'width .2s ease' }} /></div>}
        {logs.length > 0 && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(216,180,254,0.1)', maxHeight: 150, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, lineHeight: 1.6, color: MUTED, whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</div>}
      </Card>

      <div className="blow-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
        {shortcuts.map(s => (
          <button key={s.t} className="blow-card blow-tap" onClick={() => onNavigate?.(s.go)} style={{ textAlign: 'left', cursor: 'pointer', padding: 20, borderRadius: 16, background: 'linear-gradient(168deg,#17111F,#120C19)', border: '1px solid rgba(216,180,254,0.12)', boxShadow: '0 20px 50px -30px rgba(168,85,247,0.5)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 6 }}>{s.t}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: MUTED }}>{s.d}</div>
          </button>
        ))}
      </div>

      {picker && (
        <BankPicker theme={BLOW_THEME} user={user} org={org} kind="videos" multi title="Choisir des vidéos à décliner"
          onClose={() => setPicker(false)} onApply={applyPicker} />
      )}

      {showCapPicker && (
        <CaptionBankPicker user={user} org={org}
          onClose={() => setShowCapPicker(false)}
          onSelect={texts => {
            if (texts.length) setCapPool(prev => {
              const cur = prev.split('\n').map(s => s.trim()).filter(Boolean)
              return Array.from(new Set([...cur, ...texts.map(t => t.trim()).filter(Boolean)])).join('\n')
            })
            setShowCapPicker(false)
          }} />
      )}
    </div>
  )
}

// ── Picker de captions (banque caption_bank) — style Blowsome ────────────────────
function CaptionBankPicker({ user, org, onSelect, onClose }: {
  user: User; org: OrgState; onSelect: (texts: string[]) => void; onClose: () => void
}) {
  const { currentOrg } = org
  const [items, setItems] = useState<{ id: string; title: string; content: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    scope(supabase.from('caption_bank').select('id,title,content').order('created_at', { ascending: false }))
      .then(({ data }: any) => { setItems((data ?? []) as any[]); setLoading(false) })
  }, [currentOrg?.id, user.id])
  const filtered = items.filter(it => !search.trim() || (it.title ?? '').toLowerCase().includes(search.toLowerCase()) || (it.content ?? '').toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(6,6,8,0.92)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 80px)', background: '#120C19', border: '1px solid rgba(216,180,254,0.16)', borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(216,180,254,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>Choisir des captions</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: '12px 20px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(216,180,254,0.18)', color: INK, fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {loading ? <p style={{ fontSize: 12.5, color: MUTED }}>Chargement…</p>
            : filtered.length === 0 ? <p style={{ fontSize: 12.5, color: MUTED }}>Aucune caption dans la banque.</p>
            : filtered.map(it => {
              const on = selected.has(it.id)
              return (
                <button key={it.id} onClick={() => toggle(it.id)} style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${on ? 'rgba(168,85,247,0.6)' : 'rgba(216,180,254,0.12)'}`, background: on ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.02)' }}>
                  {it.title && <div style={{ fontSize: 11, fontWeight: 700, color: on ? '#E9D5FF' : MUTED, marginBottom: 2 }}>{it.title}</div>}
                  <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.45 }}>{it.content}</div>
                </button>
              )
            })}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(216,180,254,0.12)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(216,180,254,0.18)', background: 'transparent', color: INK, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Annuler</button>
          <button onClick={() => onSelect(items.filter(it => selected.has(it.id)).map(it => it.content).filter(Boolean))}
            style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: GRAD, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: selected.size ? 1 : 0.5, pointerEvents: selected.size ? 'auto' : 'none' }}>
            Ajouter {selected.size || ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Outils VIP ────────────────────────────────────────────────────────────────
const TOOLS = [
  { t: 'Remix', d: 'Une vidéo → des dizaines de variantes uniques.', tag: '×24' },
  { t: 'Spoof', d: 'Device, GPS, EXIF réécrits. Anti-doublons.', tag: 'stealth' },
  { t: 'Sous-titres', d: 'Transcription IA + incrustation stylée.', tag: 'Whisper' },
  { t: 'Mixer', d: 'Hook incrusté, rendu côté serveur.', tag: 'overlay' },
]
export function BlowTools() {
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Head title="Outils VIP" sub="Tous tes outils vidéo premium, au même endroit — gratuits." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        {TOOLS.map(t => (
          <Card key={t.t} style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{t.t}</span>
              <span style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 6, background: 'rgba(233,196,106,0.14)', border: `1px solid rgba(233,196,106,0.4)`, color: GOLD, fontSize: 10.5, fontWeight: 800 }}>{t.tag}</span>
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.6, color: MUTED }}>{t.d}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
