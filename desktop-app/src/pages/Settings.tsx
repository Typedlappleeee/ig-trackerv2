// Réglages — 4 sections claires : Profil & sécurité, Équipe, Licence & crédits,
// Intégrations (GeeLark, Groq, proxy, domaine des liens). Section mémorisée et
// ouvrable directement (openTool('settings', { tab })). Retours toujours en toast.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import ProxyRotationPanel from '@/components/ProxyRotationPanel'
import { LangSwitch } from '@/components/AppUpdate'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, FIELD, MONO, Skeleton, SkeletonRows, useNarrow, toast, confirmDialog } from '@/lib/ui'
import { supabase, type OrgRole } from '@/lib/supabase'
import { fetchBalance, fetchOrgBalance, fmtNumber, type OrgState } from '@/lib/data'
import { takeOpenArg } from '@/lib/openTool'
import { useBankUsage, fmtBytes, PLAN_LABEL } from '@/lib/bankStorage'
import { geelarkFetch } from '@/lib/geelark'
import { generateCaption } from '@/lib/ai'

type Tab = 'profile' | 'team' | 'billing' | 'integrations'
const SECTIONS: { k: Tab; l: string; d: string; i: string }[] = [
  { k: 'profile', l: 'Profil & sécurité', d: 'Nom, langue, mot de passe', i: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { k: 'team', l: 'Équipe', d: 'Organisation, membres, rôles', i: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8' },
  { k: 'billing', l: 'Licence & crédits', d: 'Accès, solde, codes', i: 'M2 8h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z|M2 8l2-4h16l2 4|M12 12v4' },
  { k: 'integrations', l: 'Intégrations', d: 'GeeLark, IA, proxy, liens', i: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
]
type LinkDomain = 'tapmylink' | 'custom'
const cleanDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
const TAB_KEY = 'sf-settings-tab'
const LEGACY: Record<string, Tab> = { account: 'profile', org: 'team', members: 'team', infra: 'integrations', proxy: 'integrations' }
function initialTab(): Tab {
  const o = takeOpenArg<{ tab?: string }>('settings')?.tab
  const fromOpen = o ? (LEGACY[o] ?? o) : null
  if (fromOpen && SECTIONS.some(s => s.k === fromOpen)) return fromOpen as Tab
  try { const v = localStorage.getItem(TAB_KEY); if (v && SECTIONS.some(s => s.k === v)) return v as Tab } catch { /* ignore */ }
  return 'profile'
}

const ROLE_LABEL: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Membre', viewer: 'Lecture seule' }
const ROLE_TONE: Record<OrgRole, 'violet' | 'info' | 'ok' | 'mute'> = { owner: 'violet', admin: 'info', member: 'ok', viewer: 'mute' }
interface MemberRow { id: string; user_id: string; role: OrgRole; email: string | null; display_name: string | null }

function initialsFrom(name: string | null, email: string | null): string {
  const src = (name?.trim() || email?.split('@')[0] || '?').replace(/[._-]/g, ' ')
  return (src.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase()
}

// ── Briques de mise en page ───────────────────────────────────────────────────
function Row({ label, hint, children, last }: { label: string; hint?: string; children: ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px 24px', flexWrap: 'wrap', padding: '14px 16px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ flex: '0 1 220px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: '#8B8B94', lineHeight: 1.45 }}>{hint}</span>}
      </span>
      <span style={{ flex: '1 1 260px', minWidth: 0 }}>{children}</span>
    </div>
  )
}
const Stack = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
function SecretInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ display: 'flex', gap: 8 }}>
      <input value={value} onChange={e => onChange(e.target.value)} type={show ? 'text' : 'password'} placeholder={placeholder} disabled={disabled} spellCheck={false} autoComplete="off" style={{ ...FIELD, fontFamily: MONO, fontSize: 12 }} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Cacher' : 'Afficher'} style={{ flexShrink: 0, width: 34, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: '#161618', color: '#A1A1AA', cursor: 'pointer' }}>
        <Icon d={show ? 'M17.9 17.9A10 10 0 0 1 12 20c-7 0-10-8-10-8a18 18 0 0 1 5.1-5.9|M9.9 4.2A9 9 0 0 1 12 4c7 0 10 8 10 8a18 18 0 0 1-2.2 3.2|M1 1l22 22' : 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'} size={14} />
      </button>
    </span>
  )
}
function Status({ ok, okText = 'Connecté', koText = 'À configurer' }: { ok: boolean; okText?: string; koText?: string }) {
  return <Chip text={ok ? `✓ ${okText}` : koText} tone={ok ? 'ok' : 'warn'} />
}

export default function Settings({ theme, user, org, onSignOut }: {
  theme: Theme; user: User; org: OrgState; onSignOut: () => void; onNavigate?: (p: string) => void
}) {
  const [tab, setTabState] = useState<Tab>(initialTab)
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t) } catch { /* ignore */ } }
  const narrow = useNarrow()
  const canManage = org.role === 'owner' || org.role === 'admin' || !org.currentOrg

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Réglages" sub="Ton compte, ton équipe, ta licence et tes intégrations." />
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '240px minmax(0,1fr)', gap: narrow ? 14 : 24, alignItems: 'start' }}>
        <nav style={{ position: narrow ? 'static' : 'sticky', top: 0, display: narrow ? 'grid' : 'flex', gridTemplateColumns: narrow ? 'repeat(2,minmax(0,1fr))' : undefined, flexDirection: 'column', gap: 4 }}>
          {SECTIONS.map(x => {
            const on = tab === x.k
            return (
              <button key={x.k} type="button" onClick={() => setTab(x.k)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', border: `1px solid ${on ? 'rgba(255,255,255,0.1)' : 'transparent'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: on ? '#161618' : 'transparent', transition: 'background .12s ease' }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 8, background: on ? theme.accent : '#18181B', color: on ? '#fff' : '#A1A1AA', border: '1px solid rgba(255,255,255,0.08)' }}><Icon d={x.i} size={15} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: on ? '#EDEDEF' : '#D4D4D8' }}>{x.l}</span>
                  {!narrow && <span style={{ fontSize: 11.5, color: '#71717A' }}>{x.d}</span>}
                </span>
              </button>
            )
          })}
        </nav>
        <div key={tab} style={{ minWidth: 0, animation: 'aIn .25s both' }}>
          {tab === 'profile' && <ProfileTab theme={theme} user={user} org={org} onSignOut={onSignOut} />}
          {tab === 'team' && <TeamTab theme={theme} user={user} org={org} />}
          {tab === 'billing' && <BillingTab theme={theme} user={user} org={org} />}
          {tab === 'integrations' && <IntegrationsTab theme={theme} user={user} org={org} canManage={canManage} />}
        </div>
      </div>
    </div>
  )
}

// ══════════ PROFIL & SÉCURITÉ ══════════
function ProfileTab({ theme, user, org, onSignOut }: { theme: Theme; user: User; org: OrgState; onSignOut: () => void }) {
  const [name, setName] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  useEffect(() => {
    let alive = true
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (alive) { const n = (data as { display_name?: string } | null)?.display_name ?? null; setName(n); setInput(n ?? '') } })
    return () => { alive = false }
  }, [user.id])
  async function saveName() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ display_name: input.trim() || null }).eq('id', user.id)
    setSaving(false)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else { setName(input.trim() || null); toast('Nom enregistré.', 'ok') }
  }
  async function changePassword() {
    if (pw.length < 8) { toast('8 caractères minimum.', 'bad'); return }
    if (pw !== pw2) { toast('Les deux mots de passe ne correspondent pas.', 'bad'); return }
    setPwBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setPwBusy(false)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else { setPw(''); setPw2(''); toast('Mot de passe modifié.', 'ok') }
  }
  return (
    <Stack>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: `linear-gradient(135deg, ${theme.accent}33, transparent 60%), #111113` }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 99, flexShrink: 0, background: `linear-gradient(135deg, ${theme.accent}, #F472B6)`, color: '#fff', fontSize: 19, fontWeight: 700 }}>{initialsFrom(name, user.email ?? null)}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span data-no-tr style={{ fontSize: 18, fontWeight: 650, color: '#EDEDEF', letterSpacing: '-0.02em' }}>{name === null ? <Skeleton w={120} h={18} /> : (name.trim() || user.email?.split('@')[0])}</span>
          <span data-no-tr style={{ fontSize: 13, color: '#8B8B94' }}>{user.email}</span>
        </span>
        {org.role && <span style={{ marginLeft: 'auto' }}><Chip text={ROLE_LABEL[org.role]} tone={ROLE_TONE[org.role]} /></span>}
      </div>

      <Panel theme={theme}>
        <PanelHead title="Informations" />
        <Row label="Nom affiché" hint="Visible par les membres de ton équipe">
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void saveName() }} placeholder="Ton nom" style={{ ...FIELD, flex: 1, minWidth: 180 }} />
            <Btn theme={theme} tone="primary" label={saving ? '…' : 'Enregistrer'} disabled={saving || input.trim() === (name ?? '').trim()} onClick={() => void saveName()} />
          </span>
        </Row>
        <Row label="Langue" hint="Langue de l’interface" last><LangSwitch theme={theme} /></Row>
      </Panel>

      <Panel theme={theme}>
        <PanelHead title="Sécurité" sub="Mot de passe et session" />
        <Row label="Nouveau mot de passe" hint="8 caractères minimum">
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Nouveau mot de passe" autoComplete="new-password" style={{ ...FIELD, flex: 1, minWidth: 160 }} />
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirmer" autoComplete="new-password" onKeyDown={e => { if (e.key === 'Enter') void changePassword() }} style={{ ...FIELD, flex: 1, minWidth: 160 }} />
            <Btn theme={theme} label={pwBusy ? '…' : 'Modifier'} disabled={pwBusy || !pw} onClick={() => void changePassword()} />
          </span>
        </Row>
        <Row label="Session" hint="Te déconnecte de cet appareil" last>
          <Btn theme={theme} tone="danger" label="Se déconnecter" icon="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9" onClick={onSignOut} />
        </Row>
      </Panel>
    </Stack>
  )
}

// ══════════ ÉQUIPE ══════════
function TeamTab({ theme, user, org }: { theme: Theme; user: User; org: OrgState }) {
  const { currentOrg, role } = org
  const canManage = role === 'owner' || role === 'admin'
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    if (!currentOrg) { setMembers(null); return }
    const { data: rows, error } = await supabase.from('organization_members').select('id, user_id, role').eq('org_id', currentOrg.id)
    if (error || !rows) { setMembers([]); return }
    const ids = (rows as { user_id: string }[]).map(r => r.user_id)
    const profs: Record<string, { email: string | null; display_name: string | null }> = {}
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, email, display_name').in('id', ids)
      for (const p of (data as { id: string; email: string | null; display_name: string | null }[]) ?? []) profs[p.id] = p
    }
    const order: Record<OrgRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 }
    setMembers((rows as { id: string; user_id: string; role: OrgRole }[]).map(r => ({ ...r, email: profs[r.user_id]?.email ?? null, display_name: profs[r.user_id]?.display_name ?? null })).sort((a, b) => order[a.role] - order[b.role]))
  }, [currentOrg?.id])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!currentOrg) return
    let alive = true
    fetchOrgBalance(currentOrg.id, currentOrg.owner_id).then(b => { if (alive) setBalance(b) })
    return () => { alive = false }
  }, [currentOrg?.id, currentOrg?.owner_id])

  async function createOrg() {
    const name = orgName.trim()
    if (!name || creating) return
    setCreating(true)
    const { data, error } = await supabase.rpc('create_org', { p_name: name })
    setCreating(false)
    if (error) { toast(`Échec : ${/org_limit_reached/.test(error.message) ? 'tu possèdes déjà une organisation.' : error.message}`, 'bad'); return }
    // L'owner est ajouté par trigger ; on bascule dessus (la liste des orgs se recharge au démarrage).
    if (typeof data === 'string') { try { localStorage.setItem('ig-tracker-current-org', data) } catch { /* ignore */ } }
    window.location.reload()
  }
  async function invite() {
    const e = email.trim().toLowerCase()
    if (!e || !currentOrg) return
    setInviting(true)
    try {
      const { data: prof } = await supabase.from('profiles').select('id').ilike('email', e).maybeSingle()
      if (!prof?.id) { toast('Aucun compte ScaleFlow avec cet email — la personne doit d’abord créer son compte.', 'bad', 6000); return }
      const { data: existing } = await supabase.from('organization_members').select('id').eq('org_id', currentOrg.id).eq('user_id', prof.id).maybeSingle()
      if (existing) { toast('Cette personne est déjà membre.', 'info'); return }
      const { error } = await supabase.from('organization_members').insert({ org_id: currentOrg.id, user_id: prof.id, role: 'member' })
      if (error) { toast(`Échec : ${error.message}`, 'bad'); return }
      toast(`${e} a rejoint l’équipe.`, 'ok'); setEmail(''); void load()
    } finally { setInviting(false) }
  }
  async function setRole(m: MemberRow, r: OrgRole) {
    const { error } = await supabase.from('organization_members').update({ role: r }).eq('id', m.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else { toast('Rôle mis à jour.', 'ok'); void load() }
  }
  async function remove(m: MemberRow) {
    if (!await confirmDialog({ title: 'Retirer ce membre ?', text: `${m.display_name || m.email || 'Ce membre'} n’aura plus accès à l’organisation.`, confirmLabel: 'Retirer', danger: true })) return
    const { error } = await supabase.from('organization_members').delete().eq('id', m.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else void load()
  }
  async function deleteOrg() {
    if (!currentOrg) return
    if (!await confirmDialog({ title: `Supprimer « ${currentOrg.name} » ?`, text: 'Irréversible : l’organisation et ses accès membres sont supprimés.', confirmLabel: 'Supprimer définitivement', danger: true })) return
    const { error } = await supabase.from('organizations').delete().eq('id', currentOrg.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else org.switchOrg(null)
  }

  if (!currentOrg) return (
    <Stack>
      <Panel theme={theme}>
        <PanelHead title="Espace personnel" sub="Tu travailles seul : tes appareils et ton contenu sont privés." />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>Créer une organisation</span>
          <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.55 }}>Invite des membres et pilote leurs comptes. Les crédits sont ceux du chef d’orga (toi) : chaque publication d’un membre débite <b>ton</b> solde.</span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={orgName} onChange={e => setOrgName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void createOrg() }} placeholder="Nom de ton organisation" maxLength={60} style={{ ...FIELD, flex: 1, minWidth: 180 }} />
            <Btn theme={theme} tone="primary" label={creating ? 'Création…' : 'Créer'} disabled={creating || !orgName.trim()} onClick={() => void createOrg()} />
          </span>
        </div>
      </Panel>
    </Stack>
  )

  const list = members ?? []
  return (
    <Stack>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: '#111113' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 11, background: `linear-gradient(135deg, ${theme.accent}, #22D3EE)`, color: '#fff', fontWeight: 700 }}>{initialsFrom(currentOrg.name, null)}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
          <span data-no-tr style={{ fontSize: 16, fontWeight: 650, color: '#EDEDEF' }}>{currentOrg.name}</span>
          <span style={{ fontSize: 12, color: '#8B8B94' }}>{members === null ? '…' : `${list.length} membre(s)`} · crédits partagés {balance === null ? '…' : fmtNumber(balance)}</span>
        </span>
        {role && <Chip text={ROLE_LABEL[role]} tone={ROLE_TONE[role]} />}
        <Btn theme={theme} sm label="Copier l’ID" icon="M9 9h11v11H9z|M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" onClick={() => { void navigator.clipboard.writeText(currentOrg.id).then(() => toast('ID copié.', 'ok'), () => toast('Copie impossible.', 'bad')) }} />
      </div>

      {canManage && (
        <Panel theme={theme}>
          <PanelHead title="Inviter quelqu’un" sub="Par l’email de son compte ScaleFlow" />
          <div style={{ display: 'flex', gap: 8, padding: 16, flexWrap: 'wrap' }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void invite() }} placeholder="prenom@agence.fr" style={{ ...FIELD, flex: 1, minWidth: 200 }} />
            <Btn theme={theme} tone="primary" label={inviting ? 'Ajout…' : 'Inviter'} disabled={inviting || !email.trim()} icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" onClick={() => void invite()} />
          </div>
        </Panel>
      )}

      <Panel theme={theme}>
        <PanelHead title="Membres" sub="Owner : tout · Admin : tout sauf facturation · Membre : publie · Lecture seule : consulte" />
        {members === null ? <SkeletonRows rows={3} avatar /> : list.map((m, i) => {
          const me = m.user_id === user.id
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 99, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8', fontSize: 11.5, fontWeight: 600 }}>{initialsFrom(m.display_name, m.email)}</span>
              <span style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span data-no-tr style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{m.display_name?.trim() || m.email || m.user_id.slice(0, 8)}{me && <span style={{ color: '#71717A', fontWeight: 400 }}> · toi</span>}</span>
                <span data-no-tr style={{ fontSize: 12, color: '#8B8B94' }}>{m.email ?? '—'}</span>
              </span>
              {canManage && !me && m.role !== 'owner' ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <select value={m.role} onChange={e => void setRole(m, e.target.value as OrgRole)} style={{ ...FIELD, width: 'auto', height: 30, cursor: 'pointer' }}>
                    {(['admin', 'member', 'viewer'] as OrgRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <Btn theme={theme} sm tone="quiet" label="Retirer" onClick={() => void remove(m)} />
                </span>
              ) : <Chip text={ROLE_LABEL[m.role]} tone={ROLE_TONE[m.role]} />}
            </div>
          )
        })}
      </Panel>

      {role === 'owner' && (
        <Panel theme={theme}>
          <PanelHead title="Zone sensible" />
          <Row label="Supprimer l’organisation" hint="Irréversible" last>
            <Btn theme={theme} tone="danger" label="Supprimer" onClick={() => void deleteOrg()} />
          </Row>
        </Panel>
      )}
    </Stack>
  )
}

// ══════════ LICENCE & CRÉDITS ══════════
function BillingTab({ theme, user, org }: { theme: Theme; user: User; org: OrgState }) {
  const { currentOrg } = org
  const [balance, setBalance] = useState<number | null>(null)
  const [lic, setLic] = useState<{ key: string; expires_at: string | null; plan: string | null } | null | undefined>(undefined)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    setBalance(currentOrg ? await fetchOrgBalance(currentOrg.id, currentOrg.owner_id) : await fetchBalance(user.id))
  }, [currentOrg?.id, currentOrg?.owner_id, user.id])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    let alive = true
    supabase.from('license_keys').select('key, expires_at, plan').eq('user_id', user.id).eq('is_active', true).order('expires_at', { ascending: false, nullsFirst: true }).limit(1).maybeSingle()
      .then(({ data, error }) => { if (alive) setLic(error ? null : (data as typeof lic) ?? null) })
    return () => { alive = false }
  }, [user.id])
  async function redeem() {
    const c = code.trim()
    if (!c || busy) return
    setBusy(true)
    const { redeemCreditCode, redeemCreditCodeForOrg } = await import('@/lib/credits')
    const res = currentOrg ? await redeemCreditCodeForOrg(c, currentOrg.id) : await redeemCreditCode(c, user.id)
    setBusy(false)
    if (!res.ok) { toast(res.error ?? 'Code invalide ou déjà utilisé.', 'bad'); return }
    toast(`+${res.amount ?? 0} crédits ajoutés.`, 'ok'); setCode(''); void reload()
  }
  const exp = lic?.expires_at ? new Date(lic.expires_at) : null
  const daysLeft = exp ? Math.ceil((exp.getTime() - Date.now()) / 86_400_000) : null
  const masked = lic?.key ? `${lic.key.slice(0, 4)}-••••-••••-${lic.key.slice(-4)}` : null
  const { usage } = useBankUsage(currentOrg?.id ?? null)
  const pct = usage?.quota ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0
  const PRICES: [string, string][] = [['Reel / TikTok', '2 cr / compte'], ['Story', '1 cr / compte'], ['Tâche automatique', '50 cr / jour'], ['Studio & outils IA', 'gratuit']]
  return (
    <Stack>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: `linear-gradient(135deg, ${theme.accent}40, transparent 70%), #111113` }}>
          <div style={{ fontSize: 12, color: '#A1A1AA' }}>Crédits disponibles{currentOrg ? ' · organisation' : ''}</div>
          <div style={{ marginTop: 8, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{balance === null ? <Skeleton w={110} h={28} r={6} /> : fmtNumber(balance)}</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: '#A1A1AA' }}>{balance === null ? '' : `≈ ${fmtNumber(Math.floor(balance / 2))} publications`}</div>
        </div>
        <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: '#111113', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#A1A1AA' }}>Licence</span>
            {lic === undefined ? <Skeleton w={60} h={18} /> : <Status ok={!!lic || !!currentOrg} okText={lic ? 'Active' : 'Via ton équipe'} koText="Aucune clé" />}
          </span>
          <span style={{ fontSize: 17, fontWeight: 650, color: '#EDEDEF' }}>{lic?.plan ? lic.plan.charAt(0).toUpperCase() + lic.plan.slice(1) : currentOrg ? 'Organisation' : 'Standard'}</span>
          {masked && <span data-no-tr style={{ fontFamily: MONO, fontSize: 12, color: '#8B8B94' }}>{masked}</span>}
          <span style={{ fontSize: 12.5, color: daysLeft !== null && daysLeft <= 7 ? '#FBBF24' : '#8B8B94' }}>
            {exp ? `Expire le ${exp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${daysLeft !== null ? ` · ${Math.max(0, daysLeft)} jour(s)` : ''}` : lic ? 'Sans date d’expiration' : ''}
          </span>
        </div>
      </div>

      {usage && (
        <Panel theme={theme}>
          <PanelHead title="Espace de la banque" sub={usage.quota ? `Abonnement ${PLAN_LABEL[usage.plan] ?? usage.plan} · Standard 5 Go · Pro 15 Go · Organisation 50 Go` : 'Espace illimité'} />
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <b style={{ color: '#EDEDEF' }}>{usage.quota ? `${fmtBytes(usage.used)} / ${fmtBytes(usage.quota)}` : fmtBytes(usage.used)}</b>
              {usage.quota !== null && <span style={{ color: pct >= 80 ? '#FBBF24' : '#8B8B94' }}>{pct} %</span>}
            </span>
            {usage.quota !== null && <span style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.max(2, pct)}%`, background: pct >= 100 ? '#F87171' : pct >= 80 ? '#FBBF24' : theme.accent }} /></span>}
            <span style={{ fontSize: 12, color: '#71717A' }}>La corbeille compte jusqu’à ce qu’elle soit vidée (7 jours). Au-delà de la limite, les nouveaux envois sont bloqués.</span>
          </div>
        </Panel>
      )}

      <Panel theme={theme}>
        <PanelHead title="Utiliser un code de crédits" sub={currentOrg ? 'Crédité sur le solde de l’organisation.' : 'Crédité sur ton solde.'} />
        <div style={{ display: 'flex', gap: 8, padding: 16, flexWrap: 'wrap' }}>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') void redeem() }} placeholder="CR-XXXX-XXXX" spellCheck={false} autoComplete="off" style={{ ...FIELD, flex: 1, minWidth: 180, fontFamily: MONO, letterSpacing: '0.04em' }} />
          <Btn theme={theme} tone="primary" label={busy ? 'Validation…' : 'Valider'} disabled={busy || !code.trim()} onClick={() => void redeem()} />
        </div>
      </Panel>

      <Panel theme={theme}>
        <PanelHead title="Tarifs" right={<a href="https://t.me/justquentin" target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#C4BBFB', textDecoration: 'none', fontWeight: 500 }}>Acheter des crédits →</a>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {PRICES.map(([l, v]) => (
            <div key={l} style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 12, color: '#8B8B94' }}>{l}</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: '#EDEDEF' }}>{v}</div>
            </div>
          ))}
        </div>
      </Panel>
    </Stack>
  )
}

// ══════════ INTÉGRATIONS ══════════
// Les clés vivent dans org_config (orga) ou app_config (perso) et alimentent useConnections()
// partout ; à l'enregistrement on prévient l'app (événement) → plus besoin de recharger.
function IntegrationsTab({ theme, user, org, canManage }: { theme: Theme; user: User; org: OrgState; canManage: boolean }) {
  const { currentOrg } = org
  const [vals, setVals] = useState<{ bearer: string; groq: string } | null>(null)
  const [saved, setSaved] = useState<{ bearer: string; groq: string }>({ bearer: '', groq: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const readOnly = !canManage
  useEffect(() => {
    let alive = true
    const q = currentOrg
      ? supabase.from('org_config').select('bearer_token, groq_api_key').eq('org_id', currentOrg.id).maybeSingle()
      : supabase.from('app_config').select('bearer_token, groq_api_key').eq('user_id', user.id).maybeSingle()
    q.then(({ data }) => {
      if (!alive) return
      const d = data as { bearer_token?: string; groq_api_key?: string } | null
      const v = { bearer: d?.bearer_token ?? '', groq: d?.groq_api_key ?? '' }
      setVals(v); setSaved(v)
    })
    return () => { alive = false }
  }, [currentOrg?.id, user.id])

  async function save(field: 'bearer' | 'groq') {
    if (!vals) return
    setBusy(`save-${field}`)
    const col = field === 'bearer' ? { bearer_token: vals.bearer.trim() } : { groq_api_key: vals.groq.trim() }
    const { error } = currentOrg
      ? await supabase.from('org_config').upsert({ org_id: currentOrg.id, ...col }, { onConflict: 'org_id' })
      : await supabase.from('app_config').upsert({ user_id: user.id, ...col }, { onConflict: 'user_id' })
    setBusy(null)
    if (error) { toast(`Échec : ${error.message}`, 'bad'); return }
    setSaved(s => ({ ...s, [field]: vals[field].trim() }))
    window.dispatchEvent(new Event('sf-conns-changed'))
    toast('Enregistré — actif tout de suite.', 'ok')
  }
  async function test(field: 'bearer' | 'groq') {
    if (!vals) return
    setBusy(`test-${field}`)
    let ok = false
    try {
      if (field === 'bearer') { const r = await geelarkFetch('/phone/list', { page: 1, pageSize: 1 }, vals.bearer.trim()); ok = Number(r['code']) === 0 }
      else ok = !!(await generateCaption(vals.groq.trim(), 'test'))
    } catch { ok = false }
    setBusy(null)
    toast(ok ? 'Connexion réussie ✓' : field === 'bearer' ? 'Token GeeLark refusé — vérifie-le dans GeeLark → OpenAPI.' : 'Clé Groq refusée — vérifie-la sur console.groq.com.', ok ? 'ok' : 'bad', 6000)
  }

  const card = (field: 'bearer' | 'groq', title: string, sub: string, placeholder: string, help: ReactNode) => (
    <Panel theme={theme}>
      <PanelHead title={title} sub={sub} right={vals ? <Status ok={!!saved[field]} /> : undefined} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
        {vals === null ? <Skeleton h={32} r={6} /> : <SecretInput value={vals[field]} onChange={v => setVals(x => x && { ...x, [field]: v })} placeholder={placeholder} disabled={readOnly} />}
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!readOnly && <Btn theme={theme} tone="primary" sm label={busy === `save-${field}` ? 'Enregistrement…' : 'Enregistrer'} disabled={!!busy || !vals || vals[field].trim() === saved[field]} onClick={() => void save(field)} />}
          <Btn theme={theme} sm label={busy === `test-${field}` ? 'Test…' : 'Tester'} disabled={!!busy || !vals?.[field].trim()} onClick={() => void test(field)} />
          <span style={{ fontSize: 12, color: '#71717A' }}>{help}</span>
        </span>
        {readOnly && <span style={{ fontSize: 12, color: '#FBBF24' }}>Seuls owner / admin de l’organisation peuvent modifier cette clé.</span>}
      </div>
    </Panel>
  )

  return (
    <Stack>
      {card('bearer', 'GeeLark', 'Indispensable : pilote tes téléphones et publie.', 'Token OpenAPI GeeLark…', <>GeeLark → OpenAPI → copier le token</>)}
      {card('groq', 'IA (Groq)', 'Légendes IA et sous-titres automatiques. Gratuit.', 'gsk_…', <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: '#C4BBFB', textDecoration: 'none' }}>Créer une clé gratuite →</a>)}
      <ProxyRotationPanel theme={theme} user={user} org={org} />
      <LinkDomainCard theme={theme} />
    </Stack>
  )
}

// Domaine des liens suivis (même stockage que Liens → Réglages).
function LinkDomainCard({ theme }: { theme: Theme }) {
  const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
  const [mode, setMode] = useState<LinkDomain>(() => read('sf-link-domain', 'tapmylink') === 'custom' ? 'custom' : 'tapmylink')
  const [custom, setCustom] = useState(() => read('sf-link-custom-domain', ''))
  function save(m: LinkDomain) {
    const d = cleanDomain(custom)
    if (m === 'custom' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) { toast('Domaine invalide (ex. liens.monagence.fr).', 'bad'); return }
    try { localStorage.setItem('sf-link-domain', m); if (m === 'custom') localStorage.setItem('sf-link-custom-domain', d) } catch { /* ignore */ }
    setMode(m); toast(m === 'custom' ? `Domaine enregistré : ${d}` : 'Domaine : tapmylink.fr', 'ok')
  }
  return (
    <Panel theme={theme}>
      <PanelHead title="Domaine des liens" sub="L’adresse de tes liens suivis et pages de liens." right={<Chip text={mode === 'custom' ? cleanDomain(custom) || 'perso' : 'tapmylink.fr'} tone="violet" />} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn theme={theme} sm tone={mode === 'tapmylink' ? 'primary' : 'ghost'} label="tapmylink.fr (par défaut)" onClick={() => save('tapmylink')} />
        </span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="liens.monagence.fr" spellCheck={false} style={{ ...FIELD, flex: 1, minWidth: 200 }} />
          <Btn theme={theme} sm tone={mode === 'custom' ? 'primary' : 'ghost'} label="Utiliser mon domaine" onClick={() => save('custom')} />
        </span>
        <span style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>Domaine perso : ajoute un enregistrement CNAME vers <span style={{ fontFamily: MONO }}>cname.vercel-dns.com</span>, puis préviens-nous pour l’activer.</span>
      </div>
    </Panel>
  )
}
