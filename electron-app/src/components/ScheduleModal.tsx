import { useState, useEffect } from 'react'
import { useTr } from '@/lib/i18n'

interface Props {
  type:        'posting' | 'mass_posting'
  phonesCount: number
  videosCount: number
  videoTitle?: string
  /** Coût en crédits débité à la programmation (remboursé si annulation) */
  creditCost?: number
  onConfirm:   (date: Date) => void
  onClose:     () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

// GeeLark expire les tâches planifiées à 30 j — garde de sécurité à 25 j
const MAX_DAYS_AHEAD = 25
const MAX_AHEAD_MS   = MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000

// Lucide-style icons (no emoji per UI/UX Pro Max rule)
const MPATHS = {
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  x:        'M18 6L6 18M6 6l12 12',
  video:    'm22 8-6 4 6 4V8Z M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z',
  clock:    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  warn:     'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  coins:    'M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 8v8M8 12H4a4 4 0 1 0 4 4v-4M16 12h4a4 4 0 1 1-4 4v-4',
}
function MIcon({ d, size = 16, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function startOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function ScheduleModal({ type, phonesCount, videosCount, videoTitle, creditCost, onConfirm, onClose }: Props) {
  const tr = useTr()
  // Ticker 30 s : garde le countdown et la validation à jour si le modal reste ouvert
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const now      = new Date(nowTs)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)

  const QUICK_DATES = [
    { label: tr("Aujourd’hui", 'Today'), date: startOfDay(now) },
    { label: tr('Demain', 'Tomorrow'),      date: startOfDay(tomorrow) },
    { label: tr('Dans 2 jours', 'In 2 days'), date: (() => { const d = startOfDay(now); d.setDate(d.getDate() + 2); return d })() },
    { label: tr('Dans 3 jours', 'In 3 days'), date: (() => { const d = startOfDay(now); d.setDate(d.getDate() + 3); return d })() },
  ]

  // Défaut : heure actuelle +1 h ; si on passe minuit (23h+), basculer sur demain
  const rollsToTomorrow = now.getHours() + 1 >= 24
  const [selectedDay, setSelectedDay]  = useState<Date>(() => startOfDay(rollsToTomorrow ? tomorrow : now))
  const [customDate, setCustomDate]    = useState('')   // "YYYY-MM-DD" for custom
  const [useCustom, setUseCustom]      = useState(false)
  const [hour, setHour]    = useState((now.getHours() + 1) % 24)
  const [minute, setMinute] = useState(0)

  const scheduled = (() => {
    const base = useCustom && customDate ? new Date(customDate + 'T00:00:00') : new Date(selectedDay)
    base.setHours(hour, minute, 0, 0)
    return base
  })()

  const diffMs   = scheduled.getTime() - now.getTime()
  const isInPast = diffMs <= 0
  const isTooFar = diffMs > MAX_AHEAD_MS
  const diffMin  = Math.round(diffMs / 60000)
  const invalid  = isInPast || isTooFar

  function countdown() {
    if (isInPast) return tr('Heure déjà passée', 'Time already passed')
    if (isTooFar) return tr(`Maximum ${MAX_DAYS_AHEAD} jours à l’avance — les tâches GeeLark expirent après 30 jours`, `Maximum ${MAX_DAYS_AHEAD} days ahead — GeeLark tasks expire after 30 days`)
    if (diffMin < 60) return tr(`dans ${diffMin} min`, `in ${diffMin} min`)
    const h = Math.floor(diffMin / 60)
    const m = diffMin % 60
    if (h < 24) return tr(`dans ${h}h${m ? ` ${m}min` : ''}`, `in ${h}h${m ? ` ${m}min` : ''}`)
    const d = Math.floor(h / 24)
    return tr(`dans ${d}j${h % 24 ? ` ${h % 24}h` : ''}`, `in ${d}d${h % 24 ? ` ${h % 24}h` : ''}`)
  }

  function adjustHour(delta: number) {
    setHour(h => (h + delta + 24) % 24)
  }
  function adjustMinute(delta: number) {
    setMinute(m => (m + delta + 60) % 60)
  }

  // Preset « Maintenant +30min » — calcul correct (pas de double arrondi d'heure),
  // bascule sur demain si on passe minuit
  function setNowPlus30() {
    const n = new Date()
    const total = n.getHours() * 60 + n.getMinutes() + 30
    setHour(Math.floor(total / 60) % 24)
    setMinute(total % 60)
    setUseCustom(false)
    if (total >= 24 * 60) {
      const tmr = new Date(n); tmr.setDate(tmr.getDate() + 1)
      setSelectedDay(startOfDay(tmr))
    } else {
      setSelectedDay(startOfDay(n))
    }
  }

  const customMissing = useCustom && !customDate

  return (
    <div className="sf-modal-bg fixed inset-0 z-[9990] flex items-center justify-center"
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="sf-modal w-full max-w-[400px] mx-4 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg,var(--surface-2),var(--surface))',
          border: '1px solid var(--border-accent)',
          borderRadius: 'var(--r-xl)',
        }}>

        {/* Liseré supérieur lumineux */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,var(--accent-dk,#4F46E5),var(--accent))' }} />

        {/* Header — pattern v2 (tuile-icône + titre + sous-titre + close) */}
        <div className="flex items-center justify-between"
          style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center" style={{ gap: 'var(--sp-3)', minWidth: 0 }}>
            <div className="sf-page-icon sf-page-icon-sm sf-anim-scale-spring">
              <MIcon d={MPATHS.calendar} size={18} color="#fff" />
            </div>
            <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
              <p className="sf-page-title" style={{ fontSize: 15 }}>{tr('Programmer ce post', 'Schedule this post')}</p>
              <p className="sf-page-sub" style={{ fontSize: 11.5 }}>
                {type === 'mass_posting' ? 'Mass Posting' : 'Posting'} · {tr(`${phonesCount} tél.`, `${phonesCount} phones`)} · {tr(`${videosCount} vidéo${videosCount > 1 ? 's' : ''}`, `${videosCount} video${videosCount > 1 ? 's' : ''}`)}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label={tr('Fermer', 'Close')}
            className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm">
            <MIcon d={MPATHS.x} size={15} />
          </button>
        </div>

        <div style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

          {/* Summary chip */}
          {videoTitle && (
            <div className="flex items-center"
              style={{
                gap: 'var(--sp-2)', padding: '10px 14px',
                background: 'var(--surface-2)', border: '1px solid var(--border-md)',
                borderRadius: 'var(--r-md)',
              }}>
              <span className="flex-shrink-0" style={{ color: 'var(--text-3)' }}><MIcon d={MPATHS.video} size={16} /></span>
              <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text-2)' }}>{videoTitle}</p>
            </div>
          )}

          {/* Date selection */}
          <div>
            <p className="sf-section-label" style={{ marginBottom: 'var(--sp-3)' }}>{tr('Jour', 'Day')}</p>
            <div className="grid grid-cols-2 mb-2" style={{ gap: 'var(--sp-2)' }}>
              {QUICK_DATES.map(q => {
                const active = !useCustom && q.date.toDateString() === selectedDay.toDateString()
                return (
                  <button key={q.label}
                    onClick={() => { setSelectedDay(q.date); setUseCustom(false) }}
                    className={`sf-btn ${active ? 'sf-btn-primary' : 'sf-btn-secondary'}`}
                    style={{ height: 36, width: '100%' }}>
                    {q.label}
                  </button>
                )
              })}
            </div>
            {/* Custom date */}
            <button
              onClick={() => setUseCustom(true)}
              className={`sf-btn ${useCustom ? 'sf-btn-primary' : 'sf-btn-secondary'}`}
              style={{ height: 36, width: '100%', ...(useCustom ? {} : { borderStyle: 'dashed' }) }}>
              <MIcon d={MPATHS.calendar} size={14} /> {tr('Choisir une date précise', 'Pick a specific date')}
            </button>
            {useCustom && (
              <input type="date" value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                max={new Date(Date.now() + MAX_AHEAD_MS).toISOString().slice(0, 10)}
                className={`sf-input w-full mt-2${customMissing ? ' is-invalid' : ''}`} />
            )}
            {customMissing && (
              <p className="sf-field-error"><MIcon d={MPATHS.warn} size={12} /> {tr('Sélectionnez une date', 'Select a date')}</p>
            )}
          </div>

          {/* Time selection */}
          <div>
            <p className="sf-section-label" style={{ marginBottom: 'var(--sp-3)' }}>{tr('Heure locale', 'Local time')}</p>
            <div className="flex items-center justify-center gap-4">
              {/* Hour */}
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={() => adjustHour(1)} aria-label={tr('Heure +1', 'Hour +1')}
                  className="sf-btn sf-btn-ghost sf-press" style={{ width: 40, height: 30 }}>▲</button>
                <div className="flex items-center justify-center font-black sf-tabular"
                  style={{ width: 64, height: 48, fontSize: 26, color: 'var(--text-1)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 'var(--r-md)' }}>
                  {pad(hour)}
                </div>
                <button onClick={() => adjustHour(-1)} aria-label={tr('Heure -1', 'Hour -1')}
                  className="sf-btn sf-btn-ghost sf-press" style={{ width: 40, height: 30 }}>▼</button>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-4)' }}>{tr('heure', 'hour')}</span>
              </div>

              <span className="text-3xl font-black pb-6" style={{ color: 'var(--text-4)' }}>:</span>

              {/* Minute */}
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={() => adjustMinute(5)} aria-label={tr('Minute +5', 'Minute +5')}
                  className="sf-btn sf-btn-ghost sf-press" style={{ width: 40, height: 30 }}>▲</button>
                <div className="flex items-center justify-center font-black sf-tabular"
                  style={{ width: 64, height: 48, fontSize: 26, color: 'var(--text-1)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 'var(--r-md)' }}>
                  {pad(minute)}
                </div>
                <button onClick={() => adjustMinute(-5)} aria-label={tr('Minute -5', 'Minute -5')}
                  className="sf-btn sf-btn-ghost sf-press" style={{ width: 40, height: 30 }}>▼</button>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-4)' }}>min</span>
              </div>
            </div>

            {/* Quick time presets */}
            <div className="flex gap-2 mt-3 flex-wrap justify-center">
              <button onClick={setNowPlus30} className="sf-btn sf-btn-secondary sf-btn-sm">
                {tr('Maintenant +30min', 'Now +30min')}
              </button>
              {[
                { label: '08:00', h: 8,  m: 0 },
                { label: '12:00', h: 12, m: 0 },
                { label: '18:00', h: 18, m: 0 },
                { label: '21:00', h: 21, m: 0 },
              ].map(t => {
                const on = hour === t.h && minute === t.m
                return (
                  <button key={t.label}
                    onClick={() => { setHour(t.h); setMinute(t.m) }}
                    className={`sf-btn sf-btn-sm ${on ? 'sf-btn-primary' : 'sf-btn-secondary'} sf-tabular`}>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview — bandeau d'état v2 */}
          <div className={`sf-banner ${invalid ? 'is-danger' : 'is-accent'}`}>
            <span className="flex-shrink-0">
              {invalid ? <MIcon d={MPATHS.warn} size={18} /> : <MIcon d={MPATHS.clock} size={18} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="text-[13px] font-black" style={{ color: invalid ? 'var(--danger)' : 'var(--text-1)' }}>
                {scheduled.toLocaleDateString(tr('fr-FR', 'en-US'), { weekday: 'long', day: 'numeric', month: 'long' })} {tr('à', 'at')} {pad(hour)}h{pad(minute)}
              </p>
              <p className="text-[11px] mt-0.5" style={{ opacity: 0.75 }}>{countdown()}</p>
            </div>
          </div>

          {/* Credit cost — bandeau warn v2 */}
          {typeof creditCost === 'number' && creditCost > 0 && (
            <div className="sf-banner is-warn">
              <span className="flex-shrink-0"><MIcon d={MPATHS.coins} size={15} /></span>
              <p className="text-[11.5px] leading-snug" style={{ margin: 0, color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{tr(`${creditCost} crédit${creditCost > 1 ? 's' : ''}`, `${creditCost} credit${creditCost > 1 ? 's' : ''}`)}</span>
                {' '}{tr('seront débités maintenant — remboursés si annulation', 'will be charged now — refunded if cancelled')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex" style={{ padding: '0 var(--sp-5) var(--sp-5)', gap: 'var(--sp-2)' }}>
          <button onClick={onClose} className="sf-btn sf-btn-secondary" style={{ flex: 1 }}>
            {tr('Annuler', 'Cancel')}
          </button>
          <button
            onClick={() => !invalid && onConfirm(scheduled)}
            disabled={invalid || customMissing}
            className="sf-btn sf-btn-primary sf-tabular"
            style={{ flex: 2 }}>
            <MIcon d={MPATHS.calendar} size={15} color="#fff" /> {tr('Confirmer', 'Confirm')} — {pad(hour)}h{pad(minute)}
          </button>
        </div>
      </div>
    </div>
  )
}
