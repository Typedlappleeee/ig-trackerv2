import { useState, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { useConnections } from '@/lib/connections'
import { fetchAllPhones, createInstagramAccount, stopPhone, type GeelarkPhone } from '@/lib/geelark'
import { pushNotification } from '@/lib/notificationStore'

interface AccountCreatorProps { user: User }

interface AccountEntry {
  id:          string
  phoneId:     string
  firstName:   string
  email:       string
  password:    string
  username:    string
  birthDay:    string
  birthMonth:  string
  birthYear:   string
}

type JobStatus = 'idle' | 'booting' | 'running' | 'waiting_code' | 'done' | 'error'

interface AccountJob extends AccountEntry {
  status:   JobStatus
  logs:     string[]
  result?:  string
}

let _idCounter = 0
function uid() { return `acc-${Date.now()}-${++_idCounter}` }

function makeEntry(): AccountEntry {
  return {
    id: uid(), phoneId: '', firstName: '', email: '', password: '',
    username: '', birthDay: '', birthMonth: '', birthYear: '',
  }
}

// ── Small icon components ────────────────────────────────────────────────────
function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  plus:    'M12 5v14m-7-7h14',
  trash:   'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  play:    'M5 3l14 9-14 9V3z',
  stop:    'M18 18H6V6h12v12z',
  check:   'M20 6 9 17l-5-5',
  x:       'M18 6 6 18M6 6l12 12',
  phone:   'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z',
  mail:    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 0 8 9 8-9',
  lock:    'M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6-6V9a6 6 0 1 0-12 0v2H4v13h16V11h-2z',
  user:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  refresh: 'M4 4v5h5M20 20v-5h-5M4.93 14A8 8 0 1 0 6.93 5.93',
  chevron: 'M19 9l-7 7-7-7',
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: JobStatus }) {
  const cfg: Record<JobStatus, { label: string; color: string; bg: string }> = {
    idle:         { label: 'En attente',  color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
    booting:      { label: 'Démarrage',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
    running:      { label: 'En cours…',   color: '#6366F1', bg: 'rgba(99,102,241,0.1)'  },
    waiting_code: { label: 'Code requis', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    done:         { label: 'Créé',        color: '#059669', bg: 'rgba(5,150,105,0.1)'   },
    error:        { label: 'Erreur',      color: '#DC2626', bg: 'rgba(220,38,38,0.1)'   },
  }
  const { label, color, bg } = cfg[status]
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      color, background: bg, border: `1px solid ${color}33`, whiteSpace: 'nowrap',
    }}>
      {status === 'booting' || status === 'running' ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
          {label}
        </span>
      ) : label}
    </span>
  )
}

// ── Verification code modal ───────────────────────────────────────────────────
function VerifModal({
  email, onSubmit,
}: { email: string; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('')
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,3,15,0.75)', backdropFilter: 'blur(6px)',
    }}>
      <div className="glass-card" style={{
        width: 420, borderRadius: 20, padding: '32px 28px', textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
          background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#f59e0b',
        }}>
          <Icon d={ICONS.mail} size={22} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Code de vérification
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
          Instagram a envoyé un code à<br />
          <strong style={{ color: 'var(--text)' }}>{email}</strong>
        </p>
        <Input
          label="Code (6 chiffres)"
          placeholder="123456"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={e => { if (e.key === 'Enter' && code.trim()) onSubmit(code.trim()) }}
          autoFocus
        />
        <Button
          className="w-full mt-4"
          disabled={!code.trim()}
          onClick={() => onSubmit(code.trim())}
        >
          Confirmer →
        </Button>
      </div>
    </div>
  )
}

// ── Log panel (collapsible) ───────────────────────────────────────────────────
function LogPanel({ logs }: { logs: string[] }) {
  const [open, setOpen] = useState(false)
  if (logs.length === 0) return null
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text2)', fontSize: 11, padding: 0,
        }}
      >
        <span style={{
          display: 'inline-block', transition: 'transform 0.15s',
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>
          <Icon d={ICONS.chevron} size={11} />
        </span>
        {open ? 'Masquer les logs' : `${logs.length} ligne${logs.length > 1 ? 's' : ''} de log`}
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)',
          maxHeight: 160, overflowY: 'auto',
        }}>
          {logs.map((l, i) => (
            <p key={i} style={{ fontSize: 10.5, color: 'rgba(233,234,240,0.55)', margin: '1px 0', fontFamily: 'monospace' }}>
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountCreator({ user }: AccountCreatorProps) {
  const { bearer } = useConnections(user)

  const [phones, setPhones]       = useState<GeelarkPhone[]>([])
  const [phonesLoaded, setPL]     = useState(false)
  const [phonesLoading, setPLL]   = useState(false)

  const [entries, setEntries]     = useState<AccountEntry[]>([makeEntry()])
  const [jobs, setJobs]           = useState<AccountJob[] | null>(null)
  const [running, setRunning]     = useState(false)

  // Pending verification code: email + promise resolver
  const [pendingVerif, setPendingVerif] = useState<{
    email: string; resolve: (code: string) => void
  } | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // ── Load phones ────────────────────────────────────────────────────────────
  const loadPhones = useCallback(async () => {
    if (!bearer) return
    setPLL(true)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
      setPL(true)
    } catch { /* ignore */ } finally {
      setPLL(false)
    }
  }, [bearer])

  // ── Entry helpers ──────────────────────────────────────────────────────────
  function addEntry() { setEntries(e => [...e, makeEntry()]) }
  function removeEntry(id: string) { setEntries(e => e.filter(x => x.id !== id)) }
  function updateEntry(id: string, patch: Partial<AccountEntry>) {
    setEntries(e => e.map(x => x.id === id ? { ...x, ...patch } : x))
  }
  function updateJob(id: string, patch: Partial<AccountJob>) {
    setJobs(j => j ? j.map(x => x.id === id ? { ...x, ...patch } : x) : j)
  }
  function appendLog(id: string, line: string) {
    setJobs(j => j ? j.map(x => x.id === id ? { ...x, logs: [...x.logs, line] } : x) : j)
  }

  // ── Run queue ──────────────────────────────────────────────────────────────
  async function startQueue() {
    if (!bearer) return
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const initialJobs: AccountJob[] = entries.map(e => ({ ...e, status: 'booting', logs: [] }))
    setJobs(initialJobs)
    setRunning(true)

    for (const entry of entries) {
      if (ctrl.signal.aborted) break

      updateJob(entry.id, { status: 'booting', logs: [] })

      const log = (line: string) => appendLog(entry.id, line)

      // onVerificationNeeded: pause automation until user submits the code
      const onVerificationNeeded = (email: string): Promise<string> => {
        updateJob(entry.id, { status: 'waiting_code' })
        return new Promise<string>(resolve => {
          setPendingVerif({ email, resolve })
        })
      }

      updateJob(entry.id, { status: 'running' })

      const result = await createInstagramAccount(
        bearer,
        entry.phoneId,
        {
          firstName:   entry.firstName,
          email:       entry.email,
          password:    entry.password,
          username:    entry.username || undefined,
          birthDay:    entry.birthDay   ? parseInt(entry.birthDay)   : undefined,
          birthMonth:  entry.birthMonth ? parseInt(entry.birthMonth) : undefined,
          birthYear:   entry.birthYear  ? parseInt(entry.birthYear)  : undefined,
        },
        onVerificationNeeded,
        log,
        ctrl.signal,
      )

      setPendingVerif(null)

      if (result.ok) {
        updateJob(entry.id, {
          status: 'done',
          result: result.username ? `@${result.username}` : 'Compte créé',
        })
        pushNotification({
          title: `Compte créé : ${entry.firstName}`,
          body:  result.username ? `@${result.username} · ${entry.email}` : entry.email,
          level: 'ok',
          page:  'accountcreator',
        })
        // Stop the phone after creation
        await stopPhone(bearer, entry.phoneId).catch(() => {})
      } else {
        updateJob(entry.id, { status: 'error', result: result.error })
        pushNotification({
          title: `Création échouée : ${entry.firstName}`,
          body:  result.error ?? 'Erreur inconnue',
          level: 'error',
          page:  'accountcreator',
        })
      }
    }

    setRunning(false)
    abortRef.current = null
  }

  function stopQueue() {
    abortRef.current?.abort()
    setRunning(false)
  }

  const phoneOptions = phones.filter(p => p.status === 0 || p.status === 1)
  const canStart = bearer && entries.length > 0 && entries.every(e => e.phoneId && e.firstName && e.email && e.password)

  return (
    <div className="page-content" style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
          Créer des comptes Instagram
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Automatise la création de comptes via tes cloud phones GeeLark.
        </p>
      </div>

      {/* Phones loader */}
      {!phonesLoaded && (
        <div className="glass-card" style={{ borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', flex: 1 }}>
            Charge d'abord tes phones GeeLark pour les sélectionner.
          </p>
          <Button onClick={loadPhones} loading={phonesLoading} variant="secondary" style={{ minWidth: 140 }}>
            <Icon d={ICONS.refresh} size={14} />
            Charger les phones
          </Button>
        </div>
      )}

      {/* Account entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {entries.map((entry, idx) => {
          const job = jobs?.find(j => j.id === entry.id)
          const isActive = job && ['booting', 'running', 'waiting_code'].includes(job.status)

          return (
            <div key={entry.id} className="glass-card" style={{
              borderRadius: 14, padding: '16px 18px',
              opacity: (running && !isActive && job?.status !== 'idle') ? 0.8 : 1,
            }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: 'rgba(99,102,241,0.15)', color: '#818CF8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {idx + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                  {entry.firstName || entry.email || `Compte ${idx + 1}`}
                </span>
                {job && <StatusBadge status={job.status} />}
                {job?.result && (
                  <span style={{ fontSize: 12, color: job.status === 'done' ? '#059669' : '#DC2626' }}>
                    {job.result}
                  </span>
                )}
                {!running && (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text2)', padding: 4, borderRadius: 6,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Icon d={ICONS.trash} size={14} />
                  </button>
                )}
              </div>

              {/* Phone selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
                  Phone GeeLark
                </label>
                {!phonesLoaded ? (
                  <p style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
                    Charge les phones d'abord
                  </p>
                ) : (
                  <select
                    disabled={running}
                    value={entry.phoneId}
                    onChange={e => updateEntry(entry.id, { phoneId: e.target.value })}
                    style={{
                      width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '7px 10px',
                    }}
                  >
                    <option value="">Sélectionner un phone…</option>
                    {phoneOptions.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.serialName ?? p.name ?? p.id}
                        {p.status === 0 ? ' (en marche)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Fields grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                <Input
                  label="Prénom"
                  placeholder="Marie"
                  value={entry.firstName}
                  onChange={e => updateEntry(entry.id, { firstName: e.target.value })}
                  disabled={running}
                />
                <Input
                  label="Username Instagram (optionnel)"
                  placeholder="marie_dupont (laisser vide = suggestion)"
                  value={entry.username}
                  onChange={e => updateEntry(entry.id, { username: e.target.value })}
                  disabled={running}
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="marie@gmail.com"
                  value={entry.email}
                  onChange={e => updateEntry(entry.id, { email: e.target.value })}
                  disabled={running}
                />
                <Input
                  label="Mot de passe"
                  type="password"
                  placeholder="••••••••"
                  value={entry.password}
                  onChange={e => updateEntry(entry.id, { password: e.target.value })}
                  disabled={running}
                />
              </div>

              {/* Birthday (optional) */}
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none' }}>
                  Date de naissance (optionnelle — 15/06/1995 par défaut)
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 10px', marginTop: 8 }}>
                  <Input
                    label="Jour"
                    placeholder="15"
                    value={entry.birthDay}
                    onChange={e => updateEntry(entry.id, { birthDay: e.target.value })}
                    disabled={running}
                  />
                  <Input
                    label="Mois"
                    placeholder="6"
                    value={entry.birthMonth}
                    onChange={e => updateEntry(entry.id, { birthMonth: e.target.value })}
                    disabled={running}
                  />
                  <Input
                    label="Année"
                    placeholder="1995"
                    value={entry.birthYear}
                    onChange={e => updateEntry(entry.id, { birthYear: e.target.value })}
                    disabled={running}
                  />
                </div>
              </details>

              {/* Logs */}
              {job && <LogPanel logs={job.logs} />}
            </div>
          )
        })}
      </div>

      {/* Add account */}
      {!running && (
        <button
          onClick={addEntry}
          style={{
            width: '100%', padding: '10px', borderRadius: 10,
            border: '1.5px dashed var(--border)', background: 'transparent',
            color: 'var(--text2)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6, marginBottom: 24,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLElement).style.borderColor = '#6366F1'
            ;(e.currentTarget as HTMLElement).style.color = '#818CF8'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text2)'
          }}
        >
          <Icon d={ICONS.plus} size={15} />
          Ajouter un compte
        </button>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        {!running ? (
          <Button
            className="flex-1"
            disabled={!canStart}
            onClick={startQueue}
          >
            <Icon d={ICONS.play} size={15} />
            Lancer la création ({entries.length} compte{entries.length > 1 ? 's' : ''})
          </Button>
        ) : (
          <Button variant="secondary" onClick={stopQueue} style={{ minWidth: 160 }}>
            <Icon d={ICONS.stop} size={15} />
            Arrêter
          </Button>
        )}

        {jobs && !running && (
          <Button
            variant="secondary"
            onClick={() => { setJobs(null); setEntries([makeEntry()]) }}
          >
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Info box */}
      {!jobs && (
        <div className="glass-card" style={{
          borderRadius: 12, padding: '14px 16px', marginTop: 20,
          background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)',
        }}>
          <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>Comment ça marche :</strong><br />
            1. Charge tes phones GeeLark et sélectionne un phone par compte à créer.<br />
            2. Remplis prénom, email et mot de passe. Le username est optionnel (Instagram en suggère un).<br />
            3. Lance. Quand Instagram envoie un code de vérif à l'email, une fenêtre te demande de le coller.<br />
            4. Une fois créé, le compte est prêt — tu peux le connecter via l'onglet Téléphones.
          </p>
        </div>
      )}

      {/* Verification modal */}
      {pendingVerif && (
        <VerifModal
          email={pendingVerif.email}
          onSubmit={code => {
            pendingVerif.resolve(code)
            setPendingVerif(null)
          }}
        />
      )}
    </div>
  )
}
