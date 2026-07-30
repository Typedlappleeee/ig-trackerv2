// Page AUTONOME "un tel en plein écran" — ouverte dans un nouvel onglet léger
// (#pf-fs=<deviceId>). Ne charge PAS tout ScaleFlow : juste l'écran du tel + des
// actions rapides. La clé iRemoTech vient du cache localStorage (partagé entre
// onglets). On peut en ouvrir autant qu'on veut.
import { LivePhone } from './LivePhone'
import { iremotech, getIremotechKey, type IrtAction, type IrtDevice } from '@/lib/iremotech'

export function StandalonePhone({ deviceId, name }: { deviceId: string; name?: string }) {
  const device: IrtDevice = { public_id: deviceId, name: name || deviceId }
  const hasKey = !!getIremotechKey()
  const act = (a: IrtAction) => { iremotech.action(deviceId, a) }
  const btn: React.CSSProperties = { height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#E9E9F2', fontSize: 13, fontWeight: 700, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(1200px 600px at 50% -10%, #16121f, #08080d)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 14 }}>
      {!hasKey ? (
        <div style={{ color: '#FCA5A5', fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
          Clé iRemoTech introuvable dans cet onglet. Ouvre d'abord Phone Farm dans ScaleFlow (pour charger la clé), puis rouvre ce tel.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#E9E9F2', letterSpacing: '.02em' }}>{device.name}</div>
          <div style={{ height: '82vh', aspectRatio: '9/19.5', maxWidth: '94vw' }}>
            <LivePhone device={device} fps={30} rounded={30} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            <button style={btn} onClick={() => act({ type: 'press', name: 'home' })}>⌂ Accueil</button>
            <button style={btn} onClick={() => act({ type: 'open_url', url: 'https://instagram.com' })}>Instagram</button>
            <button style={btn} onClick={() => act({ type: 'airplane', on: true })}>✈️ ON</button>
            <button style={btn} onClick={() => act({ type: 'airplane', on: false })}>✈️ OFF</button>
          </div>
          <div style={{ fontSize: 10.5, color: '#6b6b7c' }}>Clic = taper · glisser = swipe · molette = scroll</div>
        </>
      )}
    </div>
  )
}

export default StandalonePhone
