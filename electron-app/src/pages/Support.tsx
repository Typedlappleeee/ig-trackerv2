import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useLicense } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'
import { useT, useLang } from '@/lib/i18n'
import { useToast } from '@/components/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

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
const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  open:        'sf-badge sf-badge-warn',
  in_progress: 'sf-badge sf-badge-accent',
  resolved:    'sf-badge sf-badge-ok',
  closed:      'sf-badge sf-badge-muted',
}

const STATUS_DOT_CLASS: Record<TicketStatus, string> = {
  open:        'bg-yellow-400',
  in_progress: 'bg-accent',
  resolved:    'bg-ok',
  closed:      'bg-zinc-500',
}

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    'text-zinc-400',
  normal: 'text-blue-400',
  high:   'text-orange-400',
  urgent: 'text-red-400',
}

const PRIORITY_BAR: Record<TicketPriority, string> = {
  low:    'bg-zinc-500',
  normal: 'bg-blue-500',
  high:   'bg-orange-500',
  urgent: 'bg-red-500',
}

const PRIORITY_BADGE_CLASS: Record<TicketPriority, string> = {
  low:    'sf-badge sf-badge-muted',
  normal: 'sf-badge sf-badge-accent',
  high:   'sf-badge',
  urgent: 'sf-badge sf-badge-danger',
}

function fmtDate(iso: string, lang: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Libellés de catégorie partagés (une seule source de vérité)
function categoryLabel(t: ReturnType<typeof useT>, cat: TicketCategory | string): string {
  switch (cat) {
    case 'billing':   return t('supportCategoryBilling')
    case 'technical': return t('supportCategoryTechnical')
    case 'other':     return t('supportCategoryOther')
    default:          return t('supportCategoryGeneral')
  }
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function IconBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
  )
}

function IconSend() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

function IconTicket() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TicketStatus }) {
  const t = useT()
  const DYNAMIC_STATUS_LABELS: Record<TicketStatus, string> = {
    open:        t('supportStatusOpen'),
    in_progress: t('supportStatusInProgress'),
    resolved:    t('supportStatusResolved'),
    closed:      t('supportStatusClosed'),
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${STATUS_BADGE_CLASS[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT_CLASS[status]}`} />
      {DYNAMIC_STATUS_LABELS[status]}
    </span>
  )
}

// ── PriorityBadge ─────────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const t = useT()
  const PRIORITY_LABEL: Record<TicketPriority, string> = {
    low:    t('supportPriorityLow'),
    normal: t('supportPriorityNormal'),
    high:   t('supportPriorityHigh'),
    urgent: t('supportPriorityUrgent'),
  }
  return (
    <span className={PRIORITY_BADGE_CLASS[priority]}>
      {PRIORITY_LABEL[priority]}
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
  const t = useT()
  const [subject,     setSubject]     = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState<TicketCategory>('general')
  const [priority,    setPriority]    = useState<TicketPriority>('normal')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function submit() {
    if (!subject.trim() || !description.trim()) {
      setError(t('supportFillAllFields'))
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
      priority,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreated()
  }

  return (
    <div className="anim-page space-y-6 max-w-2xl">
      {/* Sub-header */}
      <div className="flex items-center gap-3 sf-anim-slide-up sf-d50">
        <button
          onClick={onCancel}
          className="sf-btn sf-btn-ghost cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60 flex items-center gap-1.5"
        >
          <IconBack />
          {t('supportBackBtn')}
        </button>
        <h2 className="text-[20px] font-black text-text">{t('supportNewTicket')}</h2>
      </div>

      <div className="sf-card p-6 space-y-5 sf-anim-slide-up sf-d100">
        <div className="grid grid-cols-2 gap-5">
          {/* Subject */}
          <div className="col-span-2 space-y-2">
            <label className="block text-[11px] font-semibold text-text2 uppercase tracking-widest">{t('supportSubjectLabel')}</label>
            <input
              name="subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={t('supportSubjectPlaceholder')}
              className="sf-input w-full cursor-text focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-text2 uppercase tracking-widest">{t('supportCategoryLabel')}</label>
            <select
              name="category"
              value={category}
              onChange={e => setCategory(e.target.value as TicketCategory)}
              className="sf-input w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {([['general', t('supportCategoryGeneral')], ['billing', t('supportCategoryBilling')], ['technical', t('supportCategoryTechnical')], ['other', t('supportCategoryOther')]] as [TicketCategory, string][]).map(([k, v]) => (
                <option key={k} value={k} style={{ background: '#0d1120', color: '#e2d9f3' }}>{v}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-text2 uppercase tracking-widest">{t('supportAdminColPriority')}</label>
            <select
              name="priority"
              value={priority}
              onChange={e => setPriority(e.target.value as TicketPriority)}
              className="sf-input w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {([['low', t('supportPriorityLow')], ['normal', t('supportPriorityNormal')], ['high', t('supportPriorityHigh')]] as [TicketPriority, string][]).map(([k, v]) => (
                <option key={k} value={k} style={{ background: '#0d1120', color: '#e2d9f3' }}>{v}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="col-span-2 space-y-2">
            <label className="block text-[11px] font-semibold text-text2 uppercase tracking-widest">{t('supportDescriptionLabel')}</label>
            <textarea
              name="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('supportDescPlaceholder')}
              rows={5}
              className="sf-input w-full resize-none cursor-text focus-visible:ring-2 focus-visible:ring-accent/60"
            />
          </div>
        </div>

        {error && (
          <p className="text-[13px] text-danger flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            className="sf-btn sf-btn-secondary cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {t('cancel')}
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent/60 flex items-center gap-2"
          >
            {saving ? (
              <span className="sf-spinner" />
            ) : (
              <IconSend />
            )}
            {saving ? t('supportSendingBtn') : t('supportSendBtn')}
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
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const [messages, setMessages]   = useState<TicketMessage[]>([])
  const [reply,    setReply]      = useState('')
  const [sending,  setSending]    = useState(false)
  const [loading,  setLoading]    = useState(true)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing,  setClosing]    = useState(false)
  const bottomRef                 = useRef<HTMLDivElement>(null)

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true)
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
    if (showSpinner) setLoading(false)
  }

  useEffect(() => { load() }, [ticket.id])

  // Polling 15 s — voir les nouvelles réponses sans ressortir du thread
  useEffect(() => {
    const id = setInterval(() => { load(false) }, 15000)
    return () => clearInterval(id)
  }, [ticket.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendReply() {
    const text = reply.trim()
    if (!text || sending) return
    setSending(true)
    let err: { message: string } | null = null
    if (isAdmin) {
      const { error } = await supabase.rpc('admin_reply_ticket', { p_ticket_id: ticket.id, p_message: text })
      err = error
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id:    ticket.id,
        sender_id:    userId,
        sender_email: user?.email ?? '',
        is_admin:     false,
        message:      text,
      })
      err = error
    }
    setSending(false)
    if (err) {
      // Échec : on garde le brouillon dans le champ et on prévient l'utilisateur
      toast.show({
        title: lang === 'fr' ? 'Échec de l’envoi' : 'Failed to send',
        body:  lang === 'fr' ? 'Ton message n’a pas été envoyé. Réessaie.' : 'Your message was not sent. Please try again.',
        kind:  'error',
      })
      return
    }
    setReply('')
    load(false)
  }

  // L'utilisateur clôture lui-même son ticket
  async function closeOwnTicket() {
    setClosing(true)
    const { error } = await supabase
      .from('support_tickets')
      .update({ status: 'closed' })
      .eq('id', ticket.id)
      .eq('user_id', userId)
    setClosing(false)
    setConfirmClose(false)
    if (error) {
      toast.show({
        title: lang === 'fr' ? 'Impossible de clôturer le ticket' : 'Could not close the ticket',
        body:  error.message,
        kind:  'error',
      })
      return
    }
    toast.show({
      title: lang === 'fr' ? 'Ticket clôturé' : 'Ticket closed',
      kind:  'ok',
    })
    onStatusChange(ticket.id, 'closed')
  }

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'

  return (
    <div className="anim-page space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4 sf-anim-slide-up sf-d50">
        <button
          onClick={onBack}
          className="sf-btn sf-btn-ghost cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60 mt-0.5 flex items-center gap-1.5 shrink-0"
        >
          <IconBack />
          {t('supportBackBtn')}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[18px] font-black text-text truncate">{ticket.subject}</h2>
            <StatusBadge status={ticket.status} />
            {isAdmin && <PriorityBadge priority={ticket.priority} />}
          </div>
          <p className="text-[12px] text-text3 mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span>{ticket.user_email}</span>
            {ticket.org_name && (
              <>
                <span className="text-border">·</span>
                <span className="text-accent2">{ticket.org_name}</span>
              </>
            )}
            <span className="text-border">·</span>
            <span>{categoryLabel(t, ticket.category)}</span>
            <span className="text-border">·</span>
            <span>{fmtDate(ticket.created_at, lang)}</span>
          </p>
        </div>
        {isAdmin && (
          <select
            name="ticket-status"
            value={ticket.status}
            onChange={e => onStatusChange(ticket.id, e.target.value as TicketStatus)}
            className="sf-input shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <option value="open" style={{ background: '#0d1120', color: '#e2d9f3' }}>{t('supportStatusOpen')}</option>
            <option value="in_progress" style={{ background: '#0d1120', color: '#e2d9f3' }}>{t('supportStatusInProgress')}</option>
            <option value="resolved" style={{ background: '#0d1120', color: '#e2d9f3' }}>{t('supportStatusResolved')}</option>
            <option value="closed" style={{ background: '#0d1120', color: '#e2d9f3' }}>{t('supportStatusClosed')}</option>
          </select>
        )}
      </div>

      {/* Description card */}
      <div className="sf-card p-5 sf-anim-slide-up sf-d100">
        <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest mb-3">{t('supportInitialDesc')}</p>
        <p className="text-[13px] text-text whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
      </div>

      {/* Messages */}
      <div className="sf-card overflow-hidden sf-anim-slide-up sf-d150">
        <div className="max-h-80 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-text3">
              <span className="sf-spinner" />
              <span className="text-[13px]">{t('supportLoading')}</span>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-[13px] text-text3 text-center py-6">{t('supportNoMessages')}</p>
          ) : (
            messages.map(m => {
              const isOwn = m.sender_id === userId && !m.is_admin
              return (
                <div key={m.id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${
                      m.is_admin ? 'bg-accent/20 text-accent' : 'bg-surface3 text-text2'
                    }`}
                  >
                    {m.is_admin ? <IconShield /> : m.sender_email[0]?.toUpperCase()}
                  </div>

                  {/* Bubble */}
                  <div className={`flex-1 min-w-0 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[12px] font-semibold text-text">
                        {m.is_admin ? t('supportAdminLabel') : m.sender_email}
                      </span>
                      {m.is_admin && (
                        <span className="sf-badge sf-badge-accent text-[10px]">Admin</span>
                      )}
                      <span className="text-[11px] text-text3">{fmtDate(m.created_at, lang)}</span>
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-3 text-[13px] text-text whitespace-pre-wrap leading-relaxed max-w-[85%] ${
                        m.is_admin
                          ? 'bg-accent/10 border border-accent/20 rounded-tl-sm'
                          : isOwn
                            ? 'bg-surface3 border border-border rounded-tr-sm'
                            : 'bg-surface2 border border-border rounded-tl-sm'
                      }`}
                    >
                      {m.message}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Reply input */}
        {!isClosed && (
          <div className="px-5 py-4 flex gap-3 border-t border-border">
            <input
              name="reply"
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
              placeholder={t('supportReplyPlaceholder')}
              className="sf-input flex-1 cursor-text focus-visible:ring-2 focus-visible:ring-accent/60"
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent/60 flex items-center gap-2"
            >
              {sending ? <span className="sf-spinner" /> : <IconSend />}
              {t('supportReplyBtn')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── User View ──────────────────────────────────────────────────────────────────
function UserSupport({ user }: { user: User }) {
  const t = useT()
  const { lang } = useLang()
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

  // suppress unused warning
  void lang

  function openTicket(tk: Ticket) {
    setActive(tk)
    setView('thread')
  }

  if (view === 'create') {
    return (
      <div className="sf-page anim-page">
        <div className="sf-page-header">
          <div className="sf-anim-slide-up sf-d50">
            <h1 className="sf-page-title">{t('supportTitle')}</h1>
            <p className="sf-page-subtitle">{t('supportHelp')}</p>
          </div>
        </div>
        <div className="sf-page-body">
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
      <div className="sf-page anim-page">
        <div className="sf-page-header">
          <div className="sf-anim-slide-up sf-d50">
            <h1 className="sf-page-title">{t('supportTitle')}</h1>
            <p className="sf-page-subtitle">{t('supportHelp')}</p>
          </div>
        </div>
        <div className="sf-page-body">
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

  const categoryLabel: Record<string, string> = {
    general:   t('supportCategoryGeneral'),
    billing:   t('supportCategoryBilling'),
    technical: t('supportCategoryTechnical'),
    other:     t('supportCategoryOther'),
  }

  return (
    <div className="sf-page anim-page">
      {/* Page header */}
      <div className="sf-page-header">
        <div className="sf-anim-slide-up sf-d50">
          <h1 className="sf-page-title">{t('supportTitle')}</h1>
          <p className="sf-page-subtitle">{t('supportHelp')}</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="sf-btn sf-btn-primary cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60 flex items-center gap-2 sf-anim-slide-up sf-d100"
        >
          <IconPlus />
          {t('supportNewTicketBtn')}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="sf-page-body">
        <div className="space-y-3 anim-stagger">
          {loading ? (
            <div className="sf-card p-10 flex items-center justify-center gap-3 text-text3">
              <span className="sf-spinner" />
              <span className="text-[13px]">{t('loading')}</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="sf-empty">
              <div className="text-accent/60 sf-anim-scale-spring">
                <IconTicket />
              </div>
              <p className="text-base font-bold text-text mt-2">{t('supportNoTicketsYet')}</p>
              <p className="text-[13px] text-text3">{t('supportNoTicketsHint')}</p>
              <button
                onClick={() => setView('create')}
                className="sf-btn sf-btn-primary cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60 flex items-center gap-2 mt-2"
              >
                <IconPlus />
                {t('supportCreateTicket')}
              </button>
            </div>
          ) : (
            tickets.map(tk => (
              <button
                key={tk.id}
                onClick={() => openTicket(tk)}
                className="sf-card sf-card-lift w-full text-left cursor-pointer hover:bg-surface2 transition-colors group focus-visible:ring-2 focus-visible:ring-accent/60 overflow-hidden flex"
              >
                {/* Left priority bar */}
                <div className={`w-1 shrink-0 self-stretch ${PRIORITY_BAR[tk.priority]} opacity-70`} />

                <div className="flex-1 min-w-0 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <StatusBadge status={tk.status} />
                        <PriorityBadge priority={tk.priority} />
                      </div>
                      <p className="text-[14px] font-semibold text-text truncate mb-1">{tk.subject}</p>
                      <p className="text-[12px] text-text3 line-clamp-1 mb-2">{tk.description}</p>
                      <p className="text-[11px] text-text3 flex items-center gap-1.5">
                        <span>{categoryLabel[tk.category]}</span>
                        <span className="text-border">·</span>
                        <span>{fmtDate(tk.created_at, lang)}</span>
                      </p>
                    </div>
                    <div className="text-text3 group-hover:text-text2 transition-colors mt-1 shrink-0">
                      <IconChevronRight />
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Admin View ─────────────────────────────────────────────────────────────────
function AdminSupport({ user }: { user: User }) {
  const t = useT()
  const { lang } = useLang()
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
    setTickets(prev => prev.map(tk => tk.id === id ? { ...tk, status } : tk))
    if (active?.id === id) setActive(prev => prev ? { ...prev, status } : prev)
  }

  const shown = tickets.filter(tk => {
    if (filter !== 'all' && tk.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        tk.subject.toLowerCase().includes(q) ||
        tk.user_email.toLowerCase().includes(q) ||
        (tk.org_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const counts: Record<string, number> = { all: tickets.length }
  for (const tk of tickets) counts[tk.status] = (counts[tk.status] ?? 0) + 1

  const categoryLabel: Record<string, string> = {
    general:   t('supportCategoryGeneral'),
    billing:   t('supportCategoryBilling'),
    technical: t('supportCategoryTechnical'),
    other:     t('supportCategoryOther'),
  }

  if (active) {
    return (
      <div className="sf-page anim-page">
        <div className="sf-page-header">
          <div className="sf-anim-slide-up sf-d50">
            <h1 className="sf-page-title">{t('supportAdminPanel')}</h1>
            <p className="sf-page-subtitle">{tickets.length} {t('supportAdminTotal')}</p>
          </div>
        </div>
        <div className="sf-page-body">
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
    <div className="sf-page anim-page">
      {/* Page header */}
      <div className="sf-page-header">
        <div className="sf-anim-slide-up sf-d50">
          <h1 className="sf-page-title">{t('supportAdminTickets')}</h1>
          <p className="sf-page-subtitle">{tickets.length} {t('supportAdminTotal')}</p>
        </div>
        <button
          onClick={load}
          className="sf-btn sf-btn-secondary cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60 flex items-center gap-2 sf-anim-slide-up sf-d100"
        >
          <IconRefresh />
          {t('supportAdminRefresh')}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="sf-page-body space-y-5">

        {/* Filters row */}
        <div className="flex items-center gap-3 flex-wrap sf-anim-slide-up sf-d150">
          <input
            name="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('supportAdminSearchPlaceholder')}
            className="sf-input flex-1 min-w-48 cursor-text focus-visible:ring-2 focus-visible:ring-accent/60"
          />
          <div className="sf-tabs flex items-center gap-1">
            {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`sf-tab cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/60 ${filter === s ? 'sf-tab-active' : ''}`}
              >
                {s === 'all'
                  ? t('supportAdminAll')
                  : t(`supportStatus${s === 'in_progress' ? 'InProgress' : s.charAt(0).toUpperCase() + s.slice(1)}` as Parameters<typeof t>[0])}
                <span className="ml-1 opacity-60 text-[11px]">({counts[s] ?? 0})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Table / states */}
        {loading ? (
          <div className="sf-card p-10 flex items-center justify-center gap-3 text-text3">
            <span className="sf-spinner" />
            <span className="text-[13px]">{t('supportAdminLoading')}</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="sf-empty">
            <div className="text-accent/60 sf-anim-scale-spring"><IconTicket /></div>
            <p className="text-[13px] text-text3 mt-2">{t('supportAdminNoTickets')}</p>
          </div>
        ) : (
          <div className="sf-card overflow-hidden sf-anim-slide-up sf-d200">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface2/50">
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColSubject')}</th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColEmail')}</th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColOrg')}</th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColCat')}</th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColStatus')}</th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColPriority')}</th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColMsgs')}</th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-text3 uppercase tracking-widest">{t('supportAdminColUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(tk => (
                  <tr
                    key={tk.id}
                    onClick={() => setActive(tk)}
                    className="cursor-pointer transition-colors hover:bg-surface2/60 border-t border-border/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
                  >
                    <td className="px-5 py-4 text-[13px] font-semibold text-text max-w-40 truncate">{tk.subject}</td>
                    <td className="px-5 py-4 text-[13px] text-text2">{tk.user_email}</td>
                    <td className="px-5 py-4 text-[13px] text-accent2">{tk.org_name ?? '—'}</td>
                    <td className="px-5 py-4 text-[13px] text-text2">{categoryLabel[tk.category]}</td>
                    <td className="px-5 py-4"><StatusBadge status={tk.status} /></td>
                    <td className="px-5 py-4"><PriorityBadge priority={tk.priority} /></td>
                    <td className="px-5 py-4 text-[13px] text-text2 text-center">{tk.message_count ?? 0}</td>
                    <td className="px-5 py-4 text-[13px] text-text3 whitespace-nowrap">{fmtDate(tk.updated_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
