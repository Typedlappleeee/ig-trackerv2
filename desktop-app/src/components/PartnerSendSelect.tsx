// « Envoyer direct vers » : dans les outils de montage, chaque vidéo terminée part tout de suite
// dans un dossier du site partenaire (ex. Staff), en plus de la copie dans ma banque.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { promptDialog } from '@/lib/ui'
import { cachedPartner, partnerFolders, sendOneToPartner, type Partner } from '@/lib/scaleflowLink'

export interface PartnerSend {
  partner: Partner | null
  folder: string                 // '' = pas d'envoi
  setFolder: (f: string) => void
  theirs: string[]
  // À appeler après chaque montage enregistré : l'envoi part tout de suite (sans bloquer la suite).
  queue: (id: string | null, title: string, log: (m: string) => void) => void
  // À attendre en fin de lot : renvoie le nombre d'envois réussis / échoués.
  flush: () => Promise<{ ok: number; failed: number }>
}

export function usePartnerSend(orgId: string | null, storeKey: string): PartnerSend {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [folder, setFolderState] = useState<string>(() => { try { return localStorage.getItem(storeKey) ?? '' } catch { return '' } })
  const [theirs, setTheirs] = useState<string[]>([])
  const pending = useRef<Promise<boolean>[]>([])
  useEffect(() => {
    let alive = true
    cachedPartner(orgId).then(p => {
      if (!alive) return
      setPartner(p)
      if (p) partnerFolders(orgId).then(r => { if (alive) setTheirs(r.folders.map(f => f.name)) }).catch(() => {})
    })
    return () => { alive = false }
  }, [orgId])
  const setFolder = (f: string) => { setFolderState(f); try { localStorage.setItem(storeKey, f) } catch { /* ignore */ } }
  const target = partner ? folder : ''
  return {
    partner, folder: target, setFolder, theirs,
    queue(id, title, log) {
      if (!id || !partner || !target) return
      const name = partner.name, dest = target
      pending.current.push(sendOneToPartner(orgId, id, dest).then(r => {
        log(r.ok ? `📤 « ${title} » envoyé chez ${name} › ${dest} (${(r.ms / 1000).toFixed(1)} s)` : `⚠ envoi chez ${name} échoué : ${r.error}`)
        return r.ok
      }))
    },
    async flush() {
      const all = await Promise.all(pending.current)
      pending.current = []
      return { ok: all.filter(Boolean).length, failed: all.filter(x => !x).length }
    },
  }
}

export function PartnerSendSelect({ ps, style, optStyle }: { ps: PartnerSend; style?: CSSProperties; optStyle?: CSSProperties }) {
  if (!ps.partner) return null
  const name = ps.partner.name
  const list = [...new Set([...ps.theirs, ...(ps.folder ? [ps.folder] : [])])]
  return (
    <select value={ps.folder} style={style} onChange={async e => {
      const v = e.target.value
      if (v !== '__new__') { ps.setFolder(v); return }
      const n = await promptDialog({ title: `Nouveau dossier chez ${name}`, placeholder: 'ex. Montages prêts', confirmLabel: 'Choisir' })
      if (n && n.trim()) ps.setFolder(n.trim().slice(0, 120))
    }}>
      <option value="" style={optStyle}>Non — seulement ma banque</option>
      {list.map(f => <option key={f} value={f} style={optStyle}>{`${name} › ${f}`}</option>)}
      <option value="__new__" style={optStyle}>{`${name} › nouveau dossier…`}</option>
    </select>
  )
}
