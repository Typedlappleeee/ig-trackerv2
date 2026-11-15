// DuoPlus : téléphones virtuels Android pilotés par l'API DuoPlus (réservé à l'accès Blowsome).
// Étape 1 : clé de l'espace (gardée sur le serveur), liste des téléphones, allumer / éteindre,
// commande ADB de test (propriétaire / admin). La publication automatique viendra ensuite.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Btn, Chip, Panel, PanelHead, FIELD, SkeletonRows, Empty, toast, confirmDialog, useNarrow } from '@/lib/ui'
import { PageHeader } from '@/components/Kit'
import { duoStatus, duoSetKey, duoDelKey, duoPhones, duoPower, duoCommand, duoState, canPowerOn, canPowerOff, areaName, type DuoPhone, type DuoError } from '@/lib/duoplus'

const PHONE_ICON = 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01'
const TONE = { on: 'ok', off: 'mute', busy: 'warn', bad: 'bad' } as const

export default function DuoPlus({ theme, org }: { theme: Theme; user: User; org: OrgState }) {
  const orgId = org.currentOrg?.id ?? null
  const narrow = useNarrow(760)
  const [state, setState] = useState<'loading' | 'nokey' | 'ok' | 'nosql' | 'error'>('loading')
  const [manager, setManager] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [phones, setPhones] = useState<DuoPhone[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [changing, setChanging] = useState(false)
  const [cmdPhone, setCmdPhone] = useState('')
  const [cmd, setCmd] = useState('getprop ro.build.version.release')
  const [cmdOut, setCmdOut] = useState<string | null>(null)

  const loadPhones = useCallback(async (quiet = false) => {
    if (!quiet) setPhones(null)
    try { const l = await duoPhones(orgId); setPhones(l); setSel(s => new Set([...s].filter(id => l.some(p => p.id === id)))) }
    catch (e) { const d = e as DuoError; if (d.nokey) setState('nokey'); else { setErr(d.message); if (!quiet) setPhones([]) } }
  }, [orgId])
  const load = useCallback(async () => {
    setState('loading'); setErr(null)
    try {
      const s = await duoStatus(orgId)
      setManager(s.manager)
      if (!s.configured) { setState('nokey'); return }
      setState('ok'); void loadPhones()
    } catch (e) { const d = e as DuoError; setErr(d.message); setState(d.nosql ? 'nosql' : 'error') }
  }, [orgId, loadPhones])
  useEffect(() => { void load() }, [load])
  // pendant un démarrage, on relit l'état toutes les 8 s
  useEffect(() => {
    if (!phones?.some(p => p.status === 10 || p.status === 11)) return
    const t = setTimeout(() => void loadPhones(true), 8000)
    return () => clearTimeout(t)
  }, [phones, loadPhones])

  async function saveKey() {
    setBusy(true)
    try {
      const r = await duoSetKey(orgId, keyInput.trim())
      setKeyInput(''); setChanging(false); setPhones(r.phones); setState('ok')
      toast(`Clé enregistrée : ${r.phones.length} téléphone(s) trouvé(s)`, 'ok')
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad', 7000) }
    finally { setBusy(false) }
  }
  async function removeKey() {
    if (!await confirmDialog({ title: 'Retirer la clé DuoPlus ?', text: 'Les téléphones DuoPlus ne seront plus visibles dans ScaleFlow pour cet espace. Ils restent sur ton compte DuoPlus.', confirmLabel: 'Retirer', danger: true })) return
    try { await duoDelKey(orgId); setPhones(null); setState('nokey'); toast('Clé retirée', 'ok') }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
  }
  async function power(ids: string[], on: boolean) {
    if (!ids.length) return
    if (on && !await confirmDialog({ title: `Allumer ${ids.length} téléphone(s) ?`, text: 'Un téléphone allumé consomme du temps chez DuoPlus. Pense à l’éteindre quand tu as fini.', confirmLabel: 'Allumer' })) return
    setBusy(true)
    try {
      const r = await duoPower(orgId, ids, on)
      if (r.fail.length) toast(`${r.fail.length} refusé(s) : ${r.fail.map(f => f.error).filter(Boolean)[0] ?? 'DuoPlus a refusé'}`, 'bad', 7000)
      else toast(on ? `Démarrage demandé (${r.success.length})` : `Extinction demandée (${r.success.length})`, 'ok')
      setPhones(l => l && l.map(p => r.success.includes(p.id) ? { ...p, status: on ? 10 : 2 } : p))
      setTimeout(() => void loadPhones(true), 4000)
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
    finally { setBusy(false) }
  }
  async function runCmd() {
    setBusy(true); setCmdOut(null)
    try { setCmdOut((await duoCommand(orgId, cmdPhone, cmd)).output || '(aucune sortie)') }
    catch (e) { setCmdOut(`Erreur : ${e instanceof Error ? e.message : String(e)}`) }
    finally { setBusy(false) }
  }

  const list = phones ?? []
  const selected = list.filter(p => sel.has(p.id))
  const onCount = list.filter(p => p.status === 1).length
  const usable = useMemo(() => list.filter(p => p.status === 1), [list])
  useEffect(() => { if (!usable.some(p => p.id === cmdPhone)) setCmdPhone(usable[0]?.id ?? '') }, [usable, cmdPhone])
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const keyForm = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 20px 20px' }}>
      <p style={{ margin: 0, fontSize: 13.5, color: '#A1A1AA', lineHeight: 1.55 }}>
        Dans DuoPlus : menu <b>Automatisation → API</b>, copie la clé, colle-la ici. Elle est gardée sur le serveur de ScaleFlow et n’est jamais renvoyée au navigateur.
      </p>
      {manager ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="password" autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Clé API DuoPlus" style={{ ...FIELD, flex: '1 1 260px' }} data-no-tr />
          <Btn theme={theme} tone="primary" label={busy ? 'Vérification…' : 'Enregistrer'} disabled={busy || keyInput.trim().length < 16} onClick={() => void saveKey()} />
          {changing && <Btn theme={theme} label="Annuler" onClick={() => setChanging(false)} />}
        </div>
      ) : <Chip tone="warn" text="Seuls le propriétaire et les admins de l’espace peuvent enregistrer la clé." />}
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader kicker="Blowsome" title="DuoPlus" sub="Tes téléphones virtuels DuoPlus : allume, éteins et contrôle-les depuis ScaleFlow."
        actions={state === 'ok' ? <div style={{ display: 'flex', gap: 8 }}>
          <Btn theme={theme} sm label="Actualiser" onClick={() => void loadPhones()} />
          {manager && <Btn theme={theme} sm tone="quiet" label="Changer la clé" onClick={() => setChanging(c => !c)} />}
        </div> : undefined} />

      {state === 'loading' && <Panel theme={theme}><SkeletonRows rows={4} avatar /></Panel>}
      {state === 'nosql' && <Panel theme={theme}><Empty icon={PHONE_ICON} title="Base de données à mettre à jour" text={<>Passe le fichier <code>supabase/migrations/20261115_duoplus.sql</code> dans Supabase (SQL Editor → Run), puis recharge.</>} action={<Btn theme={theme} label="Réessayer" onClick={() => void load()} />} /></Panel>}
      {state === 'error' && <Panel theme={theme}><Empty icon={PHONE_ICON} title="DuoPlus indisponible" text={<span data-no-tr>{err}</span>} action={<Btn theme={theme} label="Réessayer" onClick={() => void load()} />} /></Panel>}
      {(state === 'nokey' || changing) && <Panel theme={theme} style={{ marginBottom: 16 }}><PanelHead title={changing ? 'Changer la clé DuoPlus' : 'Relier ton compte DuoPlus'} />{keyForm}</Panel>}

      {state === 'ok' && (
        <>
          <Panel theme={theme} style={{ marginBottom: 16 }}>
            <PanelHead title="Téléphones" sub={phones ? `${list.length} au total · ${onCount} allumé(s)` : undefined}
              right={selected.length ? <div style={{ display: 'flex', gap: 8 }}>
                <Btn theme={theme} sm tone="primary" label={`Allumer (${selected.filter(canPowerOn).length})`} disabled={busy || !selected.some(canPowerOn)} onClick={() => void power(selected.filter(canPowerOn).map(p => p.id), true)} />
                <Btn theme={theme} sm label={`Éteindre (${selected.filter(canPowerOff).length})`} disabled={busy || !selected.some(canPowerOff)} onClick={() => void power(selected.filter(canPowerOff).map(p => p.id), false)} />
              </div> : undefined} />
            {phones === null ? <SkeletonRows rows={4} avatar />
              : !list.length ? <Empty icon={PHONE_ICON} title="Aucun téléphone" text={err ? <span data-no-tr>{err}</span> : 'Ce compte DuoPlus n’a aucun téléphone.'} />
              : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', fontSize: 12.5, color: '#7C7C86', borderTop: '1px solid rgba(255,255,255,.05)' }}>
                    <input type="checkbox" checked={sel.size === list.length} onChange={e => setSel(e.target.checked ? new Set(list.map(p => p.id)) : new Set())} /> Tout sélectionner
                  </label>
                  {list.map(p => {
                    const st = duoState(p.status)
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.05)', flexWrap: narrow ? 'wrap' : 'nowrap' }}>
                        <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.name}`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div data-no-tr style={{ fontSize: 14, fontWeight: 600, color: '#F4F4F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.id}</div>
                          <div style={{ fontSize: 12, color: '#7C7C86', marginTop: 2 }}><span data-no-tr>{p.os}</span> · <span data-no-tr>{areaName(p.area)}</span>{p.expires ? <> · expire le {new Date(p.expires * 1000).toLocaleDateString()}</> : null}</div>
                        </div>
                        <Chip tone={TONE[st.tone]} text={st.label} />
                        {canPowerOn(p) && <Btn theme={theme} sm label="Allumer" disabled={busy} onClick={() => void power([p.id], true)} />}
                        {canPowerOff(p) && <Btn theme={theme} sm label="Éteindre" disabled={busy} onClick={() => void power([p.id], false)} />}
                      </div>
                    )
                  })}
                </div>
              )}
          </Panel>

          {manager && (
            <Panel theme={theme} style={{ marginBottom: 16 }}>
              <PanelHead title="Commande ADB (test)" sub="Envoie une commande shell à un téléphone allumé. 10 secondes maximum." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 20px 20px' }}>
                {!usable.length ? <span style={{ fontSize: 13, color: '#7C7C86' }}>Allume un téléphone pour tester une commande.</span> : (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <select value={cmdPhone} onChange={e => setCmdPhone(e.target.value)} style={{ ...FIELD, flex: '0 1 200px' }} data-no-tr>
                        {usable.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                      </select>
                      <input value={cmd} onChange={e => setCmd(e.target.value)} style={{ ...FIELD, flex: '1 1 260px', fontFamily: 'JetBrains Mono, monospace' }} data-no-tr />
                      <Btn theme={theme} tone="primary" label="Envoyer" disabled={busy || !cmd.trim() || !cmdPhone} onClick={() => void runCmd()} />
                    </div>
                    {cmdOut !== null && <pre data-no-tr style={{ margin: 0, padding: 12, borderRadius: 10, background: '#0A0A0B', color: '#D4D4D8', fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{cmdOut}</pre>}
                  </>
                )}
              </div>
            </Panel>
          )}

          {manager && <div style={{ textAlign: 'right' }}><Btn theme={theme} sm tone="quiet" label="Retirer la clé DuoPlus" onClick={() => void removeKey()} /></div>}
        </>
      )}
    </div>
  )
}
