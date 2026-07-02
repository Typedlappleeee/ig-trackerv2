import { useEffect, useRef } from 'react'

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const ILayers   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
const ICalendar = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const ISparkles = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5z"/><path d="M19 13l.5 1.5L21 15l-1.5.5L19 17l-.5-1.5L17 15l1.5-.5z"/></svg>
const IFlame    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg>
const IScissors = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
const IPhone    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
const IUsers    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
const ICoins    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><line x1="16.71" y1="13.88" x2="13.38" y2="17.21"/></svg>

const FEATURES = [
  {
    icon: ILayers,
    title: 'Mass Posting',
    text: 'Publie simultanément sur des dizaines de comptes Instagram ET TikTok. Chaque phone se libère dès que sa publication est terminée.',
    accent: '#A855F7',
    span: 'lg:col-span-2',
    big: true,
    preview: (
      <div className="mt-5 flex flex-wrap gap-2">
        {['iPhone-01', 'iPhone-02', 'iPhone-03', 'iPhone-04', 'iPhone-05'].map((n) => (
          <div key={n} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)', color: '#D8B4FE' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            {n}
          </div>
        ))}
        <div className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(226,232,240,0.7)' }}>
          +47 appareils…
        </div>
        <div className="ml-auto inline-flex items-center gap-2 self-center text-[10px] font-semibold text-text2">
          <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>
            Instagram
          </span>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 3c.4 2.4 2 4.1 4.5 4.4v3c-1.7.1-3.2-.4-4.6-1.3v6.2c0 3.6-2.7 5.9-6 5.9-3.2 0-5.6-2.5-5.6-5.5 0-3.4 2.9-5.9 6.4-5.3v3.1c-.4-.1-.9-.2-1.3-.2-1.4 0-2.4 1-2.4 2.4 0 1.4 1 2.4 2.5 2.4 1.6 0 2.6-1.1 2.6-2.9V3h3.9z"/></svg>
            TikTok
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: ICalendar,
    title: 'Programmation',
    text: 'Calendrier visuel, files d\'attente par compte, fuseaux horaires et créneaux récurrents.',
    accent: '#22D3EE',
    span: 'lg:col-span-1',
    preview: (
      <div className="mt-5 grid grid-cols-7 gap-1">
        {Array.from({ length: 21 }, (_, i) => {
          const hasPost = [2, 5, 7, 9, 11, 14, 16, 18].includes(i)
          return (
            <div key={i} className="flex aspect-square items-center justify-center rounded-md text-[9px] font-medium"
              style={{
                background: hasPost ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${hasPost ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.05)'}`,
                color: hasPost ? '#67E8F9' : 'rgba(255,255,255,0.22)',
              }}>
              {i + 1}
            </div>
          )
        })}
      </div>
    ),
  },
  {
    icon: ISparkles,
    title: 'Captions IA',
    text: 'Génère captions, hashtags et idées de contenu. Propulsé par Claude & Groq.',
    accent: '#818CF8',
    span: 'lg:col-span-1',
    preview: (
      <div className="mt-5 rounded-xl p-3 text-[11px] leading-relaxed text-text2"
        style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)' }}>
        <span className="font-mono text-indigo">✦</span>{' '}
        « Chaque matin est une nouvelle chance de créer du contenu qui connecte avec ton audience. 🔥
        <br /><span className="mt-1.5 inline-block text-indigo opacity-70">#motivation #contentcreator #instagram</span> »
      </div>
    ),
  },
  {
    icon: IScissors,
    title: 'Remix & Repurpose vidéo',
    text: 'Mixe, recoupe et réinvente tes vidéos. Sous-titres, watermarks et préréglages pour produire en masse.',
    accent: '#F472B6',
    span: 'lg:col-span-2',
    big: true,
    preview: (
      <div className="mt-5 flex items-center gap-3">
        {['9:16', '1:1', '16:9'].map(ratio => (
          <div key={ratio} className="flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center rounded-lg text-[8px] font-bold text-pink-300"
              style={{
                width: ratio === '9:16' ? 28 : ratio === '1:1' ? 40 : 60,
                height: ratio === '9:16' ? 48 : ratio === '1:1' ? 40 : 34,
                background: 'rgba(244,114,182,0.1)',
                border: '1.5px solid rgba(244,114,182,0.4)',
              }}>
              {ratio === '9:16' ? '↕' : '□'}
            </div>
            <span className="text-[9px] text-muted">{ratio}</span>
          </div>
        ))}
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          <div className="h-1.5 rounded-full bg-pink-400/20"><div className="h-full w-3/4 rounded-full bg-pink-400/60" /></div>
          <div className="h-1.5 rounded-full bg-pink-400/20"><div className="h-full w-1/2 rounded-full bg-pink-400/60" /></div>
          <div className="h-1.5 rounded-full bg-pink-400/20"><div className="h-full w-2/3 rounded-full bg-pink-400/60" /></div>
        </div>
      </div>
    ),
  },
  {
    icon: IFlame,
    title: 'Auto-Warmup',
    text: 'Chauffe tes nouveaux comptes automatiquement : likes, follows à rythme humain. Routines configurables.',
    accent: '#FB923C',
    span: 'lg:col-span-1',
    preview: (
      <div className="mt-5 space-y-2.5">
        {[
          { label: 'Likes/h', val: 8, max: 15 },
          { label: 'Follows/h', val: 5, max: 10 },
          { label: 'Vues/h', val: 12, max: 20 },
        ].map(r => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] text-muted">{r.label}</span>
            <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${(r.val / r.max) * 100}%`, background: 'linear-gradient(90deg, #FB923C, #F97316)' }} />
            </div>
            <span className="w-4 text-right font-mono text-[10px] text-orange-400">{r.val}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: IPhone,
    title: 'Cloud Phones GeeLark',
    text: 'Pilote tes cloud phones depuis un seul dashboard. Statut en temps réel, IP et sessions isolées.',
    accent: '#34D399',
    span: 'lg:col-span-1',
    preview: (
      <div className="mt-5 space-y-1.5">
        {[
          { name: 'iPhone-01', status: 'online', followers: '12,4K' },
          { name: 'iPhone-02', status: 'posting', followers: '8,9K' },
          { name: 'iPhone-03', status: 'online', followers: '23,1K' },
        ].map(p => (
          <div key={p.name} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px]"
            style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <span className="font-mono text-text">{p.name}</span>
            <span className="text-text2">{p.followers}</span>
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold"
              style={{ background: p.status === 'posting' ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)', color: p.status === 'posting' ? '#FCD34D' : '#34D399' }}>
              <span className="h-1 w-1 rounded-full" style={{ background: 'currentColor' }} />
              {p.status}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: IUsers,
    title: 'Collaboration d\'équipe',
    text: 'Invite ton organisation, attribue des rôles (admin, membre, viewer) et restreins les accès.',
    accent: '#60A5FA',
    span: 'lg:col-span-1',
    preview: (
      <div className="mt-5 flex flex-wrap gap-1.5">
        {[
          { role: 'admin', tone: 'rgba(96,165,250,0.16)', ring: 'rgba(96,165,250,0.4)', fg: '#93C5FD' },
          { role: 'membre', tone: 'rgba(129,140,248,0.14)', ring: 'rgba(129,140,248,0.35)', fg: '#A5B4FC' },
          { role: 'viewer', tone: 'rgba(255,255,255,0.05)', ring: 'rgba(255,255,255,0.12)', fg: 'rgba(226,232,240,0.75)' },
        ].map(r => (
          <span key={r.role} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ background: r.tone, border: `1px solid ${r.ring}`, color: r.fg }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
            {r.role}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: ICoins,
    title: 'Crédits à la demande',
    text: 'Un solde unique pour l\'IA et les automatisations. Recharge à la demande, partagé par organisation.',
    accent: '#FBBF24',
    span: 'lg:col-span-1',
    preview: (
      <div className="mt-5 flex items-center justify-between rounded-xl px-3 py-2.5"
        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)' }}>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-[#08060F]"
            style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}>¢</span>
          <span className="text-[11px] text-text2">Solde partagé</span>
        </div>
        <span className="font-mono text-sm font-bold text-amber-300">2 480</span>
      </div>
    ),
  },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    el.querySelectorAll('.reveal').forEach(n => obs.observe(n))
    return () => obs.disconnect()
  }, [])
  return ref
}

export function Features() {
  const ref = useReveal()

  return (
    <section id="features" className="relative px-5 py-28" ref={ref}>
      {/* Soft background */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute left-1/2 top-1/3 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #818CF8, transparent 68%)', filter: 'blur(90px)' }} />
        <div className="absolute right-[8%] top-2/3 h-[420px] w-[420px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #C084FC, transparent 70%)', filter: 'blur(90px)' }} />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center reveal">
          <span className="section-label">Tout pour scaler</span>
          <h2 className="font-display h-section">
            Une seule app,{' '}
            <span className="gradient-text">tout dedans.</span>
          </h2>
          <p className="mt-4 text-text2">
            Fini de jongler entre dix outils. ScaleFlow réunit publication, automatisation
            et production de contenu pour faire grandir ton empire Instagram &amp; TikTok.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const delay = (i % 3) * 0.08
            return (
              <article
                key={f.title}
                className={`reveal glass-card group flex flex-col rounded-2xl p-6 ${f.span}`}
                style={{ transitionDelay: `${delay}s` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                    style={{
                      background: `linear-gradient(150deg, ${f.accent}26, ${f.accent}0D)`,
                      border: `1px solid ${f.accent}3D`,
                      color: f.accent,
                      boxShadow: `inset 0 1px 0 0 ${f.accent}26`,
                    }}
                  >
                    <f.icon />
                  </span>
                  <h3 className="font-display text-base font-bold leading-tight text-text">{f.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text2">{f.text}</p>
                {f.preview && <div className="mt-auto">{f.preview}</div>}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
