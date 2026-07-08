/**
 * Sélecteur de proxys pour UN lancement (mass posting, story…).
 *
 * Quand plusieurs proxys de rotation sont configurés, on peut choisir sur
 * le(s)quel(s) sont les téléphones de CE post → seule l'IP de ces proxys sera
 * changée. Ça permet de lancer plusieurs postings en parallèle sur des proxys
 * différents sans qu'un run vienne roter l'IP d'un proxy utilisé par un autre.
 *
 * Sélection vide = tous les proxys (rétro-compatible). Le composant ne s'affiche
 * que s'il y a au moins 2 proxys configurés (sinon rien à choisir).
 */
import { listRotationProxies } from '@/lib/proxyRotation'

export function ProxyPicker({ selected, onChange }: {
  selected: string[]
  onChange: (urls: string[]) => void
}) {
  const proxies = listRotationProxies()
  if (proxies.length < 2) return null   // 0-1 proxy → aucun choix à faire

  // Sélection vide = tous. Pour l'affichage, on matérialise « tous ».
  const isAll = selected.length === 0 || selected.length >= proxies.length
  const isOn = (url: string) => isAll || selected.includes(url)

  function toggle(url: string) {
    const base = selected.length === 0 ? proxies.map(p => p.url) : selected.slice()
    const set = new Set(base)
    if (set.has(url)) set.delete(url); else set.add(url)
    let next = proxies.map(p => p.url).filter(u => set.has(u))  // garde l'ordre configuré
    if (next.length === 0) return                               // interdit de tout décocher
    onChange(next.length >= proxies.length ? [] : next)         // tous → [] (= tous)
  }

  const count = isAll ? proxies.length : selected.length

  return (
    <div className="pl-[26px]" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.7)', fontWeight: 600 }}>
          Proxys de ce lancement
        </span>
        <span className="text-[10.5px]" style={{ color: 'rgba(148,163,184,0.45)' }}>
          {count}/{proxies.length} · {count === proxies.length ? 'tous' : 'sélection'}
        </span>
      </div>
      <p className="text-[10.5px]" style={{ color: 'rgba(148,163,184,0.45)', margin: '0 0 8px', lineHeight: 1.5 }}>
        Coche le(s) proxy sur le(s)quel(s) sont ces téléphones. Seule leur IP sera changée — tu peux lancer un autre post sur un autre proxy en parallèle.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {proxies.map(p => {
          const on = isOn(p.url)
          return (
            <button
              key={p.url}
              onClick={() => toggle(p.url)}
              title={p.url}
              className="text-[11.5px] font-semibold transition-all"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                background: on ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${on ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: on ? '#c7cbff' : 'rgba(148,163,184,0.6)',
              }}
            >
              <span style={{
                width: 13, height: 13, borderRadius: 4, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: on ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'transparent',
                border: on ? 'none' : '1px solid rgba(148,163,184,0.4)',
              }}>
                {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
              </span>
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
