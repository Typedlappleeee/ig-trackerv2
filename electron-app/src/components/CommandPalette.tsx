// Palette de commandes (Cmd/Ctrl+K) — navigation instantanée dans toute l'app.
// Additif : ne change aucun flux existant, ouvre juste un accès rapide clavier.
import { useState, useEffect, useRef, useMemo } from 'react'

export interface CommandItem {
  id: string
  label: string
  group?: string
  keywords?: string
  emoji?: string
}

// Normalise (retire accents + minuscule) pour une recherche tolérante.
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function CommandPalette({ items, onSelect }: { items: CommandItem[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Raccourci global Cmd/Ctrl+K (toggle) + Escape (close).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    // Ouverture aussi via un bouton (ex. barre latérale) qui dispatch cet évènement.
    const onOpenEvt = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('sf:cmdk', onOpenEvt)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('sf:cmdk', onOpenEvt) }
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return items
    return items.filter(it => norm(`${it.label} ${it.keywords ?? ''} ${it.group ?? ''}`).includes(q))
  }, [query, items])

  useEffect(() => { if (active >= filtered.length) setActive(0) }, [filtered.length, active])

  const choose = (id: string) => { setOpen(false); onSelect(id) }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[active]; if (it) choose(it.id) }
  }

  // Auto-scroll de l'élément actif dans la vue.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 9500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', background: 'rgba(4,4,10,0.55)', backdropFilter: 'blur(6px)', animation: 'sf-page-in .18s ease both' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="sf-glass"
        style={{ width: 'min(620px, 92vw)', maxHeight: '66vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px -30px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.14)' }}
      >
        {/* Barre de recherche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--border)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onInputKey}
            placeholder="Aller à… (page, action)"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-1)', fontSize: 15, fontWeight: 500, fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)' }}>ESC</span>
        </div>

        {/* Résultats */}
        <div ref={listRef} className="blow-scroll" style={{ overflowY: 'auto', padding: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13.5 }}>Aucun résultat</div>
          ) : (
            filtered.map((it, i) => (
              <button
                key={it.id}
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(it.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', borderRadius: 11,
                  border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 2,
                  background: i === active ? 'linear-gradient(100deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))' : 'transparent',
                  boxShadow: i === active ? 'inset 0 0 0 1px rgba(99,102,241,0.3)' : 'none',
                }}
              >
                <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 15, background: i === active ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : 'var(--surface-3)' }}>
                  {it.emoji ?? '›'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  {it.group && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-4)' }}>{it.group}</span>}
                </span>
                {i === active && <span style={{ fontSize: 11, fontWeight: 700, color: '#A5B4FC' }}>↵</span>}
              </button>
            ))
          )}
        </div>

        {/* Pied */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-4)' }}>
          <span>↑↓ naviguer</span><span>↵ ouvrir</span><span style={{ marginLeft: 'auto' }}>Ctrl K</span>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
