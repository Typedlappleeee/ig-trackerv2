import { useRef, useState } from 'react'
import { useReveal } from '../hooks/useReveal'

/**
 * Avis clients — les captures Telegram telles quelles, plus un message vocal.
 * Copie les fichiers de _redesign/assets/ dans website/public/avis/.
 */
const REVIEWS = [
  { name: 'Francis', date: '19 juin', src: '/avis/avis-francis.png', glow: 'rgba(34,211,238,0.32)',
    alt: "Avis de Francis sur Telegram : très bon CRM, staff réduit de 90 %, très bon service, je recommande." },
  { name: 'France Killian', date: '19 juin', src: '/avis/avis-france-killian.png', glow: 'rgba(168,85,247,0.35)',
    alt: "Avis de France Killian sur Telegram : comptes augmentés de 300 % en réduisant le staff de plus de la moitié, je recommande à fond." },
  { name: 'Leon', date: '20 juin', src: '/avis/avis-leon.png', glow: 'rgba(52,211,153,0.3)',
    alt: "Avis de Leon sur Telegram : logiciel performant et intuitif, accompagnement irréprochable, je recommande sans hésiter." },
  { name: 'Alx', date: '4 juillet', src: '/avis/avis-alx.png', glow: 'rgba(129,140,248,0.32)',
    alt: "Avis d'Alx sur Telegram : tout est regroupé en une seule app, très clairement le meilleur outil GeeLark." },
  { name: 'Njmoss', date: '6 juillet', src: '/avis/avis-njmoss.png', glow: 'rgba(245,158,11,0.3)',
    alt: "Avis de Njmoss sur Telegram : logiciel propre, beaucoup de choses en automatisé, un gain de temps et de performance." },
]

const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`

/** Message vocal : lecteur maison, forme d'onde qui se remplit à la lecture. */
function VoiceNote() {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [pct, setPct] = useState(0)
  const [time, setTime] = useState('0:00')

  const toggle = () => {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {})
    else { a.pause(); setPlaying(false) }
  }

  return (
    <figure
      data-reveal
      className="col-span-full m-0 flex items-center gap-4.5 rounded-[20px] border border-emerald/[0.28] p-5 transition-transform duration-300"
      style={{ background: 'linear-gradient(120deg, rgba(52,211,153,0.09), rgba(255,255,255,0.03))' }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 26px 60px -22px rgba(52,211,153,0.35)'
      }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      <button
        type="button" onClick={toggle}
        aria-label={playing ? 'Mettre en pause' : 'Écouter le message vocal'}
        className="flex h-13 w-13 shrink-0 cursor-pointer items-center justify-center rounded-full border-none text-[17px] text-[#04140C]"
        style={{ background: 'linear-gradient(135deg,#34D399,#10B981)', boxShadow: '0 0 30px -8px rgba(52,211,153,0.8)' }}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <span className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="flex h-[30px] items-center gap-[2.5px]">
          {Array.from({ length: 56 }, (_, i) => {
            const seed = Math.abs(Math.sin(i * 2.7) * Math.cos(i * 0.9))
            return (
              <span
                key={i}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{ height: `${22 + seed * 68}%`, background: i / 56 <= pct ? '#34D399' : 'rgba(255,255,255,0.16)' }}
              />
            )
          })}
        </span>
        <span className="flex items-center gap-2.5 text-[11.5px] font-bold text-muted">
          <span className="text-[12.5px] font-extrabold text-[rgba(226,222,255,0.88)]">Message vocal d'un client</span>
          <span className="font-mono">{time}</span>
          <span className="ml-auto">Telegram</span>
        </span>
      </span>

      <audio
        ref={audio} src="/avis/avis-vocal.ogg" preload="metadata" className="hidden"
        onTimeUpdate={e => {
          const a = e.currentTarget
          if (!a.duration || !isFinite(a.duration)) return
          setPct(a.currentTime / a.duration)
          setTime(`${fmt(a.currentTime)} / ${fmt(a.duration)}`)
        }}
        onEnded={() => { setPlaying(false); setPct(0); setTime('0:00') }}
      />
    </figure>
  )
}

export function Testimonials() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      id="testimonials"
      className="relative z-[1] px-6 py-25"
      style={{
        background: 'rgba(124,58,237,0.04)',
        borderTop: '1px solid rgba(139,92,246,0.18)',
        borderBottom: '1px solid rgba(139,92,246,0.18)',
      }}
      ref={ref}
    >
      <div className="mx-auto max-w-[1140px]">
        <div className="reveal mx-auto max-w-[640px] text-center">
          <span className="section-label">Social proof</span>
          <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-[46px]">
            Ils font tourner <span className="gradient-text-warm">ScaleFlow.</span>
          </h2>
          <p className="mt-4.5 text-base leading-relaxed text-text2">
            Les messages reçus, tels quels. Rien de réécrit.
          </p>
        </div>

        <div data-stagger className="mt-14 grid grid-cols-1 items-start gap-5 md:grid-cols-2">
          {REVIEWS.map(r => (
            <figure
              key={r.name}
              data-reveal
              className="m-0 flex flex-col gap-3.5 rounded-[20px] border border-white/[0.1] bg-white/[0.035] p-4 transition-transform duration-300"
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = `0 26px 60px -22px ${r.glow}`
              }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              <img src={r.src} alt={r.alt} loading="lazy" className="block h-auto w-full rounded-xl" />
              <figcaption className="flex items-center gap-2.5 whitespace-nowrap px-1 pb-1">
                <span className="tracking-[1.5px] text-xs text-[#FBBF24]">★★★★★</span>
                <span className="text-[12.5px] font-extrabold text-[rgba(226,222,255,0.88)]">{r.name}</span>
                <span className="ml-auto text-[11px] font-bold text-muted">Telegram · {r.date}</span>
              </figcaption>
            </figure>
          ))}
          <VoiceNote />
        </div>
      </div>
    </section>
  )
}
