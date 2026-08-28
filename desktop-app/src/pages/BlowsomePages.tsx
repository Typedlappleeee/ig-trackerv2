import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { useIremotech, listDevices, fetchUsage, type IrtDevice, type IrtUsage } from '@/lib/iremotech'

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

// ── Parc VIP (iRemoTech) ──────────────────────────────────────────────────────
export function BlowParc({ user, org }: { user: User; org: OrgState }) {
  const irt = useIremotech(user, org)
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [usage, setUsage] = useState<IrtUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!irt.key) return
    setLoading(true); setErr(null)
    Promise.all([listDevices(irt.key), fetchUsage(irt.key)])
      .then(([d, u]) => { setDevices(d); setUsage(u) })
      .catch(e => setErr(e instanceof Error ? e.message : 'Connexion iRemoTech échouée'))
      .finally(() => setLoading(false))
  }, [irt.key])

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Head title="Parc VIP" sub="Tes vrais iPhones pilotés à distance (capture, taps, actions) via iRemoTech."
        right={usage ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: GOLD }}>{usage.remaining ?? '—'} / {usage.budget ?? '—'} actions</span> : undefined} />
      {irt.loading ? <Card style={{ padding: 34, textAlign: 'center', color: MUTED, fontSize: 13 }}>Chargement…</Card>
        : !irt.key ? <ConnectIrt title="iRemoTech pas encore branché" />
        : err ? <Card style={{ padding: 30, textAlign: 'center', color: '#F87171', fontSize: 13 }}>{err}</Card>
        : loading ? <Card style={{ padding: 34, textAlign: 'center', color: MUTED, fontSize: 13 }}>Connexion à iRemoTech…</Card>
        : devices.length === 0 ? <Card style={{ padding: 34, textAlign: 'center', color: MUTED, fontSize: 13 }}>Aucun iPhone renvoyé par ton compte iRemoTech.</Card>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
            {devices.map(d => {
              const on = (d.status ?? '').toLowerCase().includes('on') || d.status === 'reachable'
              return (
                <Card key={d.public_id} style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#D8B4FE', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}>📱
                      <span style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 99, background: on ? '#34D399' : '#EF4444', boxShadow: '0 0 0 2px #17111F' }} /></span>
                    <span style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name ?? d.public_id}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{d.model ?? 'iPhone'}</div>
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
    </div>
  )
}

// ── Contenu auto ──────────────────────────────────────────────────────────────
export function BlowContent({ user, org }: { user: User; org: OrgState }) {
  const { currentOrg } = org
  const [count, setCount] = useState<number | null>(null)
  const load = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { count: c } = await scope(supabase.from('content_bank').select('id', { count: 'exact', head: true }))
    setCount(c ?? 0)
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Head title="Contenu auto" sub="Génère des vidéos + légendes prêtes à poster, en pilote automatique." right={<BlowBtn label="Générer" />} />
      <Card style={{ padding: 22, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: INK }}>{count === null ? '…' : count}</span>
          <span style={{ fontSize: 12.5, color: MUTED }}>médias dans ta banque, prêts à alimenter la génération</span>
        </div>
      </Card>
      <Card style={{ padding: 22 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 6 }}>Pilote automatique</div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: MUTED, maxWidth: 560 }}>Choisis un tag, colle ton style, lance — le moteur produit des variantes + captions. Le câblage du moteur serveur arrive à la prochaine passe.</p>
      </Card>
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
