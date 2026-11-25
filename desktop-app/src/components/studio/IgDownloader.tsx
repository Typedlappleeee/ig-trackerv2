// Studio › Téléchargeur Insta : liens de Reels / posts (un par ligne) → vidéos .mp4 et photos .jpg rangées
// dans un dossier de la Banque, visibles tout de suite (bouton « Voir dans la Banque ») et ajoutées aux
// résultats du Studio (aperçu, téléchargement sur l'ordinateur).
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Btn, Panel, PanelHead, FIELD, toast } from '@/lib/ui'
import { openTool } from '@/lib/openTool'
import { downloadIgPost, igLinksFrom, igCodeFromLink } from '@/lib/igLink'
import { supabase } from '@/lib/supabase'
import { saveOutputToBank } from '@/lib/studioTools'
import type { StudioResult } from './Results'
import { listBankFolders } from '@/lib/bankFolders'
import { BankFolderOptions, useBankModels } from '@/components/BankFolderOptions'

type Row = { link: string; state: 'wait' | 'run' | 'ok' | 'err'; msg?: string; n?: number }

const DEFAULT_FOLDER = 'Téléchargements Insta'

export function IgDownloader({ theme, user, org, onNavigate, addResult }: {
  theme: Theme; user: User; org: OrgState; onNavigate?: (p: string) => void; addResult: (r: StudioResult) => void
}) {
  const [text, setText] = useState('')
  // Destination choisie SÉPARÉMENT pour les Reels (vidéos) et pour les photos — reprend l'ancien réglage
  // « dossier + sous-dossiers Reels/Photos » au premier affichage
  const initDest = (kind: 'Reels' | 'Photos') => {
    try {
      const v = localStorage.getItem(kind === 'Reels' ? 'sf-igdl-reels' : 'sf-igdl-photos')
      if (v != null) return v
      const old = localStorage.getItem('sf-igdl-folder') ?? DEFAULT_FOLDER
      return localStorage.getItem('sf-igdl-split') === '0' ? old : (old ? `${old}/${kind}` : kind)
    } catch { return `${DEFAULT_FOLDER}/${kind}` }
  }
  const [reelsDest, setReelsDest] = useState(() => initDest('Reels'))
  const [photosDest, setPhotosDest] = useState(() => initDest('Photos'))
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const links = igLinksFrom(text)
  const orgId = org.currentOrg?.id ?? null
  // dossiers existants de la Banque (sous-dossiers compris)
  const [folders, setFolders] = useState<string[]>([])
  const bankModels = useBankModels({ orgId, userId: user.id })
  useEffect(() => {
    let alive = true
    void listBankFolders({ orgId, userId: user.id }).then(l => {
      if (!alive) return
      setFolders([...new Set(l)].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })))
    }, () => undefined)
    return () => { alive = false }
  }, [orgId, user.id])
  const options = [...new Set([`${DEFAULT_FOLDER}/Reels`, `${DEFAULT_FOLDER}/Photos`, ...folders, ...[reelsDest, photosDest].map(f => f.trim()).filter(Boolean)])]

  const run = async () => {
    if (busy || !links.length) return
    const rDest = reelsDest.trim() || null, pDest = photosDest.trim() || null
    try { localStorage.setItem('sf-igdl-reels', reelsDest.trim()); localStorage.setItem('sf-igdl-photos', photosDest.trim()) } catch { /* noop */ }
    setBusy(true)
    const list: Row[] = links.map(link => ({ link, state: 'wait' }))
    setRows(list)
    const set = (i: number, r: Partial<Row>) => setRows(rs => rs.map((x, k) => k === i ? { ...x, ...r } : x))
    let saved = 0
    for (let i = 0; i < list.length; i++) {
      set(i, { state: 'run' })
      try {
        // Anti-doublon : un lien déjà téléchargé dans les 30 derniers jours (fichier « Insta <code> » encore dans la
        // Banque de l'espace, toute l'équipe confondue) n'est pas retéléchargé
        const code = igCodeFromLink(list[i].link)
        if (code) {
          const since = new Date(Date.now() - 30 * 864e5).toISOString()
          const like = `Insta ${code.replace(/[\\%_]/g, m => `\\${m}`)}%`
          let q = supabase.from('content_bank').select('id').ilike('title', like).gte('created_at', since).is('deleted_at', null).limit(1)
          q = orgId ? q.eq('org_id', orgId) : q.eq('user_id', user.id).is('org_id', null)
          const { data: dup } = await q
          if ((dup ?? []).length) { set(i, { state: 'err', msg: 'déjà téléchargé ces 30 derniers jours (doublon évité)' }); continue }
        }
        const post = await downloadIgPost(list[i].link)
        const base = `Insta ${post.code}`
        let n = 0
        for (const f of post.files) {
          const title = post.files.length > 1 ? `${base} (${f.index + 1})` : base
          // vidéo → dossier choisi pour les Reels, photo → dossier choisi pour les photos
          const id = await saveOutputToBank(user.id, orgId, f.bytes, title, f.ext, f.ext === 'mp4' ? rDest : pDest)
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
    if (saved) { toast(`${saved} média(s) rangé(s) dans la Banque.`, 'ok'); setText('') }
  }

  const openBank = () => { if (onNavigate) openTool(onNavigate, 'bank', { folder: reelsDest.trim() || undefined }) }

  return (
    <Panel theme={theme} style={{ marginTop: 16 }}>
      <PanelHead title="⬇ Téléchargeur Insta" sub="Colle des liens de Reels ou de posts photo (un par ligne) : choisis le dossier de la Banque où vont les Reels et celui où vont les photos." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} disabled={busy} rows={5}
          placeholder={'https://www.instagram.com/reel/…\nhttps://www.instagram.com/p/…'}
          style={{ ...FIELD, height: 'auto', minHeight: 110, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <DestSelect label="🎬 Reels →" value={reelsDest} onChange={setReelsDest} options={options} models={bankModels} disabled={busy} />
          <DestSelect label="🖼 Photos →" value={photosDest} onChange={setPhotosDest} options={options} models={bankModels} disabled={busy} />
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

/** Choix d'un dossier de la Banque (dossiers existants, banques des modèles, ou nouveau dossier tapé). */
function DestSelect({ label, value, onChange, options, models, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; models: ReturnType<typeof useBankModels>; disabled: boolean
}) {
  const [custom, setCustom] = useState(false)
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#A1A1AA' }}>
      {label}
      {custom
        ? <input autoFocus value={value} onChange={e => onChange(e.target.value)} onBlur={() => setCustom(false)} disabled={disabled} placeholder="Nom du nouveau dossier" style={{ ...FIELD, width: 220 }} />
        : <select value={value.trim()} disabled={disabled} onChange={e => { if (e.target.value === '__new__') { onChange(''); setCustom(true) } else onChange(e.target.value) }} style={{ ...FIELD, width: 240 }}>
            <BankFolderOptions folders={options} models={models} />
            <option value="__new__">+ Nouveau dossier…</option>
          </select>}
    </label>
  )
}
