import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useLicense } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'

// ── Types ──────────────────────────────────────────────────────────────────────
type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed'
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
type TicketCategory = 'general' | 'billing' | 'technical' | 'other'

interface Ticket {
  id:           string
  user_id:      string
  org_id:       string | null
  user_email:   string
  org_name:     string | null
  subject:      string
  description:  string
  category:     TicketCategory
  status:       TicketStatus
  priority:     TicketPriority
  created_at:   string
  updated_at:   string
  message_count?: number
}

interface TicketMessage {
  id:           string
  ticket_id:    string
  sender_id:    string
  sender_email: string
  is_admin:     boolean
  message:      string
  created_at:   string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<TicketStatus, string> = {
  open:        '🟡 Ouvert',
  in_progress: '🔵 En cours',
  resolved:    '🟢 Résolu',
  closed:      '⚫ Fermé',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open:        'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  resolved:    'bg-green-500/15 text-green-400 border-green-500/25',
  closed:      'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low:    '▽ Faible',
  normal: '◇ Normal',
  high:   '▲ Élevé',
  urgent: '🔴 Urgent',
}

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    'text-zinc-400',
  normal: 'text-blue-400',
  high:   'text-orange-400',
  urgent: 'text-red-400',
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  general:   '💬 Général',
  billing:   '💳 Facturation',
  technical: '⚙️ Technique',
  other:     '📎 Autre',
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Create Ticket Form ─────────────────────────────────────────────────────────
function CreateTicketForm({
  user, orgId, orgName,
  onCreated,
  onCancel,
}: {
  user: User
  orgId: string | null
  orgName: string | null
  onCreated: () => void
  onCancel: () => void
}) {
  const [subject,     setSubject]     = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState<TicketCategory>('general')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function submit() {
    if (!subject.trim() || !description.trim()) {
      setError('Merci de remplir tous les champs.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('support_tickets').insert({
      user_id:     user.id,
      org_id:      orgId,
      user_email:  user.email ?? '',
      org_name:    orgName,
      subject:     subject.trim(),
      description: description.trim(),
      category,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreated()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="text-sm text-muted hover:text-text transition-colors"
        >
          ← Retour
        </button>
        <h2 className="text-base font-semibold text-text">Nouveau ticket</h2>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Sujet</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Résumé de votre problème"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Catégorie</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as TicketCategory)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              {(Object.entries(CATEGORY_LABELS) as [TicketCategory, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Décrivez votre problème en détail…"
              rows={5}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border/60 px-4 py-1.5 text-sm text-muted hover:text-text transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-1.5 text-sm font-medium text-white transition-colors"
          >
            {saving ? 'Envoi…' : 'Envoyer le ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thread View ────────────────────────────────────────────────────────────────
function ThreadView({
  ticket, userId, isAdmin,
  onBack, onStatusChange,
}: {
  ticket:         Ticket
  userId:         string
  isAdmin:        boolean
  onBack:         () => void
  onStatusChange: (id: string, status: TicketStatus) => void
}) {
  const [messages, setMessages]   = useState<TicketMessage[]>([])
  const [reply,    setReply]      = useState('')
  const [sending,  setSending]    = useState(false)
  const [loading,  setLoading]    = useState(true)
  const bottomRef                 = useRef<HTMLDivElement>(null)

  async function load() {
    setLoading(true)
    if (isAdmin) {
      const { data } = await supabase.rpc('get_ticket_messages_admin', { p_ticket_id: ticket.id })
      setMessages((data as TicketMessage[]) ?? [])
    } else {
      const { data } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true })
      setMessages((data as TicketMessage[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [ticket.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendReply() {
    if (!reply.trim()) return
    setSending(true)
    if (isAdmin) {
      await supabase.rpc('admin_reply_ticket', { p_ticket_id: ticket.id, p_message: reply.trim() })
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('ticket_messages').insert({
        ticket_id:    ticket.id,
        sender_id:    userId,
        sender_email: user?.email ?? '',
        is_admin:     false,
        message:      reply.trim(),
      })
    }
    setReply('')
    setSending(false)
    load()
  }

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="mt-0.5 text-sm text-muted hover:text-text transition-colors shrink-0">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-text truncate">{ticket.subject}</h2>
            <StatusBadge status={ticket.status} />
            {isAdmin && (
              <span className={`text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                {PRIORITY_LABELS[ticket.priority]}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {ticket.user_email}
            {ticket.org_name && <> · <span className="text-violet-400">{ticket.org_name}</span></>}
            {' · '}{CATEGORY_LABELS[ticket.category]}
            {' · '}{fmtDate(ticket.created_at)}
          </p>
        </div>
        {isAdmin && (
          <select
            value={ticket.status}
            onChange={e => onStatusChange(ticket.id, e.target.value as TicketStatus)}
            className="shrink-0 rounded-lg border border-border/60 bg-background px-2 py-1 text-xs text-text focus:outline-none"
          >
            <option value="open">Ouvert</option>
            <option value="in_progress">En cours</option>
            <option value="resolved">Résolu</option>
            <option value="closed">Fermé</option>
          </select>
        )}
      </div>

      {/* Description card */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Description initiale</p>
        <p className="text-sm text-text whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Messages */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="max-h-72 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-xs text-muted text-center py-4">Chargement…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted text-center py-4">Aucun message pour l'instant.</p>
          ) : (
            messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-2 ${m.sender_id === userId && !m.is_admin ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    m.is_admin ? 'bg-violet-600/30 text-violet-300' : 'bg-zinc-700 text-zinc-200'
                  }`}
                >
                  {m.is_admin ? '🛡' : m.sender_email[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-medium text-text">
                      {m.is_admin ? 'Support' : m.sender_email}
                    </span>
                    {m.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        Admin
                      </span>
                    )}
                    <span className="text-[10px] text-muted">{fmtDate(m.created_at)}</span>
                  </div>
                  <div
                    className={`rounded-xl px-3 py-2 text-sm text-text whitespace-pre-wrap ${
                      m.is_admin
                        ? 'bg-violet-600/10 border border-violet-500/20'
                        : 'bg-zinc-800/60 border border-border/40'
                    }`}
                  >
                    {m.message}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Reply input */}
        {!isClosed && (
          <div className="border-t border-border/60 p-3 flex gap-2">
            <input
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
              placeholder="Répondre…"
              className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white transition-colors"
            >
              {sending ? '…' : 'Envoyer'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── User View ──────────────────────────────────────────────────────────────────
function UserSupport({ user }: { user: User }) {
  const { currentOrg }            = useOrg()
  const [tickets, setTickets]     = useState<Ticket[]>([])
  const [loading, setLoading]     = useState(true)
  const [view,    setView]        = useState<'list' | 'create' | 'thread'>('list')
  const [active,  setActive]      = useState<Ticket | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    setTickets((data as Ticket[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openTicket(t: Ticket) {
    // Refresh ticket from list in case status changed
    setActive(t)
    setView('thread')
  }

  if (view === 'create') {
    return (
      <CreateTicketForm
        user={user}
        orgId={currentOrg?.id ?? null}
        orgName={currentOrg?.name ?? null}
        onCreated={() => { load(); setView('list') }}
        onCancel={() => setView('list')}
      />
    )
  }

  if (view === 'thread' && active) {
    return (
      <ThreadView
        ticket={active}
        userId={user.id}
        isAdmin={false}
        onBack={() => { setView('list'); load() }}
        onStatusChange={() => {}}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text">Support</h1>
          <p className="text-xs text-muted mt-0.5">Besoin d'aide ? Créez un ticket et notre équipe vous répondra.</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-sm font-medium text-white transition-colors"
        >
          + Nouveau ticket
        </button>
      </div>

      {/* Tickets list */}
      {loading ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <p className="text-sm text-muted">Chargement…</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-10 text-center space-y-3">
          <div className="text-3xl">🎫</div>
          <p className="text-sm font-medium text-text">Aucun ticket pour l'instant</p>
          <p className="text-xs text-muted">Créez un ticket si vous avez besoin d'aide.</p>
          <button
            onClick={() => setView('create')}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Créer un ticket
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => openTicket(t)}
              className="w-full text-left rounded-xl border border-border/60 bg-card hover:bg-card/80 px-4 py-3 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text truncate">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {CATEGORY_LABELS[t.category]} · {fmtDate(t.created_at)}
                  </p>
                </div>
                <span className="text-xs text-muted shrink-0">→</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Admin View ─────────────────────────────────────────────────────────────────
function AdminSupport({ user }: { user: User }) {
  const [tickets,  setTickets]  = useState<Ticket[]>([])
  const [loading,  setLoading]  = useState(true)
  const [active,   setActive]   = useState<Ticket | null>(null)
  const [filter,   setFilter]   = useState<TicketStatus | 'all'>('all')
  const [search,   setSearch]   = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.rpc('get_all_support_tickets')
    setTickets((data as Ticket[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleStatusChange(id: string, status: TicketStatus) {
    await supabase.rpc('admin_update_ticket', { p_ticket_id: id, p_status: status })
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    if (active?.id === id) setActive(prev => prev ? { ...prev, status } : prev)
  }

  const shown = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        t.subject.toLowerCase().includes(q) ||
        t.user_email.toLowerCase().includes(q) ||
        (t.org_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const counts: Record<string, number> = { all: tickets.length }
  for (const t of tickets) counts[t.status] = (counts[t.status] ?? 0) + 1

  if (active) {
    return (
      <ThreadView
        ticket={active}
        userId={user.id}
        isAdmin={true}
        onBack={() => { setActive(null); load() }}
        onStatusChange={handleStatusChange}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text">Tickets support</h1>
          <p className="text-xs text-muted mt-0.5">{tickets.length} ticket(s) au total</p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted hover:text-text transition-colors"
        >
          ↺ Actualiser
        </button>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (email, sujet, orga)…"
          className="flex-1 min-w-48 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1 text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                : 'border-border/50 text-muted hover:text-text'
            }`}
          >
            {s === 'all' ? 'Tous' : STATUS_LABELS[s as TicketStatus]}
            <span className="ml-1 text-[10px] opacity-70">({counts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <p className="text-sm text-muted">Chargement…</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-8 text-center">
          <p className="text-sm text-muted">Aucun ticket trouvé.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-background/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Sujet</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Orga</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Cat.</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Statut</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Priorité</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Msgs</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Màj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {shown.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setActive(t)}
                  className="cursor-pointer hover:bg-background/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-text max-w-40 truncate">{t.subject}</td>
                  <td className="px-4 py-3 text-muted text-xs">{t.user_email}</td>
                  <td className="px-4 py-3 text-xs text-violet-400">{t.org_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted">{CATEGORY_LABELS[t.category as TicketCategory]}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className={`px-4 py-3 text-xs font-medium ${PRIORITY_COLORS[t.priority]}`}>
                    {PRIORITY_LABELS[t.priority]}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted text-center">{t.message_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────
export function Support({ user }: { user: User }) {
  const license = useLicense()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {license.isSuperAdmin ? (
        <AdminSupport user={user} />
      ) : (
        <UserSupport user={user} />
      )}
    </div>
  )
}
