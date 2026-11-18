// Banque › « Spoofer en copies » : chaque média choisi (photo ou vidéo) est dupliqué en N versions
// uniques par le serveur (/api/v1/tools/spoof : léger recadrage, empreinte, métadonnées d'origine
// effacées, appareil + GPS réécrits). Les copies arrivent dans le même dossier que l'original.
import { useRef, useState } from 'react'
import type { Theme } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { Btn, Modal, FIELD, toast } from '@/lib/ui'
import { SPOOF_DEVICES } from '@/lib/studioTools'
import { GPS_CITIES } from '@/lib/gps'
import { API_ORIGIN } from '@/lib/scaleflowLink'

const PARALLEL = 3
const MAX_COPIES = 20
const DEVICES = SPOOF_DEVICES.filter(d => d.k !== 'none')
const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* bloqué */ } }

/** Une tâche par copie ; appareil tiré au hasard par copie quand « Aléatoire » est choisi. */
export function planSpoofCopies<T>(items: T[], count: number, device: string, rand = Math.random): { item: T; n: number; device: string }[] {
  const c = Math.max(1, Math.min(MAX_COPIES, Math.floor(count) || 1))
  return items.flatMap(item => Array.from({ length: c }, (_, i) => ({ item, n: i + 1, device: device === 'random' ? DEVICES[Math.floor(rand() * DEVICES.length)].k : device })))
}

export default function BankSpoof({ theme, items, orgId, onClose, onDone }: {
  theme: Theme; items: { id: string; title: string }[]; orgId: string | null; onClose: () => void; onDone: () => void
}) {
  const [count, setCount] = useState(() => read('sf-bank-spoof-n', '5'))
  const [device, setDevice] = useState(() => read('sf-bank-spoof-device', 'random'))
  const [gps, setGps] = useState(() => read('sf-bank-spoof-gps', 'france'))
  const [run, setRun] = useState<{ done: number; failed: number; total: number; error?: string } | null>(null)
  const stop = useRef(false)
  const n = Math.max(1, Math.min(MAX_COPIES, Number(count) || 1))
  const running = !!run && run.done + run.failed < run.total

  async function launch() {
    write('sf-bank-spoof-n', String(n)); write('sf-bank-spoof-device', device); write('sf-bank-spoof-gps', gps)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast('Session expirée : reconnecte-toi', 'bad'); return }
    const jobs = planSpoofCopies(items, n, device)
    let done = 0, failed = 0, next = 0, lastErr = ''
    stop.current = false
    setRun({ done, failed, total: jobs.length })
    const worker = async () => {
      for (;;) {
        const j = jobs[next++]
        if (!j || stop.current) return
        try {
          const r = await fetch(`${API_ORIGIN}/api/v1/tools/spoof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ file_id: j.item.id, org_id: orgId, device: j.device, gps, intensity: 'normal', title: `${j.item.title} · copie ${j.n}` }),
          })
          const b = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null
          if (b?.ok) done++; else { failed++; lastErr = b?.error ?? `HTTP ${r.status}` }
        } catch (e) { failed++; lastErr = e instanceof Error ? e.message : String(e) }
        setRun({ done, failed, total: jobs.length, error: lastErr || undefined })
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker))
    setRun({ done, failed, total: jobs.length, error: lastErr || undefined })
    onDone()
    toast(failed ? `${done} copie(s) créée(s), ${failed} échec(s)` : `${done} copie(s) créée(s) dans la Banque`, failed ? 'bad' : 'ok')
  }

  const total = items.length * n
  return (
    <Modal theme={theme} title={`Spoofer en copies (${items.length} média${items.length > 1 ? 's' : ''})`}
      sub="Chaque copie est unique (recadrage léger, empreinte, appareil et GPS réécrits). Les copies arrivent dans le même dossier que l’original."
      icon="M8 8h12v12H8z|M4 16V4h12"
      onClose={() => { stop.current = true; onClose() }}
      footer={<>
        <Btn theme={theme} tone="quiet" label={running ? 'Arrêter' : 'Fermer'} onClick={() => { stop.current = true; if (!running) onClose() }} />
        <Btn theme={theme} tone="primary" label={running ? 'En cours…' : `Créer ${total} copie(s)`} disabled={running} onClick={() => void launch()} />
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#A1A1AA' }}>
          Nombre de copies par média (1 à {MAX_COPIES})
          <input type="number" min={1} max={MAX_COPIES} value={count} disabled={running} onChange={e => setCount(e.target.value)} style={{ ...FIELD, width: 120 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#A1A1AA' }}>
          Appareil écrit dans les copies
          <select value={device} disabled={running} onChange={e => setDevice(e.target.value)} style={FIELD}>
            <option value="random">Aléatoire (un appareil différent par copie)</option>
            {DEVICES.map(d => <option key={d.k} value={d.k}>{d.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#A1A1AA' }}>
          Position GPS
          <select value={gps} disabled={running} onChange={e => setGps(e.target.value)} style={FIELD}>
            {GPS_CITIES.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}
          </select>
        </label>
        {run && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((run.done + run.failed) / run.total * 100)}%`, background: theme.accent, transition: 'width .3s' }} />
            </div>
            <span style={{ fontSize: 12.5, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{run.done} / {run.total} copie(s) créée(s){run.failed ? ` · ${run.failed} échec(s)` : ''}</span>
            {run.error && <span data-no-tr style={{ fontSize: 12, color: '#F87171' }}>{run.error}</span>}
          </div>
        )}
      </div>
    </Modal>
  )
}
