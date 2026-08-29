import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useBankThumbs } from '@/lib/data'
import BankPicker from '@/components/BankPicker'

// Studio vidéo : hub des outils (gratuits) + wizard par outil (fidèle à _studio()).
// La génération n'est pas encore branchée (outils serveur) — le wizard prépare tout.
interface Tool { k: string; t: string; d: string; tone: string; tag: string; i: string }
const TOOLS: Tool[] = [
  { k: 'remix', t: 'Remix', d: 'Une vidéo devient des dizaines de variantes uniques : luminosité, zoom, vitesse, recadrage.', tone: '139,92,246', tag: '×24 variantes', i: 'M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6' },
  { k: 'spoof', t: 'Spoof', d: "Réécrit device, GPS et EXIF, micro-varie l'image. Invisible aux filtres de doublons.", tone: '167,139,250', tag: 'anti-détection', i: 'M12 22s8-4.5 8-11a8 8 0 1 0-16 0c0 6.5 8 11 8 11z|M9 12l2 2 4-4' },
  { k: 'subs', t: 'Sous-titres', d: 'Transcription IA et incrustation stylée, mot par mot.', tone: '6,182,212', tag: 'Whisper', i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z|M7 9h10|M7 13h6' },
  { k: 'mixer', t: 'Mixer', d: 'Incruste un hook accrocheur sur la vidéo, rendu côté serveur.', tone: '236,72,153', tag: 'overlay', i: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6' },
]
const SETTINGS: Record<string, [string, string][]> = {
  remix: [['Luminosité', '±6 %'], ['Contraste', '±4 %'], ['Zoom', '±3 %'], ['Vitesse', '0,95–1,05×'], ['Recadrage', '±2 %']],
  spoof: [['Device', 'iPhone 15 Pro'], ['GPS', '34.05, -118.2'], ['EXIF', 'nettoyé'], ['Empreinte fichier', 'unique'], ['Piste audio', '±1 %']],
  subs: [['Langue', 'Auto'], ['Position', 'Centre'], ['Style du mot fort', 'Fond plein'], ['Taille', '32 px']],
  mixer: [['Hook', 'POV : tu découvres ça'], ['Position', 'Haut'], ['Fond', 'Noir'], ['Rendu', 'Serveur']],
}

interface Video { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null }
const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
function isVid(v: Video): boolean {
  const ext = (v.storage_path ?? v.file_url ?? '').toLowerCase().split('.').pop() ?? ''
  return !IMG_EXT.includes(ext)
}

export default function Studio({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [tool, setTool] = useState<string | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [src, setSrc] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [genNote, setGenNote] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { thumbFor } = useBankThumbs(videos)

  const load = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false })
    setVideos(((data ?? []) as Video[]).filter(v => !(SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url)))
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])

  const toggleSrc = (id: string) => setSrc(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Import « Mon PC » : upload vers le bucket content puis insert content_bank (comme la banque).
  async function importFromPC(files: FileList | File[]) {
    const list = Array.from(files); if (list.length === 0) return
    const scopeFolder = currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`
    let done = 0
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        let ext = (file.name.split('.').pop() ?? '').toLowerCase()
        if (!ext) ext = file.type.startsWith('image') ? 'jpg' : 'mp4'
        const id = crypto.randomUUID()
        const storagePath = `videos/${scopeFolder}/${id}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
        if (up.error) continue
        await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title: file.name.replace(/\.[a-z0-9]+$/i, ''), storage_path: storagePath, thumbnail_path: null,
          file_url: null, folder: null, duration: null, tags: [], notes: null, used_count: 0,
        })
      } catch { /* ignore */ }
    }
    setUploading(null)
    await load()
  }

  // ── Hub ──
  if (!tool) {
    return (
      <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
        <PageHead title="Studio vidéo" sub="Une vidéo source, quatre outils, des dizaines de variantes uniques. Tout est gratuit — aucun crédit consommé." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          {TOOLS.map(t => (
            <button key={t.k} onClick={() => { setTool(t.k); setSrc(new Set()) }} style={{
              display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 10, background: '#101015', textAlign: 'left',
              border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all .18s ease', boxSizing: 'border-box',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(${t.tone},0.4)`; e.currentTarget.style.background = '#13131A' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = '#101015' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: `rgba(${t.tone},0.12)`, border: `1px solid rgba(${t.tone},0.24)`, color: `rgb(${t.tone})` }}>
                  <Icon d={t.i} size={16} />
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#F4F4F6' }}>{t.t}</span>
                <span style={{ marginLeft: 'auto' }}><Chip text={t.tag} tone="mute" /></span>
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.6, color: '#71717A' }}>{t.d}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Wizard d'un outil ──
  const T = TOOLS.find(x => x.k === tool)!
  const settings = SETTINGS[tool] ?? []
  const nSrc = src.size
  const output = tool === 'remix' ? `${nSrc * 24} variantes` : `${nSrc} fichier${nSrc > 1 ? 's' : ''}`

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title={T.t} sub={T.d} actions={<>
        <Chip text="Gratuit · 0 crédit" tone="ok" />
        <Btn theme={theme} tone="quiet" label="Retour" onClick={() => setTool(null)} />
      </>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel theme={theme}>
            <PanelHead title="Vidéos sources" sub={uploading ? `Import : ${uploading}` : `${nSrc} sélectionnée${nSrc > 1 ? 's' : ''}`} right={<>
              <Btn theme={theme} sm icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Banque" onClick={() => setPickerOpen(true)} />
              <Btn theme={theme} sm tone="quiet" icon="M12 3v12|M7 10l5 5 5-5|M4 21h16" label="Mon PC" disabled={!!uploading} onClick={() => fileRef.current?.click()} />
              <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display: 'none' }}
                onChange={e => { if (e.target.files) importFromPC(e.target.files); e.target.value = '' }} />
            </>} />
            {videos.length === 0 ? <div style={{ padding: 28, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucune vidéo dans la banque. Clique « Mon PC » pour en importer.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(74px,1fr))', gap: 8, padding: 13, maxHeight: 300, overflowY: 'auto' }}>
                {videos.map((v) => {
                  const on = src.has(v.id); const prev = thumbFor(v); const vid = isVid(v)
                  return (
                    <button key={v.id} onClick={() => toggleSrc(v.id)} title={v.title} style={{
                      position: 'relative', aspectRatio: '9 / 16', borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                      border: '1.5px solid ' + (on ? `rgb(${T.tone})` : 'rgba(255,255,255,0.07)'),
                      background: `linear-gradient(160deg, rgba(${T.tone},0.16), rgba(${T.tone},0.035))`,
                    }}>
                      {prev && (vid && !v.thumbnail_url && !v.thumbnail_path
                        ? <video src={prev + '#t=0.1'} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
                      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: on ? `rgb(${T.tone})` : 'rgba(11,11,15,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel theme={theme}>
            <PanelHead title="Réglages" />
            {settings.map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 15px', borderBottom: i < settings.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none' }}>
                <span style={{ flex: 1, fontSize: 12, color: '#A1A1AA' }}>{k}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 700, color: `rgb(${T.tone})` }}>{v}</span>
              </div>
            ))}
          </Panel>
        </div>

        <Panel theme={theme}>
          <PanelHead title="Sortie" />
          <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ aspectRatio: '9 / 15', borderRadius: 9, background: `linear-gradient(160deg, rgba(${T.tone},0.15), rgba(${T.tone},0.03))`, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700, color: `rgb(${T.tone})`, letterSpacing: '-0.03em' }}>{tool === 'remix' ? '×24' : T.tag}</span>
            </div>
            {([['Vidéos sources', String(nSrc)], ['Sortie', output], ['Coût', 'Gratuit']] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#71717A' }}>{k}</span><span style={{ fontWeight: 700, color: k === 'Coût' ? '#34D399' : '#E4E4E7' }}>{v}</span>
              </div>
            ))}
            <Btn theme={theme} tone="primary" disabled={nSrc === 0} icon="M5 3l14 9-14 9z" label={nSrc === 0 ? 'Choisis des sources' : 'Générer'} onClick={() => setGenNote(true)} />
            <div style={{ fontSize: 10.5, color: genNote ? '#FBBF24' : '#52525B', textAlign: 'center', lineHeight: 1.5 }}>
              {genNote ? `${nSrc} source(s) prêtes · le moteur de génération serveur (${T.t}) arrive très bientôt — rien n'est débité en attendant.` : 'La génération serveur sera branchée prochainement.'}
            </div>
          </div>
        </Panel>
      </div>

      {pickerOpen && (
        <BankPicker theme={theme} user={user} org={org} kind="videos" multi initialIds={[...src]}
          title="Choisir des vidéos sources" onClose={() => setPickerOpen(false)}
          onApply={r => { if (r.kind === 'videos') setSrc(new Set(r.ids)) }} />
      )}
    </div>
  )
}
