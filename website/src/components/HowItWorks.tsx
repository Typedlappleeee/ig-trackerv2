import { useReveal } from '../hooks/useReveal'

const STEPS = [
  { n: '01', grad: 'linear-gradient(90deg,#22D3EE,#818CF8)', title: 'Connecte ton GeeLark',
    text: 'Colle ton bearer token, ScaleFlow détecte tous tes cloud phones et leurs comptes en quelques secondes.' },
  { n: '02', grad: 'linear-gradient(90deg,#818CF8,#C084FC)', title: 'Charge tes vidéos',
    text: "Importe ta banque de contenu, remixe-la si besoin, et laisse l'IA générer captions et hashtags." },
  { n: '03', grad: 'linear-gradient(90deg,#C084FC,#EC4899)', title: 'Lance la diffusion',
    text: 'Un clic, et tes posts partent en parallèle sur tous tes comptes Instagram & TikTok. Suis tout en temps réel.' },
]

export function HowItWorks() {
  const ref = useReveal<HTMLElement>()
  return (
    <section id="how" className="relative z-[1] mx-auto max-w-[1140px] px-6 pt-15 pb-[110px]" ref={ref}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="reveal rounded-[20px] border border-white/[0.09] bg-white/[0.025] p-6.5"
            style={{ transitionDelay: `${i * 0.08}s` }}
          >
            <div
              className="font-display text-sm font-bold"
              style={{ background: s.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              {s.n}
            </div>
            <h3 className="mt-3 font-display text-[17px] font-bold text-text">{s.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-text2">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
