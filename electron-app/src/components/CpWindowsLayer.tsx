// Couche globale des fenêtres de téléphone : rendue une seule fois dans Layout,
// donc les fenêtres restent ouvertes quel que soit l'onglet affiché et flottent
// par-dessus toute l'app. L'état vit dans cpWindowStore (singleton hors React).
import { CloudPhoneWindow } from '@/components/CloudPhoneWindow'
import { useCpWindows, closeCpWindow, focusCpWindow } from '@/lib/cpWindowStore'

export function CpWindowsLayer() {
  const { openIds, zOrder, entries } = useCpWindows()
  return (
    <>
      {openIds.map(id => {
        const e = entries[id]
        if (!e) return null
        return (
          <CloudPhoneWindow
            key={id}
            inst={{ ...e.inst, name: e.name }}
            zIndex={1000 + zOrder.indexOf(id)}
            offset={openIds.indexOf(id)}
            proxyId={e.proxyId}
            onClose={() => { closeCpWindow(id) }}
            onFocus={() => focusCpWindow(id)}
          />
        )
      })}
    </>
  )
}
