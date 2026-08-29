import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useBankThumbs } from '@/lib/data'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { useConnections } from '@/lib/connections'
import {
  resolveSourceBytes, saveOutputToBank,
  runSpoof, runRemixVariant, runMontage, runOverlay, runCaption, runSubtitles,
} from '@/lib/studioTools'
import { getFFmpeg, isFfmpegReady } from '@/lib/ffmpeg'

// Studio vidéo : hub des outils (gratuits) + wizard par outil (fidèle à _studio()).
// La génération n'est pas encore branchée (outils serveur) — le wizard prépare tout.
interface Tool { k: string; t: string; d: string; tone: string; tag: string; i: string }
const TOOLS: Tool[] = [
  { k: 'overlay', t: 'Incrustation photo/vidéo', d: 'Mets une vidéo, choisis une photo et place-la où tu veux, le temps que tu veux.', tone: '99,102,241', tag: 'photo', i: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' },
  { k: 'montage', t: 'Montage', d: 'Assemble et découpe tes vidéos : coupe, ordre, transitions simples.', tone: '245,158,11', tag: 'découpe', i: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M20 4L8.12 15.88|M14.47 14.48L20 20|M8.12 8.12L12 12' },
  { k: 'mixer', t: 'Mixer', d: 'Ajoute une légende / un montage par-dessus ta vidéo, rendu côté serveur.', tone: '236,72,153', tag: 'overlay', i: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6' },
  { k: 'remix', t: 'Remix', d: 'Une vidéo devient des dizaines de variantes uniques : luminosité, zoom, vitesse, recadrage.', tone: '139,92,246', tag: '×24 variantes', i: 'M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6' },
  { k: 'spoof', t: 'Spoof', d: "Anti-empreinte : réécrit device, GPS, EXIF et micro-varie l'image. Rend chaque vidéo unique pour l'algo.", tone: '167,139,250', tag: 'anti-détection', i: 'M12 22s8-4.5 8-11a8 8 0 1 0-16 0c0 6.5 8 11 8 11z|M9 12l2 2 4-4' },
  { k: 'subs', t: 'Sous-titres', d: 'Sous-titres automatiques (Groq Whisper), incrustés mot par mot.', tone: '6,182,212', tag: 'Whisper', i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z|M7 9h10|M7 13h6' },
]
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
  const conns = useConnections(user, org)
  const [tool, setTool] = useState<string | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [src, setSrc] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { thumbFor } = useBankThumbs(videos)

  // ── Paramètres par outil ──
  const [copies, setCopies] = useState(3)          // spoof / remix : nb de variantes/source
  const [caption, setCaption] = useState('')       // mixer
  const [capPos, setCapPos] = useState<'top' | 'center' | 'bottom'>('bottom')
  const [trimStart, setTrimStart] = useState(0)    // montage
  const [trimEnd, setTrimEnd] = useState('')       // montage (vide = jusqu'à la fin)
  const [overlayImg, setOverlayImg] = useState<{ storage_path: string | null; file_url: string | null; title: string } | null>(null)
  const [imgPicker, setImgPicker] = useState(false)

  // ── État d'exécution ──
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [results, setResults] = useState<{ title: string; url: string }[]>([])

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

  const push = (m: string) => setLogs(l => [...l.slice(-200), m])

  // Résout la photo d'incrustation (pour l'outil overlay).
  async function overlayBytes(): Promise<{ data: Uint8Array; ext: string } | null> {
    if (!overlayImg) return null
    const ext = ((overlayImg.storage_path ?? overlayImg.file_url ?? 'png').split('.').pop() ?? 'png').toLowerCase()
    const data = await resolveSourceBytes(overlayImg)
    return { data, ext }
  }

  // ── Lancement du traitement réel (ffmpeg.wasm) ──
  async function generate() {
    if (running) return
    const chosen = videos.filter(v => src.has(v.id) && isVid(v))
    if (chosen.length === 0) { push('⚠ Sélectionne au moins une vidéo source.'); return }
    if (tool === 'overlay' && !overlayImg) { push('⚠ Choisis d’abord une photo à incruster.'); return }
    if (tool === 'mixer' && !caption.trim()) { push('⚠ Écris une légende à incruster.'); return }
    if (tool === 'subs' && !conns.groq) { push('⚠ Clé Groq manquante (Réglages) pour la transcription.'); return }

    setRunning(true); setLogs([]); setResults([]); setProgress(0)
    const hooks = { onProgress: setProgress, onLog: (_m: string) => {} }
    try {
      if (!isFfmpegReady()) { push('⏳ Chargement du moteur vidéo (~30 Mo, une seule fois)…'); await getFFmpeg(); push('✅ Moteur prêt.') }
      const ov = tool === 'overlay' ? await overlayBytes() : null
      for (const v of chosen) {
        push(`— ${v.title} —`)
        setProgress(0)
        const bytes = await resolveSourceBytes(v)
        const outs: { title: string; data: Uint8Array }[] = []
        if (tool === 'spoof' || tool === 'remix') {
          const n = Math.max(1, Math.min(24, copies))
          for (let i = 0; i < n; i++) {
            push(`  · variante ${i + 1}/${n}…`)
            const seed = Math.random() * 1000
            const data = tool === 'spoof' ? await runSpoof(bytes, seed, hooks) : await runRemixVariant(bytes, seed, hooks)
            outs.push({ title: `${v.title} · ${tool} ${i + 1}`, data })
          }
        } else if (tool === 'montage') {
          push('  · découpe…')
          const end = trimEnd.trim() ? Number(trimEnd) : null
          outs.push({ title: `${v.title} · montage`, data: await runMontage(bytes, trimStart, isFinite(end as number) ? end : null, hooks) })
        } else if (tool === 'overlay' && ov) {
          push('  · incrustation…')
          outs.push({ title: `${v.title} · incrust`, data: await runOverlay(bytes, ov.data, ov.ext, { widthPx: 420, from: 0, to: null }, hooks) })
        } else if (tool === 'mixer') {
          push('  · légende…')
          outs.push({ title: `${v.title} · mixer`, data: await runCaption(bytes, caption, capPos, hooks) })
        } else if (tool === 'subs') {
          outs.push({ title: `${v.title} · sous-titres`, data: await runSubtitles(bytes, conns.groq, { onProgress: setProgress, onLog: push }) })
        }
        // Sauvegarde banque + lien de téléchargement.
        for (const o of outs) {
          await saveOutputToBank(user.id, currentOrg?.id ?? null, o.data, o.title)
          const url = URL.createObjectURL(new Blob([o.data as BlobPart], { type: 'video/mp4' }))
          setResults(r => [...r, { title: o.title, url }])
        }
      }
      push('✔ Terminé — sorties enregistrées dans la banque.')
      load()
    } catch (e) {
      push(`❌ ${e instanceof Error ? e.message : 'Échec du traitement'}`)
    }
    setRunning(false); setProgress(0)
  }

  // ── Hub ──
  if (!tool) {
    return (
      <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
        <PageHead title="Studio vidéo" sub="Une vidéo source, tous tes outils VIP — incrustation, montage, mixer, remix, spoof, sous-titres. Tout est gratuit, aucun crédit consommé." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          {TOOLS.map(t => (
            <button key={t.k} onClick={() => { setTool(t.k); setSrc(new Set()); setResults([]); setLogs([]); setOverlayImg(null) }} style={{
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
  const nSrc = src.size
  const per = (tool === 'spoof' || tool === 'remix') ? copies : 1
  const output = `${nSrc * per} fichier${nSrc * per > 1 ? 's' : ''}`
  const numInp: React.CSSProperties = { width: 80, height: 32, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', color: '#F4F4F6', fontSize: 12.5, outline: 'none', textAlign: 'right' }

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
            <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(tool === 'spoof' || tool === 'remix') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#A1A1AA' }}>Variantes par vidéo</span>
                  <input type="number" min={1} max={24} value={copies} onChange={e => setCopies(Number(e.target.value))} style={numInp} />
                </label>
              )}
              {tool === 'montage' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: '#A1A1AA' }}>Début (s)</span>
                    <input type="number" min={0} step={0.1} value={trimStart} onChange={e => setTrimStart(Number(e.target.value))} style={numInp} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: '#A1A1AA' }}>Fin (s, vide = fin)</span>
                    <input type="number" min={0} step={0.1} value={trimEnd} onChange={e => setTrimEnd(e.target.value)} placeholder="—" style={numInp} />
                  </label>
                </>
              )}
              {tool === 'mixer' && (
                <>
                  <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2} placeholder="Ta légende à incruster…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', color: '#F4F4F6', fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {(['top', 'center', 'bottom'] as const).map(p => (
                      <button key={p} onClick={() => setCapPos(p)} style={{ flex: 1, height: 30, border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: capPos === p ? theme.accentBtn : 'transparent', color: capPos === p ? '#fff' : '#A1A1AA' }}>{p === 'top' ? 'Haut' : p === 'center' ? 'Centre' : 'Bas'}</button>
                    ))}
                  </div>
                </>
              )}
              {tool === 'overlay' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Btn theme={theme} sm tone="primary" icon="M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" label={overlayImg ? 'Changer la photo' : 'Choisir une photo'} onClick={() => setImgPicker(true)} />
                  {overlayImg && <Chip text={overlayImg.title} tone="violet" />}
                  <span style={{ width: '100%', fontSize: 11, color: '#52525B' }}>La photo est incrustée au centre (40 % de la largeur). Positionnement fin à venir.</span>
                </div>
              )}
              {tool === 'subs' && (
                <span style={{ fontSize: 12, color: conns.groq ? '#A1A1AA' : '#FBBF24', lineHeight: 1.55 }}>
                  {conns.groq ? 'Transcription automatique via Groq Whisper, puis incrustation mot-groupe par mot-groupe. Langue auto.' : 'Aucune clé Groq détectée — configure-la dans les Réglages de l’app pour activer les sous-titres.'}
                </span>
              )}
            </div>
          </Panel>
        </div>

        <Panel theme={theme}>
          <PanelHead title="Sortie" />
          <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {([['Vidéos sources', String(nSrc)], ['Sortie', output], ['Coût', 'Gratuit']] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#71717A' }}>{k}</span><span style={{ fontWeight: 700, color: k === 'Coût' ? '#34D399' : '#E4E4E7' }}>{v}</span>
              </div>
            ))}

            {running && (
              <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: theme.accentBtn, transition: 'width .2s ease' }} />
              </div>
            )}

            <Btn theme={theme} tone="primary" disabled={nSrc === 0 || running} icon="M5 3l14 9-14 9z"
              label={running ? `Traitement… ${Math.round(progress * 100)}%` : nSrc === 0 ? 'Choisis des sources' : 'Générer'} onClick={generate} />
            <div style={{ fontSize: 10.5, color: '#52525B', textAlign: 'center', lineHeight: 1.5 }}>Traitement local (ffmpeg) — le premier lancement charge le moteur (~30 Mo).</div>

            {logs.length > 0 && (
              <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', maxHeight: 140, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, lineHeight: 1.6, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</div>
            )}

            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#34D399' }}>{results.length} sortie(s) · enregistrées dans la banque</span>
                {results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    <a href={r.url} download={`${r.title}.mp4`} style={{ fontSize: 11, fontWeight: 700, color: theme.accentText, textDecoration: 'none' }}>Télécharger</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {pickerOpen && (
        <BankPicker theme={theme} user={user} org={org} kind="videos" multi initialIds={[...src]}
          title="Choisir des vidéos sources" onClose={() => setPickerOpen(false)}
          onApply={r => { if (r.kind === 'videos') setSrc(new Set(r.ids)) }} />
      )}

      {imgPicker && (
        <BankPicker theme={theme} user={user} org={org} kind="images" multi={false}
          title="Choisir une photo à incruster" onClose={() => setImgPicker(false)}
          onApply={(r: PickerResult) => {
            if (r.kind !== 'images' || r.ids.length === 0) return
            const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
            scope(supabase.from('content_bank').select('title,storage_path,file_url')).in('id', [r.ids[0]]).then(({ data }: any) => {
              const v = (data ?? [])[0]; if (v) setOverlayImg(v)
            })
          }} />
      )}
    </div>
  )
}
