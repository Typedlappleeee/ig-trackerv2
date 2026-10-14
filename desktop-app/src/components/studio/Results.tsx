// Résultats du Studio : grille de miniatures (lecture au survol), téléchargement unitaire,
// « Tout télécharger » (zip), raccourcis Banque / Publier. Gardés pendant la session Studio.
import { useState } from 'react'
import { Icon, toast } from '@/lib/ui'
import { MediaTile } from '@/components/Kit'

export interface StudioResult { id: string; title: string; url: string; ext: string; tool: string; at: number }

function saveAs(href: string, name: string) {
  const a = document.createElement('a'); a.href = href; a.download = name; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)

export function Results({ results, onClear, onBank, onPublish }: { results: StudioResult[]; onClear: () => void; onBank?: () => void; onPublish?: () => void }) {
  const [zipping, setZipping] = useState(false)
  if (!results.length) return null
  async function zipAll() {
    if (zipping) return
    setZipping(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const used = new Set<string>()
      for (const r of results) {
        let name = `${safe(r.title)}.${r.ext}`
        for (let k = 2; used.has(name); k++) name = `${safe(r.title)} (${k}).${r.ext}`
        used.add(name)
        zip.file(name, await (await fetch(r.url)).blob())
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob); saveAs(url, `scaleflow-studio-${results.length}.zip`); setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch { toast('Zip impossible — télécharge les fichiers un par un.', 'bad') }
    setZipping(false)
  }
  const btn = (label: string, icon: string, onClick: () => void, primary?: boolean) => (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 10, border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)', background: primary ? '#F4F4F5' : '#151517', color: primary ? '#0A0A0B' : '#E4E4E7', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
      <Icon d={icon} size={14} sw={2} />{label}
    </button>
  )
  return (
    <section style={{ marginTop: 28, animation: 'dbRise .5s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 19, fontWeight: 750, letterSpacing: '-0.025em', color: '#F4F4F5' }}>Résultats <span style={{ fontSize: 14, fontWeight: 600, color: '#5A5A63' }}>{results.length}</span></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#4ADE80' }}><Icon d="M20 6L9 17l-5-5" size={13} sw={2.4} />Enregistrés dans ta Banque</span>
        </span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {btn(zipping ? 'Préparation…' : 'Tout télécharger', 'M12 3v12|M7 10l5 5 5-5|M4 21h16', () => void zipAll(), true)}
          {onBank && btn('Voir dans la Banque', 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z', onBank)}
          {onPublish && btn('Publier', 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z', onPublish)}
          <button type="button" onClick={onClear} style={{ height: 34, padding: '0 10px', borderRadius: 10, border: 'none', background: 'transparent', color: '#71717A', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>Effacer la liste</button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {results.map(r => (
          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <MediaTile thumb={r.ext === 'jpg' ? r.url : null} video={r.ext === 'jpg' ? null : r.url} title={r.title} aspect={r.ext === 'jpg' ? '4 / 5' : '9 / 16'} />
            <button type="button" onClick={() => saveAs(r.url, `${safe(r.title)}.${r.ext}`)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,0.09)', background: '#141416', color: '#E4E4E7', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>
              <Icon d="M12 3v12|M7 10l5 5 5-5|M4 21h16" size={12} sw={2} />Télécharger
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
