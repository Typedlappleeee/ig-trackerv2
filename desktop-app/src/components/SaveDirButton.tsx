// Choix du dossier de MON PC où enregistrer aussi les vidéos générées (lib/saveDir).
// Aucun dossier = seulement dans la Banque. Masqué si le navigateur ne le permet pas.
import { useEffect, useState } from 'react'
import { getSaveDir, pickSaveDir, clearSaveDir, saveDirSupported } from '@/lib/saveDir'

const BTN: React.CSSProperties = { height: 30, padding: '0 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#161618', color: '#EDEDEF', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }

export function SaveDirButton() {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => { void getSaveDir().then(h => setName(h?.name ?? null)) }, [])
  if (!saveDirSupported()) return null
  const pick = async () => { const n = await pickSaveDir(); if (n) setName(n) }
  return name ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span title="Chaque vidéo générée y est aussi enregistrée en fichier" style={{ fontSize: 12.5, color: '#EDEDEF', fontWeight: 600 }}>📁 <span data-no-tr>{name}</span></span>
      <button type="button" onClick={pick} style={BTN}>Changer</button>
      <button type="button" onClick={async () => { await clearSaveDir(); setName(null) }} style={{ ...BTN, background: 'transparent', color: '#A1A1AA' }}>Retirer</button>
    </span>
  ) : (
    <button type="button" onClick={pick} title="Les vidéos générées seront aussi enregistrées dans ce dossier, en fichiers" style={BTN}>Choisir un dossier…</button>
  )
}
