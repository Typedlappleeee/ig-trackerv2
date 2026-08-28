import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, Empty } from '@/lib/ui'
import { supabase, type OrgRole } from '@/lib/supabase'
import { fetchBalance, fetchOrgBalance, fmtNumber, type OrgState } from '@/lib/data'

// ── Sections (portées de _settings() du prototype v10) ───────────────────────────
type Tab = 'account' | 'org' | 'members' | 'billing' | 'infra' | 'notif' | 'security'
// On ne garde que les sections RÉELLES. Les onglets placeholder (Infrastructure /
// Notifications / Sécurité, tous « à venir ») sont retirés : pas de config proxy à
// gérer côté desktop (tout passe par GeeLark / la config web).
const SECTIONS: { k: Tab; l: string; i: string }[] = [
  { k: 'account', l: 'Profil', i: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { k: 'org', l: 'Organisation', i: 'M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4' },
  { k: 'members', l: 'Membres & rôles', i: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8' },
  { k: 'billing', l: 'Abonnement & crédits', i: 'M2 8h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z|M2 8l2-4h16l2 4|M12 12v4' },
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>
      <span style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#E4E4E7' }}>{label}</span>
        {hint ? <span style={{ fontSize: 11, color: '#52525B' }}>{hint}</span> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  )
}

// Champ texte lecture-seule (aucune donnée inventée : la vraie valeur ou « — »).
function ReadValue({ value, mono }: { value: ReactNode; mono?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 11px', borderRadius: 7,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', maxWidth: 320,
      fontFamily: mono ? "'JetBrains Mono',monospace" : undefined, fontSize: mono ? 11.5 : 12, color: '#F4F4F6',
    }}>{value}</span>
  )
}

// Toggle purement visuel (les préférences ne sont pas persistées dans cette passe).
function Toggle({ theme, on }: { theme: Theme; on: boolean }) {
  return (
    <span aria-hidden style={{
      display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 34, height: 19,
      padding: 2, borderRadius: 99, flexShrink: 0, background: on ? theme.accent : 'rgba(255,255,255,0.1)',
    }}>
      <span style={{ width: 15, height: 15, borderRadius: 99, background: '#fff' }} />
    </span>
  )
}

const DASH = <span style={{ color: '#52525B' }}>—</span>

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
            display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 11px', border: 'none',
            borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
            background: on ? `rgba(${theme.tone},0.11)` : 'transparent', color: on ? theme.accentText : '#A1A1AA',
            fontSize: 12.5, fontWeight: on ? 700 : 500, transition: 'all .14s ease',
          }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
            <span style={{ display: 'flex', flexShrink: 0, opacity: on ? 1 : 0.6 }}><Icon d={x.i} size={15} /></span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.l}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Réglages" sub="Ton profil, ton organisation, tes membres et ton abonnement." />
      <div style={{ display: 'grid', gridTemplateColumns: '208px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        {menu}
        <div style={{ minWidth: 0 }}>
          {tab === 'account' && <AccountTab theme={theme} user={user} displayName={displayName} onSignOut={onSignOut}
            nameInput={nameInput} setNameInput={setNameInput} savingName={savingName} saveName={saveName} notice={notice} onNavigate={onNavigate} />}
          {tab === 'org' && <OrgTab theme={theme} org={org} balance={balance} canManage={canManage} />}
          {tab === 'members' && <MembersTab theme={theme} org={org} members={members} canManage={canManage} currentUserId={user.id} onReload={loadMembers} />}
          {tab === 'billing' && <BillingTab theme={theme} org={org} balance={balance} canManage={canManage} />}
          {tab === 'infra' && <InfraTab theme={theme} />}
          {tab === 'notif' && <NotifTab theme={theme} email={user.email ?? null} />}
          {tab === 'security' && <SecurityTab theme={theme} />}
        </div>
      </div>
    </div>
  )
}

// ══════════ PROFIL — c'est ici la déconnexion officielle ══════════
function AccountTab({ theme, user, displayName, onSignOut, nameInput, setNameInput, savingName, saveName, notice, onNavigate }: {
  theme: Theme; user: User; displayName: string | null; onSignOut: () => void
  nameInput: string; setNameInput: (v: string) => void; savingName: boolean; saveName: () => void; notice: string | null; onNavigate?: (p: string) => void
}) {
  const initial = initialsFrom(displayName, user.email ?? null)
  return (
    <>
      <Panel theme={theme}>
        <PanelHead title="Mon profil" sub="Ton compte ScaleFlow" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px' }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(140deg,#3F3F46,#27272A)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#E4E4E7', fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700,
          }}>{initial}</span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F6' }}>
              {displayName?.trim() || <span style={{ fontStyle: 'italic', color: '#71717A' }}>Aucun nom</span>}
            </span>
            <span style={{ fontSize: 12, color: '#71717A' }}>{user.email ?? '—'}</span>
          </span>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Field label="Nom affiché" hint="Visible par les autres membres">
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Ton nom" style={{ width: 200, height: 30, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, outline: 'none' }} />
              <Btn label={savingName ? '…' : 'Enregistrer'} theme={theme} sm tone="primary" disabled={savingName || nameInput.trim() === (displayName ?? '').trim()} onClick={saveName} />
            </span>
          </Field>
          <Field label="Adresse e-mail" hint="Identifiant de connexion">
            <ReadValue value={user.email ?? DASH} />
          </Field>
        </div>
      </Panel>

      {notice && (
        <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: 8, background: `rgba(${theme.tone},0.08)`, border: `1px solid rgba(${theme.tone},0.22)`, fontSize: 12, color: '#E4E4E7' }}>{notice}</div>
      )}

      {/* CTA : connecte tes comptes pour tes stats officielles */}
      <div style={{ marginTop: 12 }}>
        <Panel theme={theme} style={{ background: `linear-gradient(120deg, rgba(${theme.tone},0.1), ${theme.panelBg})`, border: `1px solid rgba(${theme.tone},0.28)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: `rgba(${theme.tone},0.14)`, border: `1px solid rgba(${theme.tone},0.3)`, color: theme.accentText }}>
              <Icon d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" size={17} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#F4F4F6' }}>Connecte tes comptes Instagram</div>
              <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Vues, abonnés et engagement officiels dans Performances — via l'API Meta.</div>
            </span>
            <Btn label="Connexions" theme={theme} tone="primary" icon="M5 3l14 9-14 9z" onClick={() => onNavigate?.('connections')} />
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Session" />
          <Field label="Se déconnecter" hint="Ferme ta session sur cet appareil">
            <Btn label="Se déconnecter" theme={theme} tone="danger" onClick={onSignOut}
              icon="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9" />
          </Field>
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
  if (!currentOrg) {
    return (
      <Panel theme={theme}>
        <PanelHead title="Organisation" />
        <div style={{ padding: '10px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ display: 'flex', color: theme.accentText }}><Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" size={16} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F4F4F6' }}>Espace personnel</span>
              <span style={{ fontSize: 11.5, color: '#71717A' }}>Tu travailles hors organisation. Tes appareils et ton contenu sont privés.</span>
            </span>
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
          <Field label="Crédits de l’organisation">
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#FBBF24' }}>
              {balance === null ? '…' : fmtNumber(balance)}
            </span>
          </Field>
        </div>
      </Panel>
      {canManage && (
        <div style={{ marginTop: 12 }}>
          <Panel theme={theme}>
            <PanelHead title="Zone sensible" />
            <Field label="Transférer la propriété" hint="Un autre owner reprend l’organisation">
              <Btn label="Transférer" theme={theme} sm tone="quiet" />
            </Field>
            <Field label="Supprimer l’organisation" hint="Irréversible">
              <Btn label="Supprimer" theme={theme} sm tone="danger" />
            </Field>
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
      {canManage && (
        <Panel theme={theme} style={{ marginBottom: 12 }}>
          <PanelHead title="Inviter dans l’organisation" sub="La personne reçoit un lien par e-mail" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '15px 16px', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#71717A' }}>Adresse e-mail</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 11px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ display: 'flex', color: '#52525B' }}><Icon d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M22 6l-10 7L2 6" size={13} /></span>
                <span style={{ flex: 1, fontSize: 12, color: '#52525B' }}>prenom@agence.fr</span>
              </span>
            </span>
            <Btn label="Envoyer l’invitation" theme={theme} tone="primary" icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" />
          </div>
        </Panel>
      )}

      <Panel theme={theme}>
        <PanelHead title="Membres" right={<Chip text={loading ? '…' : String(list.length)} tone="mute" />} />
        {loading ? (
          <div style={{ padding: '24px 16px', fontSize: 12, color: '#52525B' }}>…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12, color: '#71717A' }}>Aucun membre.</div>
        ) : (
          <div data-rows="">
            {list.map((m, i) => {
              const isMe = m.user_id === currentUserId
              const av = ROLE_AV[m.role]
              return (
                <div key={m.id} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) 108px 120px', gap: 12, alignItems: 'center',
                  padding: '11px 16px', fontSize: 12, borderBottom: i < list.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 99, flexShrink: 0,
                      background: `rgba(${av},0.16)`, border: `1px solid rgba(${av},0.3)`, color: `rgb(${av})`, fontSize: 11, fontWeight: 700,
                    }}>{initialsFrom(m.display_name, m.email)}</span>
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.display_name?.trim() || m.email || m.user_id.slice(0, 8)}
                      </span>
                      <span style={{ fontSize: 11, color: '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.email ?? '—'}
                      </span>
                    </span>
                  </span>
                  <span><Chip text={ROLE_LABEL[m.role]} tone={ROLE_TONE[m.role]} /></span>
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
                    {isMe ? (
                      <span style={{ fontSize: 11, color: '#3F3F46' }}>c’est toi</span>
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
                <div key={r.r} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none' }}>
                  <span style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: `rgb(${tone})` }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F4F4F6' }}>{ROLE_LABEL[r.r]}</span>
                    </span>
                    <span style={{ fontSize: 11, lineHeight: 1.45, color: '#52525B' }}>{r.d}</span>
                  </span>
                  <span style={{ flex: 1, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {r.can.map(c => (
                      <span key={c} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: `rgba(${tone},0.08)`, border: `1px solid rgba(${tone},0.2)`, color: `rgb(${tone})` }}>{c}</span>
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
function BillingTab({ theme, org, balance, canManage }: {
  theme: Theme; org: OrgState; balance: number | null; canManage: boolean
}) {
  const { currentOrg } = org
  const planLabel = currentOrg ? 'Organisation' : 'Espace personnel'
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, padding: '18px 20px', borderRadius: 11, marginBottom: 12, flexWrap: 'wrap',
        background: `linear-gradient(120deg, rgba(${theme.tone},0.1), ${theme.panelBg})`, border: `1px solid rgba(${theme.tone},0.3)`,
      }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.accentText }}>Plan actuel</span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: '#F4F4F6' }}>{planLabel}</span>
        </span>
        <span style={{ width: 1, height: 52, background: 'rgba(255,255,255,0.08)' }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#52525B' }}>Crédits disponibles</span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: '#FBBF24', fontVariantNumeric: 'tabular-nums' }}>
            {balance === null ? '…' : fmtNumber(balance)}
          </span>
        </span>
        {canManage && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
            <Btn label="Gérer" theme={theme} sm tone="primary" />
          </span>
        )}
      </div>

      <Panel theme={theme}>
        <PanelHead title="Solde" sub={balance === null ? undefined : `≈ ${fmtNumber(Math.floor(balance / 2))} publications restantes`} />
        <div style={{ padding: '15px 16px' }}>
          <span style={{ display: 'block', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${balance === null ? 0 : Math.min(100, Math.round((balance / 5000) * 100))}%`, borderRadius: 99, background: `linear-gradient(90deg,${theme.accent},${theme.accentSoft})` }} />
          </span>
          <div style={{ marginTop: 10, fontSize: 11.5, color: '#71717A' }}>
            Publication : 2 crédits / appareil · Story : 1 crédit / appareil · Tâches automatiques : 50 crédits / jour.
          </div>
        </div>
      </Panel>
    </>
  )
}

// ══════════ INFRASTRUCTURE (visuel-only) ══════════
function InfraTab({ theme }: { theme: Theme }) {
  return (
    <>
      <Panel theme={theme}>
        <PanelHead title="Agent ScaleFlow Cloud" right={<Chip text="Bientôt" tone="mute" />} sub="Configuration à venir" />
        <Field label="URL de l’agent"><ReadValue value={DASH} /></Field>
        <Field label="Token" hint="Généré à l’installation"><ReadValue mono value="••••••••" /></Field>
        <Field label="Boot automatique" hint="Démarre les appareils avant une tâche"><Toggle theme={theme} on={true} /></Field>
      </Panel>
      <div style={{ marginTop: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="GeeLark" right={<Chip text="Secondaire" tone="mute" />} sub="Conservé pour tes appareils loués" />
          <Field label="Bearer token"><ReadValue mono value="••••••••" /></Field>
          <Field label="Garder GeeLark actif"><Toggle theme={theme} on={true} /></Field>
        </Panel>
      </div>
    </>
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
          <span style={{ fontSize: 12, color: '#A1A1AA' }}>—</span>
        </Field>
        <Field label="Clés API">
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#71717A' }}>—</span>
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
