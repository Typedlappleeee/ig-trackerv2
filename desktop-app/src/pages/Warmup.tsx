import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Empty, StatusDot, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { scopeInfra, phoneLabel, phoneSub } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { warmupAccountNative, editProfileOnPhone, loginInstagramOnPhone, ensurePhoneRunning, setPhoneManaged, stopPhoneSurely } from '@/lib/geelark'
import { changeUsernameOnPhone, changeProfilePicOnPhone } from '@/lib/geelarkAdb'
import { bankUrls, expandUsername, lines } from '@/lib/flowEngine'
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

  // Édition de profil en masse (RÉELLE), par téléphone : nom d'utilisateur et photo
  // (ADB, Centre de comptes) puis nom affiché / bio / lien (RPA instagramEdit).
  // Le téléphone démarre UNE fois pour tout, puis est éteint à la fin (même en échec).
  const userLines = lines(usernames)
  const hasRpaEdit = !!(edit.nickname.trim() || edit.biography.trim() || edit.linkURL.trim())
  const hasEdit = hasRpaEdit || userLines.length > 0 || avatarIds.length > 0
  function editIssue(n: number): string | null {
    const bad = userLines.find(u => !/^@?[a-zA-Z0-9._{}]{1,30}$/.test(u.replace(/\{\d{1,2}\}/g, '0')))
    if (bad) return `Nom d'utilisateur invalide « ${bad} » (lettres, chiffres, . et _ uniquement).`
    if (userLines.length > 0 && userLines.length < n && !userLines.some(u => /\{\d{1,2}\}/.test(u)))
      return `Il faut un nom d'utilisateur différent par compte (${userLines.length}/${n}) — ou ajoute {4} pour des chiffres aléatoires.`
    return null
  }

  async function launchEdit() {
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    if (editLocked || targets.length === 0 || !bearer || running || !hasEdit) return
    const issue = editIssue(targets.length)
    setEditError(issue)
    if (issue) return
    setRunning(true); setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: phoneLabel(p), phase: 'pending' as RunPhase })))
    const push = (m: string) => setLogs(l => [...l.slice(-200), m])
    await loadProxyRotation(currentOrg?.id ?? null, user.id)
    const rotU = resolveRotationUrls(); const rot = (rotationOn && rotU.length) ? rotU : undefined
    const urls = avatarIds.length ? await bankUrls(avatarIds) : new Map<string, string>()
    if (avatarIds.length && urls.size === 0) push('⚠ Photos de profil introuvables dans la banque — ignorées.')
    const avatars = avatarIds.map(id => urls.get(id)).filter((u): u is string => !!u)

    for (const [i, p] of targets.entries()) {
      const gid = p.geelark_id!
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      push(`— ${phoneLabel(p)} —`)
      const errors: string[] = []
      setPhoneManaged(gid, true)
      try {
        const ready = await ensurePhoneRunning(bearer, gid, push, rot)
        if (!ready.ok) { errors.push(ready.reason ?? 'Téléphone non démarré'); continue }
        if (userLines.length) {
          const handle = expandUsername(userLines[i % userLines.length]).replace(/^@/, '')
          const r = await changeUsernameOnPhone(bearer, gid, handle, push, p.ig_username ?? undefined)
          if (r.ok) {
            await supabase.from('phones').update({ ig_username: handle }).eq('id', p.id)
            setPhones(ps => ps.map(x => x.id === p.id ? { ...x, ig_username: handle } : x))
          } else errors.push(`nom d'utilisateur : ${r.error}`)
        }
        if (avatars.length) {
          const r = await changeProfilePicOnPhone(bearer, gid, avatars[i % avatars.length], push)
          if (!r.ok) errors.push(`photo : ${r.error}`)
        }
        if (hasRpaEdit) {
          const r = await editProfileOnPhone(bearer, gid, edit, push, rot)
          if (!r.ok) errors.push(`profil : ${r.error}`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        setPhoneManaged(gid, false)
        await stopPhoneSurely(bearer, gid, push)
        if (errors.length) push(`❌ ${errors.join(' · ')}`)
        setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: errors.length ? 'failed' : 'done', detail: errors.join(' · ') || undefined } : it))
      }
    }
    push('✔ Édition terminée.')
    setRunning(false)
  }

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
      <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 7, marginBottom: 16, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setWtab(k)} style={{
            height: 28, padding: '0 12px', border: 'none', borderRadius: 5, cursor: 'pointer',
            background: wtab === k ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: wtab === k ? '#EDEDEF' : '#8B8B94', fontSize: 12.5, fontWeight: 500, transition: 'background .12s ease, color .12s ease',
          }}>{l}</button>
        ))}
      </div>

      {/* Rotation d'IP proxy — même toggle que les composers (Reels/Story/Photo…). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 12, borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>Rotation d’IP proxy</span>
          <span style={{ fontSize: 12, color: '#8B8B94' }}>{!rotationConfigured ? 'Aucun proxy — configure dans Paramètres → Proxy & rotation' : rotationOn ? 'IP changée avant chaque téléphone (envoi en série)' : 'Désactivée pour ce run'}</span>
        </span>
        <span onClick={() => rotationConfigured && setRotationOn(v => !v)}
          title={rotationConfigured ? '' : 'Configure d’abord un proxy rotatif dans les Paramètres'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: rotationOn ? 'flex-end' : 'flex-start', width: 30, height: 18, padding: 2, boxSizing: 'border-box', borderRadius: 99, flexShrink: 0, cursor: rotationConfigured ? 'pointer' : 'not-allowed', opacity: rotationConfigured ? 1 : 0.4, background: rotationOn ? theme.accent : 'rgba(255,255,255,0.12)', transition: 'background .12s ease' }}>
          <span style={{ width: 14, height: 14, borderRadius: 99, background: '#fff' }} />
        </span>
      </div>

      {wtab !== 'warm' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
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
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accent : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 8.5, fontWeight: 600 }}>{on ? '✓' : ''}</span>
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
                      <input value={edit.nickname} onChange={e => setEdit(v => ({ ...v, nickname: e.target.value }))} placeholder="Léa ✨" style={fieldStyle} />
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>Le nom en gras sur le profil. Ne touche pas au @.</span>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Nom d'utilisateur <span style={{ color: '#71717A', fontWeight: 400 }}>· @username</span></span>
                      <textarea value={usernames} onChange={e => { setUsernames(e.target.value); setEditError(null) }} rows={2} placeholder={'lea.officiel{4}\nlea_backup'} style={{ ...fieldStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }} />
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
                        <input value={edit[k]} onChange={e => setEdit(v => ({ ...v, [k]: e.target.value }))} placeholder={l} style={fieldStyle} />
                      </label>
                    ))}
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Bio</span>
                    <textarea value={edit.biography} onChange={e => setEdit(v => ({ ...v, biography: e.target.value }))} rows={3} placeholder="Bio…" style={{ resize: 'vertical', padding: '8px 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  </label>
                  {editError && <div role="alert" style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: 12.5 }}>{editError}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: '#8B8B94' }}>Édite <b style={{ color: '#EDEDEF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{nSel}</b> compte{nSel > 1 ? 's' : ''}. Le téléphone s'éteint à la fin.</span>
                  <Btn theme={theme} tone="primary" disabled={nSel === 0 || !bearer || running || !hasEdit} icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" label={running ? 'Édition…' : 'Lancer l\'édition'} onClick={launchEdit} />
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
                            <input value={c.email} onChange={e => set('email', e.target.value)} placeholder="email / identifiant" style={{ height: 28, padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 12.5, outline: 'none', boxSizing: 'border-box', minWidth: 0 }} />
                            <input value={c.password} onChange={e => set('password', e.target.value)} type="password" placeholder="mot de passe" style={{ height: 28, padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 12.5, outline: 'none', boxSizing: 'border-box', minWidth: 0 }} />
                            <input value={c.totp} onChange={e => set('totp', e.target.value)} placeholder="clé 2FA" style={{ height: 28, padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 12.5, outline: 'none', boxSizing: 'border-box', minWidth: 0, fontFamily: "'JetBrains Mono',monospace" }} />
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
            {runItems.length > 0 && (
              <Panel theme={theme}>
                <PanelHead title="En direct" sub={`${runItems.filter(r => r.phase === 'done').length}/${runItems.length} terminés`} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px' }}>
                  {runItems.map(it => <Chip key={it.id} text={`${it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'} ${it.name}`} tone={(it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute') as any} />)}
                </div>
                <div style={{ margin: '0 16px 16px', padding: '10px 12px', borderRadius: 6, background: '#0E0E10', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 200, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>{logs.length === 0 ? '…' : logs.join('\n')}</div>
              </Panel>
            )}
          </div>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
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
            <div style={{ padding: 30, textAlign: 'center', color: '#71717A', fontSize: 12.5 }}>Chargement…</div>
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
                      background: on ? theme.accent : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 8.5, fontWeight: 600,
                    }}>{on ? '✓' : ''}</span>
                    <StatusDot kind={dotKind(p.status)} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: on ? '#EDEDEF' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneSub(p)}</span>
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
                <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="ex. fashion, fitness… — vide = fil Reels" style={{ height: 32, padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
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
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap',
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

const fieldStyle = { height: 32, padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 13, outline: 'none', boxSizing: 'border-box' } as const
