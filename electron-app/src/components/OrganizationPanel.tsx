import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Organization, type OrgMember, type OrgInvite, type OrgRole, type OrgRoleTemplate, type PermOverrides, type PageKey, type ActionKey } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { ROLE_LABELS, ALL_TABS, ALL_ACTIONS, canManageOrg } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Onboarding } from '@/components/Onboarding'

interface Props { user: User }

interface MemberRow extends OrgMember {
  email:        string | null
  display_name: string | null
}

// ── Inline Lucide-style icon set (no emoji UI icons) ────────────────────────
type IconName =
  | 'building' | 'users' | 'roles' | 'logs' | 'user'
  | 'ticket' | 'pencil' | 'x' | 'lock' | 'settings' | 'paperclip'

function Icon({ name, size = 16, className, label }: {
  name: IconName
  size?: number
  className?: string
  /** When set, the icon is exposed to assistive tech with this label; otherwise it's decorative. */
  label?: string
}) {
  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const }
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className,
  }
  switch (name) {
    case 'building': // building-2
      return (
        <svg {...common} {...a11y}>
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
          <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common} {...a11y}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'roles': // venetian-mask
      return (
        <svg {...common} {...a11y}>
          <path d="M18 11c-1.5 0-2.5.5-3 2" />
          <path d="M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 0 5-2 8 8 0 0 0 5 2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z" />
          <path d="M6 11c1.5 0 2.5.5 3 2" />
        </svg>
      )
    case 'logs': // clipboard-list
      return (
        <svg {...common} {...a11y}>
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
        </svg>
      )
    case 'user':
      return (
        <svg {...common} {...a11y}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'ticket':
      return (
        <svg {...common} {...a11y}>
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2M13 17v2M13 11v2" />
        </svg>
      )
    case 'pencil':
      return (
        <svg {...common} {...a11y}>
          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z" />
          <path d="m15 5 4 4" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common} {...a11y}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common} {...a11y}>
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common} {...a11y}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'paperclip':
      return (
        <svg {...common} {...a11y}>
          <path d="M13.234 20.252 21 12.3a4.243 4.243 0 0 0-6-6L5.42 16.23a2.829 2.829 0 0 0 4 4L17.59 12" />
        </svg>
      )
  }
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
  const [invLabel,        setInvLabel]        = useState('')
  const [invRole,         setInvRole]         = useState<Exclude<OrgRole, 'owner'>>('member')
  const [invTemplateId,   setInvTemplateId]   = useState<string | null>(null)
  const [invitePermModal, setInvitePermModal] = useState<OrgInvite | null>(null)

  const [orgTab, setOrgTab] = useState<'orgas' | 'membres' | 'roles' | 'logs'>('orgas')

  // Custom role templates
  const [roleTemplates, setRoleTemplates]       = useState<OrgRoleTemplate[]>([])
  const [editingTemplate, setEditingTemplate]   = useState<OrgRoleTemplate | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)

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
    const [m, i, b, p, rt] = await Promise.all([
      supabase.from('organization_members').select('*').eq('org_id', orgId),
      supabase.from('organization_invites').select('*').eq('org_id', orgId).is('accepted_at', null).order('created_at', { ascending: false }),
      supabase.from('content_bank').select('folder').eq('org_id', orgId),
      supabase.from('phones').select('group_name').eq('org_id', orgId),
      supabase.from('org_role_templates').select('*').eq('org_id', orgId).order('created_at'),
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
    setRoleTemplates((rt.data ?? []) as OrgRoleTemplate[])
  }

  async function saveTemplate(name: string, color: string, perms: PermOverrides, id?: string) {
    if (!currentOrg) return
    if (id) {
      await supabase.from('org_role_templates').update({ name, color, perm_overrides: perms }).eq('id', id)
    } else {
      await supabase.from('org_role_templates').insert({ org_id: currentOrg.id, name, color, perm_overrides: perms, created_by: user.id })
    }
    setEditingTemplate(null); setCreatingTemplate(false)
    await loadOrgDetail(currentOrg.id)
    flash(id ? 'Rôle mis à jour ✓' : 'Rôle créé ✓')
  }

  async function deleteTemplate(t: OrgRoleTemplate) {
    if (!confirm(`Supprimer le rôle "${t.name}" ?`)) return
    await supabase.from('org_role_templates').delete().eq('id', t.id)
    if (currentOrg) await loadOrgDetail(currentOrg.id)
    flash('Rôle supprimé')
  }

  async function applyTemplateToMember(member: MemberRow, template: OrgRoleTemplate) {
    await assignCustomRole(member, template)
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
    const template = invTemplateId ? roleTemplates.find(t => t.id === invTemplateId) : null
    const { data, error } = await supabase.from('organization_invites').insert({
      org_id: currentOrg.id, email: label,
      token, role: invRole, invited_by: user.id,
      custom_role_id: template?.id ?? null,
      perm_overrides: template?.perm_overrides ?? {},
    }).select().single()
    setBusy(false)
    if (error) { flash(error.message, true); return }
    setInvLabel(''); setInvTemplateId(null)
    if (data) {
      navigator.clipboard.writeText(data.token).catch(() => {})
      setInvitePermModal(data as OrgInvite)
    }
    await loadOrgDetail(currentOrg.id)
  }

  async function saveInvitePerms(inv: OrgInvite, perms: PermOverrides) {
    await supabase.from('organization_invites').update({ perm_overrides: perms }).eq('id', inv.id)
    setInvitePermModal(null)
    flash('Code généré ✓ — permissions configurées et code copié')
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
    // Apply pre-configured permissions from the invite token if any
    if (orgId) {
      const { data: inv } = await supabase
        .from('organization_invites').select('perm_overrides, custom_role_id').eq('token', token).maybeSingle()
      if (inv && (Object.keys(inv.perm_overrides ?? {}).length > 0 || inv.custom_role_id)) {
        const { data: mem } = await supabase
          .from('organization_members').select('id')
          .eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
        if (mem) {
          await supabase.from('organization_members')
            .update({ perm_overrides: inv.perm_overrides ?? {}, custom_role_id: inv.custom_role_id ?? null }).eq('id', mem.id)
        }
      }
    }
    // Persist the target org so it's selected after the reload
    if (orgId) localStorage.setItem('ig-tracker-current-org', orgId)
    // Full reload is the most reliable way to flush all stale auth/org state
    setTimeout(() => window.location.reload(), 800)
  }

  async function changeRole(member: MemberRow, newRole: OrgRole) {
    if (member.role === 'owner') { flash('Le propriétaire ne peut pas changer de rôle', true); return }
    setBusy(true)
    // Switching back to a system role clears the custom_role_id
    const { error } = await supabase.from('organization_members')
      .update({ role: newRole, custom_role_id: null }).eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function assignCustomRole(member: MemberRow, template: OrgRoleTemplate) {
    setBusy(true)
    const { error } = await supabase.from('organization_members')
      .update({ role: 'member', perm_overrides: template.perm_overrides, custom_role_id: template.id }).eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash(`Rôle "${template.name}" assigné ✓`)
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function savePerms(member: MemberRow, perms: PermOverrides) {
    setBusy(true)
    const { error } = await supabase.from('organization_members')
      .update({ perm_overrides: perms, custom_role_id: null }).eq('id', member.id)
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
          { k: 'orgas',   label: 'Organisations', icon: 'building' as const },
          { k: 'membres', label: 'Membres',        icon: 'users'    as const },
          ...(canManage ? [{ k: 'roles', label: 'Rôles', icon: 'roles' as const }] : []),
          ...(canManage ? [{ k: 'logs',  label: 'Logs',  icon: 'logs'  as const }] : []),
        ] as const).map(t => (
          <button
            key={t.k}
            onClick={() => setOrgTab(t.k as typeof orgTab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors -mb-px border-b-2 inline-flex items-center gap-1.5 ${
              orgTab === t.k ? 'border-accent text-accent bg-accent/5' : 'border-transparent text-text2 hover:text-text'
            }`}
          ><Icon name={t.icon} size={15} />{t.label}</button>
        ))}
      </div>

      {/* ── Organisations tab ─────────────────────────────────────────────── */}
      {orgTab === 'orgas' && <>
        {/* My display name */}
        <section className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="user" size={16} />Mon nom dans les organisations</h2>
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
              <Button size="sm" variant="secondary" onClick={() => setEditingName(true)}><span className="inline-flex items-center gap-1.5"><Icon name="pencil" size={14} />Modifier</span></Button>
            </div>
          )}
        </section>

        {/* My orgs */}
        <section className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="building" size={16} />Mes organisations</h2>
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
                      <span className="text-accent"><Icon name="building" size={22} /></span>
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
                          aria-label="Renommer"
                          title={canRename ? 'Renommer' : `Renommage disponible dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}>
                          <Icon name="pencil" size={14} />
                        </Button>
                      )}
                      {isOwner ? (
                        <Button size="sm" variant="danger" onClick={() => deleteOrg(org)}>Supprimer</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => leaveOrg(org.id)}>Quitter</Button>
                      )}
                    </div>
                    {isOwner && !canRename && (
                      <p className="px-3 pb-2 text-[11px] inline-flex items-center gap-1.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                        <Icon name="lock" size={12} /><span>Renommage disponible dans <strong>{daysLeft}</strong> jour{daysLeft > 1 ? 's' : ''}</span>
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
          <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="ticket" size={16} />Rejoindre une organisation</h2>
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
            <p className="flex justify-center text-text2"><Icon name="building" size={32} /></p>
            <p className="text-text font-semibold">Aucune organisation active</p>
            <p className="text-text2 text-sm">Active une organisation dans l'onglet "Organisations" pour gérer ses membres.</p>
          </div>
        ) : !canManage ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
            <p className="flex justify-center text-text2"><Icon name="lock" size={32} /></p>
            <p className="text-text font-semibold">Accès réservé aux admins</p>
            <p className="text-text2 text-sm">Seuls les propriétaires et admins peuvent gérer les membres.</p>
          </div>
        ) : (
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="users" size={16} />Membres de "{currentOrg.name}"</h2>

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
                      {m.role === 'owner' || isMe ? (
                        <span className="text-xs text-text2 px-2">
                          {m.role === 'owner' ? 'Propriétaire' : (m.custom_role_id ? (roleTemplates.find(t => t.id === m.custom_role_id)?.name ?? 'Membre') : ROLE_LABELS[m.role])}
                        </span>
                      ) : (
                        <RoleDropdown
                          value={m.custom_role_id ?? m.role}
                          systemRole={m.role}
                          templates={roleTemplates}
                          onSystemRole={r => changeRole(m, r)}
                          onTemplate={t => assignCustomRole(m, t)}
                        />
                      )}
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
                      <>
                        {roleTemplates.length > 0 && (
                          <div className="px-3 pt-2 pb-1 bg-bg/40 border-t border-border flex items-center gap-2">
                            <span className="text-[10px] text-text2 font-medium">Appliquer un rôle :</span>
                            <div className="flex gap-1 flex-wrap">
                              {roleTemplates.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => applyTemplateToMember(m, t)}
                                  title={permSummary(t.perm_overrides)}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors hover:opacity-80"
                                  style={{ background: t.color + '22', color: t.color, borderColor: t.color + '55' }}
                                >
                                  {t.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <PermEditor
                          member={m}
                          availableFolders={folders}
                          availableGroups={groups}
                          onSave={perms => savePerms(m, perms)}
                          onCancel={() => setEditing(null)}
                        />
                      </>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Invites */}
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-xs font-bold text-text uppercase tracking-wider">Générer un code d'invitation</h3>
              <p className="text-text2 text-xs">Chaque code est <strong className="text-text">à usage unique</strong> : une fois utilisé, il devient invalide.</p>
              <div className="flex gap-2 flex-wrap">
                <Input value={invLabel} onChange={e => setInvLabel(e.target.value)} placeholder="Note (ex: Pour Pierre) — optionnel" />
                <RoleDropdown
                  value={invTemplateId ?? invRole}
                  systemRole={invRole}
                  templates={roleTemplates}
                  onSystemRole={r => { setInvRole(r); setInvTemplateId(null) }}
                  onTemplate={t => { setInvTemplateId(t.id); setInvRole('member') }}
                />
                <Button onClick={createInvite} loading={busy}><span className="inline-flex items-center gap-1.5"><Icon name="ticket" size={15} />Générer un code</span></Button>
              </div>

            {invites.length > 0 && (
              <ul className="space-y-1.5">
                <p className="text-[10px] text-text2 uppercase tracking-wider">Codes en attente</p>
                {invites.map(inv => (
                  <li key={inv.id} className="flex items-center gap-2 bg-surface px-3 py-2 rounded-lg text-xs">
                    <span className="flex-1 truncate text-text">{inv.email}</span>
                    {inv.custom_role_id ? (() => {
                      const t = roleTemplates.find(r => r.id === inv.custom_role_id)
                      return t ? <span className="font-semibold px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: t.color + '22', color: t.color }}>{t.name}</span> : null
                    })() : <span className="text-text2">{ROLE_LABELS[inv.role as OrgRole]}</span>}
                    <code
                      onClick={() => { navigator.clipboard.writeText(inv.token); flash('Code copié ✓') }}
                      className="bg-bg px-2 py-1 rounded font-mono text-[10px] cursor-pointer hover:text-accent"
                      title="Cliquer pour copier le code complet"
                    >{inv.token.slice(0, 12)}…</code>
                    <button onClick={() => revokeInvite(inv)} className="text-danger hover:opacity-70 inline-flex items-center" title="Révoquer ce code" aria-label="Révoquer ce code"><Icon name="x" size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        )
      )}
      {/* ── Roles tab ─────────────────────────────────────────────────────── */}
      {orgTab === 'roles' && canManage && (
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="roles" size={16} />Rôles personnalisés</h2>
              <p className="text-xs text-text2 mt-0.5">Crée des templates de permissions réutilisables pour ton agence</p>
            </div>
            <Button size="sm" onClick={() => setCreatingTemplate(true)}>+ Nouveau rôle</Button>
          </div>
          <div className="divide-y divide-border">
            {roleTemplates.length === 0 && !creatingTemplate && (
              <div className="px-5 py-8 text-center">
                <p className="flex justify-center mb-2 text-text2"><Icon name="roles" size={34} /></p>
                <p className="text-sm font-medium text-text mb-1">Aucun rôle personnalisé</p>
                <p className="text-xs text-text2 mb-4">Crée des templates comme "Content Manager", "Analyst"… pour assigner des permissions en un clic.</p>
                <Button size="sm" onClick={() => setCreatingTemplate(true)}>Créer mon premier rôle</Button>
              </div>
            )}
            {roleTemplates.map(t => (
              <div key={t.id}>
                {editingTemplate?.id === t.id ? (
                  <div className="p-4">
                    <RoleTemplateEditor
                      initial={t}
                      availableFolders={folders}
                      availableGroups={groups}
                      onSave={(name, color, perms) => saveTemplate(name, color, perms, t.id)}
                      onCancel={() => setEditingTemplate(null)}
                    />
                  </div>
                ) : (
                  <div className="px-5 py-3 flex items-center gap-3 hover:bg-surface/50 transition-colors">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text">{t.name}</p>
                      <p className="text-[10px] text-text2 truncate">{permSummary(t.perm_overrides)}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingTemplate(t)} className="text-xs text-accent hover:opacity-70 px-2 py-1 rounded hover:bg-accent/10 transition-colors inline-flex items-center gap-1.5"><Icon name="pencil" size={13} />Éditer</button>
                      <button onClick={() => deleteTemplate(t)} className="text-xs text-danger hover:opacity-70 px-2 py-1 rounded hover:bg-danger/10 transition-colors inline-flex items-center" aria-label="Supprimer le rôle"><Icon name="x" size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {creatingTemplate && (
              <div className="p-4">
                <RoleTemplateEditor
                  availableFolders={folders}
                  availableGroups={groups}
                  onSave={(name, color, perms) => saveTemplate(name, color, perms)}
                  onCancel={() => setCreatingTemplate(false)}
                />
              </div>
            )}
          </div>
          {roleTemplates.length > 0 && (
            <div className="px-5 py-3 border-t border-border bg-surface/30">
              <p className="text-[10px] text-text2">
                Pour appliquer un rôle à un membre, va dans l'onglet <strong className="text-text">Membres</strong> et clique sur son nom.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Logs tab ──────────────────────────────────────────────────────── */}
      {orgTab === 'logs' && canManage && (
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="logs" size={16} />Logs d'activité</h2>
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
                              <span className="text-[10px] text-text2 font-mono inline-flex items-center gap-1"><Icon name="paperclip" size={11} />{log.details.file}</span>
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

      {/* ── Invite permission modal ──────────────────────────────────────── */}
      {invitePermModal && (
        <InvitePermModal
          invite={invitePermModal}
          availableFolders={folders}
          availableGroups={groups}
          roleTemplates={roleTemplates}
          onSave={perms => saveInvitePerms(invitePermModal, perms)}
          onSkip={() => { setInvitePermModal(null); flash('Code généré et copié ✓ — partage-le, il ne marche qu\'une fois') }}
        />
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
          <Icon name="settings" size={11} className="inline-block align-[-1px] mr-1" />
          "Paramètres → Connexions" contrôle l'accès aux clés API de l'organisation (token GéeLark, Groq, etc.).
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

// ── Helper: short readable summary of PermOverrides ─────────────────────────
function permSummary(p: PermOverrides): string {
  const parts: string[] = []
  const deniedTabs = Object.entries(p.tabs ?? {}).filter(([, v]) => v === false).length
  const allowedTabs = Object.entries(p.tabs ?? {}).filter(([, v]) => v === true).length
  if (deniedTabs > 0) parts.push(`${deniedTabs} onglet(s) bloqué(s)`)
  if (allowedTabs > 0) parts.push(`${allowedTabs} onglet(s) forcé(s)`)
  if (p.bank_folders?.mode === 'allow') parts.push(`banque: ${(p.bank_folders as { list: string[] }).list.length} dossier(s)`)
  if (p.bank_folders?.mode === 'deny')  parts.push(`banque: sauf ${(p.bank_folders as { list: string[] }).list.length} dossier(s)`)
  const deniedActions = Object.entries(p.actions ?? {}).filter(([, v]) => v === false).length
  const allowedActions = Object.entries(p.actions ?? {}).filter(([, v]) => v === true).length
  if (deniedActions > 0) parts.push(`${deniedActions} action(s) bloquée(s)`)
  if (allowedActions > 0) parts.push(`${allowedActions} action(s) activée(s)`)
  return parts.length > 0 ? parts.join(' · ') : 'Permissions par défaut'
}

// ── Invite permission modal ──────────────────────────────────────────────────
function InvitePermModal({
  invite, availableFolders, availableGroups, roleTemplates, onSave, onSkip,
}: {
  invite: OrgInvite
  availableFolders: string[]
  availableGroups: string[]
  roleTemplates: OrgRoleTemplate[]
  onSave: (p: PermOverrides) => void
  onSkip: () => void
}) {
  const init = invite.perm_overrides ?? {}
  const [tabs, setTabs]         = useState<Partial<Record<PageKey, boolean>>>(init.tabs ?? {})
  const [actions, setActions]   = useState<Partial<Record<ActionKey, boolean>>>(init.actions ?? {})
  const [bankMode, setBankMode] = useState<'all' | 'allow' | 'deny'>(init.bank_folders?.mode ?? 'all')
  const [bankList, setBankList] = useState<string[]>(
    init.bank_folders && init.bank_folders.mode !== 'all' ? init.bank_folders.list : []
  )
  const [groupMode, setGroupMode] = useState<'all' | 'allow'>(init.phone_groups?.mode ?? 'all')
  const [groupList, setGroupList] = useState<string[]>(
    init.phone_groups && init.phone_groups.mode === 'allow' ? init.phone_groups.list : []
  )
  const [copied, setCopied] = useState(false)

  function applyTemplate(t: OrgRoleTemplate) {
    const p = t.perm_overrides
    setTabs(p.tabs ?? {})
    setActions(p.actions ?? {})
    setBankMode(p.bank_folders?.mode ?? 'all')
    setBankList(p.bank_folders && p.bank_folders.mode !== 'all' ? p.bank_folders.list : [])
    setGroupMode(p.phone_groups?.mode ?? 'all')
    setGroupList(p.phone_groups && p.phone_groups.mode === 'allow' ? p.phone_groups.list : [])
  }

  function toggleTab(tab: PageKey, v: boolean | undefined) {
    setTabs(prev => {
      const next = { ...prev }
      if (v === undefined) delete next[tab]; else next[tab] = v
      return next
    })
  }

  function save() {
    const out: PermOverrides = {}
    if (Object.keys(tabs).length > 0) out.tabs = tabs
    if (Object.keys(actions).length > 0) out.actions = actions
    if (bankMode === 'all') out.bank_folders = { mode: 'all' }
    else                    out.bank_folders = { mode: bankMode, list: bankList }
    if (groupMode === 'all') out.phone_groups = { mode: 'all' }
    else                     out.phone_groups = { mode: 'allow', list: groupList }
    onSave(out)
  }

  function copyToken() {
    navigator.clipboard.writeText(invite.token).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-accent"><Icon name="ticket" size={26} /></span>
            <div>
              <h2 className="text-sm font-bold text-text">Code généré — Configure les permissions</h2>
              <p className="text-xs text-text2 mt-0.5">
                {invite.email || 'Nouveau membre'} · <span className="text-accent font-medium">{ROLE_LABELS[invite.role as OrgRole]}</span>
              </p>
            </div>
          </div>
          {/* Token display */}
          <div className="mt-3 flex items-center gap-2 bg-bg border border-border rounded-xl px-4 py-3">
            <code className="flex-1 font-mono text-xs text-accent tracking-wider break-all">{invite.token}</code>
            <button
              onClick={copyToken}
              className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)', color: copied ? '#4ade80' : '#a78bfa' }}
            >
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
          <p className="text-[10px] text-text2 mt-2">
            Ce code est à <strong className="text-text">usage unique</strong>. Configure ci-dessous ce que ce membre pourra faire avant de le partager.
          </p>
        </div>

        {/* Scrollable permissions body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Role templates quick-apply */}
          {roleTemplates.length > 0 && (
            <div>
              <p className="text-xs font-bold text-text mb-2">Appliquer un rôle existant</p>
              <div className="flex gap-1.5 flex-wrap">
                {roleTemplates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    title={permSummary(t.perm_overrides)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80"
                    style={{ background: t.color + '22', color: t.color, borderColor: t.color + '55' }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text2 mt-1.5">Clique pour pré-remplir les permissions. Tu peux ensuite affiner manuellement.</p>
              <div className="border-t border-border mt-3" />
            </div>
          )}
          {/* Tabs */}
          <div>
            <p className="text-xs font-bold text-text mb-2">Onglets accessibles</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_TABS.map(t => {
                const v = tabs[t.key]
                return (
                  <div key={t.key} className="flex items-center gap-2 bg-surface rounded px-2 py-1.5">
                    <span className="text-base">{t.icon}</span>
                    <span className="flex-1 text-xs text-text truncate" title={t.label}>{t.label}</span>
                    <select
                      value={v === undefined ? 'default' : v ? 'allow' : 'deny'}
                      onChange={e => {
                        const val = e.target.value
                        toggleTab(t.key, val === 'default' ? undefined : val === 'allow')
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

          {/* Bank folders */}
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
                <MultiSelect options={availableFolders} selected={bankList} onChange={setBankList} placeholder="Sélectionne les dossiers…" />
              )}
            </div>
          </div>

          {/* Phone groups */}
          <div>
            <p className="text-xs font-bold text-text mb-2">Groupes de téléphones</p>
            <div className="flex flex-col gap-2">
              <select value={groupMode} onChange={e => setGroupMode(e.target.value as 'all' | 'allow')}
                className="bg-bg border border-border rounded px-2 py-1 text-xs text-text">
                <option value="all">Tous les groupes</option>
                <option value="allow">Uniquement ces groupes…</option>
              </select>
              {groupMode === 'allow' && (
                <MultiSelect options={availableGroups} selected={groupList} onChange={setGroupList} placeholder="Sélectionne les groupes GéeLark…" />
              )}
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="text-xs font-bold text-text mb-2">Actions autorisées</p>
            <p className="text-[10px] text-text2 mb-2">Contrôle ce que ce membre peut faire dans chaque section.</p>
            {['Banque', 'Téléphones', 'Actions'].map(group => (
              <div key={group} className="mb-3">
                <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-1.5">{group}</p>
                <div className="grid grid-cols-2 gap-1">
                  {ALL_ACTIONS.filter(a => a.group === group).map(a => {
                    const v = actions[a.key]
                    return (
                      <div key={a.key} className="flex items-center gap-1.5 bg-surface rounded px-2 py-1.5">
                        <span className="text-sm">{a.icon}</span>
                        <span className="flex-1 text-[10px] text-text truncate">{a.label}</span>
                        <select
                          value={v === undefined ? 'default' : v ? 'allow' : 'deny'}
                          onChange={e => {
                            const val = e.target.value
                            setActions(prev => {
                              const next = { ...prev }
                              if (val === 'default') delete next[a.key]; else next[a.key] = val === 'allow'
                              return next
                            })
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
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="text-xs text-text2 hover:text-text transition-colors underline underline-offset-2"
          >
            Passer (sans configurer)
          </button>
          <Button onClick={save}>Enregistrer les permissions</Button>
        </div>
      </div>
    </div>
  )
}

// ── Role template creator / editor ──────────────────────────────────────────
const TEMPLATE_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d',
]
function RoleTemplateEditor({
  initial, availableFolders, availableGroups, onSave, onCancel,
}: {
  initial?: OrgRoleTemplate
  availableFolders: string[]
  availableGroups: string[]
  onSave: (name: string, color: string, perms: PermOverrides) => void
  onCancel: () => void
}) {
  const init = initial?.perm_overrides ?? {}
  const [name,      setName]      = useState(initial?.name ?? '')
  const [color,     setColor]     = useState(initial?.color ?? TEMPLATE_COLORS[0])
  const [tabs,      setTabs]      = useState<Partial<Record<PageKey, boolean>>>(init.tabs ?? {})
  const [actions,   setActions]   = useState<Partial<Record<ActionKey, boolean>>>(init.actions ?? {})
  const [bankMode,  setBankMode]  = useState<'all' | 'allow' | 'deny'>(init.bank_folders?.mode ?? 'all')
  const [bankList,  setBankList]  = useState<string[]>(init.bank_folders && init.bank_folders.mode !== 'all' ? init.bank_folders.list : [])
  const [groupMode, setGroupMode] = useState<'all' | 'allow'>(init.phone_groups?.mode ?? 'all')
  const [groupList, setGroupList] = useState<string[]>(init.phone_groups?.mode === 'allow' ? (init.phone_groups as { list: string[] }).list : [])

  function save() {
    if (!name.trim()) return
    const out: PermOverrides = {}
    if (Object.keys(tabs).length > 0) out.tabs = tabs
    if (Object.keys(actions).length > 0) out.actions = actions
    if (bankMode !== 'all') out.bank_folders = { mode: bankMode, list: bankList }
    if (groupMode === 'allow') out.phone_groups = { mode: 'allow', list: groupList }
    onSave(name.trim(), color, out)
  }

  return (
    <div className="space-y-4">
      {/* Name + color */}
      <div className="flex gap-2 items-center">
        <div className="flex gap-1 flex-shrink-0">
          {TEMPLATE_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-5 h-5 rounded-full transition-transform hover:scale-110 ring-offset-1"
              style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
            />
          ))}
        </div>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nom du rôle (ex: Content Manager)"
          onKeyDown={e => { if (e.key === 'Enter') save() }}
        />
      </div>

      {/* Tabs */}
      <div>
        <p className="text-xs font-bold text-text mb-1.5">Onglets</p>
        <div className="grid grid-cols-2 gap-1">
          {ALL_TABS.map(t => {
            const v = tabs[t.key]
            return (
              <div key={t.key} className="flex items-center gap-1.5 bg-surface rounded px-2 py-1">
                <span className="text-sm">{t.icon}</span>
                <span className="flex-1 text-[10px] text-text truncate">{t.label}</span>
                <select
                  value={v === undefined ? 'default' : v ? 'allow' : 'deny'}
                  onChange={e => {
                    const val = e.target.value
                    setTabs(prev => {
                      const next = { ...prev }
                      if (val === 'default') delete next[t.key]; else next[t.key] = val === 'allow'
                      return next
                    })
                  }}
                  className="bg-bg border border-border rounded text-[10px] px-1 py-0.5 text-text"
                >
                  <option value="default">Défaut</option>
                  <option value="allow">Autorisé</option>
                  <option value="deny">Bloqué</option>
                </select>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div>
        <p className="text-xs font-bold text-text mb-1.5">Actions</p>
        {['Banque', 'Téléphones', 'Actions'].map(group => (
          <div key={group} className="mb-2">
            <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-1">{group}</p>
            <div className="grid grid-cols-2 gap-1">
              {ALL_ACTIONS.filter(a => a.group === group).map(a => {
                const v = actions[a.key]
                return (
                  <div key={a.key} className="flex items-center gap-1.5 bg-surface rounded px-2 py-1">
                    <span className="text-sm">{a.icon}</span>
                    <span className="flex-1 text-[10px] text-text truncate">{a.label}</span>
                    <select
                      value={v === undefined ? 'default' : v ? 'allow' : 'deny'}
                      onChange={e => {
                        const val = e.target.value
                        setActions(prev => {
                          const next = { ...prev }
                          if (val === 'default') delete next[a.key]; else next[a.key] = val === 'allow'
                          return next
                        })
                      }}
                      className="bg-bg border border-border rounded text-[10px] px-1 py-0.5 text-text"
                    >
                      <option value="default">Défaut</option>
                      <option value="allow">Autorisé</option>
                      <option value="deny">Bloqué</option>
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bank folders & phone groups */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-1">Dossiers banque</p>
          <select value={bankMode} onChange={e => setBankMode(e.target.value as 'all' | 'allow' | 'deny')}
            className="w-full bg-bg border border-border rounded px-2 py-1 text-xs text-text mb-1">
            <option value="all">Tous</option>
            <option value="allow">Seulement…</option>
            <option value="deny">Sauf…</option>
          </select>
          {bankMode !== 'all' && <MultiSelect options={availableFolders} selected={bankList} onChange={setBankList} placeholder="Dossiers…" />}
        </div>
        <div>
          <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-1">Groupes téléphones</p>
          <select value={groupMode} onChange={e => setGroupMode(e.target.value as 'all' | 'allow')}
            className="w-full bg-bg border border-border rounded px-2 py-1 text-xs text-text mb-1">
            <option value="all">Tous</option>
            <option value="allow">Seulement…</option>
          </select>
          {groupMode === 'allow' && <MultiSelect options={availableGroups} selected={groupList} onChange={setGroupList} placeholder="Groupes…" />}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button
          size="sm"
          onClick={save}
          style={name.trim() ? { background: color + '33', color, borderColor: color + '66' } : {}}
          disabled={!name.trim()}
        >
          {initial ? 'Mettre à jour' : 'Créer le rôle'}
        </Button>
      </div>
    </div>
  )
}

// ── Unified role dropdown (system roles + custom templates) ──────────────────
function RoleDropdown({
  value, systemRole, templates, onSystemRole, onTemplate,
}: {
  value: string
  systemRole: OrgRole
  templates: OrgRoleTemplate[]
  onSystemRole: (r: Exclude<OrgRole, 'owner'>) => void
  onTemplate: (t: OrgRoleTemplate) => void
}) {
  const activeTemplate = templates.find(t => t.id === value)

  function handleChange(v: string) {
    const tpl = templates.find(t => t.id === v)
    if (tpl) { onTemplate(tpl); return }
    onSystemRole(v as Exclude<OrgRole, 'owner'>)
  }

  return (
    <select
      value={value}
      onChange={e => handleChange(e.target.value)}
      className="bg-bg border border-border rounded px-2 py-1 text-xs text-text"
      style={activeTemplate ? { color: activeTemplate.color, borderColor: activeTemplate.color + '66' } : {}}
    >
      <optgroup label="Rôles système">
        <option value="admin">Admin</option>
        <option value="member">Membre</option>
        <option value="viewer">Lecteur</option>
      </optgroup>
      {templates.length > 0 && (
        <optgroup label="Rôles personnalisés">
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
