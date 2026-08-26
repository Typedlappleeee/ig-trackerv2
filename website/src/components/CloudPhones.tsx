import { useState } from 'react'
import { LogoMark } from './Logo'

const PERKS = [
  { icon: '⚡', title: 'Démarrage instantané', rgb: '34,211,238',  grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)',
    text: 'Un appareil prêt en quelques secondes, pas en minutes. Ta diffusion part sans attendre le boot.' },
  { icon: '∞', title: 'Aucune limite', rgb: '139,92,246', grad: 'linear-gradient(135deg,#8B5CF6,#6366F1)',
    text: "Autant d'appareils que ton serveur peut en tenir. Plus de quota imposé par un tiers." },
  { icon: '🔒', title: 'Chez toi', rgb: '52,211,153', grad: 'linear-gradient(135deg,#10B981,#059669)',
    text: "Tes sessions, tes proxies, tes données. L'agent tourne sur ton propre serveur." },
]

/** Section « Nos Cloud Phones arrivent » — téléphone en lévitation + waitlist. */
export function CloudPhones() {
  const [joined, setJoined] = useState(false)
  const [wait, setWait] = useState(8)

  return (
    <section
      id="cloud"
      className="relative z-[1] mt-25 overflow-hidden border-y border-cyan/[0.18] px-8 pb-30 pt-[110px]"
      style={{
        background:
          'radial-gradient(ellipse 90% 100% at 50% 0%, rgba(34,211,238,0.07), transparent 70%), #05050C',
      }}
    >
      {/* grille + ondes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.7) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 70% 80% at 50% 40%, #000 10%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 50% 40%, #000 10%, transparent 70%)',
        }}
      />
      {[0, -1.3, -2.6].map((d, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="animate-sf-ring absolute left-1/2 top-1/2 -ml-[260px] -mt-[260px] h-[520px] w-[520px] rounded-full"
          style={{ border: `1px solid rgba(${['34,211,238', '129,140,248', '168,85,247'][i]},0.28)`, animationDelay: `${d}s` }}
        />
      ))}

      <div className="relative mx-auto max-w-[1000px] text-center">
        <div data-reveal className="inline-flex items-center gap-2.5 rounded-full border border-cyan/40 bg-cyan/[0.08] py-2 pl-4 pr-2.5">
          <span className="animate-pulse-dot h-[7px] w-[7px] rounded-full bg-cyan" />
          <span className="text-[12.5px] font-extrabold tracking-[0.06em] text-[#67E8F9]">EN CONSTRUCTION</span>
          <span className="rounded-full bg-cyan/[0.18] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.1em] text-[#A5F3FC]">Q4 2026</span>
        </div>

        <h2 data-reveal className="mx-auto mt-7 max-w-[840px] font-display text-[2.6rem] font-bold leading-none tracking-[-0.045em] text-text sm:text-[64px]">
          Nos propres{' '}
          <span style={{ background: 'linear-gradient(94deg,#22D3EE,#67E8F9 40%,#818CF8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Cloud Phones
          </span>{' '}
          arrivent.
        </h2>

        <p data-reveal className="mx-auto mt-6.5 max-w-[620px] text-[17.5px] leading-[1.7] text-text2">
          Fini de payer GeeLark. ScaleFlow héberge ses propres appareils Android : tu crées un phone en un clic,
          il démarre en quelques secondes, et tu n'as plus aucune limite de comptes.
        </p>

        {/* Téléphone en lévitation */}
        <div data-reveal className="relative mt-15 flex justify-center">
          <div aria-hidden="true" className="animate-sf-glow absolute left-1/2 top-1/2 -ml-[320px] -mt-[170px] h-[340px] w-[640px] rounded-full blur-[90px]" style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.3), transparent 70%)' }} />
          <div aria-hidden="true" className="animate-sf-beam absolute -bottom-7 left-1/2 -ml-[150px] h-9 w-[300px] rounded-full bg-cyan/[0.28] blur-[28px]" />

          <div data-zoom className="animate-float-slow relative w-[268px] will-change-transform">
            <div
              className="relative rounded-[42px] p-[11px]"
              style={{
                background: 'linear-gradient(160deg, rgba(34,211,238,0.55), rgba(129,140,248,0.35) 45%, rgba(6,6,14,0.9))',
                boxShadow: '0 60px 120px -40px rgba(34,211,238,0.45), 0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 0 rgba(255,255,255,0.22)',
              }}
            >
              <div className="relative flex aspect-[9/19] flex-col overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#07070F]">
                <span aria-hidden="true" className="absolute left-1/2 top-[11px] z-[2] -ml-[30px] h-1.5 w-[60px] rounded-full bg-white/[0.14]" />
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2]" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, transparent 34%, transparent 66%, rgba(255,255,255,0.05) 100%)' }} />
                <span aria-hidden="true" className="animate-sf-scan absolute inset-x-0 z-[1] h-[120px]" style={{ background: 'linear-gradient(180deg, transparent, rgba(34,211,238,0.10), transparent)' }} />

                <div className="flex items-center justify-between px-4.5 pt-6.5 font-mono text-[9.5px] font-bold text-text2">
                  <span>09:41</span>
                  <span className="flex items-center gap-1.5"><span className="text-emerald">●</span>4G ▮▮▮</span>
                </div>

                <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4.5 pt-5">
                  <div className="flex items-center gap-2.5">
                    <LogoMark size={28} />
                    <span className="flex flex-col gap-px text-left">
                      <span className="font-display text-[11.5px] font-bold text-text">sf-cloud-07</span>
                      <span className="text-[9px] font-bold text-emerald">● démarré · Android 14</span>
                    </span>
                  </div>

                  <div className="rounded-xl border border-cyan/25 bg-cyan/[0.07] p-2.5 text-left">
                    <div className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-muted">Tâche en cours</div>
                    <div className="mt-1.5 text-[11px] font-bold text-[#E7E0F5]">Publication Reels</div>
                    <div className="mt-2 h-1 rounded-full bg-white/[0.08]">
                      <div className="h-full w-[68%] rounded-full" style={{ background: 'linear-gradient(90deg,#22D3EE,#818CF8)' }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[['Proxy', 'FR-07', '#67E8F9'], ['Boot', '3,2 s', '#34D399']].map(([k, v, c]) => (
                      <div key={k} className="rounded-[11px] border border-white/[0.07] bg-white/[0.03] p-2.5 text-left">
                        <div className="text-[8px] font-extrabold uppercase tracking-[0.08em] text-muted">{k}</div>
                        <div className="mt-1 font-mono text-[9.5px] font-bold" style={{ color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto flex flex-col gap-1.5 rounded-[11px] border border-white/[0.06] bg-black/35 p-2.5 text-left font-mono text-[8.5px] leading-normal text-text2">
                    <span>adb · connected</span>
                    <span>ig · session ok</span>
                    <span className="text-emerald">upload · 34 / 52</span>
                  </div>
                </div>
              </div>
            </div>

            {/* badges flottants */}
            {[
              { pos: 'top-[52px] -left-[118px]', delay: '0s',  icon: '⚡', v: '3,2 s',      l: 'au démarrage',        c: '#67E8F9', b: 'rgba(34,211,238,0.35)' },
              { pos: 'bottom-24 -right-[124px]', delay: '-2s', icon: '∞', v: 'Illimité',   l: 'appareils / serveur', c: '#C4B5FD', b: 'rgba(139,92,246,0.35)' },
              { pos: 'top-[196px] -right-[108px]', delay: '-4s', icon: '🔒', v: 'Tes données', l: 'sur ton serveur',  c: '#A7F3D0', b: 'rgba(52,211,153,0.35)' },
            ].map(bd => (
              <div
                key={bd.v}
                className={`animate-float-slow absolute ${bd.pos} flex items-center gap-2.5 rounded-[14px] bg-[rgba(10,10,26,0.95)] px-4 py-2.5 backdrop-blur-md`}
                style={{ border: `1px solid ${bd.b}`, boxShadow: '0 20px 50px -18px rgba(0,0,0,0.8)', animationDelay: bd.delay }}
              >
                <span className="text-sm">{bd.icon}</span>
                <span className="flex flex-col gap-px text-left">
                  <span className="font-display text-sm font-bold" style={{ color: bd.c }}>{bd.v}</span>
                  <span className="text-[9.5px] font-bold text-muted">{bd.l}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Arguments */}
        <div data-stagger className="mt-[70px] grid grid-cols-1 gap-4 text-left md:grid-cols-3">
          {PERKS.map(p => (
            <div
              key={p.title}
              data-reveal
              className="rounded-[20px] p-6.5"
              style={{ background: `linear-gradient(160deg, rgba(${p.rgb},0.09), rgba(255,255,255,0.015))`, border: `1px solid rgba(${p.rgb},0.28)` }}
            >
              <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px] text-[19px]" style={{ background: p.grad }}>{p.icon}</span>
              <h3 className="mt-4 font-display text-[17px] font-bold text-text">{p.title}</h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-text2">{p.text}</p>
            </div>
          ))}
        </div>

        {/* Waitlist */}
        <div data-reveal className="mt-9 flex flex-col items-center gap-3.5">
          {joined ? (
            <span className="animate-fade-in inline-flex items-center gap-2.5 rounded-full border border-emerald/40 bg-emerald/[0.12] px-9 py-4.5 text-[15.5px] font-extrabold text-emerald">
              ✓ Tu es sur la liste — on te prévient au lancement
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { setJoined(true); setWait(w => w + 1) }}
              className="relative cursor-pointer overflow-hidden rounded-full border-none px-9 py-4.5 text-[15.5px] font-extrabold text-[#04141A] transition-transform duration-200 hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#22D3EE,#67E8F9,#818CF8)', boxShadow: '0 0 52px -10px rgba(34,211,238,0.85)' }}
            >
              Rejoindre la liste d'attente
              <span aria-hidden="true" className="animate-sf-sweep absolute inset-y-0 w-11" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)' }} />
            </button>
          )}
          <span className="text-[12.5px] font-semibold text-muted">{wait} agences déjà inscrites · accès prioritaire</span>
          <span className="text-[11.5px] font-semibold text-muted/70">Les premières inscrites testent avant tout le monde.</span>
        </div>
      </div>
    </section>
  )
}
