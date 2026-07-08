/**
 * Sélecteur de proxys pour UN lancement (mass posting, story…).
 *
 * Quand plusieurs proxys de rotation sont configurés, on choisit sur le(s)quel(s)
 * sont les téléphones de CE post → seule l'IP de ces proxys sera changée. Ça
 * permet de lancer plusieurs postings en parallèle sur des proxys différents sans
 * qu'un run vienne roter l'IP d'un proxy utilisé par un autre.
 *
 * Modèle simple et prévisible :
 *  - Puce « Tous » = tous les proxys (état par défaut ; stocké comme []).
 *  - Cliquer un proxy quand on est sur « Tous » → démarre une sélection fraîche
 *    avec UNIQUEMENT ce proxy (c'est ce qu'on veut : « mes tél sont sur ce proxy »).
 *  - Ensuite, cliquer ajoute/retire des proxys. Tout retirer → revient à « Tous ».
 *
 * Ne s'affiche que s'il y a au moins 2 proxys configurés (sinon rien à choisir).
 */
import { listRotationProxies } from '@/lib/proxyRotation'

export function ProxyPicker({ selected, onChange }: {
  selected: string[]
  onChange: (urls: string[]) => void
}) {
  const proxies = listRotationProxies()
  if (proxies.length < 2) return null   // 0-1 proxy → aucun choix à faire

  const sel = selected ?? []
  const allUrls = proxies.map(p => p.url)
  // « Tous » actif quand rien de spécifique n'est sélectionné (ou tout l'est).
  const allMode = sel.length === 0 || sel.length >= proxies.length
  const isOn = (url: string) => !allMode && sel.includes(url)

  function selectAll() { onChange([]) }   // [] = tous

  function toggle(url: string) {
    // Sur « Tous », un clic démarre une sélection fraîche avec juste ce proxy.
    if (allMode) { onChange([url]); return }
    const set = new Set(sel)
    if (set.has(url)) set.delete(url); else set.add(url)
    const next = allUrls.filter(u => set.has(u))     // garde l'ordre configuré
    if (next.length === 0) { onChange([]); return }  // plus rien → « Tous »
    onChange(next.length >= allUrls.length ? [] : next)
  }

  const chip = (active: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
    background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'}`,
    color: active ? '#c7cbff' : 'rgba(148,163,184,0.6)',
  } as const)

  const box = (active: boolean) => ({
    width: 13, height: 13, borderRadius: 4, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: active ? 'linear-gradient(130deg,#6366F1,#818CF8)' : 'transparent',
    border: active ? 'none' : '1px solid rgba(148,163,184,0.4)',
  } as const)

  const check = <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>

  return (
    <div className="pl-[26px]" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.7)', fontWeight: 600 }}>
          Proxys de ce lancement
        </span>
        <span className="text-[10.5px]" style={{ color: 'rgba(148,163,184,0.45)' }}>
          {allMode ? `tous (${proxies.length})` : `${sel.length}/${proxies.length}`}
        </span>
      </div>
      <p className="text-[10.5px]" style={{ color: 'rgba(148,163,184,0.45)', margin: '0 0 8px', lineHeight: 1.5 }}>
        Choisis le(s) proxy sur le(s)quel(s) sont ces téléphones. Seule leur IP sera changée — tu peux lancer un autre post sur un autre proxy en parallèle.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {/* Puce « Tous » */}
        <button onClick={selectAll} className="text-[11.5px] font-semibold transition-all" style={chip(allMode)}>
          <span style={box(allMode)}>{allMode && check}</span>
          Tous
        </button>
        {proxies.map(p => (
          <button
            key={p.url}
            onClick={() => toggle(p.url)}
            title={p.url}
            className="text-[11.5px] font-semibold transition-all"
            style={chip(isOn(p.url))}
          >
            <span style={box(isOn(p.url))}>{isOn(p.url) && check}</span>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
