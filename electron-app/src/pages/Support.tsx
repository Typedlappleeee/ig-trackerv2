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
    <span className={`text-[12px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[status]}`}>
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="text-[13px] text-text2 hover:text-text transition-colors"
        >
          ← Retour
        </button>
        <h2 className="text-[22px] font-black text-white">Nouveau ticket</h2>
      </div>

      <div className="rounded-2xl p-6 space-y-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2 space-y-2">
            <label className="text-[12px] font-medium text-text2 uppercase tracking-wide">Sujet</label>
            <input
              name="subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Résumé de votre problème"
              className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[12px] font-medium text-text2 uppercase tracking-wide">Catégorie</label>
            <select
              name="category"
              value={category}
              onChange={e => setCategory(e.target.value as TicketCategory)}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
            >
              {(Object.entries(CATEGORY_LABELS) as [TicketCategory, string][]).map(([k, v]) => (
                <option key={k} value={k} style={{ background: '#0d1120', color: '#e2d9f3' }}>{v}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-2">
            <label className="text-[12px] font-medium text-text2 uppercase tracking-wide">Description</label>
            <textarea
              name="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Décrivez votre problème en détail…"
              rows={5}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
            />
          </div>
        </div>

        {error && <p className="text-[13px] text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onBack} className="mt-1 text-[13px] text-text2 hover:text-text transition-colors shrink-0">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[20px] font-black text-white truncate">{ticket.subject}</h2>
            <StatusBadge status={ticket.status} />
            {isAdmin && (
              <span className={`text-[13px] font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                {PRIORITY_LABELS[ticket.priority]}
              </span>
            )}
          </div>
          <p className="text-[12px] text-text2 mt-1">
            {ticket.user_email}
            {ticket.org_name && <> · <span className="text-violet-400">{ticket.org_name}</span></>}
            {' · '}{CATEGORY_LABELS[ticket.category]}
            {' · '}{fmtDate(ticket.created_at)}
          </p>
        </div>
        {isAdmin && (
          <select
            name="ticket-status"
            value={ticket.status}
            onChange={e => onStatusChange(ticket.id, e.target.value as TicketStatus)}
            className="shrink-0 rounded-xl px-3 py-2 text-[13px] focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
          >
            <option value="open" style={{ background: '#0d1120', color: '#e2d9f3' }}>Ouvert</option>
            <option value="in_progress" style={{ background: '#0d1120', color: '#e2d9f3' }}>En cours</option>
            <option value="resolved" style={{ background: '#0d1120', color: '#e2d9f3' }}>Résolu</option>
            <option value="closed" style={{ background: '#0d1120', color: '#e2d9f3' }}>Fermé</option>
          </select>
        )}
      </div>

      {/* Description card */}
      <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[12px] font-medium text-text2 uppercase tracking-wide mb-3">Description initiale</p>
        <p className="text-[13px] text-text whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Messages */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="max-h-80 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <p className="text-[13px] text-text2 text-center py-4">Chargement…</p>
          ) : messages.length === 0 ? (
            <p className="text-[13px] text-text2 text-center py-4">Aucun message pour l'instant.</p>
          ) : (
            messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.sender_id === userId && !m.is_admin ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${
                    m.is_admin ? 'bg-violet-600/30 text-violet-300' : 'bg-zinc-700 text-zinc-200'
                  }`}
                >
                  {m.is_admin ? '🛡' : m.sender_email[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-text">
                      {m.is_admin ? 'Support' : m.sender_email}
                    </span>
                    {m.is_admin && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        Admin
                      </span>
                    )}
                    <span className="text-[12px] text-text2">{fmtDate(m.created_at)}</span>
                  </div>
                  <div
                    className={`rounded-xl px-4 py-3 text-[13px] text-text whitespace-pre-wrap ${
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
          <div className="px-5 py-4 flex gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              name="reply"
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
              placeholder="Répondre…"
              className="flex-1 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
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
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-10 pt-9 pb-7" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h1 className="text-[28px] font-black text-white leading-none">Support</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-10 pb-10 mt-8">
          <CreateTicketForm
            user={user}
            orgId={currentOrg?.id ?? null}
            orgName={currentOrg?.name ?? null}
            onCreated={() => { load(); setView('list') }}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  if (view === 'thread' && active) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-10 pt-9 pb-7" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h1 className="text-[28px] font-black text-white leading-none">Support</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-10 pb-10 mt-8">
          <ThreadView
            ticket={active}
            userId={user.id}
            isAdmin={false}
            onBack={() => { setView('list'); load() }}
            onStatusChange={() => {}}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">Support</h1>
          <p className="text-[13px] text-text2 mt-0.5">Besoin d'aide ? Créez un ticket et notre équipe vous répondra.</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
        >
          + Nouveau ticket
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-10 pb-10">
        <div className="mt-8 space-y-4">
          {/* Tickets list */}
          {loading ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[13px] text-text2">Chargement…</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl p-10 text-center space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-4xl">🎫</div>
              <p className="text-base font-bold text-white">Aucun ticket pour l'instant</p>
              <p className="text-[13px] text-text2">Créez un ticket si vous avez besoin d'aide.</p>
              <button
                onClick={() => setView('create')}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white"
                style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
              >
                Créer un ticket
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map(t => (
                <button
                  key={t.id}
                  onClick={() => openTicket(t)}
                  className="w-full text-left rounded-2xl px-5 py-4 transition-all hover:bg-white/[0.03]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-text truncate">{t.subject}</span>
                        <StatusBadge status={t.status} />
                      </div>
                      <p className="text-[12px] text-text2 mt-1">
                        {CATEGORY_LABELS[t.category]} · {fmtDate(t.created_at)}
                      </p>
                    </div>
                    <span className="text-[13px] text-text2 shrink-0">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
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
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-10 pt-9 pb-7" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h1 className="text-[28px] font-black text-white leading-none">Support Admin</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-10 pb-10 mt-8">
          <ThreadView
            ticket={active}
            userId={user.id}
            isAdmin={true}
            onBack={() => { setActive(null); load() }}
            onStatusChange={handleStatusChange}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 px-10 pt-9 pb-7 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none">Tickets support</h1>
          <p className="text-[13px] text-text2 mt-0.5">{tickets.length} ticket(s) au total</p>
        </div>
        <button
          onClick={load}
          className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
        >
          ↺ Actualiser
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-10 pb-10">
        <div className="mt-8 space-y-6">

          {/* Filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              name="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (email, sujet, orga)…"
              className="flex-1 min-w-48 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e2e8f0' }}
            />
            {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-xl px-4 py-2.5 text-[13px] font-medium border transition-colors ${
                  filter === s
                    ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                    : 'text-text2 hover:text-text'
                }`}
                style={filter !== s ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' } : {}}
              >
                {s === 'all' ? 'Tous' : STATUS_LABELS[s as TicketStatus]}
                <span className="ml-1 text-[11px] opacity-70">({counts[s] ?? 0})</span>
              </button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[13px] text-text2">Chargement…</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[13px] text-text2">Aucun ticket trouvé.</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Sujet</th>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Email</th>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Orga</th>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Cat.</th>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Statut</th>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Priorité</th>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Msgs</th>
                    <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-text2 uppercase tracking-wide">Màj</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(t => (
                    <tr
                      key={t.id}
                      onClick={() => setActive(t)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <td className="px-5 py-4 text-[13px] font-medium text-text max-w-40 truncate">{t.subject}</td>
                      <td className="px-5 py-4 text-[13px] text-text2">{t.user_email}</td>
                      <td className="px-5 py-4 text-[13px] text-violet-400">{t.org_name ?? '—'}</td>
                      <td className="px-5 py-4 text-[13px] text-text2">{CATEGORY_LABELS[t.category as TicketCategory]}</td>
                      <td className="px-5 py-4"><StatusBadge status={t.status} /></td>
                      <td className={`px-5 py-4 text-[13px] font-medium ${PRIORITY_COLORS[t.priority]}`}>
                        {PRIORITY_LABELS[t.priority]}
                      </td>
                      <td className="px-5 py-4 text-[13px] text-text2 text-center">{t.message_count ?? 0}</td>
                      <td className="px-5 py-4 text-[13px] text-text2 whitespace-nowrap">{fmtDate(t.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────
export function Support({ user }: { user: User }) {
  const license = useLicense()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {license.isSuperAdmin ? (
        <AdminSupport user={user} />
      ) : (
        <UserSupport user={user} />
      )}
    </div>
  )
}
