// DuoPlus › Créer des comptes Instagram : sur chaque téléphone coché (Instagram déconnecté), un numéro
// US acheté sur SMSPool, le code SMS saisi tout seul, puis mot de passe, date de naissance, nom et
// pseudo proposé par Instagram. Les identifiants sont gardés sur ce PC (liste « Comptes créés »).
import { useEffect, useRef, useState } from 'react'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Btn, Chip, Panel, PanelHead, FIELD, toast } from '@/lib/ui'
import { startRun } from '@/lib/runStore'
import { smspoolBuy, smspoolWaitCode, smspoolCancel, smspoolPing, smspoolPrice } from '@/lib/smspool'
import { addCreatedAccount, loadCreatedAccounts, type CreatedAccount } from '@/lib/irtCreatedAccounts'
import { createAccount, intlPhone, StopError } from '@/lib/duoplusAuto'
import type { DuoPhone } from '@/lib/duoplus'

const US_FIRST = ['Emily', 'Madison', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Abigail', 'Chloe', 'Ella', 'Grace', 'Lily', 'Hannah', 'Avery', 'Harper', 'Riley', 'Zoey', 'Nora', 'Layla', 'Brooklyn', 'Savannah', 'Aubrey', 'Claire', 'Skylar', 'Paige', 'Kayla', 'Jasmine', 'Brianna', 'Sydney', 'Taylor']
const US_LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter']
const FR_FIRST = ['Camille', 'Léa', 'Manon', 'Chloé', 'Sarah', 'Emma', 'Julie', 'Marie', 'Laura', 'Clara', 'Inès', 'Jade', 'Louise', 'Alice', 'Lucie', 'Anaïs', 'Océane', 'Pauline', 'Justine', 'Margaux', 'Célia', 'Zoé', 'Ambre', 'Lina', 'Nina', 'Romane', 'Eva', 'Lola']
const FR_LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Michel', 'Garcia', 'Roux', 'Fontaine', 'Girard', 'Bonnet', 'Dupont', 'Lambert', 'Fournier', 'Rousseau', 'Vincent', 'Faure', 'Mercier', 'Blanc', 'Garnier', 'Chevalier']
const DE_FIRST = ['Lena', 'Mia', 'Hannah', 'Emma', 'Sophie', 'Lea', 'Anna', 'Marie', 'Laura', 'Lisa', 'Julia', 'Sarah', 'Lara', 'Nele', 'Jana', 'Luisa', 'Paula', 'Clara', 'Emilia', 'Maja']
const DE_LAST = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Braun', 'Zimmermann', 'Krüger', 'Hartmann']
// Pays du numéro : il doit correspondre au pays du proxy du téléphone (sinon Instagram bloque à l'étape du nom).
export const SIGNUP_COUNTRIES = {
  us: { label: '🇺🇸 États-Unis', smspool: 'United States', dial: '1', first: US_FIRST, last: US_LAST },
  fr: { label: '🇫🇷 France', smspool: 'France', dial: '33', first: FR_FIRST, last: FR_LAST },
  uk: { label: '🇬🇧 Royaume-Uni', smspool: 'United Kingdom', dial: '44', first: US_FIRST, last: US_LAST },
  de: { label: '🇩🇪 Allemagne', smspool: 'Germany', dial: '49', first: DE_FIRST, last: DE_LAST },
} as const
export type SignupCountry = keyof typeof SIGNUP_COUNTRIES
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
export function randomPassword(n = 14): string {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', all = U + L + D
  const p = [pick([...U]), pick([...L]), pick([...D])]
  while (p.length < n) p.push(all[Math.floor(Math.random() * all.length)])
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  return p.join('')
}
// Âge entre 21 et 29 ans
export const randomBirth = (now = new Date()) => ({ y: now.getFullYear() - 21 - Math.floor(Math.random() * 9), m: 1 + Math.floor(Math.random() * 12), d: 1 + Math.floor(Math.random() * 28) })
type Phase = 'wait' | 'run' | 'ok' | 'fail'
interface Job { phone: DuoPhone; phase: Phase; log: string[]; result?: string; error?: string }

export default function DuoAccounts({ theme, org, phones }: { theme: Theme; org: OrgState; phones: DuoPhone[] }) {
  const orgId = org.currentOrg?.id ?? null
  const [key, setKeyState] = useState(() => { try { return localStorage.getItem('sf-smspool-key') ?? '' } catch { return '' } })
  const setKey = (v: string) => { setKeyState(v); try { localStorage.setItem('sf-smspool-key', v) } catch { /* bloqué */ } }
  const [country, setCountryState] = useState<SignupCountry>(() => { try { const v = localStorage.getItem('sf-duo-signup-country'); return v && v in SIGNUP_COUNTRIES ? v as SignupCountry : 'us' } catch { return 'us' } })
  const setCountry = (v: SignupCountry) => { setCountryState(v); setPrice(null); try { localStorage.setItem('sf-duo-signup-country', v) } catch { /* bloqué */ } }
  const [price, setPrice] = useState<string | null>(null)
  const [maxPrice, setMaxPrice] = useState('2')
  const [balance, setBalance] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [running, setRunning] = useState(false)
  const [made, setMade] = useState<CreatedAccount[]>(() => loadCreatedAccounts().filter(a => a.container === 'DuoPlus'))
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const ready = phones.filter(p => p.status === 1)
  const blocker = !key.trim() ? 'Colle ta clé SMSPool' : !phones.length ? 'Coche des téléphones dans la liste au-dessus' : !ready.length ? 'Allume les téléphones cochés' : null

  async function check() {
    const r = await smspoolPing(key.trim())
    setBalance(r.ok ? `solde : ${r.balance?.toFixed(2)} $` : `clé refusée : ${r.error}`)
    if (r.ok) { const p = await smspoolPrice(key.trim(), SIGNUP_COUNTRIES[country].smspool).catch(() => null); setPrice(p != null ? `numéro ${SIGNUP_COUNTRIES[country].label} : ${p.toFixed(2)} $` : 'aucun numéro disponible pour ce pays') }
  }
  async function launch() {
    if (blocker || running) return
    const k = key.trim(), max = Number(maxPrice.replace(',', '.')), C = SIGNUP_COUNTRIES[country]
    const list: Job[] = ready.map(phone => ({ phone, phase: 'wait', log: [] }))
    setJobs(list); setRunning(true)
    const R = startRun('auto', `${list.length} compte(s) Instagram DuoPlus`, list.length)
    const set = (id: string, p: Partial<Job> | ((j: Job) => Partial<Job>)) => { if (alive.current) setJobs(l => l.map(x => x.phone.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)) }
    await Promise.all(list.map(async it => {
      const id = it.phone.id, logs: string[] = []
      const log = (m: string) => { logs.push(m); set(id, j => ({ log: [...j.log, m].slice(-30) })) }
      set(id, { phase: 'run' })
      const fullName = `${pick(C.first)} ${pick(C.last)}`, password = randomPassword()
      let phone = '', price: number | undefined
      try {
        const r = await createAccount({ orgId, phone: id, log, shouldStop: () => R.isCancelled() }, { fullName, password, birth: randomBirth() }, {
          buy: async () => { const o = await smspoolBuy(k, { country: C.smspool, service: 'Instagram', maxPrice: Number.isFinite(max) && max > 0 ? max : undefined, onLog: log }); phone = intlPhone(o.phone, C.dial); price = o.price; return { id: o.id, phone } },
          waitCode: (oid) => smspoolWaitCode(k, oid, { onLog: log, shouldStop: () => R.isCancelled(), maxMs: 4 * 60_000 }),
          cancel: (oid) => smspoolCancel(k, oid),
        })
        const acc: CreatedAccount = { at: Date.now(), device: id, deviceName: it.phone.name, container: 'DuoPlus', username: r.username, password, fullName, phone: r.phone, provider: 'SMSPool', price, country: C.smspool, ok: true, log: logs }
        addCreatedAccount(acc); if (alive.current) setMade(m => [acc, ...m])
        set(id, { phase: 'ok', result: `@${r.username}` }); R.tick(true)
      } catch (e) {
        if (phone) addCreatedAccount({ at: Date.now(), device: id, deviceName: it.phone.name, container: 'DuoPlus', fullName, password, phone, provider: 'SMSPool', price, country: C.smspool, ok: false, log: logs })
        set(id, { phase: 'fail', error: e instanceof StopError ? 'Annulé' : e instanceof Error ? e.message : String(e) }); R.tick(false)
      }
    }))
    R.finish()
    if (alive.current) { setRunning(false); toast('Création terminée', 'ok') }
  }
  const tone = (p: Phase) => p === 'ok' ? 'ok' : p === 'fail' ? 'bad' : p === 'wait' ? 'mute' : 'violet'
  const label = (p: Phase) => ({ wait: 'En attente', run: 'En cours…', ok: 'Créé', fail: 'Échec' })[p]

  return (
    <Panel theme={theme} style={{ marginBottom: 16 }}>
      <PanelHead title="Créer des comptes Instagram" sub="Sur chaque téléphone coché et allumé, avec Instagram déconnecté : numéro SMSPool du pays choisi, code SMS saisi tout seul." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 20px 20px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="password" autoComplete="off" value={key} disabled={running} onChange={e => setKey(e.target.value.trim())} placeholder="Clé API SMSPool" style={{ ...FIELD, flex: '1 1 240px' }} data-no-tr />
          <Btn theme={theme} sm label="Vérifier" disabled={!key.trim() || running} onClick={() => void check()} />
          {balance && <span data-no-tr style={{ fontSize: 12.5, color: '#A1A1AA' }}>{balance}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: '#A1A1AA' }}>
          Pays du numéro (le même que le proxy du téléphone)
          <select value={country} disabled={running} onChange={e => setCountry(e.target.value as SignupCountry)} style={{ ...FIELD, width: 180 }}>
            {(Object.keys(SIGNUP_COUNTRIES) as SignupCountry[]).map(c => <option key={c} value={c}>{SIGNUP_COUNTRIES[c].label}</option>)}
          </select>
          {price && <span data-no-tr>{price}</span>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#A1A1AA' }}>
          Prix maximum d’un numéro ($)
          <input value={maxPrice} disabled={running} onChange={e => setMaxPrice(e.target.value)} inputMode="decimal" style={{ ...FIELD, width: 90 }} data-no-tr />
        </label>
        <span style={{ fontSize: 12.5, color: '#7C7C86', lineHeight: 1.5 }}>La clé SMSPool reste sur ce PC. Si le SMS n’arrive pas, le numéro est annulé et SMSPool le rembourse. Le pseudo est celui proposé par Instagram (jamais « prénom + chiffres »).</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Btn theme={theme} tone="primary" label={running ? 'En cours…' : `Créer ${ready.length} compte(s)`} disabled={!!blocker || running} onClick={() => void launch()} />
          {blocker && !running && <span style={{ fontSize: 12.5, color: '#7C7C86' }}>{blocker}</span>}
        </div>
        {!!jobs.length && jobs.map(j => (
          <div key={j.phone.id} style={{ border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span data-no-tr style={{ fontSize: 13.5, fontWeight: 600, color: '#F4F4F5', flex: 1, minWidth: 0 }}>{j.phone.name || j.phone.id}{j.result ? ` · ${j.result}` : ''}</span>
              <Chip tone={tone(j.phase)} text={label(j.phase)} />
            </div>
            {j.error && <div data-no-tr style={{ fontSize: 12, color: '#F87171', marginTop: 6 }}>{j.error}</div>}
            {!!j.log.length && <pre data-no-tr style={{ margin: '6px 0 0', fontSize: 11.5, color: '#7C7C86', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'auto' }}>{j.log.slice(-6).join('\n')}</pre>}
          </div>
        ))}
        {!!made.length && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12.5, color: '#A1A1AA' }}>Comptes créés (gardés sur ce PC)</span>
            {made.filter(a => a.ok).slice(0, 30).map(a => (
              <div key={a.at} data-no-tr style={{ display: 'flex', gap: 12, fontSize: 12.5, color: '#E4E4E7', fontFamily: 'JetBrains Mono, monospace', flexWrap: 'wrap' }}>
                <span>@{a.username}</span><span>{a.password}</span><span>+{a.phone}</span><span style={{ color: '#7C7C86' }}>{a.deviceName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
