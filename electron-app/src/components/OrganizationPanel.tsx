import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Organization, type OrgMember, type OrgInvite, type OrgRole, type PermOverrides, type PageKey } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { ROLE_LABELS, ALL_TABS, canManageOrg } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Onboarding } from '@/components/Onboarding'

interface Props { user: User }

interface MemberRow extends OrgMember {
  email:        string | null
  display_name: string | null
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
  // Set to the new org's id right after createOrg succeeds; triggers the API setup wizard.
  const [setupForOrg, setSetupForOrg] = useState<string | null>(null)

  // Detail view (admin / owner) for currentOrg
  const [members, setMembers]     = useState<MemberRow[]>([])
  const [invites, setInvites]     = useState<OrgInvite[]>([])
  const [editing, setEditing]     = useState<string | null>(null)  // member.id being edited
  const [folders, setFolders]     = useState<string[]>([])
  const [groups, setGroups]       = useState<string[]>([])

  // My display name (in profiles, visible to all org members)
  const [myDisplayName, setMyDisplayName] = useState('')
  const [editingName, setEditingName]     = useState(false)

  // Org rename
  const [renamingOrgId, setRenamingOrgId] = useState<string | null>(null)
  const [renameValue, setRenameValue]     = useState('')

  // Invite form
  const [invLabel, setInvLabel] = useState('')
  const [invRole,  setInvRole]  = useState<Exclude<OrgRole, 'owner'>>('member')

  const [orgTab, setOrgTab] = useState<'orgas' | 'membres' | 'logs'>('orgas')

  // Activity logs (admin/owner only)
  interface ActivityLog { id: string; user_email: string | null; action: string; details: Record<string, unknown>; created_at: string }
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [logsLoading, setLogsLoading]   = useState(false)

  async function loadLogs() {
    if (!currentOrg) return
    setLogsLoading(true)
    const { data } = await supabase.from('activity_logs')
      .select('id,user_email,action,details,created_at')
      .eq('org_id', currentOrg.id)
      .order('created_at', { ascending: false })
      .limit(200)
    setActivityLogs((data ?? []) as ActivityLog[])
    setLogsLoading(false)
  }

  useEffect(() => { if (orgTab === 'logs' && canManage) loadLogs() }, [orgTab, currentOrg?.id])

  const myMembership = myOrgs.find(x => x.org.id === currentOrg?.id)?.member
  const myRole       = myMembership?.role ?? null
  const canManage    = myRole ? canManageOrg(myRole) : false

  function flash(text: string, isErr = false) {
    if (isErr) { setErr(text); setMsg(null) } else { setMsg(text); setErr(null) }
    setTimeout(() => { setMsg(null); setErr(null) }, 3500)
  }

  // Load my profile (display_name)
  useEffect(() => {
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => setMyDisplayName(data?.display_name ?? ''))
  }, [user.id])

  async function loadOrgDetail(orgId: string) {
    const [m, i, b, p] = await Promise.all([
      supabase.from('organization_members').select('*').eq('org_id', orgId),
      supabase.from('organization_invites').select('*').eq('org_id', orgId).is('accepted_at', null).order('created_at', { ascending: false }),
      // Distinct folders / groups for this org → used by the dropdowns in PermEditor
      supabase.from('content_bank').select('folder').eq('org_id', orgId),
      supabase.from('phones').select('group_name').eq('org_id', orgId),
    ])
    const memberRows = (m.data ?? []) as OrgMember[]

    // Fetch profile (email + display_name) for each member
    const profiles: Record<string, { email: string | null; display_name: string | null }> = {}
    if (memberRows.length > 0) {
      const ids = memberRows.map(r => r.user_id)
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in('id', ids)
      for (const p of profs ?? []) {
        profiles[p.id] = { email: p.email, display_name: p.display_name }
      }
    }

    setMembers(memberRows.map(r => ({
      ...r,
      email:        profiles[r.user_id]?.email ?? null,
      display_name: profiles[r.user_id]?.display_name ?? null,
    })))
    setInvites((i.data ?? []) as OrgInvite[])

    const folderSet = new Set<string>()
    for (const row of (b.data ?? []) as { folder: string | null }[]) {
      folderSet.add(row.folder ?? '(racine)')
    }
    setFolders([...folderSet].sort())

    const groupSet = new Set<string>()
    for (const row of (p.data ?? []) as { group_name: string | null }[]) {
      groupSet.add(row.group_name ?? '(sans groupe)')
    }
    setGroups([...groupSet].sort())
  }

  useEffect(() => {
    if (currentOrg) loadOrgDetail(currentOrg.id)
    else { setMembers([]); setInvites([]); setFolders([]); setGroups([]) }
  }, [currentOrg?.id])

  async function saveDisplayName(name: string) {
    setBusy(true)
    const { error } = await supabase.from('profiles').upsert({
      id: user.id, email: user.email ?? '', display_name: name.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    setBusy(false)
    if (error) { flash(error.message, true); return }
    setMyDisplayName(name.trim())
    setEditingName(false)
    flash('Nom mis à jour ✓')
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function createOrg() {
    if (!newName.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_org', { p_name: newName.trim() })
    setBusy(false)
    if (error) {
      const msg = /not_authenticated/.test(error.message) ? 'Non authentifié — reconnecte-toi'
                : /name_required/.test(error.message)     ? 'Le nom est requis'
                : /org_limit_reached/.test(error.message) ? 'Tu ne peux créer qu\'une seule organisation'
                : error.message
      flash(msg, true)
      return
    }
    flash('Organisation créée ✓')
    setNewName('')
    setCreating(false)
    await refresh()
    if (data) {
      switchOrg(data as string)
      setSetupForOrg(data as string)
    }
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

  async function renameOrg(org: Organization) {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === org.name) { setRenamingOrgId(null); return }
    setBusy(true)
    const { error } = await supabase.from('organizations')
      .update({ name: trimmed, name_updated_at: new Date().toISOString() })
      .eq('id', org.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Nom de l\'organisation modifié')
    setRenamingOrgId(null)
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
    const orgId = data as string | null
    if (orgId) {
      const { data: org } = await supabase
        .from('organizations').select('owner_id').eq('id', orgId).maybeSingle()
      const { data: ownerKey } = await supabase
        .from('license_keys').select('expires_at')
        .eq('user_id', org?.owner_id ?? '').eq('is_active', true).maybeSingle()
      const expired = ownerKey?.expires_at ? new Date(ownerKey.expires_at) < new Date() : false
      if (!ownerKey || expired) {
        flash("Cette organisation n'a pas d'abonnement actif.", true)
        await refresh()
        return
      }
    }
    flash('Bienvenue dans l\'organisation ✓')
    await refresh()
    if (orgId) switchOrg(orgId)
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
    if (!confirm(`Retirer ${member.email ?? member.display_name ?? 'ce membre'} ?`)) return
    setBusy(true)
    const { error } = await supabase.from('organization_members').delete().eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Membre retiré')
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  function memberLabel(m: MemberRow): string {
    return m.display_name?.trim() || m.email || m.user_id.slice(0, 8)
  }

  if (setupForOrg) {
    return (
      <Onboarding
        user={user}
        orgId={setupForOrg}
        onComplete={() => setSetupForOrg(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {(msg || err) && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${err ? 'bg-danger/10 text-danger border border-danger/30' : 'bg-ok/10 text-ok border border-ok/30'}`}>
          {err ?? msg}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { k: 'orgas',   l: '🏢 Organisations' },
          { k: 'membres', l: '👥 Membres'        },
          ...(canManage ? [{ k: 'logs', l: '📋 Logs activité' }] : []),
        ] as const).map(t => (
          <button
            key={t.k}
            onClick={() => setOrgTab(t.k as typeof orgTab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              orgTab === t.k ? 'border-accent text-accent bg-accent/5' : 'border-transparent text-text2 hover:text-text'
            }`}
          >{t.l}</button>
        ))}
      </div>

      {/* ── Organisations tab ─────────────────────────────────────────────── */}
      {orgTab === 'orgas' && <>
        {/* My display name */}
        <section className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-text">👤 Mon nom dans les organisations</h2>
          <p className="text-text2 text-xs">Visible par les autres membres. Si vide, ton email est affiché.</p>
          {editingName ? (
            <DisplayNameEditor initial={myDisplayName} onSave={saveDisplayName} onCancel={() => setEditingName(false)} busy={busy} />
          ) : (
            <div className="flex items-center gap-3 bg-surface rounded-lg p-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">
                {(myDisplayName || user.email || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text text-sm font-medium truncate">{myDisplayName || <span className="text-text2 italic">Aucun nom — {user.email}</span>}</p>
                {myDisplayName && <p className="text-text2 text-xs truncate">{user.email}</p>}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditingName(true)}>✎ Modifier</Button>
            </div>
          )}
        </section>

        {/* My orgs */}
        <section className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">🏢 Mes organisations</h2>
            {!myOrgs.some(({ member }) => member.role === 'owner') && (
              <Button size="sm" onClick={() => setCreating(v => !v)}>+ Nouvelle</Button>
            )}
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
              {myOrgs.map(({ org, member }) => {
                const isOwner = member.role === 'owner'
                const lastChange = org.name_updated_at ?? org.created_at
                const daysSince  = Math.floor((Date.now() - new Date(lastChange).getTime()) / 86400000)
                const canRename  = isOwner && daysSince >= 90
                const daysLeft   = Math.max(0, 90 - daysSince)
                const isRenaming = renamingOrgId === org.id
                return (
                  <li key={org.id} className={`rounded-lg border ${currentOrg?.id === org.id ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface'}`}>
                    <div className="flex items-center gap-3 p-3">
                      <span className="text-xl">🏢</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-text font-medium truncate">{org.name}</p>
                        <p className="text-text2 text-xs">{ROLE_LABELS[member.role]}</p>
                      </div>
                      {currentOrg?.id !== org.id && (
                        <Button size="sm" variant="secondary" onClick={() => { switchOrg(org.id); window.location.reload() }}>Activer</Button>
                      )}
                      {isOwner && !isRenaming && (
                        <Button size="sm" variant="secondary"
                          onClick={() => { setRenamingOrgId(org.id); setRenameValue(org.name) }}
                          disabled={!canRename}
                          title={canRename ? 'Renommer' : `Renommage disponible dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}>
                          ✎
                        </Button>
                      )}
                      {isOwner ? (
                        <Button size="sm" variant="danger" onClick={() => deleteOrg(org)}>Supprimer</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => leaveOrg(org.id)}>Quitter</Button>
                      )}
                    </div>
                    {isOwner && !canRename && (
                      <p className="px-3 pb-2 text-[11px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
                        🔒 Renommage disponible dans <strong>{daysLeft}</strong> jour{daysLeft > 1 ? 's' : ''}
                      </p>
                    )}
                    {isRenaming && (
                      <div className="flex gap-2 items-center px-3 pb-3">
                        <Input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          placeholder="Nouveau nom…" maxLength={48}
                          onKeyDown={e => { if (e.key === 'Enter') renameOrg(org); if (e.key === 'Escape') setRenamingOrgId(null) }} />
                        <Button size="sm" onClick={() => renameOrg(org)} loading={busy}>OK</Button>
                        <Button size="sm" variant="secondary" onClick={() => setRenamingOrgId(null)}>Annuler</Button>
                      </div>
                    )}
                  </li>
                )
              })}
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
      </>}

      {/* ── Membres tab ───────────────────────────────────────────────────── */}
      {orgTab === 'membres' && (
        !currentOrg ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
            <p className="text-2xl">🏢</p>
            <p className="text-text font-semibold">Aucune organisation active</p>
            <p className="text-text2 text-sm">Active une organisation dans l'onglet "Organisations" pour gérer ses membres.</p>
          </div>
        ) : !canManage ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
            <p className="text-2xl">🔒</p>
            <p className="text-text font-semibold">Accès réservé aux admins</p>
            <p className="text-text2 text-sm">Seuls les propriétaires et admins peuvent gérer les membres.</p>
          </div>
        ) : (
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-text">👥 Membres de "{currentOrg.name}"</h2>

            <ul className="space-y-2">
              {members.map(m => {
                const isMe = m.user_id === user.id
                const label = memberLabel(m)
                return (
                  <li key={m.id} className="bg-surface rounded-lg border border-border">
                    <div className="flex items-center gap-3 p-3">
                      <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">
                        {label[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text text-sm font-medium truncate">
                          {label} {isMe && <span className="text-text2">(toi)</span>}
                        </p>
                        <p className="text-text2 text-xs truncate">
                          {m.email ?? m.user_id} · Rejoint {new Date(m.joined_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <select
                        name="member-role"
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
                        availableFolders={folders}
                        availableGroups={groups}
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
              <p className="text-text2 text-xs">Chaque code est <strong className="text-text">à usage unique</strong> : une fois utilisé, il devient invalide.</p>
              <div className="flex gap-2">
                <Input value={invLabel} onChange={e => setInvLabel(e.target.value)} placeholder="Note (ex: Pour Pierre) — optionnel" />
                <select
                  name="invite-role"
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
        )
      )}
      {/* ── Logs tab ──────────────────────────────────────────────────────── */}
      {orgTab === 'logs' && canManage && (
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text">📋 Logs d'activité</h2>
              <p className="text-xs text-text2 mt-0.5">Actions récentes des membres (200 dernières)</p>
            </div>
            <button onClick={loadLogs} className="text-xs text-accent hover:opacity-70 transition-opacity">⟳ Rafraîchir</button>
          </div>
          {logsLoading ? (
            <div className="px-5 py-6 text-center text-xs text-text2">Chargement…</div>
          ) : activityLogs.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-text2">Aucune activité enregistrée pour cette organisation.</div>
          ) : (
            <div className="divide-y divide-border max-h-[600px] overflow-auto">
              {activityLogs.map(log => {
                const d = new Date(log.created_at)
                const label: Record<string, string> = {
                  posting_launched:      '📤 Posting lancé',
                  mass_posting_launched: '⚡ Mass Posting lancé',
                  warmup_launched:       '🔥 Warmup lancé',
                }
                return (
                  <div key={log.id} className="px-5 py-3 hover:bg-surface/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-text">{label[log.action] ?? log.action}</span>
                          <span className="text-[10px] text-accent font-mono">{log.user_email ?? '—'}</span>
                        </div>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            {typeof log.details.count === 'number' && (
                              <span className="text-[10px] text-text2">{log.details.count} téléphone(s)</span>
                            )}
                            {Array.isArray(log.details.phones) && (
                              <span className="text-[10px] text-text2 truncate max-w-xs">
                                {(log.details.phones as string[]).slice(0, 5).join(', ')}
                                {(log.details.phones as string[]).length > 5 ? ` +${(log.details.phones as string[]).length - 5}` : ''}
                              </span>
                            )}
                            {typeof log.details.file === 'string' && (
                              <span className="text-[10px] text-text2 font-mono">📎 {log.details.file}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-text2 flex-shrink-0 tabular-nums">
                        {d.toLocaleDateString('fr-FR')} {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ── Display name inline editor ──────────────────────────────────────────────
function DisplayNameEditor({ initial, onSave, onCancel, busy }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
  busy: boolean
}) {
  const [v, setV] = useState(initial)
  return (
    <div className="flex gap-2 items-center bg-surface rounded-lg p-3">
      <Input value={v} onChange={e => setV(e.target.value)} placeholder="Ton prénom / pseudo (ex: Alex)"
        onKeyDown={e => { if (e.key === 'Enter') onSave(v) }} />
      <Button size="sm" onClick={() => onSave(v)} loading={busy}>Enregistrer</Button>
      <Button size="sm" variant="secondary" onClick={onCancel}>Annuler</Button>
    </div>
  )
}

// ── Multi-select chip dropdown ──────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder }: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  function toggle(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter(x => x !== opt))
    else onChange([...selected, opt])
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 bg-bg border border-border rounded px-2 py-1.5 text-xs text-text text-left"
      >
        <span className="flex-1 truncate">
          {selected.length === 0
            ? <span className="text-text2">{placeholder}</span>
            : selected.join(', ')}
        </span>
        <span className="text-text2">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-[9991] bg-surface border border-border rounded-lg shadow-2xl max-h-48 overflow-auto">
            {options.length === 0 ? (
              <p className="text-text2 text-xs px-3 py-2 italic">Aucun élément disponible</p>
            ) : options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-accent"
                />
                <span className="flex-1 truncate">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Per-member permission editor ────────────────────────────────────────────
function PermEditor({
  member, availableFolders, availableGroups, onSave, onCancel,
}: {
  member: OrgMember
  availableFolders: string[]
  availableGroups: string[]
  onSave: (p: PermOverrides) => void
  onCancel: () => void
}) {
  const init = member.perm_overrides ?? {}
  const [tabs, setTabs] = useState<Partial<Record<PageKey, boolean>>>(init.tabs ?? {})

  const [bankMode, setBankMode] = useState<'all' | 'allow' | 'deny'>(init.bank_folders?.mode ?? 'all')
  const [bankList, setBankList] = useState<string[]>(
    init.bank_folders && init.bank_folders.mode !== 'all' ? init.bank_folders.list : []
  )

  const [groupMode, setGroupMode] = useState<'all' | 'allow'>(init.phone_groups?.mode ?? 'all')
  const [groupList, setGroupList] = useState<string[]>(
    init.phone_groups && init.phone_groups.mode === 'allow' ? init.phone_groups.list : []
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

    if (bankMode === 'all') out.bank_folders = { mode: 'all' }
    else                    out.bank_folders = { mode: bankMode, list: bankList }

    if (groupMode === 'all') out.phone_groups = { mode: 'all' }
    else                     out.phone_groups = { mode: 'allow', list: groupList }

    onSave(out)
  }

  return (
    <div className="border-t border-border p-3 space-y-4 bg-bg/50">
      <div>
        <p className="text-xs font-bold text-text mb-2">Onglets accessibles</p>
        <p className="text-[10px] text-text2 mb-2">
          ⚙ "Paramètres → Connexions" contrôle l'accès aux clés API de l'organisation (token GéeLark, Groq, etc.).
          Par défaut bloqué pour les membres et lecteurs.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TABS.map(t => {
            const v = tabs[t.key]
            return (
              <div key={t.key} className="flex items-center gap-2 bg-surface rounded px-2 py-1.5">
                <span className="text-base">{t.icon}</span>
                <span className="flex-1 text-xs text-text truncate" title={t.label}>{t.label}</span>
                <select
                  name="tool-permission"
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
          <select name="bank-mode" value={bankMode} onChange={e => setBankMode(e.target.value as 'all' | 'allow' | 'deny')}
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text">
            <option value="all">Tous les dossiers</option>
            <option value="allow">Uniquement ces dossiers…</option>
            <option value="deny">Tous sauf ces dossiers…</option>
          </select>
          {bankMode !== 'all' && (
            <MultiSelect
              options={availableFolders}
              selected={bankList}
              onChange={setBankList}
              placeholder="Sélectionne les dossiers…"
            />
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-text mb-2">Groupes de téléphones (GéeLark)</p>
        <div className="flex flex-col gap-2">
          <select name="group-mode" value={groupMode} onChange={e => setGroupMode(e.target.value as 'all' | 'allow')}
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text">
            <option value="all">Tous les groupes</option>
            <option value="allow">Uniquement ces groupes…</option>
          </select>
          {groupMode === 'allow' && (
            <MultiSelect
              options={availableGroups}
              selected={groupList}
              onChange={setGroupList}
              placeholder="Sélectionne les groupes GéeLark…"
            />
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
