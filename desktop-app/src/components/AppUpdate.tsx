// Barre du haut : date de la dernière mise à jour + bandeau « Rafraîchir »
// quand une version plus récente de ScaleFlow est en ligne.
import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import { Btn, Modal } from '@/lib/ui'
import { APP_BUILD, fmtBuild, useAppUpdate } from '@/lib/appVersion'
import { useRuns } from '@/lib/runStore'
import { IS_WEB } from '@/lib/platform'

const DISMISS_KEY = 'sf-update-dismissed'

export function UpdateChip({ theme }: { theme: Theme }) {
  const upd = useAppUpdate()
  const full = new Date(APP_BUILD.builtAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  return (
    <span title={`Version ${APP_BUILD.id} — mise à jour le ${full}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 99, flexShrink: 0,
      border: `1px solid ${upd ? `rgba(${theme.tone},0.4)` : 'rgba(255,255,255,0.07)'}`,
      color: upd ? theme.accentText : '#71717A', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: upd ? theme.accentText : '#34D399' }} />
      MAJ {fmtBuild()}
    </span>
  )
}

export function UpdateBanner({ theme }: { theme: Theme }) {
  const upd = useAppUpdate()
  const runs = useRuns()
  const [confirm, setConfirm] = useState(false)
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) } catch { return null } })
  if (!IS_WEB || !upd || dismissed === upd.id) return null

  const active = runs.filter(r => r.status === 'running').length
  const reload = () => window.location.reload()
  const later = () => { try { localStorage.setItem(DISMISS_KEY, upd.id) } catch { /* */ } setDismissed(upd.id) }
  const when = upd.builtAt ? ` (publiée le ${fmtBuild(upd.builtAt)})` : ''

  return (
    <>
      <div role="status" style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 20px',
        background: `rgba(${theme.tone},0.12)`, borderBottom: `1px solid rgba(${theme.tone},0.3)`, color: '#E4E4E7', fontSize: 12.5,
      }}>
        <span style={{ fontWeight: 700, color: theme.accentText }}>Nouvelle version de ScaleFlow en ligne{when}.</span>
        <span style={{ color: '#A1A1AA' }}>Rafraîchis la page pour l'avoir — ton onglet utilise l'ancienne.</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn sm theme={theme} tone="quiet" label="Plus tard" onClick={later} />
          <Btn sm theme={theme} tone="primary" label="Rafraîchir" onClick={() => active ? setConfirm(true) : reload()} />
        </span>
      </div>
      {confirm && (
        <Modal theme={theme} title="Rafraîchir maintenant ?" sub={`${active} lancement${active > 1 ? 's' : ''} en cours`} onClose={() => setConfirm(false)}
          footer={<><Btn theme={theme} tone="ghost" label="Attendre" onClick={() => setConfirm(false)} /><Btn theme={theme} tone="primary" label="Rafraîchir quand même" onClick={reload} /></>}>
          <div style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.55 }}>
            Un lancement est en cours dans cet onglet. Si tu rafraîchis, les publications déjà envoyées continuent sur les téléphones, mais tu perds le suivi en direct ici. Mieux vaut attendre la fin.
          </div>
        </Modal>
      )}
    </>
  )
}
