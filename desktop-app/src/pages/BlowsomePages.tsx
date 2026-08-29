import { useCallback, useEffect, useState } from 'react'
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

// ── Design system Blowsome (mauve/or) ────────────────────────────────────────
const GRAD = 'linear-gradient(100deg,#EC4899,#A855F7,#6366F1)'
const GOLD = '#E9C46A'
const INK = '#ECE9F5'
const MUTED = '#A79FBD'
const SERIF = "'Space Grotesk',sans-serif"

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
    <button onClick={onClick} style={{
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
    await replaySequence(irt.key, [...runSel], runSeq.steps, { videoUrl, videoName, caption: runCaption }, {
      onStep: (i, t) => push(`· étape ${i + 1}/${t}`), log: push,
    })
    push('✔ Terminé.')
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
  const [count, setCount] = useState<number | null>(null)
  const [note, setNote] = useState(false)
  const load = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { count: c } = await scope(supabase.from('content_bank').select('id', { count: 'exact', head: true }))
    setCount(c ?? 0)
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])
  const shortcuts = [
    { t: 'Ouvrir le Studio', d: 'Remix, spoof, sous-titres, mixer — génère des variantes uniques.', go: 'blowTools' },
    { t: 'Voir la banque', d: 'Tout ton contenu VIP, prêt à publier.', go: 'bank' },
    { t: 'Publier maintenant', d: 'Envoie une vidéo sur tes comptes en un parcours guidé.', go: 'publish' },
  ]
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Head title="Auto-contenu" sub="Génère des vidéos + légendes prêtes à poster, en pilote automatique." right={<BlowBtn label="Générer" onClick={() => setNote(true)} />} />
      {note && <Card style={{ padding: '12px 16px', marginBottom: 12 }}><span style={{ fontSize: 12, color: GOLD, lineHeight: 1.5 }}>Le moteur de génération auto Blowsome (variantes + captions en pilote) arrive très bientôt — ta banque ({count ?? 0} médias) est déjà prête à l'alimenter. En attendant, utilise le Studio pour créer tes variantes.</span></Card>}
      <Card style={{ padding: 22, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: INK }}>{count === null ? '…' : count}</span>
          <span style={{ fontSize: 12.5, color: MUTED }}>médias dans ta banque, prêts à alimenter la génération</span>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
        {shortcuts.map(s => (
          <button key={s.t} onClick={() => onNavigate?.(s.go)} style={{ textAlign: 'left', cursor: 'pointer', padding: 20, borderRadius: 16, background: 'linear-gradient(168deg,#17111F,#120C19)', border: '1px solid rgba(216,180,254,0.12)', boxShadow: '0 20px 50px -30px rgba(168,85,247,0.5)', transition: 'border-color .16s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(216,180,254,0.12)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 6 }}>{s.t}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: MUTED }}>{s.d}</div>
          </button>
        ))}
      </div>
    </div>
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
