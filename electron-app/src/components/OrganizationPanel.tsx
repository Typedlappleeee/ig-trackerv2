import { useEffect, useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Organization, type OrgMember, type OrgInvite, type OrgRole, type OrgRoleTemplate, type PermOverrides, type PageKey, type ActionKey } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { ROLE_LABELS, ALL_TABS, ALL_ACTIONS, TAB_GROUPS, canManageOrg } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Onboarding } from '@/components/Onboarding'

interface Props { user: User }

interface MemberRow extends OrgMember {
  email:        string | null
  display_name: string | null
}

// ── Inline icon set ──────────────────────────────────────────────────────────
type IconName =
  | 'building' | 'users' | 'roles' | 'logs' | 'user'
  | 'ticket' | 'pencil' | 'x' | 'lock' | 'settings' | 'paperclip' | 'shield' | 'chevron-down'

function Icon({ name, size = 16, className, label }: {
  name: IconName; size?: number; className?: string; label?: string
}) {
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className }
  switch (name) {
    case 'building':
      return <svg {...common} {...a11y}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>
    case 'users':
      return <svg {...common} {...a11y}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'roles':
      return <svg {...common} {...a11y}><path d="M18 11c-1.5 0-2.5.5-3 2"/><path d="M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 0 5-2 8 8 0 0 0 5 2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z"/><path d="M6 11c1.5 0 2.5.5 3 2"/></svg>
    case 'logs':
      return <svg {...common} {...a11y}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>
    case 'user':
      return <svg {...common} {...a11y}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    case 'ticket':
      return <svg {...common} {...a11y}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>
    case 'pencil':
      return <svg {...common} {...a11y}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z"/><path d="m15 5 4 4"/></svg>
    case 'x':
      return <svg {...common} {...a11y}><path d="M18 6 6 18M6 6l12 12"/></svg>
    case 'lock':
      return <svg {...common} {...a11y}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    case 'settings':
      return <svg {...common} {...a11y}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    case 'paperclip':
      return <svg {...common} {...a11y}><path d="M13.234 20.252 21 12.3a4.243 4.243 0 0 0-6-6L5.42 16.23a2.829 2.829 0 0 0 4 4L17.59 12"/></svg>
    case 'shield':
      return <svg {...common} {...a11y}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
    case 'chevron-down':
      return <svg {...common} {...a11y}><path d="m6 9 6 6 6-6"/></svg>
  }
}

function genToken(): string {
  const a = new Uint8Array(24)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

// ── TriState permission control ──────────────────────────────────────────────
function TriState({ value, onChange }: {
  value: 'default' | 'allow' | 'deny'
  onChange: (v: 'default' | 'allow' | 'deny') => void
}) {
  return (
    <div className="flex items-center rounded-lg overflow-hidden border border-border/70 text-[10px] font-bold flex-shrink-0">
      <button
        onClick={() => onChange('default')}
        title="Par défaut (hérité du rôle)"
        className={`px-2.5 py-1.5 transition-colors ${value === 'default' ? 'bg-surface2 text-text' : 'text-text2/50 hover:text-text2 bg-bg'}`}
      >—</button>
      <button
        onClick={() => onChange('allow')}
        title="Forcer actif"
        className={`px-2.5 py-1.5 border-x border-border/70 transition-colors ${value === 'allow' ? 'bg-ok/20 text-ok' : 'text-text2/50 hover:text-ok bg-bg'}`}
      >✓</button>
      <button
        onClick={() => onChange('deny')}
        title="Bloquer"
        className={`px-2.5 py-1.5 transition-colors ${value === 'deny' ? 'bg-danger/20 text-danger' : 'text-text2/50 hover:text-danger bg-bg'}`}
      >✗</button>
    </div>
  )
}

// ── Role chip ────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<OrgRole, string> = {
  owner:  '#f59e0b',
  admin:  '#6366F1',
  member: '#059669',
  viewer: '#64748b',
}

function RoleChip({ role, template }: { role: OrgRole; template?: OrgRoleTemplate | null }) {
  if (template) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: template.color + '22', color: template.color, border: `1px solid ${template.color}44` }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: template.color }} />
        {template.name}
      </span>
    )
  }
  const c = ROLE_COLORS[role]
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: c + '22', color: c, border: `1px solid ${c}44` }}>
      {ROLE_LABELS[role]}
    </span>
  )
}

// ── Display name inline editor ───────────────────────────────────────────────
function DisplayNameEditor({ initial, onSave, onCancel, busy }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void; busy: boolean
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

// ── Multi-select chip dropdown ───────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder }: {
  options: string[]; selected: string[]; onChange: (next: string[]) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  function toggle(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter(x => x !== opt))
    else onChange([...selected, opt])
  }
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text text-left">
        <span className="flex-1 truncate">
          {selected.length === 0 ? <span className="text-text2">{placeholder}</span> : selected.join(', ')}
        </span>
        <span className="text-text2"><Icon name="chevron-down" size={14} /></span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-[9991] bg-surface border border-border rounded-xl shadow-2xl max-h-48 overflow-auto">
            {options.length === 0 ? (
              <p className="text-text2 text-xs px-3 py-2 italic">Aucun élément disponible</p>
            ) : options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface2 cursor-pointer">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-accent" />
                <span className="flex-1 truncate">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── perm summary helper ──────────────────────────────────────────────────────
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

// ── Custom role dropdown ─────────────────────────────────────────────────────
function RoleDropdown({ value, systemRole, templates, onSystemRole, onTemplate }: {
  value: string; systemRole: OrgRole; templates: OrgRoleTemplate[]
  onSystemRole: (r: Exclude<OrgRole, 'owner'>) => void; onTemplate: (t: OrgRoleTemplate) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const activeTemplate = templates.find(t => t.id === value)
  const displayRole = activeTemplate ? 'member' as OrgRole : value as OrgRole

  function openDropdown() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen(o => !o)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={openDropdown}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        <RoleChip role={displayRole} template={activeTemplate} />
        <Icon name="chevron-down" size={12} className="text-text2" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9991] bg-card border border-border rounded-xl shadow-2xl min-w-[180px] overflow-hidden py-1"
            style={{ top: pos.top, right: pos.right }}
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-text2 uppercase tracking-wider">Rôles système</p>
            {(['admin', 'member', 'viewer'] as const).map(r => (
              <button key={r} onClick={() => { onSystemRole(r); setOpen(false) }}
                className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-surface transition-colors ${value === r && !activeTemplate ? 'bg-surface' : ''}`}>
                <RoleChip role={r} />
              </button>
            ))}
            {templates.length > 0 && (
              <div className="border-t border-border mt-1 pt-1">
                <p className="px-3 pb-1 text-[10px] font-bold text-text2 uppercase tracking-wider">Personnalisés</p>
                {templates.map(t => (
                  <button key={t.id} onClick={() => { onTemplate(t); setOpen(false) }}
                    className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-surface transition-colors ${value === t.id ? 'bg-surface' : ''}`}>
                    <RoleChip role="member" template={t} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Shared permission body (tabs, actions, restrictions) ─────────────────────
type PermInnerTab = 'tabs' | 'actions' | 'restrictions'

function PermBody({ innerTab, tabs, setTabs, actions, setActions, bankMode, setBankMode, bankList, setBankList, groupMode, setGroupMode, groupList, setGroupList, availableFolders, availableGroups }: {
  innerTab: PermInnerTab
  tabs: Partial<Record<PageKey, boolean>>
  setTabs: (fn: (prev: Partial<Record<PageKey, boolean>>) => Partial<Record<PageKey, boolean>>) => void
  actions: Partial<Record<ActionKey, boolean>>
  setActions: (fn: (prev: Partial<Record<ActionKey, boolean>>) => Partial<Record<ActionKey, boolean>>) => void
  bankMode: 'all' | 'allow' | 'deny'
  setBankMode: (v: 'all' | 'allow' | 'deny') => void
  bankList: string[]
  setBankList: (v: string[]) => void
  groupMode: 'all' | 'allow'
  setGroupMode: (v: 'all' | 'allow') => void
  groupList: string[]
  setGroupList: (v: string[]) => void
  availableFolders: string[]
  availableGroups: string[]
}) {
  function tabState(k: PageKey): 'default' | 'allow' | 'deny' {
    const v = tabs[k]; return v === undefined ? 'default' : v ? 'allow' : 'deny'
  }
  function setTabState(k: PageKey, s: 'default' | 'allow' | 'deny') {
    setTabs(prev => { const n = { ...prev }; if (s === 'default') delete n[k]; else n[k] = s === 'allow'; return n })
  }
  function actionState(k: ActionKey): 'default' | 'allow' | 'deny' {
    const v = actions[k]; return v === undefined ? 'default' : v ? 'allow' : 'deny'
  }
  function setActionState(k: ActionKey, s: 'default' | 'allow' | 'deny') {
    setActions(prev => { const n = { ...prev }; if (s === 'default') delete n[k]; else n[k] = s === 'allow'; return n })
  }

  if (innerTab === 'tabs') return (
    <div className="space-y-5">
      <p className="text-xs text-text2">
        <strong className="text-text">—</strong> = par défaut du rôle &nbsp;·&nbsp;
        <strong className="text-ok">✓</strong> = toujours actif &nbsp;·&nbsp;
        <strong className="text-danger">✗</strong> = toujours bloqué
      </p>
      {TAB_GROUPS.map(group => (
        <div key={group}>
          <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="flex-1">{group}</span>
          </p>
          <div className="space-y-1">
            {ALL_TABS.filter(t => t.group === group).map(t => (
              <div key={t.key} className="flex items-center gap-3 px-3 py-2.5 bg-surface rounded-xl hover:bg-surface2 transition-colors">
                <span className="text-base w-7 text-center flex-shrink-0">{t.icon}</span>
                <span className="flex-1 text-sm text-text">{t.label}</span>
                <TriState value={tabState(t.key)} onChange={v => setTabState(t.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  if (innerTab === 'actions') return (
    <div className="space-y-5">
      <p className="text-xs text-text2">
        Contrôle les actions spécifiques que ce membre peut effectuer.
      </p>
      {['Banque', 'Téléphones', 'Actions'].map(group => (
        <div key={group}>
          <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-2">{group}</p>
          <div className="space-y-1">
            {ALL_ACTIONS.filter(a => a.group === group).map(a => (
              <div key={a.key} className="flex items-center gap-3 px-3 py-2.5 bg-surface rounded-xl hover:bg-surface2 transition-colors">
                <span className="text-base w-7 text-center flex-shrink-0">{a.icon}</span>
                <span className="flex-1 text-sm text-text">{a.label}</span>
                <TriState value={actionState(a.key)} onChange={v => setActionState(a.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-text mb-1">Dossiers de la banque vidéos</p>
        <p className="text-xs text-text2 mb-3">Restreint l'accès aux dossiers de la banque de contenu.</p>
        <div className="space-y-2">
          <select value={bankMode} onChange={e => setBankMode(e.target.value as 'all' | 'allow' | 'deny')}
            className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text">
            <option value="all">Tous les dossiers</option>
            <option value="allow">Uniquement ces dossiers…</option>
            <option value="deny">Tous sauf ces dossiers…</option>
          </select>
          {bankMode !== 'all' && (
            <MultiSelect options={availableFolders} selected={bankList} onChange={setBankList} placeholder="Sélectionne les dossiers…" />
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-text mb-1">Groupes de téléphones</p>
        <p className="text-xs text-text2 mb-3">Restreint l'accès aux groupes de téléphones GéeLark.</p>
        <div className="space-y-2">
          <select value={groupMode} onChange={e => setGroupMode(e.target.value as 'all' | 'allow')}
            className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text">
            <option value="all">Tous les groupes</option>
            <option value="allow">Uniquement ces groupes…</option>
          </select>
          {groupMode === 'allow' && (
            <MultiSelect options={availableGroups} selected={groupList} onChange={setGroupList} placeholder="Sélectionne les groupes GéeLark…" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Member permission modal ──────────────────────────────────────────────────
function PermModal({ member, templates, availableFolders, availableGroups, onSave, onCancel }: {
  member: MemberRow; templates: OrgRoleTemplate[]
  availableFolders: string[]; availableGroups: string[]
  onSave: (p: PermOverrides) => void; onCancel: () => void
}) {
  const init = member.perm_overrides ?? {}
  const [innerTab, setInnerTab]   = useState<PermInnerTab>('tabs')
  const [tabs, setTabs]           = useState<Partial<Record<PageKey, boolean>>>(init.tabs ?? {})
  const [actions, setActions]     = useState<Partial<Record<ActionKey, boolean>>>(init.actions ?? {})
  const [bankMode, setBankMode]   = useState<'all' | 'allow' | 'deny'>(init.bank_folders?.mode ?? 'all')
  const [bankList, setBankList]   = useState<string[]>(init.bank_folders && init.bank_folders.mode !== 'all' ? init.bank_folders.list : [])
  const [groupMode, setGroupMode] = useState<'all' | 'allow'>(init.phone_groups?.mode ?? 'all')
  const [groupList, setGroupList] = useState<string[]>(init.phone_groups?.mode === 'allow' ? (init.phone_groups as { list: string[] }).list : [])

  const label = member.display_name?.trim() || member.email || member.user_id.slice(0, 8)

  function applyTemplate(t: OrgRoleTemplate) {
    const p = t.perm_overrides
    setTabs(p.tabs ?? {})
    setActions(p.actions ?? {})
    setBankMode(p.bank_folders?.mode ?? 'all')
    setBankList(p.bank_folders && p.bank_folders.mode !== 'all' ? p.bank_folders.list : [])
    setGroupMode(p.phone_groups?.mode ?? 'all')
    setGroupList(p.phone_groups?.mode === 'allow' ? (p.phone_groups as { list: string[] }).list : [])
  }

  function save() {
    const out: PermOverrides = {}
    if (Object.keys(tabs).length > 0) out.tabs = tabs
    if (Object.keys(actions).length > 0) out.actions = actions
    if (bankMode === 'all') out.bank_folders = { mode: 'all' }
    else out.bank_folders = { mode: bankMode, list: bankList }
    if (groupMode === 'all') out.phone_groups = { mode: 'all' }
    else out.phone_groups = { mode: 'allow', list: groupList }
    onSave(out)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-sm flex-shrink-0">
            {label[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text truncate">{label}</h2>
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <RoleChip role={member.role} />
              {member.email && <span className="text-xs text-text2 truncate">{member.email}</span>}
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-xl hover:bg-surface text-text2 hover:text-text transition-colors flex-shrink-0">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Quick-apply templates */}
        {templates.length > 0 && (
          <div className="px-6 pt-4 pb-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-2">Appliquer un rôle rapide</p>
            <div className="flex flex-wrap gap-1.5">
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)}
                  title={permSummary(t.perm_overrides)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all hover:opacity-80 active:scale-95"
                  style={{ background: t.color + '22', color: t.color, borderColor: t.color + '55' }}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Inner tabs */}
        <div className="flex border-b border-border px-6 flex-shrink-0 mt-3">
          {([
            { k: 'tabs' as const, label: 'Onglets' },
            { k: 'actions' as const, label: 'Actions' },
            { k: 'restrictions' as const, label: 'Restrictions' },
          ]).map(t => (
            <button key={t.k} onClick={() => setInnerTab(t.k)}
              className={`px-4 py-2.5 text-xs font-semibold -mb-px border-b-2 transition-colors ${innerTab === t.k ? 'border-accent text-accent' : 'border-transparent text-text2 hover:text-text'}`}
            >{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <PermBody
            innerTab={innerTab}
            tabs={tabs} setTabs={setTabs}
            actions={actions} setActions={setActions}
            bankMode={bankMode} setBankMode={setBankMode}
            bankList={bankList} setBankList={setBankList}
            groupMode={groupMode} setGroupMode={setGroupMode}
            groupList={groupList} setGroupList={setGroupList}
            availableFolders={availableFolders}
            availableGroups={availableGroups}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button onClick={save}>Enregistrer les permissions</Button>
        </div>
      </div>
    </div>
  )
}

// ── Role template modal (create / edit) ──────────────────────────────────────
const TEMPLATE_COLORS = ['#6366F1','#4F46E5','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d']

function RoleModal({ initial, availableFolders, availableGroups, onSave, onCancel }: {
  initial?: OrgRoleTemplate
  availableFolders: string[]; availableGroups: string[]
  onSave: (name: string, color: string, perms: PermOverrides) => void
  onCancel: () => void
}) {
  const init = initial?.perm_overrides ?? {}
  const [name,      setName]      = useState(initial?.name ?? '')
  const [color,     setColor]     = useState(initial?.color ?? TEMPLATE_COLORS[0])
  const [innerTab, setInnerTab]   = useState<PermInnerTab>('tabs')
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex-shrink-0">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-text">{initial ? 'Modifier le rôle' : 'Créer un rôle personnalisé'}</h2>
              <p className="text-xs text-text2 mt-0.5">Ce rôle sera réutilisable pour tous les membres de l'organisation.</p>
            </div>
            <button onClick={onCancel} className="p-1.5 rounded-xl hover:bg-surface text-text2 hover:text-text transition-colors flex-shrink-0">
              <Icon name="x" size={18} />
            </button>
          </div>
          {/* Name + color picker */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
              {TEMPLATE_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-6 h-6 rounded-full transition-all hover:scale-110"
                  style={{ background: c, outline: color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }}
                />
              ))}
            </div>
            <div className="flex-1">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nom du rôle (ex: Content Manager)"
                onKeyDown={e => { if (e.key === 'Enter') save() }}
                style={name.trim() ? { borderColor: color + '66', color } : {}}
              />
            </div>
          </div>
          {/* Preview chip */}
          {name.trim() && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-text2">Aperçu :</span>
              <RoleChip role="member" template={{ id: '', org_id: '', name: name.trim(), color, perm_overrides: {}, created_by: '', created_at: '' }} />
            </div>
          )}
        </div>

        {/* Inner tabs */}
        <div className="flex border-b border-border px-6 flex-shrink-0">
          {([
            { k: 'tabs' as const, label: 'Onglets' },
            { k: 'actions' as const, label: 'Actions' },
            { k: 'restrictions' as const, label: 'Restrictions' },
          ]).map(t => (
            <button key={t.k} onClick={() => setInnerTab(t.k)}
              className={`px-4 py-2.5 text-xs font-semibold -mb-px border-b-2 transition-colors ${innerTab === t.k ? 'border-accent text-accent' : 'border-transparent text-text2 hover:text-text'}`}
            >{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <PermBody
            innerTab={innerTab}
            tabs={tabs} setTabs={setTabs}
            actions={actions} setActions={setActions}
            bankMode={bankMode} setBankMode={setBankMode}
            bankList={bankList} setBankList={setBankList}
            groupMode={groupMode} setGroupMode={setGroupMode}
            groupList={groupList} setGroupList={setGroupList}
            availableFolders={availableFolders}
            availableGroups={availableGroups}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button
            onClick={save}
            disabled={!name.trim()}
            style={name.trim() ? { background: color + '33', color, borderColor: color + '66' } : {}}
          >
            {initial ? 'Mettre à jour' : 'Créer le rôle'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Invite permission modal ──────────────────────────────────────────────────
function InvitePermModal({ invite, availableFolders, availableGroups, roleTemplates, onSave, onSkip }: {
  invite: OrgInvite; availableFolders: string[]; availableGroups: string[]
  roleTemplates: OrgRoleTemplate[]; onSave: (p: PermOverrides) => void; onSkip: () => void
}) {
  const init = invite.perm_overrides ?? {}
  const [innerTab, setInnerTab]   = useState<PermInnerTab>('tabs')
  const [tabs, setTabs]           = useState<Partial<Record<PageKey, boolean>>>(init.tabs ?? {})
  const [actions, setActions]     = useState<Partial<Record<ActionKey, boolean>>>(init.actions ?? {})
  const [bankMode, setBankMode]   = useState<'all' | 'allow' | 'deny'>(init.bank_folders?.mode ?? 'all')
  const [bankList, setBankList]   = useState<string[]>(init.bank_folders && init.bank_folders.mode !== 'all' ? init.bank_folders.list : [])
  const [groupMode, setGroupMode] = useState<'all' | 'allow'>(init.phone_groups?.mode ?? 'all')
  const [groupList, setGroupList] = useState<string[]>(init.phone_groups?.mode === 'allow' ? (init.phone_groups as { list: string[] }).list : [])
  const [copied, setCopied]       = useState(false)

  function applyTemplate(t: OrgRoleTemplate) {
    const p = t.perm_overrides
    setTabs(p.tabs ?? {})
    setActions(p.actions ?? {})
    setBankMode(p.bank_folders?.mode ?? 'all')
    setBankList(p.bank_folders && p.bank_folders.mode !== 'all' ? p.bank_folders.list : [])
    setGroupMode(p.phone_groups?.mode ?? 'all')
    setGroupList(p.phone_groups?.mode === 'allow' ? (p.phone_groups as { list: string[] }).list : [])
  }

  function copyToken() {
    navigator.clipboard.writeText(invite.token).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function save() {
    const out: PermOverrides = {}
    if (Object.keys(tabs).length > 0) out.tabs = tabs
    if (Object.keys(actions).length > 0) out.actions = actions
    if (bankMode === 'all') out.bank_folders = { mode: 'all' }
    else out.bank_folders = { mode: bankMode, list: bankList }
    if (groupMode === 'all') out.phone_groups = { mode: 'all' }
    else out.phone_groups = { mode: 'allow', list: groupList }
    onSave(out)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              <Icon name="ticket" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-text">Code d'invitation généré</h2>
              <p className="text-xs text-text2 mt-0.5">
                {invite.email || 'Nouveau membre'} · <RoleChip role={invite.role as OrgRole} />
              </p>
            </div>
          </div>
          {/* Token display */}
          <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-4 py-3">
            <code className="flex-1 font-mono text-xs text-accent tracking-wider break-all">{invite.token}</code>
            <button onClick={copyToken}
              className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)', color: copied ? '#4ade80' : '#6366F1' }}>
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
          <p className="text-[10px] text-text2 mt-2">Code à <strong className="text-text">usage unique</strong>. Configure les accès avant de le partager.</p>
        </div>

        {/* Quick-apply templates */}
        {roleTemplates.length > 0 && (
          <div className="px-6 pt-4 pb-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-text2 uppercase tracking-wider mb-2">Appliquer un rôle rapide</p>
            <div className="flex flex-wrap gap-1.5">
              {roleTemplates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)}
                  title={permSummary(t.perm_overrides)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all hover:opacity-80"
                  style={{ background: t.color + '22', color: t.color, borderColor: t.color + '55' }}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Inner tabs */}
        <div className="flex border-b border-border px-6 flex-shrink-0 mt-3">
          {([
            { k: 'tabs' as const, label: 'Onglets' },
            { k: 'actions' as const, label: 'Actions' },
            { k: 'restrictions' as const, label: 'Restrictions' },
          ]).map(t => (
            <button key={t.k} onClick={() => setInnerTab(t.k)}
              className={`px-4 py-2.5 text-xs font-semibold -mb-px border-b-2 transition-colors ${innerTab === t.k ? 'border-accent text-accent' : 'border-transparent text-text2 hover:text-text'}`}
            >{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <PermBody
            innerTab={innerTab}
            tabs={tabs} setTabs={setTabs}
            actions={actions} setActions={setActions}
            bankMode={bankMode} setBankMode={setBankMode}
            bankList={bankList} setBankList={setBankList}
            groupMode={groupMode} setGroupMode={setGroupMode}
            groupList={groupList} setGroupList={setGroupList}
            availableFolders={availableFolders}
            availableGroups={availableGroups}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
          <button onClick={onSkip} className="text-xs text-text2 hover:text-text transition-colors underline underline-offset-2">
            Passer (sans configurer)
          </button>
          <Button onClick={save}>Enregistrer les permissions</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main OrganizationPanel ───────────────────────────────────────────────────
export function OrganizationPanel({ user }: Props) {
  const { myOrgs, currentOrg, refresh, switchOrg } = useOrg()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [joinToken, setJoinToken] = useState('')
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState<string | null>(null)
  const [err, setErr]           = useState<string | null>(null)
  const [setupForOrg, setSetupForOrg] = useState<string | null>(null)

  const [members, setMembers]   = useState<MemberRow[]>([])
  const [invites, setInvites]   = useState<OrgInvite[]>([])
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null)
  const [folders, setFolders]   = useState<string[]>([])
  const [groups, setGroups]     = useState<string[]>([])

  const [myDisplayName, setMyDisplayName] = useState('')
  const [editingName, setEditingName]     = useState(false)

  const [renamingOrgId, setRenamingOrgId] = useState<string | null>(null)
  const [renameValue, setRenameValue]     = useState('')

  const [invLabel,        setInvLabel]        = useState('')
  const [invRole,         setInvRole]         = useState<Exclude<OrgRole, 'owner'>>('member')
  const [invTemplateId,   setInvTemplateId]   = useState<string | null>(null)
  const [invitePermModal, setInvitePermModal] = useState<OrgInvite | null>(null)

  const [orgTab, setOrgTab] = useState<'orgas' | 'membres' | 'roles' | 'logs'>('orgas')

  const [roleTemplates, setRoleTemplates]       = useState<OrgRoleTemplate[]>([])
  const [editingTemplate, setEditingTemplate]   = useState<OrgRoleTemplate | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  interface ActivityLog { id: string; user_email: string | null; action: string; details: Record<string, unknown>; created_at: string }
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [logsLoading, setLogsLoading]   = useState(false)

  const myMembership = myOrgs.find(x => x.org.id === currentOrg?.id)?.member
  const myRole       = myMembership?.role ?? null
  const canManage    = myRole ? canManageOrg(myRole) : false

  function flash(text: string, isErr = false) {
    if (isErr) { setErr(text); setMsg(null) } else { setMsg(text); setErr(null) }
    setTimeout(() => { setMsg(null); setErr(null) }, 3500)
  }

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
    const profiles: Record<string, { email: string | null; display_name: string | null }> = {}
    if (memberRows.length > 0) {
      const ids = memberRows.map(r => r.user_id)
      const { data: profs } = await supabase.from('profiles').select('id, email, display_name').in('id', ids)
      for (const p of profs ?? []) profiles[p.id] = { email: p.email, display_name: p.display_name }
    }
    setMembers(memberRows.map(r => ({ ...r, email: profiles[r.user_id]?.email ?? null, display_name: profiles[r.user_id]?.display_name ?? null })))
    setInvites((i.data ?? []) as OrgInvite[])
    const folderSet = new Set<string>()
    for (const row of (b.data ?? []) as { folder: string | null }[]) folderSet.add(row.folder ?? '(racine)')
    setFolders([...folderSet].sort())
    const groupSet = new Set<string>()
    for (const row of (p.data ?? []) as { group_name: string | null }[]) groupSet.add(row.group_name ?? '(sans groupe)')
    setGroups([...groupSet].sort())
    setRoleTemplates((rt.data ?? []) as OrgRoleTemplate[])
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
    setMyDisplayName(name.trim()); setEditingName(false); flash('Nom mis à jour ✓')
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
                : /org_limit_reached/.test(error.message) ? "Tu ne peux créer qu'une seule organisation"
                : error.message
      flash(msg, true); return
    }
    flash('Organisation créée ✓'); setNewName(''); setCreating(false)
    await refresh()
    if (data) { switchOrg(data as string); setSetupForOrg(data as string) }
  }

  async function deleteOrg(org: Organization) {
    if (!confirm(`Supprimer "${org.name}" ? Cette action est irréversible.`)) return
    setBusy(true)
    const { error } = await supabase.from('organizations').delete().eq('id', org.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Organisation supprimée'); switchOrg(null); await refresh()
  }

  async function renameOrg(org: Organization) {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === org.name) { setRenamingOrgId(null); return }
    setBusy(true)
    const { error } = await supabase.from('organizations').update({ name: trimmed, name_updated_at: new Date().toISOString() }).eq('id', org.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Nom modifié'); setRenamingOrgId(null); await refresh()
  }

  async function leaveOrg(orgId: string) {
    if (!confirm('Quitter cette organisation ?')) return
    setBusy(true)
    const { error } = await supabase.from('organization_members').delete().eq('org_id', orgId).eq('user_id', user.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash("Tu as quitté l'organisation"); switchOrg(null); await refresh()
  }

  async function createInvite() {
    if (!currentOrg) return
    setBusy(true)
    const token = genToken()
    const label = invLabel.trim() || `Invitation ${new Date().toLocaleDateString('fr-FR')}`
    const template = invTemplateId ? roleTemplates.find(t => t.id === invTemplateId) : null
    const { data, error } = await supabase.from('organization_invites').insert({
      org_id: currentOrg.id, email: label, token, role: invRole, invited_by: user.id,
      custom_role_id: template?.id ?? null, perm_overrides: template?.perm_overrides ?? {},
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
    setInvitePermModal(null); flash('Code généré ✓ — permissions configurées et code copié')
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
      const msg = /invite_not_found/.test(error.message)     ? "Code d'invitation invalide"
                : /invite_already_used/.test(error.message)  ? 'Ce code a déjà été utilisé'
                : /invite_expired/.test(error.message)       ? 'Code expiré'
                : error.message
      flash(msg, true); return
    }
    setJoinToken('')
    const orgId = data as string | null
    if (orgId) {
      const { data: org } = await supabase.from('organizations').select('owner_id').eq('id', orgId).maybeSingle()
      const { data: ownerKey } = await supabase.from('license_keys').select('expires_at').eq('user_id', org?.owner_id ?? '').eq('is_active', true).maybeSingle()
      const expired = ownerKey?.expires_at ? new Date(ownerKey.expires_at) < new Date() : false
      if (!ownerKey || expired) { flash("Cette organisation n'a pas d'abonnement actif.", true); await refresh(); return }
    }
    flash("Bienvenue dans l'organisation ✓")
    if (orgId) {
      const { data: inv } = await supabase.from('organization_invites').select('perm_overrides, custom_role_id').eq('token', token).maybeSingle()
      if (inv && (Object.keys(inv.perm_overrides ?? {}).length > 0 || inv.custom_role_id)) {
        const { data: mem } = await supabase.from('organization_members').select('id').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
        if (mem) {
          await supabase.from('organization_members').update({ perm_overrides: inv.perm_overrides ?? {}, custom_role_id: inv.custom_role_id ?? null }).eq('id', mem.id)
        }
      }
    }
    if (orgId) localStorage.setItem('ig-tracker-current-org', orgId)
    setTimeout(() => window.location.reload(), 800)
  }

  async function changeRole(member: MemberRow, newRole: OrgRole) {
    if (member.role === 'owner') { flash('Le propriétaire ne peut pas changer de rôle', true); return }
    setBusy(true)
    const { error } = await supabase.from('organization_members').update({ role: newRole, custom_role_id: null }).eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function assignCustomRole(member: MemberRow, template: OrgRoleTemplate) {
    setBusy(true)
    const { error } = await supabase.from('organization_members').update({ role: 'member', perm_overrides: template.perm_overrides, custom_role_id: template.id }).eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash(`Rôle "${template.name}" assigné ✓`)
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function savePerms(member: MemberRow, perms: PermOverrides) {
    setBusy(true)
    const { error } = await supabase.from('organization_members').update({ perm_overrides: perms, custom_role_id: null }).eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash('Permissions mises à jour ✓'); setEditingMember(null)
    if (currentOrg) await loadOrgDetail(currentOrg.id)
  }

  async function removeMember(member: MemberRow) {
    if (member.role === 'owner') { flash('Impossible de retirer le propriétaire', true); return }
    if (!confirm(`Retirer ${member.email ?? member.display_name ?? 'ce membre'} ?`)) return
    setBusy(true)
    const { error } = await supabase.from('organization_members').delete().eq('id', member.id)
    setBusy(false)
    if (error) { flash(error.message, true); return }
    // Instant kick — notify the removed member's session to reload immediately.
    if (currentOrg) {
      try {
        const ch = supabase.channel(`org-room-${currentOrg.id}`)
        await new Promise<void>(res => {
          ch.subscribe(s => { if (s === 'SUBSCRIBED') res() })
          setTimeout(res, 2000) // don't hang if realtime is slow
        })
        await ch.send({ type: 'broadcast', event: 'member_removed', payload: { userId: member.user_id } })
        supabase.removeChannel(ch)
      } catch { /* best-effort — the 15s safety poll will catch it anyway */ }
    }
    flash('Membre retiré')
    if (currentOrg) await loadOrgDetail(currentOrg.id)
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

  function memberLabel(m: MemberRow): string {
    return m.display_name?.trim() || m.email || m.user_id.slice(0, 8)
  }

  if (setupForOrg) {
    return <Onboarding user={user} orgId={setupForOrg} onComplete={() => setSetupForOrg(null)} />
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
          <button key={t.k} onClick={() => setOrgTab(t.k as typeof orgTab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors -mb-px border-b-2 inline-flex items-center gap-1.5 ${
              orgTab === t.k ? 'border-accent text-accent bg-accent/5' : 'border-transparent text-text2 hover:text-text'
            }`}
          ><Icon name={t.icon} size={15} />{t.label}</button>
        ))}
      </div>

      {/* ── Organisations tab ─────────────────────────────────────────────── */}
      {orgTab === 'orgas' && <>
        <section className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="user" size={16} />Mon profil</h2>
          <p className="text-text2 text-xs">Nom visible par les autres membres. Si vide, ton email est affiché.</p>
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
                        <div className="mt-0.5"><RoleChip role={member.role} /></div>
                      </div>
                      {currentOrg?.id !== org.id && (
                        <Button size="sm" variant="secondary" onClick={() => { switchOrg(org.id); window.location.reload() }}>Activer</Button>
                      )}
                      {isOwner && !isRenaming && (
                        <Button size="sm" variant="secondary"
                          onClick={() => { setRenamingOrgId(org.id); setRenameValue(org.name) }}
                          disabled={!canRename} aria-label="Renommer"
                          title={canRename ? 'Renommer' : `Renommage dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}>
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
                      <p className="px-3 pb-2 text-[11px] inline-flex items-center gap-1.5" style={{ color: 'rgba(233,234,240,0.4)' }}>
                        <Icon name="lock" size={12} /><span>Renommage dans <strong>{daysLeft}</strong> jour{daysLeft > 1 ? 's' : ''}</span>
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
            <p className="text-text2 text-sm">Active une organisation dans l'onglet "Organisations".</p>
          </div>
        ) : !canManage ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
            <p className="flex justify-center text-text2"><Icon name="lock" size={32} /></p>
            <p className="text-text font-semibold">Accès réservé aux admins</p>
            <p className="text-text2 text-sm">Seuls les propriétaires et admins peuvent gérer les membres.</p>
          </div>
        ) : (
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="users" size={16} />Membres · {currentOrg.name}</h2>
              <p className="text-xs text-text2 mt-0.5">{members.length} membre{members.length > 1 ? 's' : ''}</p>
            </div>

            <ul className="divide-y divide-border">
              {members.map(m => {
                const isMe = m.user_id === user.id
                const label = memberLabel(m)
                const customTemplate = m.custom_role_id ? roleTemplates.find(t => t.id === m.custom_role_id) : null
                return (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface/50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {label[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-sm font-medium truncate">
                        {label} {isMe && <span className="text-text2 text-xs">(toi)</span>}
                      </p>
                      <p className="text-text2 text-xs truncate">
                        {m.email ?? m.user_id} · {new Date(m.joined_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {m.role === 'owner' || isMe ? (
                        <RoleChip role={m.role} template={customTemplate} />
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
                        <button
                          onClick={() => setEditingMember(m)}
                          className="text-xs text-text2 hover:text-accent transition-colors px-2.5 py-1.5 rounded-lg hover:bg-accent/10 inline-flex items-center gap-1.5"
                        >
                          <Icon name="shield" size={13} />
                          <span className="hidden sm:inline">Permissions</span>
                        </button>
                      )}
                      {m.role !== 'owner' && !isMe && (
                        <button onClick={() => removeMember(m)}
                          className="text-danger hover:opacity-70 p-1.5 rounded-lg hover:bg-danger/10 transition-colors" title="Retirer ce membre">
                          <Icon name="x" size={15} />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Invites section */}
            <div className="px-5 py-4 border-t border-border space-y-4 bg-surface/30">
              <div>
                <h3 className="text-xs font-bold text-text mb-0.5">Générer un code d'invitation</h3>
                <p className="text-text2 text-xs mb-3">Chaque code est <strong className="text-text">à usage unique</strong>.</p>
                <div className="flex gap-2 flex-wrap items-center">
                  <div className="flex-1 min-w-[160px]">
                    <Input value={invLabel} onChange={e => setInvLabel(e.target.value)} placeholder="Note (ex: Pour Pierre) — optionnel" />
                  </div>
                  <RoleDropdown
                    value={invTemplateId ?? invRole}
                    systemRole={invRole}
                    templates={roleTemplates}
                    onSystemRole={r => { setInvRole(r); setInvTemplateId(null) }}
                    onTemplate={t => { setInvTemplateId(t.id); setInvRole('member') }}
                  />
                  <Button onClick={createInvite} loading={busy}>
                    <span className="inline-flex items-center gap-1.5"><Icon name="ticket" size={15} />Générer</span>
                  </Button>
                </div>
              </div>

              {invites.length > 0 && (
                <div>
                  <p className="text-[10px] text-text2 uppercase tracking-wider font-bold mb-2">Codes en attente ({invites.length})</p>
                  <ul className="space-y-1.5">
                    {invites.map(inv => (
                      <li key={inv.id} className="flex items-center gap-2 bg-bg border border-border px-3 py-2 rounded-xl text-xs">
                        <span className="flex-1 truncate text-text">{inv.email}</span>
                        {inv.custom_role_id ? (() => {
                          const t = roleTemplates.find(r => r.id === inv.custom_role_id)
                          return t ? <RoleChip role="member" template={t} /> : null
                        })() : <RoleChip role={inv.role as OrgRole} />}
                        <code
                          onClick={() => { navigator.clipboard.writeText(inv.token); flash('Code copié ✓') }}
                          className="bg-surface px-2 py-1 rounded-lg font-mono text-[10px] cursor-pointer hover:text-accent transition-colors border border-border"
                          title="Cliquer pour copier le code complet"
                        >{inv.token.slice(0, 12)}…</code>
                        <button onClick={() => revokeInvite(inv)} className="text-danger hover:opacity-70 p-1 rounded" title="Révoquer" aria-label="Révoquer ce code"><Icon name="x" size={14} /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )
      )}

      {/* ── Roles tab ─────────────────────────────────────────────────────── */}
      {orgTab === 'roles' && canManage && (
        <div className="space-y-4">
          {/* System roles */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="shield" size={16} />Rôles système</h2>
              <p className="text-xs text-text2 mt-0.5">Rôles prédéfinis — non modifiables</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y divide-border">
              {([
                { role: 'owner' as OrgRole, desc: "Accès complet, gestion de l'organisation" },
                { role: 'admin' as OrgRole, desc: "Comme propriétaire, sans pouvoir supprimer l'orga" },
                { role: 'member' as OrgRole, desc: 'Posting, banque, outils vidéo (sans sous-titres)' },
                { role: 'viewer' as OrgRole, desc: 'Lecture seule : banque et captions uniquement' },
              ]).map(({ role, desc }) => (
                <div key={role} className="px-4 py-4">
                  <div className="mb-2"><RoleChip role={role} /></div>
                  <p className="text-xs text-text2 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Custom roles */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="roles" size={16} />Rôles personnalisés</h2>
                <p className="text-xs text-text2 mt-0.5">Templates réutilisables pour assigner des permissions en un clic</p>
              </div>
              <Button size="sm" onClick={() => setCreatingTemplate(true)}>+ Nouveau rôle</Button>
            </div>

            {roleTemplates.length === 0 && (
              <div className="px-5 py-10 text-center">
                <p className="flex justify-center mb-3 text-text2"><Icon name="roles" size={40} /></p>
                <p className="text-sm font-semibold text-text mb-1">Aucun rôle personnalisé</p>
                <p className="text-xs text-text2 mb-5 max-w-xs mx-auto">Crée des rôles comme "Content Manager", "Analyste"… pour configurer des permissions précises et les appliquer en un clic.</p>
                <Button size="sm" onClick={() => setCreatingTemplate(true)}>Créer mon premier rôle</Button>
              </div>
            )}

            {roleTemplates.length > 0 && (
              <div className="divide-y divide-border">
                {roleTemplates.map(t => (
                  <div key={t.id} className="px-5 py-4 flex items-center gap-4 hover:bg-surface/40 transition-colors">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <RoleChip role="member" template={t} />
                      </div>
                      <p className="text-[11px] text-text2 truncate">{permSummary(t.perm_overrides)}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditingTemplate(t)}
                        className="text-xs text-text2 hover:text-accent px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors inline-flex items-center gap-1.5"
                      ><Icon name="pencil" size={13} />Éditer</button>
                      <button
                        onClick={() => deleteTemplate(t)}
                        className="text-xs text-text2 hover:text-danger px-2 py-1.5 rounded-lg hover:bg-danger/10 transition-colors"
                        aria-label="Supprimer"
                      ><Icon name="x" size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {roleTemplates.length > 0 && (
              <div className="px-5 py-3 border-t border-border bg-surface/20">
                <p className="text-[10px] text-text2">
                  Pour appliquer un rôle à un membre, va dans <strong className="text-text">Membres</strong> et clique sur son badge de rôle.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Logs tab ──────────────────────────────────────────────────────── */}
      {orgTab === 'logs' && canManage && (
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text inline-flex items-center gap-2"><Icon name="logs" size={16} />Logs d'activité</h2>
              <p className="text-xs text-text2 mt-0.5">200 dernières actions des membres</p>
            </div>
            <button onClick={loadLogs} className="text-xs text-accent hover:opacity-70 transition-opacity">⟳ Rafraîchir</button>
          </div>
          {logsLoading ? (
            <div className="px-5 py-6 text-center text-xs text-text2">Chargement…</div>
          ) : activityLogs.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-text2">Aucune activité enregistrée.</div>
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
                            {typeof log.details.count === 'number' && <span className="text-[10px] text-text2">{log.details.count} téléphone(s)</span>}
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

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {editingMember && (
        <PermModal
          member={editingMember}
          templates={roleTemplates}
          availableFolders={folders}
          availableGroups={groups}
          onSave={perms => savePerms(editingMember, perms)}
          onCancel={() => setEditingMember(null)}
        />
      )}

      {(creatingTemplate || editingTemplate) && (
        <RoleModal
          initial={editingTemplate ?? undefined}
          availableFolders={folders}
          availableGroups={groups}
          onSave={(name, color, perms) => saveTemplate(name, color, perms, editingTemplate?.id)}
          onCancel={() => { setCreatingTemplate(false); setEditingTemplate(null) }}
        />
      )}

      {invitePermModal && (
        <InvitePermModal
          invite={invitePermModal}
          availableFolders={folders}
          availableGroups={groups}
          roleTemplates={roleTemplates}
          onSave={perms => saveInvitePerms(invitePermModal, perms)}
          onSkip={() => { setInvitePermModal(null); flash("Code généré et copié ✓ — partage-le, il ne marche qu'une fois") }}
        />
      )}
    </div>
  )
}
