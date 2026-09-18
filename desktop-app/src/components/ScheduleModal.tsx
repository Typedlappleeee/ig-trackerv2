import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import { Btn, Modal } from '@/lib/ui'

// Modale de programmation « PC éteint » : la tâche est créée maintenant sur GeeLark
// avec un scheduleAt futur → GeeLark l'exécute dans son cloud à l'heure prévue.
// Partagée par Story / Cross (les Reels ont leur propre modale inline). Max ~29 j
// (l'hébergement média GeeLark expire après 30 j).
function localVal(plusMin: number): string {
  const d = new Date(Date.now() + plusMin * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ScheduleModal({ theme, count, kind, onClose, onSchedule }: {
  theme: Theme; count: number; kind?: string; onClose: () => void; onSchedule: (unix: number) => void
}) {
  const [val, setVal] = useState(localVal(60))
  function confirm() {
    const ms = new Date(val).getTime()
    if (!isFinite(ms) || ms < Date.now() + 60_000) { alert('Choisis une heure future (au moins +1 min).'); return }
    if (ms > Date.now() + 29 * 86_400_000) { alert('Max ~29 jours : l\'hébergement média GeeLark expire après 30 jours.'); return }
    onSchedule(Math.floor(ms / 1000))
  }
  return (
    <Modal theme={theme} title={`Programmer ${kind ?? 'la publication'}`} sub="GeeLark exécutera à l'heure choisie, dans son cloud — PC et ScaleFlow éteints."
      icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" onClose={onClose} width={430}
      footer={<>
        <Btn theme={theme} tone="quiet" label="Annuler" onClick={onClose} />
        <Btn theme={theme} tone="primary" label={`Programmer sur ${count} compte${count > 1 ? 's' : ''}`} disabled={!val} onClick={confirm} />
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717A' }}>Date et heure</label>
        <input type="datetime-local" value={val} min={localVal(1)} max={localVal(29 * 24 * 60)} onChange={e => setVal(e.target.value)}
          style={{ height: 40, padding: '0 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#F4F4F6', fontSize: 13, outline: 'none', colorScheme: 'dark' }} />
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: '#71717A' }}>
          La tâche est créée <b>maintenant</b> sur GeeLark (média hébergé + crédits débités) et part <b>toute seule</b> à l'heure prévue. Visible/annulable dans les <b>Task Logs</b> de GeeLark. Max ~29 jours.
        </p>
      </div>
    </Modal>
  )
}
