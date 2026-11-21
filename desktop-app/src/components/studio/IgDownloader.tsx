// Studio › Téléchargeur Insta : liens de Reels / posts (un par ligne) → vidéos .mp4 et photos .jpg rangées
// dans un dossier de la Banque, visibles tout de suite (bouton « Voir dans la Banque ») et ajoutées aux
// résultats du Studio (aperçu, téléchargement sur l'ordinateur).
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Btn, Panel, PanelHead, FIELD, toast } from '@/lib/ui'
import { openTool } from '@/lib/openTool'
import { downloadIgPost, igLinksFrom } from '@/lib/igLink'
import { saveOutputToBank } from '@/lib/studioTools'
import type { StudioResult } from './Results'

type Row = { link: string; state: 'wait' | 'run' | 'ok' | 'err'; msg?: string; n?: number }

const DEFAULT_FOLDER = 'Téléchargements Insta'

export function IgDownloader({ theme, user, org, onNavigate, addResult }: {
  theme: Theme; user: User; org: OrgState; onNavigate?: (p: string) => void; addResult: (r: StudioResult) => void
}) {
  const [text, setText] = useState('')
  const [folder, setFolder] = useState(() => { try { return localStorage.getItem('sf-igdl-folder') ?? DEFAULT_FOLDER } catch { return DEFAULT_FOLDER } })
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const links = igLinksFrom(text)
  const orgId = org.currentOrg?.id ?? null

  const run = async () => {
    if (busy || !links.length) return
    const dest = folder.trim() || null
    try { localStorage.setItem('sf-igdl-folder', folder.trim()) } catch { /* noop */ }
    setBusy(true)
    const list: Row[] = links.map(link => ({ link, state: 'wait' }))
    setRows(list)
    const set = (i: number, r: Partial<Row>) => setRows(rs => rs.map((x, k) => k === i ? { ...x, ...r } : x))
    let saved = 0
    for (let i = 0; i < list.length; i++) {
      set(i, { state: 'run' })
      try {
        const post = await downloadIgPost(list[i].link)
        const base = `Insta ${post.code}`
        let n = 0
        for (const f of post.files) {
          const title = post.files.length > 1 ? `${base} (${f.index + 1})` : base
          const id = await saveOutputToBank(user.id, orgId, f.bytes, title, f.ext, dest)
          if (!id) throw new Error('enregistrement dans la Banque refusé')
          const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.ext === 'mp4' ? 'video/mp4' : 'image/jpeg' }))
          addResult({ id, title, url, ext: f.ext, tool: 'igdl', at: Date.now() })
          n++
        }
        saved += n
        set(i, { state: 'ok', n, msg: post.files[0]?.ext === 'mp4' ? 'vidéo' : n > 1 ? `${n} photos` : 'photo' })
      } catch (e) {
        set(i, { state: 'err', msg: e instanceof Error ? e.message : String(e) })
      }
    }
    setBusy(false)
    if (saved) { toast(`${saved} média(s) rangé(s) dans la Banque${dest ? ` › ${dest}` : ''}.`, 'ok'); setText('') }
  }

  const openBank = () => { if (onNavigate) openTool(onNavigate, 'bank', { folder: folder.trim() || undefined }) }

  return (
    <Panel theme={theme} style={{ marginTop: 16 }}>
      <PanelHead title="⬇ Téléchargeur Insta" sub="Colle des liens de Reels ou de posts photo (un par ligne) : la vidéo ou les photos arrivent directement dans ta Banque." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} disabled={busy} rows={5}
          placeholder={'https://www.instagram.com/reel/…\nhttps://www.instagram.com/p/…'}
          style={{ ...FIELD, height: 'auto', minHeight: 110, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#A1A1AA' }}>
            Dossier de la Banque
            <input value={folder} onChange={e => setFolder(e.target.value)} disabled={busy} placeholder="(aucun dossier)" style={{ ...FIELD, width: 220 }} />
          </label>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: '#7C7C86' }}>{links.length ? `${links.length} lien(s) reconnu(s)` : 'Aucun lien reconnu'}</span>
            {onNavigate && <Btn theme={theme} label="Voir dans la Banque" onClick={openBank} />}
            <Btn theme={theme} tone="primary" label={busy ? 'Téléchargement…' : `Télécharger${links.length > 1 ? ` (${links.length})` : ''}`} disabled={busy || !links.length} onClick={() => void run()} />
          </span>
        </div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: '#111113', border: `1px solid ${r.state === 'err' ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.06)'}`, fontSize: 12.5 }}>
                <span style={{ width: 18, textAlign: 'center' }}>{r.state === 'ok' ? '✅' : r.state === 'err' ? '⚠' : r.state === 'run' ? '⏳' : '·'}</span>
                <span data-no-tr style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#D4D4D8' }}>{r.link}</span>
                <span style={{ color: r.state === 'err' ? '#F87171' : '#A1A1AA', whiteSpace: 'nowrap' }}>{r.state === 'ok' ? `${r.msg} → Banque` : r.state === 'err' ? r.msg : r.state === 'run' ? 'en cours…' : 'en attente'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
