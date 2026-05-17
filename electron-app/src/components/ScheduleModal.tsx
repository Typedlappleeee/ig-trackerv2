import { useState, useEffect } from 'react'

interface Props {
  type:        'posting' | 'mass_posting'
  phonesCount: number
  videosCount: number
  videoTitle?: string
  onConfirm:   (date: Date) => void
  onClose:     () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

function startOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function ScheduleModal({ type, phonesCount, videosCount, videoTitle, onConfirm, onClose }: Props) {
  const now      = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)

  const QUICK_DATES = [
    { label: "Aujourd'hui", date: startOfDay(now) },
    { label: 'Demain',      date: startOfDay(tomorrow) },
    { label: 'Dans 2 jours', date: (() => { const d = startOfDay(now); d.setDate(d.getDate() + 2); return d })() },
    { label: 'Dans 3 jours', date: (() => { const d = startOfDay(now); d.setDate(d.getDate() + 3); return d })() },
  ]

  const [selectedDay, setSelectedDay]  = useState<Date>(startOfDay(now))
  const [customDate, setCustomDate]    = useState('')   // "YYYY-MM-DD" for custom
  const [useCustom, setUseCustom]      = useState(false)
  const [hour, setHour]    = useState(now.getHours() + 1 >= 24 ? 0 : now.getHours() + 1)
  const [minute, setMinute] = useState(0)

  const scheduled = (() => {
    const base = useCustom && customDate ? new Date(customDate + 'T00:00:00') : new Date(selectedDay)
    base.setHours(hour, minute, 0, 0)
    return base
  })()

  const isInPast = scheduled <= now
  const diffMs   = scheduled.getTime() - now.getTime()
  const diffMin  = Math.round(diffMs / 60000)

  function countdown() {
    if (isInPast) return '⚠ Heure déjà passée'
    if (diffMin < 60) return `dans ${diffMin} min`
    const h = Math.floor(diffMin / 60)
    const m = diffMin % 60
    if (h < 24) return `dans ${h}h${m ? ` ${m}min` : ''}`
    const d = Math.floor(h / 24)
    return `dans ${d}j${h % 24 ? ` ${h % 24}h` : ''}`
  }

  function adjustHour(delta: number) {
    setHour(h => (h + delta + 24) % 24)
  }
  function adjustMinute(delta: number) {
    setMinute(m => (m + delta + 60) % 60)
  }

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="w-full max-w-[400px] mx-4 rounded-2xl overflow-hidden anim-scale-in"
        style={{ background: '#0c0919', border: '1px solid rgba(37,99,235,0.3)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#2563eb,#7c3aed)' }} />
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg,rgba(37,99,235,0.2),rgba(124,58,237,0.12))', border: '1px solid rgba(37,99,235,0.25)' }}>
              📅
            </div>
            <div>
              <p className="font-black text-white text-[14px] leading-tight">Programmer ce post</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                {type === 'mass_posting' ? 'Mass Posting' : 'Posting'} · {phonesCount} tél. · {videosCount} vidéo{videosCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-all"
            style={{ color: 'rgba(196,181,253,0.4)' }}>✕</button>
        </div>

        <div className="p-5 space-y-5">

          {/* Summary chip */}
          {videoTitle && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-base flex-shrink-0">🎬</span>
              <p className="text-[12px] font-semibold truncate" style={{ color: 'rgba(196,181,253,0.7)' }}>{videoTitle}</p>
            </div>
          )}

          {/* Date selection */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] font-black mb-2.5" style={{ color: 'rgba(37,99,235,0.8)' }}>
              Jour
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {QUICK_DATES.map(q => {
                const active = !useCustom && q.date.toDateString() === selectedDay.toDateString()
                return (
                  <button key={q.label}
                    onClick={() => { setSelectedDay(q.date); setUseCustom(false) }}
                    className="py-2.5 rounded-xl text-[12px] font-bold transition-all"
                    style={active
                      ? { background: 'linear-gradient(130deg,#2563eb,#7c3aed)', color: 'white', boxShadow: '0 2px 12px rgba(37,99,235,0.35)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {q.label}
                  </button>
                )
              })}
            </div>
            {/* Custom date */}
            <button
              onClick={() => setUseCustom(true)}
              className="w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all flex items-center justify-center gap-2"
              style={useCustom
                ? { background: 'linear-gradient(130deg,#2563eb,#7c3aed)', color: 'white' }
                : { background: 'rgba(255,255,255,0.03)', color: 'rgba(196,181,253,0.45)', border: '1px dashed rgba(255,255,255,0.1)' }}>
              📆 Choisir une date précise
            </button>
            {useCustom && (
              <input type="date" value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full mt-2 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none sf-input" />
            )}
          </div>

          {/* Time selection */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] font-black mb-2.5" style={{ color: 'rgba(37,99,235,0.8)' }}>
              Heure locale
            </p>
            <div className="flex items-center justify-center gap-4">
              {/* Hour */}
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={() => adjustHour(1)}
                  className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-white/[0.08]"
                  style={{ color: 'rgba(196,181,253,0.5)', background: 'rgba(255,255,255,0.04)' }}>▲</button>
                <div className="w-16 h-12 rounded-xl flex items-center justify-center font-black text-2xl text-white"
                  style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)' }}>
                  {pad(hour)}
                </div>
                <button onClick={() => adjustHour(-1)}
                  className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-white/[0.08]"
                  style={{ color: 'rgba(196,181,253,0.5)', background: 'rgba(255,255,255,0.04)' }}>▼</button>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(196,181,253,0.3)' }}>heure</span>
              </div>

              <span className="text-3xl font-black pb-6" style={{ color: 'rgba(196,181,253,0.3)' }}>:</span>

              {/* Minute */}
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={() => adjustMinute(5)}
                  className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-white/[0.08]"
                  style={{ color: 'rgba(196,181,253,0.5)', background: 'rgba(255,255,255,0.04)' }}>▲</button>
                <div className="w-16 h-12 rounded-xl flex items-center justify-center font-black text-2xl text-white"
                  style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)' }}>
                  {pad(minute)}
                </div>
                <button onClick={() => adjustMinute(-5)}
                  className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-white/[0.08]"
                  style={{ color: 'rgba(196,181,253,0.5)', background: 'rgba(255,255,255,0.04)' }}>▼</button>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(196,181,253,0.3)' }}>min</span>
              </div>
            </div>

            {/* Quick time presets */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {[
                { label: 'Maintenant +30min', h: (now.getHours() + Math.ceil((now.getMinutes() + 30) / 60)) % 24, m: (now.getMinutes() + 30) % 60 },
                { label: '08:00', h: 8,  m: 0 },
                { label: '12:00', h: 12, m: 0 },
                { label: '18:00', h: 18, m: 0 },
                { label: '21:00', h: 21, m: 0 },
              ].map(t => (
                <button key={t.label}
                  onClick={() => { setHour(t.h); setMinute(t.m) }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                  style={{ background: 'rgba(37,99,235,0.08)', color: 'rgba(147,197,253,0.7)', border: '1px solid rgba(37,99,235,0.12)' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="px-4 py-3 rounded-xl flex items-center gap-3"
            style={{
              background: isInPast ? 'rgba(239,68,68,0.06)' : 'rgba(37,99,235,0.06)',
              border: `1px solid ${isInPast ? 'rgba(239,68,68,0.2)' : 'rgba(37,99,235,0.15)'}`,
            }}>
            <span className="text-lg flex-shrink-0">{isInPast ? '⚠' : '🕐'}</span>
            <div>
              <p className="text-[13px] font-black" style={{ color: isInPast ? '#f87171' : 'white' }}>
                {scheduled.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à {pad(hour)}h{pad(minute)}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: isInPast ? 'rgba(248,113,113,0.7)' : 'rgba(147,197,253,0.6)' }}>
                {countdown()}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
            Annuler
          </button>
          <button
            onClick={() => !isInPast && onConfirm(scheduled)}
            disabled={isInPast || (useCustom && !customDate)}
            className="flex-[2] py-2.5 rounded-xl text-[12px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(130deg,#2563eb,#7c3aed)', boxShadow: '0 4px 20px -4px rgba(37,99,235,0.5)' }}>
            📅 Confirmer — {pad(hour)}h{pad(minute)}
          </button>
        </div>
      </div>
    </div>
  )
}
