import { useEffect, useRef } from 'react'

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const IKey = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
)
const IUpload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </svg>
)
const IRocket = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
)
const IPlay = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)
const ICheckSmall = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

// ── Mini-UI previews ─────────────────────────────────────────────────────────
function PreviewToken() {
  return (
    <div className="rounded-xl border border-border bg-[#080812] p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">Connexion GeeLark</span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold text-emerald" style={{ background: 'rgba(52,211,153,0.12)' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-dot" />
          API OK
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-cyan/30 bg-white/[0.03] px-3 py-2">
        <span className="shrink-0 text-cyan"><IKey /></span>
        <span className="truncate font-mono text-[10px] text-text2">glk_••••••••••••a7f2</span>
        <span className="ml-auto shrink-0 rounded-md px-2 py-1 text-[9px] font-bold text-[#0a0a16]" style={{ background: 'linear-gradient(135deg,#22D3EE,#818CF8)' }}>
          Connecter
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-[10px]">
        <span className="text-text2">Phones détectés</span>
        <span className="font-mono font-bold text-cyan">47 appareils</span>
      </div>
    </div>
  )
}

function PreviewBank() {
  const files = [
    { name: 'reel-042.mp4', dur: '0:23', accent: '#818CF8' },
    { name: 'hook-pov.mp4', dur: '0:17', accent: '#A855F7' },
    { name: 'remix-08.mp4', dur: '0:31', accent: '#22D3EE' },
    { name: 'viral-cut.mp4', dur: '0:12', accent: '#EC4899' },
    { name: 'trend-21.mp4', dur: '0:26', accent: '#34D399' },
    { name: 'final-v3.mp4', dur: '0:19', accent: '#FB923C' },
  ]
  return (
    <div className="rounded-xl border border-border bg-[#080812] p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">Banque vidéos</span>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo">
          <IUpload />
          247 fichiers
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {files.map((f) => (
          <div key={f.name} className="overflow-hidden rounded-lg border border-border bg-white/[0.03]">
            <div className="flex aspect-video items-center justify-center" style={{ background: `${f.accent}14` }}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: `${f.accent}33`, color: f.accent }}>
                <IPlay />
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 px-1.5 py-1">
              <span className="truncate font-mono text-[8px] text-text2">{f.name}</span>
              <span className="shrink-0 font-mono text-[8px] text-muted">{f.dur}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewMassPost() {
  const phones = [
    { name: 'iPhone-01', state: 'done' },
    { name: 'iPhone-02', state: 'done' },
    { name: 'iPhone-03', state: 'done' },
    { name: 'iPhone-04', state: 'posting' },
    { name: 'iPhone-05', state: 'posting' },
    { name: 'iPhone-06', state: 'queue' },
  ] as const
  return (
    <div className="rounded-xl border border-border bg-[#080812] p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">Mass Posting</span>
        <span className="font-mono text-[9px] font-bold text-emerald">42/47 publiés</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {phones.map((p) => (
          <div
            key={p.name}
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[9px]"
            style={{
              background:
                p.state === 'done' ? 'rgba(52,211,153,0.10)' : p.state === 'posting' ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${
                p.state === 'done' ? 'rgba(52,211,153,0.3)' : p.state === 'posting' ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.07)'
              }`,
            }}
          >
            <span className="font-mono text-text">{p.name}</span>
            {p.state === 'done' && (
              <span className="inline-flex items-center gap-1 font-bold text-emerald">
                <ICheckSmall /> publié
              </span>
            )}
            {p.state === 'posting' && (
              <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse-dot" /> en cours
              </span>
            )}
            {p.state === 'queue' && <span className="text-muted">en file</span>}
          </div>
        ))}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: '89%', background: 'linear-gradient(90deg, #22D3EE, #34D399)' }} />
      </div>
    </div>
  )
}

// ── Steps data ───────────────────────────────────────────────────────────────
const STEPS = [
  {
    num: '01',
    icon: IKey,
    accent: '#22D3EE',
    title: 'Connecte ton GeeLark',
    text: 'Colle ton bearer token GeeLark : ScaleFlow détecte instantanément tous tes cloud phones et synchronise leurs profils Instagram.',
    preview: <PreviewToken />,
  },
  {
    num: '02',
    icon: IUpload,
    accent: '#818CF8',
    title: 'Remplis ta banque vidéos',
    text: 'Glisse-dépose tes reels par centaines. Remix, sous-titres et captions IA en option pour transformer un clip en dix variantes.',
    preview: <PreviewBank />,
  },
  {
    num: '03',
    icon: IRocket,
    accent: '#A855F7',
    title: 'Lance le Mass Post',
    text: "Sélectionne tes comptes, choisis la cadence, clique. ScaleFlow publie en parallèle et libère chaque phone dès que c'est terminé.",
    preview: <PreviewMassPost />,
  },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    el.querySelectorAll('.reveal').forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [])
  return ref
}

export function Showcase() {
  const ref = useReveal()

  return (
    <section id="how" className="relative px-5 py-28" ref={ref}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/4 top-1/3 h-[500px] w-[500px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #22D3EE, transparent)', filter: 'blur(90px)' }}
        />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center reveal">
          <span className="section-label">Comment ça marche</span>
          <h2 className="text-3xl font-black text-text sm:text-5xl">
            Opérationnel en <span className="gradient-text">3 étapes.</span>
          </h2>
          <p className="mt-4 text-text2">
            Pas de setup interminable, pas de scripts à bidouiller. Du token au premier mass post en moins de cinq minutes.
          </p>
        </div>

        <div className="relative mt-16">
          {/* Gradient connecting line (desktop) */}
          <div
            className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-7 hidden h-px lg:block"
            style={{ background: 'linear-gradient(90deg, #22D3EE 0%, #818CF8 50%, #A855F7 100%)', opacity: 0.45 }}
            aria-hidden="true"
          />
          {/* Vertical connecting line (mobile) */}
          <div
            className="pointer-events-none absolute bottom-12 left-7 top-10 w-px lg:hidden"
            style={{ background: 'linear-gradient(180deg, #22D3EE 0%, #818CF8 50%, #A855F7 100%)', opacity: 0.35 }}
            aria-hidden="true"
          />

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-6">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className="reveal relative flex gap-5 lg:flex-col lg:gap-0"
                style={{ transitionDelay: `${i * 0.15}s` }}
              >
                {/* Number badge */}
                <div className="relative z-10 shrink-0 lg:mx-auto lg:mb-6">
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg font-mono text-base font-extrabold"
                    style={{
                      border: `1.5px solid ${step.accent}55`,
                      color: step.accent,
                      boxShadow: `0 0 30px -6px ${step.accent}66, inset 0 0 24px -10px ${step.accent}55`,
                    }}
                  >
                    {step.num}
                  </span>
                </div>

                {/* Card */}
                <div className="glass-card min-w-0 flex-1 rounded-2xl p-6">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${step.accent}1A`, border: `1px solid ${step.accent}33`, color: step.accent }}
                    >
                      <step.icon />
                    </span>
                    <h3 className="text-base font-bold text-text">{step.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-text2">{step.text}</p>
                  <div className="mt-5">{step.preview}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
