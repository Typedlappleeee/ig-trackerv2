// Banque du site partenaire (ex. staff) vue depuis ScaleFlow : ses dossiers et ses médias,
// séparés de ma banque ; import d'une sélection dans MA banque ; envoi de mes médias chez lui.
import { useEffect, useRef, useState } from 'react'
import type { Theme } from '@/lib/theme'
import { Btn, FIELD, Icon, Modal, Skeleton, toast } from '@/lib/ui'
import VideoFrame from '@/components/VideoFrame'
import { importFromPartner, partnerFiles, partnerFolders, sendToPartner, type LinkFile, type LinkFolder, type Partner, type Progress } from '@/lib/scaleflowLink'

const FOLDER_ICON = 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z'
const NO_FOLDER = '\u0000'                 // clé interne : médias hors dossier
const pct = (p: Progress) => (p.total ? Math.round(((p.done + p.failed) / p.total) * 100) : 100)

function Bar({ p, color }: { p: Progress; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${pct(p)}%`, height: '100%', background: color, transition: 'width .3s ease' }} />
      </div>
      <span style={{ fontSize: 12, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{`${p.done} / ${p.total}${p.failed ? ` · ${p.failed} échec(s)` : ''}`}</span>
    </div>
  )
}

function Tile({ f, on, onToggle }: { f: LinkFile; on: boolean; onToggle: () => void }) {
  const [bad, setBad] = useState(false)
  return (
    <button type="button" onClick={onToggle} title={f.title} style={{ position: 'relative', aspectRatio: '9 / 14', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', padding: 0, background: '#18181B', border: `2px solid ${on ? '#A78BFA' : 'transparent'}` }}>
      {f.thumbnail_url && !bad ? <img src={f.thumbnail_url} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : f.kind === 'image' && f.url ? <img src={f.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : f.url ? <VideoFrame src={f.url} /> : null}
      <span style={{ position: 'absolute', top: 6, left: 6, width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#0A0A0B', background: on ? '#A78BFA' : 'rgba(0,0,0,0.45)', border: on ? 'none' : '1px solid rgba(255,255,255,0.35)' }}>{on ? '✓' : ''}</span>
      <span data-no-tr style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 7px 6px', fontSize: 11, color: '#EDEDEF', textAlign: 'left', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</span>
    </button>
  )
}

export function PartnerBankModal({ theme, orgId, partner, myFolders, onImported, onClose }: {
  theme: Theme; orgId: string | null; partner: Partner; myFolders: string[]; onImported: () => void; onClose: () => void
}) {
  const [folders, setFolders] = useState<LinkFolder[] | null>(null)
  const [unfiled, setUnfiled] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)          // dossier ouvert (NO_FOLDER = hors dossier)
  const [files, setFiles] = useState<LinkFile[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dest, setDest] = useState('')
  const [prog, setProg] = useState<Progress | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    partnerFolders(orgId)
      .then(r => { setFolders(r.folders); setUnfiled((r.unfiled?.videos ?? 0) + (r.unfiled?.images ?? 0)) })
      .catch(e => setErr(e instanceof Error ? e.message : String(e)))
  }, [orgId])

  async function openFolder(name: string) {
    setOpen(name); setFiles(null); setSel(new Set()); setErr(null); setCursor(null)
    setDest(name === NO_FOLDER ? partner.name : name)
    try {
      const r = await partnerFiles(orgId, name === NO_FOLDER ? null : name)
      setFiles(r.files); setCursor(r.next_cursor)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setFiles([]) }
  }
  async function loadMore() {
    if (!open || !cursor) return
    setMore(true)
    try {
      const r = await partnerFiles(orgId, open === NO_FOLDER ? null : open, cursor)
      setFiles(f => [...(f ?? []), ...r.files]); setCursor(r.next_cursor)
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
    setMore(false)
  }
  async function doImport() {
    const picked = (files ?? []).filter(f => sel.has(f.id))
    if (!picked.length || !dest.trim()) return
    abort.current = new AbortController()
    setProg({ done: 0, total: picked.length, failed: 0 })
    const p = await importFromPartner(orgId, picked, dest.trim(), setProg, abort.current.signal)
    abort.current = null
    if (p.done) onImported()
    toast(p.failed ? `${p.done} importé(s), ${p.failed} échec(s)${p.lastError ? ` : ${p.lastError}` : ''}` : `${p.done} média(s) importé(s) dans « ${dest.trim()} » ✓`, p.failed ? 'bad' : 'ok', 7000)
    setProg(null); setSel(new Set())
  }

  const all = files ?? []
  const title = open === null ? `Banque ${partner.name}` : open === NO_FOLDER ? `${partner.name} · hors dossier` : `${partner.name} · ${open}`
  return (
    <Modal theme={theme} title={title} sub={open === null ? 'Sa banque, séparée de la tienne. Ouvre un dossier pour voir et récupérer ses vidéos.' : 'Coche des médias puis importe-les dans ta banque.'} icon={FOLDER_ICON} onClose={() => { abort.current?.abort(); onClose() }} width={920}
      footer={open === null ? <Btn theme={theme} label="Fermer" onClick={onClose} /> : prog ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <span style={{ flex: 1 }}><Bar p={prog} color={theme.accent} /></span>
          <Btn theme={theme} tone="quiet" label="Arrêter" onClick={() => abort.current?.abort()} />
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'wrap' }}>
          <Btn theme={theme} tone="quiet" label="← Dossiers" onClick={() => { setOpen(null); setFiles(null) }} />
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#A1A1AA' }}>Dans mon dossier</span>
          <input value={dest} onChange={e => setDest(e.target.value)} list="sf-my-folders" placeholder="Nom du dossier" style={{ ...FIELD, height: 32, width: 200 }} />
          <datalist id="sf-my-folders">{myFolders.map(n => <option key={n} value={n} />)}</datalist>
          <Btn theme={theme} tone="primary" label={sel.size ? `Importer ${sel.size} dans ma banque` : 'Importer dans ma banque'} disabled={!sel.size || !dest.trim()} onClick={() => void doImport()} />
        </span>
      )}>
      {err && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12.5, color: '#FCA5A5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{err}</div>}
      {open === null ? (
        folders === null && !err ? <div style={{ display: 'grid', gap: 8 }}>{[0, 1, 2].map(i => <Skeleton key={i} h={46} r={10} />)}</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {(folders ?? []).map(f => (
              <button key={f.name} type="button" onClick={() => void openFolder(f.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', background: '#141416', border: '1px solid rgba(255,255,255,0.08)', color: '#EDEDEF' }}>
                <span style={{ display: 'flex', color: '#C4BBFB' }}><Icon d={FOLDER_ICON} size={16} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span data-no-tr style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <span style={{ fontSize: 11.5, color: '#8B8B94' }}>{`${f.videos ?? 0} vidéo(s)${f.images ? ` · ${f.images} image(s)` : ''}`}</span>
                </span>
              </button>
            ))}
            {unfiled > 0 && (
              <button type="button" onClick={() => void openFolder(NO_FOLDER)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', background: 'transparent', border: '1px dashed rgba(255,255,255,0.12)', color: '#A1A1AA' }}>
                <span style={{ fontSize: 13 }}>{`Hors dossier · ${unfiled}`}</span>
              </button>
            )}
            {folders && !folders.length && !unfiled && <span style={{ fontSize: 13, color: '#8B8B94' }}>Sa banque est vide.</span>}
          </div>
        )
      ) : files === null ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} h={180} r={10} />)}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: '#8B8B94' }}>{`${all.length} média(s)${cursor ? '+' : ''}`}</span>
            {all.length > 0 && <Btn theme={theme} sm tone="ghost" label={sel.size === all.length ? 'Tout désélectionner' : 'Tout sélectionner'} onClick={() => setSel(sel.size === all.length ? new Set() : new Set(all.map(f => f.id)))} />}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {all.map(f => <Tile key={f.id} f={f} on={sel.has(f.id)} onToggle={() => setSel(s => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n })} />)}
          </div>
          {!all.length && <span style={{ fontSize: 13, color: '#8B8B94' }}>Dossier vide.</span>}
          {cursor && <span><Btn theme={theme} sm label={more ? 'Chargement…' : 'Charger plus'} disabled={more} onClick={() => void loadMore()} /></span>}
        </div>
      )}
    </Modal>
  )
}

export function SendToPartnerModal({ theme, orgId, partner, ids, defaultFolder, onClose }: {
  theme: Theme; orgId: string | null; partner: Partner; ids: string[]; defaultFolder: string; onClose: () => void
}) {
  const [theirs, setTheirs] = useState<string[]>([])
  const [dest, setDest] = useState(defaultFolder)
  const [prog, setProg] = useState<Progress | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => { partnerFolders(orgId).then(r => setTheirs(r.folders.map(f => f.name))).catch(() => setTheirs([])) }, [orgId])

  async function send() {
    if (!dest.trim()) return
    abort.current = new AbortController()
    setProg({ done: 0, total: ids.length, failed: 0 })
    const p = await sendToPartner(orgId, ids, dest.trim(), setProg, abort.current.signal)
    abort.current = null
    toast(p.failed ? `${p.done} envoyé(s), ${p.failed} échec(s)${p.lastError ? ` : ${p.lastError}` : ''}` : `${p.done} média(s) envoyé(s) chez ${partner.name} › « ${dest.trim()} » ✓`, p.failed ? 'bad' : 'ok', 7000)
    if (!p.failed) onClose()
    else setProg(null)
  }
  return (
    <Modal theme={theme} title={`Envoyer ${ids.length} média(s) vers ${partner.name}`} sub="Choisis son dossier (existant ou nouveau) : les vidéos y sont copiées." icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" onClose={() => { abort.current?.abort(); onClose() }} width={520}
      footer={prog ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <span style={{ flex: 1 }}><Bar p={prog} color={theme.accent} /></span>
          <Btn theme={theme} tone="quiet" label="Arrêter" onClick={() => abort.current?.abort()} />
        </span>
      ) : (
        <>
          <Btn theme={theme} tone="quiet" label="Annuler" onClick={onClose} />
          <Btn theme={theme} tone="primary" label="Envoyer" disabled={!dest.trim()} onClick={() => void send()} />
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={dest} onChange={e => setDest(e.target.value)} list="sf-partner-folders" placeholder="Dossier chez le partenaire" disabled={!!prog} style={FIELD} />
        <datalist id="sf-partner-folders">{theirs.map(n => <option key={n} value={n} />)}</datalist>
        {theirs.length > 0 && (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {theirs.slice(0, 12).map(n => (
              <button key={n} type="button" disabled={!!prog} onClick={() => setDest(n)} data-no-tr style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, cursor: 'pointer', color: dest === n ? '#0A0A0B' : '#D4D4D8', background: dest === n ? '#E4E4E7' : '#18181B', border: '1px solid rgba(255,255,255,0.1)' }}>{n}</button>
            ))}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>Son site télécharge chaque vidéo (lien valable 24 h) et la range dans ce dossier. Rien n’est retiré de ta banque.</span>
      </div>
    </Modal>
  )
}
