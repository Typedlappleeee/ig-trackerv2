import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Empty, StatusDot, Panel, PanelHead, PageHead, FIELD, FIELD_SM, TEXTAREA, MONO, Toggle, Segmented, SkeletonRows, useNarrow } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { scopeInfra, phoneLabel, phoneSub } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { warmupAccountNative, loginInstagramOnPhone } from '@/lib/geelark'
import { lines, newBlock, runFlow, useFlowRuns, type Flow } from '@/lib/flowEngine'
import { usernameListIssues } from '@/lib/igRules'
import FlowRunCard from '@/components/FlowRunCard'
import BankPicker from '@/components/BankPicker'
import ComingSoon from '@/components/ComingSoon'
import { isReleased, releaseLabel } from '@/lib/releases'
import { loadProxyRotation, resolveRotationUrls } from '@/lib/proxyRotation'

interface Phone { id: string; ig_username: string | null; phone_name: string; status: string; geelark_id: string | null; group_name: string | null }
function dotKind(status: string): string { return status === 'warming' ? 'warmup' : status }

type RunPhase = 'pending' | 'running' | 'done' | 'failed'
interface RunItem { id: string; name: string; phase: RunPhase; detail?: string }
type WTab = 'login' | 'edit' | 'warm'

// Le flow GeeLark parcourt ≈ 2 vidéos/min, plafonné à 100 vidéos (~50 min) : au-delà,
// une session plus longue serait identique — on ne propose donc que des durées réelles.
const DURATIONS: { v: number; h: string }[] = [
  { v: 15, h: 'échauffement' }, { v: 30, h: 'recommandé' }, { v: 45, h: 'session longue' },
]

export default function Warmup({ theme, infra, user, org, isSuperAdmin }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; isSuperAdmin?: boolean
}) {
  // Édition en masse en maintenance jusqu'à sa date de retour (le super-admin garde l'accès).
  const editLocked = !isReleased('massEdit') && !isSuperAdmin
  const narrow = useNarrow()
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const bearer = conns.bearer
  const [phones, setPhones] = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dur, setDur] = useState(30)
  const [keyword, setKeyword] = useState('')

  // État d'exécution réelle du warmup (GeeLark).
  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [wtab, setWtab] = useState<WTab>('warm')
  const [wgroup, setWgroup] = useState('Tous')
  const [rotationConfigured, setRotationConfigured] = useState(false)
  const [rotationOn, setRotationOn] = useState(false)
  const [edit, setEdit] = useState({ nickname: '', biography: '', linkURL: '', linkTitle: '' })
  // Nom d'utilisateur (@) : un par ligne, attribués dans l'ordre ; {4} = 4 chiffres aléatoires.
  const [usernames, setUsernames] = useState('')
  // Photo(s) de profil depuis la banque : distribuées dans l'ordre aux comptes.
  const [avatarIds, setAvatarIds] = useState<string[]>([])
  const [avatarPicker, setAvatarPicker] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [creds, setCreds] = useState<Record<string, { email: string; password: string; totp: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase.from('phones').select('id,ig_username,phone_name,status,geelark_id,group_name')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q = scopeInfra(q, infra)
    const { data, error: err } = await q
    if (err) { setError('Impossible de charger les téléphones.'); setLoading(false); return }
    setPhones((data ?? []) as Phone[])
    setLoading(false)
  }, [currentOrg?.id, user.id, infra])

  useEffect(() => { load() }, [load])
  // Proxy rotatif dispo ? Par défaut OFF (choix par run, comme les composers).
  useEffect(() => {
    loadProxyRotation(currentOrg?.id ?? null, user.id).then(c => {
      setRotationConfigured(c.enabled && c.urls.some(u => /^https?:\/\//i.test(u.trim())))
      setRotationOn(false)
    })
  }, [currentOrg?.id, user.id])

  // Lancement RÉEL : warmup natif GeeLark, un téléphone après l'autre (les tâches
  // durent longtemps ; le séquentiel évite de saturer le démon shell).
  async function launch() {
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    if (targets.length === 0 || !bearer || running) return
    setRunning(true)
    setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: p.ig_username ?? p.geelark_id ?? p.id, phase: 'pending' as RunPhase })))
    // Nb de vidéos parcourues dérivé de la durée (≈2/min, plafonné à 100).
    const browseVideo = Math.max(1, Math.min(100, Math.round(dur * 2)))
    const pushLog = (m: string) => setLogs(l => [...l.slice(-200), m])
    await loadProxyRotation(currentOrg?.id ?? null, user.id)
    const rotU = resolveRotationUrls(); const rot = (rotationOn && rotU.length) ? rotU : undefined

    for (const p of targets) {
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      pushLog(`— @${p.ig_username ?? p.geelark_id} —`)
      const r = await warmupAccountNative(bearer, p.geelark_id!, { browseVideo, keyword: keyword.trim() || undefined, rotationUrls: rot }, pushLog)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }
    pushLog('✔ Warmup terminé.')
    setRunning(false)
  }

  // Édition de profil en masse (RÉELLE) : exécutée par le MOTEUR DE FLOWS (mêmes blocs
  // que le Flow Builder : @, photo, nom/bio/lien). On hérite ainsi de la remise à zéro
  // d'Instagram entre les étapes, des délais max, de la rotation d'IP, du parallélisme,
  // de l'historique Activité et d'un suivi qui survit au changement de page.
  const EDIT_FLOW_NAME = 'Édition en masse'
  const flowRuns = useFlowRuns()
  const editRuns = flowRuns.filter(r => r.flowName === EDIT_FLOW_NAME)
  const busyKeys = new Set(flowRuns.filter(r => r.status === 'preparing' || r.status === 'running').flatMap(r => r.phones.map(p => p.key)))
  const [editSimul, setEditSimul] = useState<'all' | number>(3)
  const userLines = lines(usernames)
  const hasRpaEdit = !!(edit.nickname.trim() || edit.biography.trim() || edit.linkURL.trim())
  const hasEdit = hasRpaEdit || userLines.length > 0 || avatarIds.length > 0
  function editIssue(n: number): string | null {
    const issues = userLines.length ? usernameListIssues(userLines, n) : []
    return issues[0] ?? null
  }

  async function launchEdit() {
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    if (editLocked || targets.length === 0 || !bearer || !hasEdit) return
    const issue = editIssue(targets.length)
    setEditError(issue)
    if (issue) return
    const busy = targets.filter(p => busyKeys.has(p.id))
    if (busy.length) { setEditError(`${busy.length} compte(s) déjà dans une automatisation en cours — attends la fin ou retire-les.`); return }
    await loadProxyRotation(currentOrg?.id ?? null, user.id)
    const rotU = resolveRotationUrls(); const rot = (rotationOn && rotU.length) ? rotU : undefined

    const blocks = []
    if (userLines.length) { const b = newBlock('username'); b.params.usernames = usernames; b.params.onError = 'continue'; blocks.push(b) }
    if (avatarIds.length) { const b = newBlock('avatar'); Object.assign(b.params, { source: 'pick', imageIds: avatarIds, mode: 'seq', onError: 'continue' }); blocks.push(b) }
    if (hasRpaEdit) {
      const b = newBlock('bio')
      Object.assign(b.params, { names: edit.nickname, bios: edit.biography, bioSingle: true, link: edit.linkURL, linkTitle: edit.linkTitle, mode: 'seq', onError: 'continue' })
      blocks.push(b)
    }
    const flow: Flow = { id: 'mass-edit', name: EDIT_FLOW_NAME, blocks, onError: 'continue' }
    await runFlow({
      bearer, flow,
      targets: targets.map(p => ({ key: p.id, geelarkId: p.geelark_id!, name: phoneLabel(p), username: p.ig_username ?? undefined })),
      creds: {}, concurrency: editSimul === 'all' ? targets.length : editSimul,
      rotationUrls: rot, creditOwnerId: user.id, scope: { orgId: currentOrg?.id ?? null, userId: user.id },
    })
  }

  // Les @ changés (et vérifiés) sont écrits en base par le moteur → on recharge la liste à la fin.
  const editActive = editRuns.some(r => r.status === 'preparing' || r.status === 'running')
  const wasActive = useRef(false)
  useEffect(() => { if (wasActive.current && !editActive) void load(); wasActive.current = editActive }, [editActive, load])

  // Auto-login (RÉEL) : flow RPA login par téléphone, avec les identifiants saisis.
  async function launchLogin() {
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id && (creds[p.id]?.email?.trim() && creds[p.id]?.password?.trim()))
    if (targets.length === 0 || !bearer || running) return
    setRunning(true); setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: phoneLabel(p), phase: 'pending' as RunPhase })))
    const push = (m: string) => setLogs(l => [...l.slice(-200), m])
    await loadProxyRotation(currentOrg?.id ?? null, user.id)
    const rotU = resolveRotationUrls(); const rot = (rotationOn && rotU.length) ? rotU : undefined
    for (const p of targets) {
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      push(`— ${phoneLabel(p)} —`)
      const c = creds[p.id]
      const r = await loginInstagramOnPhone(bearer, p.geelark_id!, { email: c.email.trim(), password: c.password.trim(), totp: c.totp, rotationUrls: rot }, push)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }
    push('✔ Connexions terminées.')
    setRunning(false)
  }

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const nSel = sel.size
  const durLabel = dur < 60 ? `${dur} min` : `${dur / 60} h`
  const groups = ['Tous', ...[...new Set(phones.map(p => p.group_name).filter(Boolean) as string[])].sort()]
  const shownWarm = phones.filter(p => wgroup === 'Tous' || p.group_name === wgroup)

  const TABS: [WTab, string][] = [['login', 'Connexion'], ['edit', isReleased('massEdit') ? 'Édition en masse' : `Édition en masse · ${releaseLabel('massEdit')}`], ['warm', 'Warmup']]
  const subFor: Record<WTab, string> = {
    login: 'Connecte automatiquement tes comptes Instagram sur les appareils (auto-login).',
    edit: 'Édite en masse le profil de tes comptes (nom, bio, lien, photo).',
    warm: "Chauffe tes comptes par sessions de durée fixe. Les appareils s'éteignent à la fin.",
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Automatisations comptes"
        sub={subFor[wtab]}
        actions={wtab === 'warm' ? <Chip text={`${nSel} sélectionnés`} tone="mute" /> : undefined}
      />

      {/* Onglets Connexion / Édition en masse / Warmup */}
      <div style={{ marginBottom: 16 }}>
        <Segmented value={wtab} onChange={setWtab} options={TABS.map(([v, l]) => ({ v, l }))} />
      </div>

      {/* Rotation d'IP proxy — même toggle que les composers (Reels/Story/Photo…). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 12, borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>Rotation d’IP proxy</span>
          <span style={{ fontSize: 12, color: '#8B8B94' }}>{!rotationConfigured ? 'Aucun proxy — configure dans Paramètres → Proxy & rotation' : rotationOn ? 'IP changée avant chaque téléphone (envoi en série)' : 'Désactivée pour ce run'}</span>
        </span>
        <span title={rotationConfigured ? '' : 'Configure d’abord un proxy rotatif dans les Paramètres'}>
          <Toggle on={rotationOn} onChange={setRotationOn} disabled={!rotationConfigured} label="Rotation d’IP proxy" />
        </span>
      </div>

      {wtab !== 'warm' ? (
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '250px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
          {/* Sélecteur de téléphones (partagé) */}
          <Panel theme={theme}>
            <PanelHead title="Téléphones" right={<Btn theme={theme} sm tone="quiet" label="Tout" onClick={() => setSel(new Set(shownWarm.map(p => p.id)))} />} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Groupe</span>
              <select value={wgroup} onChange={e => setWgroup(e.target.value)} style={{ flex: 1, height: 28, padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${wgroup !== 'Tous' ? theme.selEdge : 'rgba(255,255,255,0.09)'}`, background: '#161618', color: wgroup !== 'Tous' ? theme.accentText : '#EDEDEF', fontSize: 12.5, fontWeight: 400, outline: 'none' }}>
                {groups.map(g => <option key={g} value={g} style={{ background: '#161618' }}>{g === 'Tous' ? 'Tous les groupes' : g}</option>)}
              </select>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {shownWarm.map(p => {
                const on = sel.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 40, padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'left', background: on ? 'rgba(255,255,255,0.04)' : 'transparent', boxSizing: 'border-box' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accent : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 11, fontWeight: 600 }}>{on ? '✓' : ''}</span>
                    <StatusDot kind={dotKind(p.status)} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: on ? '#EDEDEF' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                  </button>
                )
              })}
            </div>
          </Panel>

          {/* Config */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {wtab === 'edit' && editLocked ? (
              <Panel theme={theme}>
                <ComingSoon theme={theme} icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" badge={`De retour le ${releaseLabel('massEdit')}`}
                  title="Édition en masse en maintenance"
                  text={<>On améliore l'édition de profil en masse (nom affiché, @username, photo de profil, bio, lien). Elle revient le <b style={{ color: '#EDEDEF', fontWeight: 600 }}>{releaseLabel('massEdit')}</b>.</>} />
              </Panel>
            ) : wtab === 'edit' ? (
              <Panel theme={theme}>
                <PanelHead title="Nouveau profil" sub="Laisse vide ce que tu ne veux pas changer" />
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Nom affiché <span style={{ color: '#71717A', fontWeight: 400 }}>· name</span></span>
                      <input value={edit.nickname} onChange={e => setEdit(v => ({ ...v, nickname: e.target.value }))} placeholder="Léa ✨" style={FIELD} />
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>Le nom en gras sur le profil. Ne touche pas au @.</span>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Nom d'utilisateur <span style={{ color: '#71717A', fontWeight: 400 }}>· @username</span></span>
                      <textarea value={usernames} onChange={e => { setUsernames(e.target.value); setEditError(null) }} rows={2} placeholder={'lea.officiel{4}\nlea_backup'} style={TEXTAREA} />
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>Un par ligne, attribués dans l'ordre. {'{4}'} = 4 chiffres aléatoires.</span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Photo de profil</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Btn theme={theme} sm tone="ghost" icon="M3 5h18v14H3z|M3 16l5-5 4 4 3-3 6 6" label={avatarIds.length ? `${avatarIds.length} photo${avatarIds.length > 1 ? 's' : ''} choisie${avatarIds.length > 1 ? 's' : ''}` : 'Choisir dans la banque'} onClick={() => setAvatarPicker(true)} />
                      {avatarIds.length > 0 && <Btn theme={theme} sm tone="quiet" label="Retirer" onClick={() => setAvatarIds([])} />}
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>{avatarIds.length > 1 ? 'Distribuées dans l\'ordre aux comptes.' : 'Plusieurs photos = une différente par compte.'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                    {([['linkURL', 'Lien (URL)'], ['linkTitle', 'Titre du lien']] as [keyof typeof edit, string][]).map(([k, l]) => (
                      <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{l}</span>
                        <input value={edit[k]} onChange={e => setEdit(v => ({ ...v, [k]: e.target.value }))} placeholder={l} style={FIELD} />
                      </label>
                    ))}
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Bio</span>
                    <textarea value={edit.biography} onChange={e => setEdit(v => ({ ...v, biography: e.target.value }))} rows={3} placeholder="Bio…" style={TEXTAREA} />
                  </label>
                  {editError && <div role="alert" style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: 12.5 }}>{editError}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: '#8B8B94' }}>Édite <b style={{ color: '#EDEDEF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{nSel}</b> compte{nSel > 1 ? 's' : ''}. Le téléphone s'éteint à la fin.</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8B8B94' }}>
                    Téléphones simultanés
                    <select value={String(editSimul)} onChange={e => setEditSimul(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ ...FIELD_SM, width: 'auto' }}>
                      {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
                      <option value="all">Tous</option>
                    </select>
                  </label>
                  <Btn theme={theme} tone="primary" disabled={nSel === 0 || !bearer || !hasEdit} icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" label="Lancer l'édition" onClick={launchEdit} />
                </div>
              </Panel>
            ) : (
              <Panel theme={theme}>
                <PanelHead title="Connexion automatique" sub="Identifiants IG par compte (flow RPA GeeLark, 2FA supporté)" />
                {nSel === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#71717A', fontSize: 12.5 }}>Sélectionne des comptes à gauche pour saisir leurs identifiants.</div>
                ) : (
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {phones.filter(p => sel.has(p.id)).map(p => {
                      const c = creds[p.id] ?? { email: '', password: '', totp: '' }
                      const set = (k: 'email' | 'password' | 'totp', v: string) => setCreds(cr => ({ ...cr, [p.id]: { ...c, [k]: v } }))
                      return (
                        <div key={p.id} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF', marginBottom: 8 }}>{phoneLabel(p)}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
                            <input value={c.email} onChange={e => set('email', e.target.value)} placeholder="email / identifiant" style={{ ...FIELD_SM, minWidth: 0 }} />
                            <input value={c.password} onChange={e => set('password', e.target.value)} type="password" placeholder="mot de passe" style={{ ...FIELD_SM, minWidth: 0 }} />
                            <input value={c.totp} onChange={e => set('totp', e.target.value)} placeholder="clé 2FA" style={{ ...FIELD_SM, minWidth: 0, fontFamily: MONO }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: '#8B8B94' }}>Connecte les comptes avec identifiants renseignés.</span>
                  <Btn theme={theme} tone="primary" disabled={nSel === 0 || !bearer || running} icon="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4|M10 17l5-5-5-5|M15 12H3" label={running ? 'Connexion…' : 'Lancer la connexion'} onClick={launchLogin} />
                </div>
              </Panel>
            )}
            {wtab === 'edit' && editRuns.map(r => <FlowRunCard key={r.id} theme={theme} run={r} />)}
            {wtab !== 'edit' && runItems.length > 0 && (
              <Panel theme={theme}>
                <PanelHead title="En direct" sub={`${runItems.filter(r => r.phase === 'done').length}/${runItems.length} terminés`} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px' }}>
                  {runItems.map(it => <Chip key={it.id} text={`${it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'} ${it.name}`} tone={(it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute') as any} />)}
                </div>
                <div style={{ margin: '0 16px 16px', padding: '10px 12px', borderRadius: 6, background: '#0E0E10', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 200, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>{logs.length === 0 ? '…' : logs.join('\n')}</div>
              </Panel>
            )}
          </div>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '250px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
        {/* Téléphones */}
        <Panel theme={theme}>
          <PanelHead title="Téléphones" right={<Btn theme={theme} sm tone="quiet" label="Tout" onClick={() => setSel(new Set(shownWarm.map(p => p.id)))} />} />
          {/* Filtre groupe (menu déroulant) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Groupe</span>
            <select value={wgroup} onChange={e => setWgroup(e.target.value)} style={{ flex: 1, height: 28, padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${wgroup !== 'Tous' ? theme.selEdge : 'rgba(255,255,255,0.09)'}`, background: '#161618', color: wgroup !== 'Tous' ? theme.accentText : '#EDEDEF', fontSize: 12.5, fontWeight: 400, outline: 'none' }}>
              {groups.map(g => <option key={g} value={g} style={{ background: '#161618' }}>{g === 'Tous' ? 'Tous les groupes' : g}</option>)}
            </select>
          </div>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : error ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#F87171', fontSize: 12.5 }}>{error}</div>
          ) : shownWarm.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#71717A', fontSize: 12.5 }}>Aucun téléphone.</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {shownWarm.map(p => {
                const on = sel.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'left',
                    background: on ? 'rgba(255,255,255,0.04)' : 'transparent', transition: 'background .12s ease', boxSizing: 'border-box',
                  }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: on ? theme.accent : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 11, fontWeight: 600,
                    }}>{on ? '✓' : ''}</span>
                    <StatusDot kind={dotKind(p.status)} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: on ? '#EDEDEF' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneSub(p)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Durée */}
          <Panel theme={theme}>
            <PanelHead title="Durée de la session" sub="Le téléphone démarre, navigue, puis s'éteint" />
            <div style={{ display: 'flex', gap: 8, padding: 16, flexWrap: 'wrap' }}>
              {DURATIONS.map(d => {
                const act = dur === d.v
                return (
                  <button key={d.v} onClick={() => setDur(d.v)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 20px', minWidth: 104, borderRadius: 8, cursor: 'pointer',
                    background: act ? 'rgba(255,255,255,0.07)' : '#161618',
                    border: '1px solid ' + (act ? theme.selEdge : 'rgba(255,255,255,0.08)'), transition: 'background .12s ease, border-color .12s ease',
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: act ? '#EDEDEF' : '#A1A1AA', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{d.v < 60 ? `${d.v} min` : `${d.v / 60} h`}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 400, color: act ? theme.accentText : '#71717A' }}>{d.h}</span>
                  </button>
                )
              })}
            </div>
          </Panel>

          {/* Ce que fait la session (réel, pas de réglage factice) */}
          <Panel theme={theme}>
            <PanelHead title="Pendant la session" sub="Ce que fait réellement l'automatisation GeeLark" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#A1A1AA' }}>
                Parcourt <b style={{ color: '#EDEDEF', fontWeight: 600 }}>≈ {Math.min(100, dur * 2)} Reels</b>{keyword.trim() ? <> trouvés avec « <b style={{ color: '#EDEDEF', fontWeight: 600 }}>{keyword.trim()}</b> »</> : <> du fil</>}, avec des likes, commentaires et abonnements aléatoires dosés par le flow, puis éteint le téléphone.
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Mot-clé de recherche (optionnel)</span>
                <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="ex. fashion, fitness… — vide = fil Reels" style={FIELD} />
              </label>
            </div>
          </Panel>

          {/* Lancement */}
          <Panel theme={theme}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.6, color: '#8B8B94' }}>
                {!bearer && !conns.loading ? (
                  <span style={{ color: '#FBBF24' }}>Connecte d'abord ton compte GeeLark (token) dans les Réglages de l'app web, puis reviens ici.</span>
                ) : (
                  <>Session de <span style={{ color: '#EDEDEF', fontWeight: 500 }}>{durLabel}</span> sur <span style={{ color: '#EDEDEF', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{nSel}</span> téléphone{nSel > 1 ? 's' : ''}. Les appareils s'éteignent à la fin.</>
                )}
              </span>
              <Btn theme={theme} tone="primary" disabled={nSel === 0 || !bearer || running}
                icon="M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z"
                label={running ? 'Warmup en cours…' : nSel === 0 ? 'Sélectionne des comptes' : 'Lancer le warmup'}
                onClick={launch} />
            </div>

            {/* Progression + logs en direct */}
            {runItems.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px' }}>
                  {runItems.map(it => {
                    const c = it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute'
                    const label = it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'
                    return <Chip key={it.id} text={`${label} @${it.name}`} tone={c as any} />
                  })}
                </div>
                <div style={{
                  margin: '0 16px 16px', padding: '10px 12px', borderRadius: 6, background: '#0E0E10',
                  border: '1px solid rgba(255,255,255,0.06)', maxHeight: 220, overflowY: 'auto',
                  fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap',
                }}>
                  {logs.length === 0 ? '…' : logs.join('\n')}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
      )}
      {avatarPicker && (
        <BankPicker theme={theme} user={user} org={org} kind="images" multi initialIds={avatarIds} title="Photos de profil"
          onClose={() => setAvatarPicker(false)}
          onApply={r => { if (r.kind === 'images') setAvatarIds(r.ids); setAvatarPicker(false) }} />
      )}
    </div>
  )
}

