// Options d'un <select> « Enregistrer dans » commun à tous les outils (Studio, Genjutsu, Blowsome, téléchargeur
// Insta, spoof en copies…) : favoris, puis la Banque principale, puis CHAQUE modèle avec ses dossiers — on peut donc
// ranger un contenu directement dans la banque d'une modèle.
import { useEffect, useState, type CSSProperties } from 'react'
import { loadBankModels, type BankScope } from '@/lib/bankFolders'
import { groupFolders } from '@/lib/bankSpaces'

const nice = (p: string) => p.split('/').join(' › ')

/** Modèles de la Banque (chargées une fois par espace). */
export function useBankModels(scope: BankScope): string[] {
  const [models, setModels] = useState<string[]>([])
  useEffect(() => { let a = true; void loadBankModels(scope).then(m => { if (a) setModels(m) }).catch(() => undefined); return () => { a = false } }, [scope.orgId, scope.userId]) // eslint-disable-line react-hooks/exhaustive-deps
  return models
}

export function BankFolderOptions({ folders, models, favs = [], optStyle }: { folders: string[]; models: string[]; favs?: string[]; optStyle?: CSSProperties }) {
  const f = favs.filter(x => folders.includes(x))
  return <>
    {f.length > 0 && <optgroup label="★ Favoris" style={optStyle}>{f.map(x => <option key={`fav-${x}`} value={x} style={optStyle} data-no-tr>{`★ ${nice(x)}`}</option>)}</optgroup>}
    {groupFolders(folders, models).map(g => (
      <optgroup key={g.label} label={g.label} style={optStyle}>
        {g.paths.map(x => <option key={x} value={x} style={optStyle} data-no-tr>{nice(x)}</option>)}
      </optgroup>
    ))}
  </>
}
