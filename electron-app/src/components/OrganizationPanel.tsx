import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Organization, type OrgMember, type OrgInvite, type OrgRole, type PermOverrides, type PageKey } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { ROLE_LABELS, ALL_TABS, canManageOrg } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

interface Props { user: User }

interface MemberRow extends OrgMember {
  email: string | null
}

// Generate URL-safe random token
function genToken(): string {
  const a = new Uint8Array(24)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

export function OrganizationPanel({ user }: Props) {
  const { myOrgs, currentOrg, refresh, switchOrg } = useOrg()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [joinToken, setJoinToken] = useState('')
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState<string | null>(null)
  const [err, setErr]           = useState<string | null>(null)

  // Detail view (admin / owner) for currentOrg
  const [members, setMembers]   = useState<MemberRow[]>([])
  const [invites, setInvites]   = useState<OrgInvite[]>([])
  const [editing, setEditing]   = useState<string | null>(null)  // member.id being edited

  // Invite form
  const [invLabel, setInvLabel] = useState('')
  const [invRole,  setInvRole]  = useState<Exclude<OrgRole, 'owner'>>('member')

  const myMembership = myOrgs.find(x => x.org.id === currentOrg?.id)?.member
  const myRole       = myMembership?.role ?? null
  const canManage    = myRole ? canManageOrg(myRole) : false

  function flash(text: string, isErr = false) {
    if (isErr) { setErr(text); setMsg(null) } else { setMsg(text); setErr(null) }
    setTimeout(() => { setMsg(null); setErr(null) }, 3500)
  }

  async function loadOrgDetail(orgId: string) {
    const [m, i] = await Promise.all([
      supabase.from('organization_members').select('*').eq('org_id', orgId),
      supabase.from('organization_invites').select('*').eq('org_id', orgId).is('accepted_at', null).order('created_at', { ascending: false }),
    ])
    const memberRows = (m.data ?? []) as OrgMember[]
    // Fetch emails via auth.users join — fallback to id substring if not allowed
    const emails: Record<string, string> = {}
    for (const mem of memberRows) {
      const { data: prof } = await supabase.from('profiles').select('email').eq('id', mem.user_id).maybeSingle()
      emails[mem.user_id] = prof?.email ?? mem.user_id.slice(0, 8)
    }
    setMembers(memberRows.map(r => ({ ...r, email: emails[r.user_id] ?? null })))
    setInvites((i.data ?? []) as OrgInvite[])
  }

  useEffect(() => {
    if (currentOrg) loadOrgDetail(currentOrg.id)
    else { setMembers([]); setInvites([]) }
  }, [currentOrg?.id])

  async function createOrg() {
    if (!newName.trim()) return
    setBusy(true)
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: newName.trim(), owner_id: user.id })
      .select()
      .single()
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Organisation créée ✓')
    setNewName('')
    setCreating(false)
    await refresh()
    if (data) switchOrg(data.id)
  }

  async function deleteOrg(org: Organization) {
    if (!confirm(`Supprimer "${org.name}" ? Cette action est irréversible.`)) return
    setBusy(true)
    const { error } = await supabase.from('organizations').delete().eq('id', org.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Organisation supprimée')
    switchOrg(null)
    await refresh()
  }

  async function leaveOrg(orgId: string) {
    if (!confirm('Quitter cette organisation ?')) return
    setBusy(true)
    const { error } = await supabase.from('organization_members').delete()
      .eq('org_id', orgId).eq('user_id', user.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Tu as quitté l\'organisation')
    switchOrg(null)
    await refresh()
  }

  async function createInvite() {
    if (!currentOrg) return
    setBusy(true)
    const token = genToken()
    // Email field is just a label/note now — the token is what matters.
    const label = invLabel.trim() || `Invitation ${new Date().toLocaleDateString('fr-FR')}`
    const { data, error } = await supabase.from('organization_invites').insert({
      org_id: currentOrg.id, email: label,
      token, role: invRole, invited_by: user.id,
    }).select().single()
    setBusy(false)
    if (error) { flash(error.message, true); return }
    setInvLabel('')
    if (data) {
      navigator.clipboard.writeText(data.token).catch(() => {})
      flash('Code généré et copié ✓ — partage-le, il ne marche qu\'une fois')
    }
    await loadOrgDetail(currentOrg.id)
  }

  async function revokeInvite(inv: OrgInvite) {
    setBusy(true)
    await supabase.from('organization_invites').delete().eq('id', inv.id)
    setBusy(false)
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function acceptInvite() {
    const token = joinToken.trim()
    if (!token) return
    setBusy(true)
    const { data, error } = await supabase.rpc('accept_org_invite', { p_token: token })
    setBusy(false)
    if (error) {
      const msg = /invite_not_found/.test(error.message)     ? 'Code d\'invitation invalide'
                : /invite_already_used/.test(error.message)  ? 'Ce code a déjà été utilisé'
                : /invite_expired/.test(error.message)       ? 'Code expiré'
                : error.message
      flash(msg, true)
      return
    }
    setJoinToken('')
    flash('Bienvenue dans l\'organisation ✓')
    await refresh()
    if (data) switchOrg(data as string)
  }

  async function changeRole(member: MemberRow, newRole: OrgRole) {
    if (member.role === 'owner') { flash('Le propriétaire ne peut pas changer de rôle', true); return }
    setBusy(true)
    const { error } = await supabase.from('organization_members').update({ role: newRole }).eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function savePerms(member: MemberRow, perms: PermOverrides) {
    setBusy(true)
    const { error } = await supabase.from('organization_members')
      .update({ perm_overrides: perms }).eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Permissions mises à jour ✓')
    setEditing(null)
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function removeMember(member: MemberRow) {
    if (member.role === 'owner') { flash('Impossible de retirer le propriétaire', true); return }
    if (!confirm(`Retirer ${member.email ?? 'ce membre'} ?`)) return
    setBusy(true)
    const { error } = await supabase.from('organization_members').delete().eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Membre retiré')
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  return (
    <div className="space-y-5">
      {(msg || err) && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${err ? 'bg-danger/10 text-danger border border-danger/30' : 'bg-ok/10 text-ok border border-ok/30'}`}>
          {err ?? msg}
        </div>
      )}

      {/* My orgs */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text">🏢 Mes organisations</h2>
          <Button size="sm" onClick={() => setCreating(v => !v)}>+ Nouvelle</Button>
        </div>

        {creating && (
          <div className="flex gap-2 items-center bg-surface rounded-lg p-3">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom de l'organisation"
              onKeyDown={e => { if (e.key === 'Enter') createOrg() }} />
            <Button size="sm" onClick={createOrg} loading={busy}>Créer</Button>
            <Button size="sm" variant="secondary" onClick={() => setCreating(false)}>Annuler</Button>
          </div>
        )}

        {myOrgs.length === 0 ? (
          <p className="text-text2 text-sm">Aucune organisation. Crée-en une ou rejoins-en une avec un code d'invitation.</p>
        ) : (
          <ul className="space-y-2">
            {myOrgs.map(({ org, member }) => (
              <li key={org.id} className={`flex items-center gap-3 p-3 rounded-lg border ${currentOrg?.id === org.id ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface'}`}>
                <span className="text-xl">🏢</span>
                <div className="flex-1 min-w-0">
                  <p className="text-text font-medium truncate">{org.name}</p>
                  <p className="text-text2 text-xs">{ROLE_LABELS[member.role]}</p>
                </div>
                {currentOrg?.id !== org.id && (
                  <Button size="sm" variant="secondary" onClick={() => switchOrg(org.id)}>Activer</Button>
                )}
                {member.role === 'owner' ? (
                  <Button size="sm" variant="danger" onClick={() => deleteOrg(org)}>Supprimer</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => leaveOrg(org.id)}>Quitter</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Join via token */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-text">🎟 Rejoindre une organisation</h2>
        <div className="flex gap-2">
          <Input value={joinToken} onChange={e => setJoinToken(e.target.value)} placeholder="Colle ton code d'invitation"
            onKeyDown={e => { if (e.key === 'Enter') acceptInvite() }} />
          <Button onClick={acceptInvite} loading={busy} disabled={!joinToken.trim()}>Rejoindre</Button>
        </div>
      </section>

      {/* Members management (only for admin/owner of currentOrg) */}
      {currentOrg && canManage && (
        <section className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-text">👥 Membres de "{currentOrg.name}"</h2>

          <ul className="space-y-2">
            {members.map(m => {
              const isMe = m.user_id === user.id
              return (
                <li key={m.id} className="bg-surface rounded-lg border border-border">
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">
                      {(m.email ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-sm font-medium truncate">{m.email ?? m.user_id} {isMe && <span className="text-text2">(toi)</span>}</p>
                      <p className="text-text2 text-xs">Rejoint {new Date(m.joined_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <select
                      value={m.role}
                      disabled={m.role === 'owner' || isMe}
                      onChange={e => changeRole(m, e.target.value as OrgRole)}
                      className="bg-bg border border-border rounded px-2 py-1 text-xs text-text disabled:opacity-50"
                    >
                      <option value="owner" disabled>Propriétaire</option>
                      <option value="admin">Admin</option>
                      <option value="member">Membre</option>
                      <option value="viewer">Lecteur</option>
                    </select>
                    {m.role !== 'owner' && (
                      <>
                        <button onClick={() => setEditing(editing === m.id ? null : m.id)} className="text-xs text-accent hover:text-accent2 px-2">
                          {editing === m.id ? 'Fermer' : 'Permissions'}
                        </button>
                        {!isMe && <button onClick={() => removeMember(m)} className="text-xs text-danger hover:opacity-80 px-2">Retirer</button>}
                      </>
                    )}
                  </div>
                  {editing === m.id && (
                    <PermEditor
                      member={m}
                      onSave={perms => savePerms(m, perms)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>

          {/* Invites */}
          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="text-xs font-bold text-text uppercase tracking-wider">Générer un code d'invitation</h3>
            <p className="text-text2 text-xs">Chaque code est <strong className="text-text">à usage unique</strong> : une fois utilisé pour rejoindre, il devient invalide.</p>
            <div className="flex gap-2">
              <Input value={invLabel} onChange={e => setInvLabel(e.target.value)} placeholder="Note (ex: Pour Pierre) — optionnel" />
              <select
                value={invRole}
                onChange={e => setInvRole(e.target.value as Exclude<OrgRole, 'owner'>)}
                className="bg-bg border border-border rounded px-2 py-1 text-sm text-text"
              >
                <option value="admin">Admin</option>
                <option value="member">Membre</option>
                <option value="viewer">Lecteur</option>
              </select>
              <Button onClick={createInvite} loading={busy}>🎟 Générer un code</Button>
            </div>

            {invites.length > 0 && (
              <ul className="space-y-1.5">
                <p className="text-[10px] text-text2 uppercase tracking-wider">Codes en attente</p>
                {invites.map(inv => (
                  <li key={inv.id} className="flex items-center gap-2 bg-surface px-3 py-2 rounded-lg text-xs">
                    <span className="flex-1 truncate text-text">{inv.email}</span>
                    <span className="text-text2">{ROLE_LABELS[inv.role as OrgRole]}</span>
                    <code
                      onClick={() => { navigator.clipboard.writeText(inv.token); flash('Code copié ✓') }}
                      className="bg-bg px-2 py-1 rounded font-mono text-[10px] cursor-pointer hover:text-accent"
                      title="Cliquer pour copier le code complet"
                    >{inv.token.slice(0, 12)}…</code>
                    <button onClick={() => revokeInvite(inv)} className="text-danger hover:opacity-70" title="Révoquer ce code">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Per-member permission editor ────────────────────────────────────────────
function PermEditor({
  member, onSave, onCancel,
}: {
  member: OrgMember
  onSave: (p: PermOverrides) => void
  onCancel: () => void
}) {
  const init = member.perm_overrides ?? {}
  const [tabs, setTabs] = useState<Partial<Record<PageKey, boolean>>>(init.tabs ?? {})
  const [bankMode, setBankMode] = useState<'all' | 'allow' | 'deny'>(init.bank_folders?.mode ?? 'all')
  const [bankList, setBankList] = useState<string>(
    init.bank_folders && init.bank_folders.mode !== 'all' ? init.bank_folders.list.join(', ') : ''
  )

  function toggle(tab: PageKey, v: boolean | undefined) {
    setTabs(prev => {
      const next = { ...prev }
      if (v === undefined) delete next[tab]
      else next[tab] = v
      return next
    })
  }

  function save() {
    const out: PermOverrides = {}
    if (Object.keys(tabs).length > 0) out.tabs = tabs
    if (bankMode === 'all') {
      out.bank_folders = { mode: 'all' }
    } else {
      const list = bankList.split(',').map(s => s.trim()).filter(Boolean)
      out.bank_folders = { mode: bankMode, list }
    }
    onSave(out)
  }

  return (
    <div className="border-t border-border p-3 space-y-3 bg-bg/50">
      <div>
        <p className="text-xs font-bold text-text mb-2">Onglets accessibles</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TABS.map(t => {
            const v = tabs[t.key]
            return (
              <div key={t.key} className="flex items-center gap-2 bg-surface rounded px-2 py-1.5">
                <span className="text-base">{t.icon}</span>
                <span className="flex-1 text-xs text-text">{t.label}</span>
                <select
                  value={v === undefined ? 'default' : v ? 'allow' : 'deny'}
                  onChange={e => {
                    const val = e.target.value
                    toggle(t.key, val === 'default' ? undefined : val === 'allow')
                  }}
                  className="bg-bg border border-border rounded text-[10px] px-1 py-0.5 text-text"
                >
                  <option value="default">Par défaut</option>
                  <option value="allow">Autorisé</option>
                  <option value="deny">Bloqué</option>
                </select>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-text mb-2">Dossiers de la banque</p>
        <div className="flex flex-col gap-2">
          <select value={bankMode} onChange={e => setBankMode(e.target.value as 'all' | 'allow' | 'deny')}
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text">
            <option value="all">Tous les dossiers</option>
            <option value="allow">Uniquement ces dossiers…</option>
            <option value="deny">Tous sauf ces dossiers…</option>
          </select>
          {bankMode !== 'all' && (
            <Input value={bankList} onChange={e => setBankList(e.target.value)}
              placeholder="dossier1, dossier2, (racine)" />
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button size="sm" onClick={save}>Enregistrer</Button>
      </div>
    </div>
  )
}
