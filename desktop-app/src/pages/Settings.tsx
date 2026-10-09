import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import ProxyRotationPanel from '@/components/ProxyRotationPanel'
import { LangSwitch } from '@/components/AppUpdate'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, Empty } from '@/lib/ui'
import { supabase, type OrgRole } from '@/lib/supabase'
import { fetchBalance, fetchOrgBalance, fmtNumber, type OrgState } from '@/lib/data'

// ── Sections (portées de _settings() du prototype v10) ───────────────────────────
type Tab = 'account' | 'org' | 'members' | 'billing' | 'proxy' | 'infra' | 'notif' | 'security'
// On ne garde que les sections RÉELLES. Les onglets placeholder (Infrastructure /
// Notifications / Sécurité, tous « à venir ») sont retirés : pas de config proxy à
// gérer côté desktop (tout passe par GeeLark / la config web).
const SECTIONS: { k: Tab; l: string; i: string }[] = [
  { k: 'account', l: 'Profil', i: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { k: 'org', l: 'Organisation', i: 'M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4' },
  { k: 'members', l: 'Membres & rôles', i: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8' },
  { k: 'billing', l: 'Abonnement & crédits', i: 'M2 8h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z|M2 8l2-4h16l2 4|M12 12v4' },
  { k: 'infra', l: 'Connexions & clés', i: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  { k: 'proxy', l: 'Proxy & rotation', i: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z' },
]

// ── Rôles ────────────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Membre', viewer: 'Viewer' }
const ROLE_TONE: Record<OrgRole, 'violet' | 'info' | 'ok' | 'mute'> = { owner: 'violet', admin: 'info', member: 'ok', viewer: 'mute' }
const ROLE_AV: Record<OrgRole, string> = { owner: '139,92,246', admin: '6,182,212', member: '16,185,129', viewer: '113,113,122' }

interface MemberRow {
  id: string
  user_id: string
  role: OrgRole
  email: string | null
  display_name: string | null
}

function initialsFrom(name: string | null, email: string | null): string {
  const src = (name?.trim() || email?.split('@')[0] || '?').replace(/[._-]/g, ' ')
  const parts = src.split(/\s+/).filter(Boolean)
  return (parts.map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase()
}

// ── Ligne de réglage (label + valeur), visuel-only pour les sections statiques ────
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px 24px', flexWrap: 'wrap', minHeight: 60, boxSizing: 'border-box', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{label}</span>
        {hint ? <span style={{ fontSize: 12, color: '#8B8B94', lineHeight: 1.4 }}>{hint}</span> : null}
      </span>
      <span style={{ flex: '1 1 240px', minWidth: 0 }}>{children}</span>
    </div>
  )
}

// Champ texte lecture-seule (aucune donnée inventée : la vraie valeur ou « — »).
function ReadValue({ value, mono }: { value: ReactNode; mono?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', verticalAlign: 'middle', height: 32, lineHeight: '30px', padding: '0 10px', borderRadius: 6, boxSizing: 'border-box',
      background: '#161618', border: '1px solid rgba(255,255,255,0.09)', maxWidth: '100%', width: 320,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      fontFamily: mono ? "'JetBrains Mono',monospace" : undefined, fontSize: mono ? 12 : 13, color: '#EDEDEF',
    }}>{value}</span>
  )
}

// Toggle purement visuel (les préférences ne sont pas persistées dans cette passe).
function Toggle({ theme, on }: { theme: Theme; on: boolean }) {
  return (
    <span aria-hidden style={{
      display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 32, height: 18,
      padding: 2, borderRadius: 99, flexShrink: 0, boxSizing: 'border-box', background: on ? theme.accent : 'rgba(255,255,255,0.12)',
    }}>
      <span style={{ width: 14, height: 14, borderRadius: 99, background: '#fff' }} />
    </span>
  )
}

// Champ de saisie standard (input/select) — guide « SaaS épuré ».
const FIELD: CSSProperties = {
  height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 6,
  background: '#161618', border: '1px solid rgba(255,255,255,0.09)',
  color: '#EDEDEF', fontSize: 13, outline: 'none',
}

const DASH = <span style={{ color: '#5A5A63' }}>—</span>

export default function Settings({ theme, user, org, onSignOut, onNavigate }: {
  theme: Theme; user: User; org: OrgState; onSignOut: () => void; onNavigate?: (p: string) => void
}) {
  const [tab, setTab] = useState<Tab>('account')
  const { currentOrg, role } = org
  const canManage = role === 'owner' || role === 'admin'

  // ── Profil : display_name réel (email vient déjà de la session) ──────────────────
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (alive) { const n = (data as { display_name?: string } | null)?.display_name ?? null; setDisplayName(n); setNameInput(n ?? '') } })
    return () => { alive = false }
  }, [user.id])

  async function saveName() {
    setSavingName(true)
    const { error } = await supabase.from('profiles').update({ display_name: nameInput.trim() || null }).eq('id', user.id)
    setSavingName(false)
    if (!error) { setDisplayName(nameInput.trim() || null); setNotice('Nom enregistré.') }
    else setNotice(`Échec : ${error.message}`)
  }

  // ── Solde de crédits réel (org ou perso) ────────────────────────────────────────
  const [balance, setBalance] = useState<number | null>(null)
  const reloadBalance = useCallback(async () => {
    const b = currentOrg ? await fetchOrgBalance(currentOrg.id, currentOrg.owner_id) : await fetchBalance(user.id)
    setBalance(b)
  }, [currentOrg?.id, currentOrg?.owner_id, user.id])
  useEffect(() => {
    let alive = true
    const p = currentOrg ? fetchOrgBalance(currentOrg.id, currentOrg.owner_id) : fetchBalance(user.id)
    p.then(b => { if (alive) setBalance(b) })
    return () => { alive = false }
  }, [currentOrg?.id, currentOrg?.owner_id, user.id])

  // ── Membres réels (organization_members ⋈ profiles) ─────────────────────────────
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const loadMembers = useCallback(async () => {
    if (!currentOrg) { setMembers(null); return }
    const { data: rows, error } = await supabase.from('organization_members').select('id, user_id, role').eq('org_id', currentOrg.id)
    if (error || !rows) { setMembers([]); return }
    const ids = (rows as { user_id: string }[]).map(r => r.user_id)
    const profiles: Record<string, { email: string | null; display_name: string | null }> = {}
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, email, display_name').in('id', ids)
      for (const p of (profs as { id: string; email: string | null; display_name: string | null }[]) ?? []) {
        profiles[p.id] = { email: p.email, display_name: p.display_name }
      }
    }
    const mapped: MemberRow[] = (rows as { id: string; user_id: string; role: OrgRole }[]).map(r => ({
      id: r.id, user_id: r.user_id, role: r.role,
      email: profiles[r.user_id]?.email ?? null,
      display_name: profiles[r.user_id]?.display_name ?? null,
    }))
    // owner d'abord, puis admin, membre, viewer
    const order: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 }
    mapped.sort((a, b) => order[a.role] - order[b.role])
    setMembers(mapped)
  }, [currentOrg?.id])
  useEffect(() => { loadMembers() }, [loadMembers])

  const menu = (
    <div style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {SECTIONS.map(x => {
        const on = tab === x.k
        return (
          <button key={x.k} onClick={() => setTab(x.k)} style={{
            display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 10px', border: 'none',
            borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%',
            background: on ? 'rgba(255,255,255,0.07)' : 'transparent', color: on ? '#EDEDEF' : '#A1A1AA',
            fontSize: 13, fontWeight: 500, transition: 'background .12s ease, color .12s ease',
          }}
            onMouseEnter={e => { if (!on) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#EDEDEF' } }}
            onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA' } }}>
            <span style={{ display: 'flex', flexShrink: 0, color: on ? theme.accentText : '#71717A' }}><Icon d={x.i} size={15} /></span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.l}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Réglages" sub="Ton profil, ton organisation, tes membres et ton abonnement." />
      <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        {menu}
        <div style={{ minWidth: 0 }}>
          {tab === 'account' && <AccountTab theme={theme} user={user} displayName={displayName} onSignOut={onSignOut}
            nameInput={nameInput} setNameInput={setNameInput} savingName={savingName} saveName={saveName} notice={notice} />}
          {tab === 'org' && <OrgTab theme={theme} org={org} balance={balance} canManage={canManage} />}
          {tab === 'members' && <MembersTab theme={theme} org={org} members={members} canManage={canManage} currentUserId={user.id} onReload={loadMembers} />}
          {tab === 'billing' && <BillingTab theme={theme} user={user} org={org} balance={balance} canManage={canManage} onRedeemed={reloadBalance} />}
          {tab === 'proxy' && <ProxyRotationPanel theme={theme} user={user} org={org} />}
          {tab === 'infra' && <InfraTab theme={theme} user={user} org={org} canManage={canManage} />}
          {tab === 'notif' && <NotifTab theme={theme} email={user.email ?? null} />}
          {tab === 'security' && <SecurityTab theme={theme} />}
        </div>
      </div>
    </div>
  )
}

// ══════════ PROFIL — c'est ici la déconnexion officielle ══════════
function AccountTab({ theme, user, displayName, onSignOut, nameInput, setNameInput, savingName, saveName, notice }: {
  theme: Theme; user: User; displayName: string | null; onSignOut: () => void
  nameInput: string; setNameInput: (v: string) => void; savingName: boolean; saveName: () => void; notice: string | null
}) {
  const initial = initialsFrom(displayName, user.email ?? null)
  return (
    <>
      <Panel theme={theme}>
        <PanelHead title="Mon profil" sub="Ton compte ScaleFlow" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 99, flexShrink: 0,
            background: '#18181B', border: '1px solid rgba(255,255,255,0.08)',
            color: '#D4D4D8', fontSize: 14, fontWeight: 600,
          }}>{initial}</span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF' }}>
              {displayName?.trim() || <span style={{ fontWeight: 500, color: '#71717A' }}>Aucun nom</span>}
            </span>
            <span style={{ fontSize: 12, color: '#8B8B94' }}>{user.email ?? '—'}</span>
          </span>
        </div>
        <div style={{ marginBottom: -1 }}>
          <Field label="Nom affiché" hint="Visible par les autres membres">
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Ton nom" style={{ ...FIELD, width: 320, maxWidth: '100%' }} />
              <Btn label={savingName ? '…' : 'Enregistrer'} theme={theme} tone="primary" disabled={savingName || nameInput.trim() === (displayName ?? '').trim()} onClick={saveName} />
            </span>
          </Field>
          <Field label="Adresse e-mail" hint="Identifiant de connexion">
            <ReadValue value={user.email ?? DASH} />
          </Field>
          <Field label="Langue" hint="Langue de l’interface">
            <LangSwitch theme={theme} />
          </Field>
        </div>
      </Panel>

      {notice && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', fontSize: 13, color: '#EDEDEF' }}>{notice}</div>
      )}

      <div style={{ marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Session" />
          <div style={{ marginBottom: -1 }}><Field label="Se déconnecter" hint="Ferme ta session sur cet appareil">
            <Btn label="Se déconnecter" theme={theme} tone="danger" onClick={onSignOut}
              icon="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9" />
          </Field></div>
        </Panel>
      </div>
    </>
  )
}

// ══════════ ORGANISATION ══════════
function OrgTab({ theme, org, balance, canManage }: {
  theme: Theme; org: OrgState; balance: number | null; canManage: boolean
}) {
  const { currentOrg, role } = org
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // Création d'organisation.
  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)

  async function createOrg() {
    const name = orgName.trim()
    if (!name || creating) return
    setCreating(true); setNote(null)
    const { data, error } = await supabase.rpc('create_org', { p_name: name })
    setCreating(false)
    if (error) {
      const msg = /org_limit_reached/.test(error.message) ? 'Tu possèdes déjà une organisation.'
        : /name_required/.test(error.message) ? 'Nom requis.'
        : error.message
      setNote(`Échec : ${msg}`); return
    }
    // L'owner est ajouté comme membre par trigger. On bascule dessus et on recharge
    // pour rafraîchir la liste des orgs (useOrg ne réexpose pas de reload).
    if (typeof data === 'string') { localStorage.setItem('ig-tracker-current-org', data) }
    window.location.reload()
  }

  async function deleteOrg() {
    if (!currentOrg) return
    setDeleting(true); setNote(null)
    const { error } = await supabase.from('organizations').delete().eq('id', currentOrg.id)
    setDeleting(false)
    if (error) { setNote(`Échec : ${error.message}`); return }
    org.switchOrg(null)
  }
  if (!currentOrg) {
    return (
      <Panel theme={theme}>
        <PanelHead title="Organisation" />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText }}><Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" size={15} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>Espace personnel</span>
              <span style={{ fontSize: 12, color: '#8B8B94' }}>Tu travailles hors organisation. Tes appareils et ton contenu sont privés.</span>
            </span>
          </div>

          {/* Créer son organisation : l'owner devient le « chef » — ses crédits sont
              partagés, et toute dépense d'un membre débite le solde du chef. */}
          <div style={{ padding: 16, borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', marginBottom: 4 }}>Créer une organisation</div>
            <div style={{ fontSize: 12, color: '#8B8B94', lineHeight: 1.55, marginBottom: 12 }}>
              Invite des membres et pilote leurs comptes. Les crédits sont ceux du chef d’orga (toi) : chaque publication d’un membre débite <b>ton</b> solde.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={orgName} onChange={e => { setOrgName(e.target.value); setNote(null) }}
                onKeyDown={e => { if (e.key === 'Enter') createOrg() }}
                placeholder="Nom de ton organisation" maxLength={60} spellCheck={false}
                style={{ ...FIELD, flex: 1, minWidth: 180 }} />
              <Btn theme={theme} tone="primary" label={creating ? 'Création…' : 'Créer'} disabled={creating || !orgName.trim()} onClick={createOrg} />
            </div>
            {note && <div style={{ marginTop: 8, fontSize: 12, color: '#F87171' }}>{note}</div>}
          </div>
        </div>
      </Panel>
    )
  }
  return (
    <>
      <Panel theme={theme}>
        <PanelHead title="Identité" sub="Ce que voient tes membres" />
        <div>
          <Field label="Nom de l’organisation">
            <ReadValue value={currentOrg.name || DASH} />
          </Field>
          <Field label="Identifiant" hint="Non modifiable · utilisé par l’API">
            <ReadValue mono value={currentOrg.id} />
          </Field>
          <Field label="Ton rôle">
            {role ? <Chip text={ROLE_LABEL[role]} tone={ROLE_TONE[role]} /> : DASH}
          </Field>
          <div style={{ marginBottom: -1 }}><Field label="Crédits de l’organisation">
            <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>
              {balance === null ? '…' : fmtNumber(balance)}
            </span>
          </Field></div>
        </div>
      </Panel>
      {canManage && (
        <div style={{ marginTop: 12 }}>
          <Panel theme={theme}>
            <PanelHead title="Zone sensible" />
            <Field label="Transférer la propriété" hint="Un autre owner reprend l’organisation">
              <Btn label="Transférer" theme={theme} sm tone="quiet" onClick={() => setNote('Le transfert de propriété se fait depuis la console d’administration — change le rôle d’un membre en « owner » dans l’onglet Membres.')} />
            </Field>
            <Field label="Supprimer l’organisation" hint="Irréversible">
              {confirmDel
                ? <span style={{ display: 'flex', gap: 6 }}>
                    <Btn label={deleting ? 'Suppression…' : 'Confirmer'} theme={theme} sm tone="danger" disabled={deleting} onClick={deleteOrg} />
                    <Btn label="Annuler" theme={theme} sm tone="quiet" onClick={() => setConfirmDel(false)} />
                  </span>
                : <Btn label="Supprimer" theme={theme} sm tone="danger" onClick={() => setConfirmDel(true)} />}
            </Field>
            {note && <div style={{ padding: '12px 16px', fontSize: 12, color: '#FBBF24', lineHeight: 1.5 }}>{note}</div>}
          </Panel>
        </div>
      )}
    </>
  )
}

// ══════════ MEMBRES & RÔLES ══════════
async function cycleMemberRole(id: string, cur: OrgRole, reload: () => void) {
  const order: OrgRole[] = ['admin', 'member', 'viewer']
  const next = order[(order.indexOf(cur) + 1) % order.length]
  await supabase.from('organization_members').update({ role: next }).eq('id', id)
  reload()
}
async function removeMember(id: string, reload: () => void) {
  await supabase.from('organization_members').delete().eq('id', id)
  reload()
}

// Invitation : ajoute un utilisateur EXISTANT (compte ScaleFlow) à l'org par email.
function InviteBox({ theme, orgId, onReload }: { theme: Theme; orgId: string; onReload: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  async function invite() {
    const e = email.trim().toLowerCase()
    if (!e) return
    setBusy(true); setMsg(null)
    try {
      const { data: prof } = await supabase.from('profiles').select('id').ilike('email', e).maybeSingle()
      if (!prof?.id) { setMsg({ ok: false, t: "Aucun compte ScaleFlow avec cet email. La personne doit d'abord créer son compte." }); setBusy(false); return }
      const { data: existing } = await supabase.from('organization_members').select('id').eq('org_id', orgId).eq('user_id', prof.id).maybeSingle()
      if (existing) { setMsg({ ok: false, t: 'Cette personne est déjà membre.' }); setBusy(false); return }
      const { error } = await supabase.from('organization_members').insert({ org_id: orgId, user_id: prof.id, role: 'member' })
      if (error) { setMsg({ ok: false, t: `Échec : ${error.message}` }); setBusy(false); return }
      setMsg({ ok: true, t: `${e} a été ajouté comme membre.` }); setEmail(''); onReload()
    } catch (err) { setMsg({ ok: false, t: err instanceof Error ? err.message : 'Échec.' }) }
    setBusy(false)
  }

  return (
    <Panel theme={theme} style={{ marginBottom: 12 }}>
      <PanelHead title="Inviter dans l’organisation" sub="Ajoute un membre par son email de compte ScaleFlow" />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: 16, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Adresse e-mail</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.09)' }}>
            <span style={{ display: 'flex', color: '#71717A' }}><Icon d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M22 6l-10 7L2 6" size={13} /></span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom@agence.fr"
              onKeyDown={e => { if (e.key === 'Enter') invite() }}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', color: '#EDEDEF', fontSize: 13 }} />
          </span>
        </span>
        <Btn label={busy ? 'Ajout…' : 'Envoyer l’invitation'} theme={theme} tone="primary" disabled={busy} icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" onClick={invite} />
      </div>
      {msg && <div style={{ padding: '0 16px 14px', fontSize: 12, color: msg.ok ? '#4ADE80' : '#FBBF24', lineHeight: 1.5 }}>{msg.t}</div>}
    </Panel>
  )
}

function MembersTab({ theme, org, members, canManage, currentUserId, onReload }: {
  theme: Theme; org: OrgState; members: MemberRow[] | null; canManage: boolean; currentUserId: string; onReload: () => void
}) {
  if (!org.currentOrg) {
    return (
      <Panel theme={theme}>
        <Empty icon="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8"
          title="Aucune organisation" text="Crée ou rejoins une organisation pour inviter des membres et gérer les rôles." />
      </Panel>
    )
  }
  const loading = members === null
  const list = members ?? []
  return (
    <>
      {canManage && org.currentOrg && (
        <InviteBox theme={theme} orgId={org.currentOrg.id} onReload={onReload} />
      )}

      <Panel theme={theme}>
        <PanelHead title="Membres" right={<Chip text={loading ? '…' : String(list.length)} tone="mute" />} />
        {loading ? (
          <div style={{ padding: '24px 16px', fontSize: 12, color: '#71717A' }}>…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: '#8B8B94' }}>Aucun membre.</div>
        ) : (
          <div data-rows="">
            {list.map((m, i) => {
              const isMe = m.user_id === currentUserId
              return (
                <div key={m.id} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) 108px 120px', gap: 12, alignItems: 'center',
                  minHeight: 56, boxSizing: 'border-box', padding: '10px 16px', fontSize: 13, borderBottom: i < list.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 99, flexShrink: 0,
                      background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8', fontSize: 11, fontWeight: 600,
                    }}>{initialsFrom(m.display_name, m.email)}</span>
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.display_name?.trim() || m.email || m.user_id.slice(0, 8)}
                      </span>
                      <span style={{ fontSize: 12, color: '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.email ?? '—'}
                      </span>
                    </span>
                  </span>
                  <span><Chip text={ROLE_LABEL[m.role]} tone={ROLE_TONE[m.role]} /></span>
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
                    {isMe ? (
                      <span style={{ fontSize: 12, color: '#5A5A63' }}>c’est toi</span>
                    ) : canManage && m.role !== 'owner' ? (
                      <>
                        <Btn label="Changer le rôle" theme={theme} sm tone="quiet" icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" onClick={() => cycleMemberRole(m.id, m.role, onReload)} />
                        <Btn label="Retirer" theme={theme} sm tone="quiet" icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" onClick={() => removeMember(m.id, onReload)} />
                      </>
                    ) : null}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <div style={{ marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Ce que chaque rôle peut faire" />
          <div data-rows="">
            {([
              { r: 'owner', d: 'Tout, y compris la facturation et la suppression', can: ['Facturation', 'Membres', 'Infrastructure', 'Publication', 'Contenu'] },
              { r: 'admin', d: 'Tout sauf la facturation et la propriété', can: ['Membres', 'Infrastructure', 'Publication', 'Contenu'] },
              { r: 'member', d: 'Publie et gère le contenu, ne touche pas aux réglages', can: ['Publication', 'Contenu'] },
              { r: 'viewer', d: 'Consulte les performances, ne publie rien', can: ['Lecture seule'] },
            ] as { r: OrgRole; d: string; can: string[] }[]).map((r, i, arr) => {
              const tone = ROLE_AV[r.r]
              return (
                <div key={r.r} style={{ display: 'flex', alignItems: 'center', gap: '10px 24px', flexWrap: 'wrap', padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <span style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: `rgb(${tone})` }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{ROLE_LABEL[r.r]}</span>
                    </span>
                    <span style={{ fontSize: 12, lineHeight: 1.45, color: '#8B8B94' }}>{r.d}</span>
                  </span>
                  <span style={{ flex: '1 1 240px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {r.can.map(c => (
                      <span key={c} style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', boxSizing: 'border-box', borderRadius: 5, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#A1A1AA' }}>{c}</span>
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>
    </>
  )
}

// ══════════ ABONNEMENT & CRÉDITS ══════════
function BillingTab({ theme, user, org, balance, canManage, onRedeemed }: {
  theme: Theme; user: User; org: OrgState; balance: number | null; canManage: boolean; onRedeemed: () => void
}) {
  const { currentOrg } = org
  const planLabel = currentOrg ? 'Organisation' : 'Espace personnel'
  const [note, setNote] = useState(false)
  // ── Utiliser un code de crédits ──
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function redeem() {
    const c = code.trim()
    if (!c || redeeming) return
    setRedeeming(true); setRedeemMsg(null)
    const { redeemCreditCode, redeemCreditCodeForOrg } = await import('@/lib/credits')
    const res = currentOrg ? await redeemCreditCodeForOrg(c, currentOrg.id) : await redeemCreditCode(c, user.id)
    setRedeeming(false)
    if (!res.ok) { setRedeemMsg({ ok: false, text: res.error ?? 'Code invalide ou déjà utilisé.' }); return }
    setRedeemMsg({ ok: true, text: `+${res.amount ?? 0} crédits ajoutés.` })
    setCode(''); onRedeemed()
  }
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 24, padding: '16px 20px', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap',
        background: theme.panelBg, border: `1px solid ${theme.panelEdge}`,
      }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Plan actuel</span>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, color: '#EDEDEF' }}>{planLabel}</span>
        </span>
        <span style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.06)' }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Crédits disponibles</span>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>
            {balance === null ? '…' : fmtNumber(balance)}
          </span>
        </span>
        {canManage && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn label="Gérer" theme={theme} sm tone="primary" onClick={() => setNote(true)} />
          </span>
        )}
      </div>
      {note && (
        <div style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12, color: '#A1A1AA', lineHeight: 1.55 }}>
          L’achat de crédits et la gestion de l’abonnement se font sur l’espace web ScaleFlow (paiement sécurisé). Les crédits achetés sont partagés avec l’app de bureau instantanément.
        </div>
      )}

      <Panel theme={theme}>
        <PanelHead title="Solde" sub={balance === null ? undefined : `≈ ${fmtNumber(Math.floor(balance / 2))} publications restantes`} />
        <div style={{ padding: 16 }}>
          <span style={{ display: 'block', height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${balance === null ? 0 : Math.min(100, Math.round((balance / 5000) * 100))}%`, borderRadius: 99, background: theme.accent }} />
          </span>
          <div style={{ marginTop: 12, fontSize: 12, color: '#8B8B94' }}>
            Publication : 2 crédits / appareil · Story : 1 crédit / appareil · Tâches automatiques : 50 crédits / jour.
          </div>
        </div>
      </Panel>

      <Panel theme={theme} style={{ marginTop: 12 }}>
        <PanelHead title="Utiliser un code de crédits" sub={currentOrg ? 'Crédité sur le solde de l’organisation.' : 'Crédité sur ton solde personnel.'} />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setRedeemMsg(null) }}
              onKeyDown={e => { if (e.key === 'Enter') redeem() }}
              placeholder="CR-XXXX-XXXX" spellCheck={false} autoComplete="off"
              style={{ ...FIELD, flex: 1, minWidth: 180, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em' }} />
            <Btn theme={theme} tone="primary" label={redeeming ? 'Validation…' : 'Valider le code'} disabled={redeeming || !code.trim()} onClick={redeem} />
          </div>
          {redeemMsg && (
            <div style={{ fontSize: 12, fontWeight: 500, color: redeemMsg.ok ? '#4ADE80' : '#F87171' }}>{redeemMsg.text}</div>
          )}
        </div>
      </Panel>
    </>
  )
}

// ══════════ INFRASTRUCTURE (visuel-only) ══════════
// Connexions & clés : enregistre le token GeeLark + la clé Groq dans org_config
// (org) ou app_config (perso). C'est CE qui alimente useConnections() partout.
function InfraTab({ theme, user, org, canManage }: { theme: Theme; user: User; org: OrgState; canManage: boolean }) {
  const { currentOrg } = org
  const [bearer, setBearer] = useState('')
  const [groq, setGroq] = useState('')
  const [showBearer, setShowBearer] = useState(false)
  const [showGroq, setShowGroq] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const readOnly = !!currentOrg && !canManage

  useEffect(() => {
    let alive = true
    setLoading(true)
    const q = currentOrg
      ? supabase.from('org_config').select('bearer_token, groq_api_key').eq('org_id', currentOrg.id).maybeSingle()
      : supabase.from('app_config').select('bearer_token, groq_api_key').eq('user_id', user.id).maybeSingle()
    q.then(({ data }) => {
      if (!alive) return
      const d = data as { bearer_token?: string; groq_api_key?: string } | null
      setBearer(d?.bearer_token ?? ''); setGroq(d?.groq_api_key ?? ''); setLoading(false)
    })
    return () => { alive = false }
  }, [currentOrg?.id, user.id])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const err = currentOrg
        ? (await supabase.from('org_config').upsert({ org_id: currentOrg.id, bearer_token: bearer.trim(), groq_api_key: groq.trim() }, { onConflict: 'org_id' })).error
        : (await supabase.from('app_config').upsert({ user_id: user.id, bearer_token: bearer.trim(), groq_api_key: groq.trim() }, { onConflict: 'user_id' })).error
      if (err) throw new Error(err.message)
      setMsg('Enregistré ✓ — recharge la page pour l’appliquer partout.')
    } catch (e) { setMsg(`Échec : ${e instanceof Error ? e.message : 'erreur'}`) }
    setSaving(false)
  }

  const inp: CSSProperties = {
    ...FIELD, width: '100%', fontSize: 12, fontFamily: "'JetBrains Mono',monospace",
  }
  const eye = (on: boolean, set: (v: boolean) => void) => (
    <button type="button" onClick={() => set(!on)} style={{ flexShrink: 0, height: 32, minWidth: 64, padding: '0 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: '#161618', color: '#A1A1AA', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{on ? 'Cacher' : 'Voir'}</button>
  )

  return (
    <Panel theme={theme}>
      <PanelHead title="Connexions & clés"
        sub={currentOrg ? `Partagées par l’organisation « ${currentOrg.name} »` : 'Ton espace perso'}
        right={<Chip text={currentOrg ? 'Org' : 'Perso'} tone="violet" />} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? <span style={{ fontSize: 13, color: '#8B8B94' }}>Chargement…</span> : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>Token GeeLark (Bearer)</span>
              <span style={{ fontSize: 12, color: '#8B8B94', marginTop: -2, marginBottom: 2 }}>Indispensable pour piloter les téléphones et publier. Depuis GeeLark → OpenAPI.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={bearer} onChange={e => setBearer(e.target.value)} type={showBearer ? 'text' : 'password'} placeholder="Bearer token GeeLark…" style={inp} disabled={readOnly} spellCheck={false} autoComplete="off" />
                {eye(showBearer, setShowBearer)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>Clé API Groq</span>
              <span style={{ fontSize: 12, color: '#8B8B94', marginTop: -2, marginBottom: 2 }}>Pour les légendes IA et les sous-titres (Whisper). Optionnelle.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={groq} onChange={e => setGroq(e.target.value)} type={showGroq ? 'text' : 'password'} placeholder="gsk_…" style={inp} disabled={readOnly} spellCheck={false} autoComplete="off" />
                {eye(showGroq, setShowGroq)}
              </div>
            </div>
            {readOnly
              ? <span style={{ fontSize: 12, color: '#FBBF24' }}>Seuls owner/admin de l’organisation peuvent modifier ces clés.</span>
              : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <Btn theme={theme} tone="primary" label={saving ? 'Enregistrement…' : 'Enregistrer'} disabled={saving} onClick={save} />
                  {msg && <span style={{ fontSize: 12, color: msg.startsWith('Échec') ? '#F87171' : '#4ADE80' }}>{msg}</span>}
                </div>
              )}
          </>
        )}
      </div>
    </Panel>
  )
}

// ══════════ NOTIFICATIONS (visuel-only) ══════════
function NotifTab({ theme, email }: { theme: Theme; email: string | null }) {
  const rows: { l: string; hint?: string; on: boolean }[] = [
    { l: 'Diffusion terminée', on: true },
    { l: 'Échec de publication', hint: 'Recommandé', on: true },
    { l: 'Compte à risque', hint: 'Score de santé sous 70', on: true },
    { l: 'Crédits bas', hint: 'Sous 500 crédits restants', on: true },
    { l: 'Appareil hors ligne', on: false },
    { l: 'Résumé hebdomadaire', hint: 'Chaque lundi matin', on: true },
  ]
  return (
    <>
      <Panel theme={theme}>
        <PanelHead title="Quand te prévenir" sub="Préférences à venir" />
        {rows.map(r => <Field key={r.l} label={r.l} hint={r.hint}><Toggle theme={theme} on={r.on} /></Field>)}
      </Panel>
      <div style={{ marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Canaux" />
          <Field label="E-mail"><ReadValue value={email ?? DASH} /></Field>
          <Field label="Webhook" hint="Reçoit chaque événement en JSON"><ReadValue value={DASH} /></Field>
        </Panel>
      </div>
    </>
  )
}

// ══════════ SÉCURITÉ (visuel-only) ══════════
function SecurityTab({ theme }: { theme: Theme }) {
  return (
    <>
      <Panel theme={theme}>
        <PanelHead title="Accès" sub="À venir" />
        <Field label="Authentification à deux facteurs" hint="Application d’authentification">
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Chip text="Inactive" tone="mute" />
            <Btn label="Configurer" theme={theme} sm tone="quiet" />
          </span>
        </Field>
        <Field label="Sessions actives">
          <span style={{ fontSize: 13, color: '#5A5A63' }}>—</span>
        </Field>
        <Field label="Clés API">
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5A5A63' }}>—</span>
        </Field>
      </Panel>
      <div style={{ marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Journal d’audit" />
          <Empty icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6"
            title="Aucune activité à afficher" text="Le journal d’audit détaillé sera branché prochainement." />
        </Panel>
      </div>
    </>
  )
}
