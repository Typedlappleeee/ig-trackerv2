import type { ReactNode } from 'react'
import { useReveal } from '../hooks/useReveal'

interface Feature {
  title: string
  text: string
  accent: string
  titleColor: string
  span?: string
  tinted?: boolean
  horizontal?: boolean
  preview?: ReactNode
}

const PhonePills = () => (
  <div className="mt-2 flex flex-wrap gap-2">
    {['iPhone-01', 'iPhone-02', 'iPhone-03', 'iPhone-04'].map((n, i) => (
      <span
        key={n}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-extrabold text-[#D8B4FE]"
        style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}
      >
        <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald" style={{ animationDelay: `-${i * 0.6}s` }} />
        {n}
      </span>
    ))}
    <span className="rounded-full border border-white/[0.12] px-3 py-1.5 text-[11px] font-extrabold text-text2">+47 appareils…</span>
  </div>
)

const MiniCalendar = () => {
  const posted = [2, 5, 7, 9, 11, 14, 16, 18]
  return (
    <div className="mt-2 grid grid-cols-7 gap-1">
      {Array.from({ length: 21 }, (_, i) => {
        const on = posted.includes(i)
        return (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-md text-[10px] font-bold"
            style={{
              background: on ? 'rgba(34,211,238,0.14)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${on ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.05)'}`,
              color: on ? '#67E8F9' : 'rgba(255,255,255,0.22)',
            }}
          >
            {i + 1}
          </div>
        )
      })}
    </div>
  )
}

const CaptionSample = () => (
  <div
    className="mt-2 rounded-xl p-3.5 text-xs leading-relaxed text-text2"
    style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.22)' }}
  >
    <span className="font-mono text-indigo">✦</span>{' '}
    « Chaque matin est une nouvelle chance de créer du contenu qui connecte avec ton audience. 🔥
    <br /><span className="mt-1 inline-block text-indigo opacity-75">#motivation #contentcreator #instagram</span> »
  </div>
)

const RatioPreview = () => (
  <div className="mt-2 flex items-end gap-4.5">
    {[{ r: '9:16', w: 26, h: 46 }, { r: '1:1', w: 38, h: 38 }, { r: '16:9', w: 58, h: 32 }].map(({ r, w, h }) => (
      <div key={r} className="flex flex-col items-center gap-1.5">
        <div
          className="rounded-[7px]"
          style={{ width: w, height: h, background: 'rgba(244,114,182,0.08)', border: '1.5px solid rgba(244,114,182,0.5)' }}
        />
        <span className="text-[10px] font-bold text-muted">{r}</span>
      </div>
    ))}
    <div className="flex flex-1 flex-col gap-1.5 pb-4.5">
      {[75, 50, 66].map(w => (
        <div key={w} className="h-1.5 rounded-full" style={{ background: 'rgba(244,114,182,0.15)' }}>
          <div className="h-full rounded-full" style={{ width: `${w}%`, background: 'linear-gradient(90deg,#F472B6,#EC4899)' }} />
        </div>
      ))}
    </div>
  </div>
)

const WarmupGauges = () => (
  <div className="mt-2 flex flex-col gap-2.5 text-[11px] font-bold text-muted">
    {[{ l: 'Likes/h', v: 8, m: 15 }, { l: 'Follows/h', v: 5, m: 10 }, { l: 'Vues/h', v: 12, m: 20 }].map(r => (
      <div key={r.l} className="flex items-center gap-2.5">
        <span className="w-[58px] shrink-0">{r.l}</span>
        <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full" style={{ width: `${(r.v / r.m) * 100}%`, background: 'linear-gradient(90deg,#FB923C,#F97316)' }} />
        </div>
        <span className="w-5 text-right font-mono text-[#FB923C]">{r.v}</span>
      </div>
    ))}
  </div>
)

const PhoneStatus = () => (
  <div className="mt-2 flex flex-col gap-1.5">
    {[
      { name: 'iPhone-01', followers: '12,4K', status: 'online' },
      { name: 'iPhone-02', followers: '8,9K',  status: 'posting' },
      { name: 'iPhone-03', followers: '23,1K', status: 'online' },
    ].map(p => (
      <div
        key={p.name}
        className="flex items-center justify-between rounded-[10px] px-3 py-2 text-[11px] font-bold"
        style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.16)' }}
      >
        <span className="font-mono text-text">{p.name}</span>
        <span className="text-text2">{p.followers}</span>
        <span style={{ color: p.status === 'posting' ? '#FCD34D' : '#34D399' }}>● {p.status}</span>
      </div>
    ))}
  </div>
)

const RolePills = () => (
  <div className="mt-2 flex flex-wrap gap-2">
    {[
      { role: 'admin',  bg: 'rgba(96,165,250,0.16)',  bd: 'rgba(96,165,250,0.4)',  fg: '#93C5FD' },
      { role: 'membre', bg: 'rgba(129,140,248,0.14)', bd: 'rgba(129,140,248,0.35)', fg: '#A5B4FC' },
      { role: 'viewer', bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.12)', fg: 'rgba(226,232,240,0.75)' },
    ].map(r => (
      <span key={r.role} className="rounded-full px-3.5 py-1.5 text-[11px] font-extrabold" style={{ background: r.bg, border: `1px solid ${r.bd}`, color: r.fg }}>
        {r.role}
      </span>
    ))}
  </div>
)

const CreditBalance = () => (
  <div
    className="flex items-baseline gap-3 rounded-2xl px-6 py-4.5"
    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}
  >
    <span className="text-xs font-bold text-text2">Solde partagé</span>
    <span className="font-display text-[26px] font-bold text-[#FCD34D]">2 480</span>
  </div>
)

const FEATURES: Feature[] = [
  {
    title: 'Mass Posting', accent: '#A855F7', titleColor: '#E9D5FF', span: 'lg:col-span-2', tinted: true,
    text: 'Publie simultanément sur des dizaines de comptes Instagram ET TikTok. Chaque phone se libère dès que sa publication est terminée.',
    preview: <PhonePills />,
  },
  {
    title: 'Programmation', accent: '#22D3EE', titleColor: '#A5F3FC',
    text: "Calendrier visuel, files d'attente par compte, fuseaux horaires et créneaux récurrents.",
    preview: <MiniCalendar />,
  },
  {
    title: 'Captions IA', accent: '#818CF8', titleColor: '#C7D2FE',
    text: 'Génère captions, hashtags et idées de contenu. Propulsé par Claude & Groq.',
    preview: <CaptionSample />,
  },
  {
    title: 'Remix & Repurpose vidéo', accent: '#EC4899', titleColor: '#FBCFE8', span: 'lg:col-span-2', tinted: true,
    text: 'Mixe, recoupe et réinvente tes vidéos. Sous-titres, watermarks et préréglages pour produire en masse.',
    preview: <RatioPreview />,
  },
  {
    title: 'Auto-Warmup', accent: '#FB923C', titleColor: '#FED7AA',
    text: 'Chauffe tes nouveaux comptes automatiquement : likes, follows à rythme humain. Routines configurables.',
    preview: <WarmupGauges />,
  },
  {
    title: 'Cloud Phones GeeLark', accent: '#34D399', titleColor: '#A7F3D0',
    text: 'Pilote tes cloud phones depuis un seul dashboard. Statut en temps réel, IP et sessions isolées.',
    preview: <PhoneStatus />,
  },
  {
    title: "Collaboration d'équipe", accent: '#60A5FA', titleColor: '#BFDBFE',
    text: 'Invite ton organisation, attribue des rôles (admin, membre, viewer) et restreins les accès.',
    preview: <RolePills />,
  },
  {
    title: 'Crédits à la demande', accent: '#FBBF24', titleColor: '#FDE68A', span: 'lg:col-span-2', tinted: true, horizontal: true,
    text: "Un solde unique pour l'IA et les automatisations. Recharge à la demande, partagé par organisation.",
    preview: <CreditBalance />,
  },
]

export function Features() {
  const ref = useReveal<HTMLElement>()

  return (
    <section id="features" className="relative z-[1] mx-auto max-w-[1140px] px-6 pt-[110px] pb-15" ref={ref}>
      <div className="reveal mx-auto max-w-[660px] text-center">
        <span className="section-label">Tout pour scaler</span>
        <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-[46px]">
          Une seule app, <span className="gradient-text-warm">tout dedans.</span>
        </h2>
        <p className="mx-auto mt-4.5 text-base leading-relaxed text-text2">
          Fini de jongler entre dix outils. ScaleFlow réunit publication, automatisation et production de contenu
          pour faire grandir ton empire Instagram &amp; TikTok.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <article
            key={f.title}
            className={`reveal group flex rounded-[20px] p-7 ${f.span ?? ''} ${f.horizontal ? 'items-center gap-7' : 'flex-col gap-3'}`}
            style={{
              transitionDelay: `${(i % 3) * 0.08}s`,
              background: f.tinted
                ? `linear-gradient(160deg, ${f.accent}17, rgba(255,255,255,0.02))`
                : 'rgba(255,255,255,0.025)',
              border: `1px solid ${f.tinted ? `${f.accent}40` : 'rgba(255,255,255,0.09)'}`,
              transition: 'transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease, opacity 0.7s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div className={f.horizontal ? 'flex flex-1 flex-col gap-3' : 'contents'}>
              <h3 className="font-display text-lg font-bold" style={{ color: f.titleColor }}>{f.title}</h3>
              <p className="text-sm leading-relaxed text-text2">{f.text}</p>
            </div>
            {f.preview && (f.horizontal ? f.preview : <div className="mt-auto">{f.preview}</div>)}
          </article>
        ))}
      </div>
    </section>
  )
}
