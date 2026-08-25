import { useEffect, useState } from 'react'
import { AppMockup } from './AppMockup'
import { StatCounter } from './StatCounter'
import { IconArrowRight, IconDownload, IconCheck } from './Icons'
import { APP_URL, WINDOWS_URL, MAC_URL } from '../lib/links'

function useIsMac() {
  const [mac, setMac] = useState(false)
  useEffect(() => {
    const p = (navigator.platform || navigator.userAgent || '').toLowerCase()
    setMac(p.includes('mac'))
  }, [])
  return mac
}

const REASSURANCE = ['Sans carte bancaire', 'Windows, Mac & Web', 'Setup en < 5 min']

export function Hero() {
  const isMac = useIsMac()
  const dlUrl   = isMac ? MAC_URL : WINDOWS_URL
  const dlLabel = isMac ? 'Télécharger pour Mac' : 'Télécharger pour Windows'

  return (
    <section id="top" className="relative z-[1] mx-auto max-w-[1140px] px-6 pt-20 pb-[72px] text-center">
      <div className="flex justify-center">
        <span className="eyebrow animate-fade-in !px-4 !py-2 !text-[12.5px] !font-bold">
          <span className="animate-pulse-dot h-[7px] w-[7px] rounded-full bg-emerald" />
          Automatisation Instagram &amp; TikTok multi-comptes
        </span>
      </div>

      <h1
        className="animate-fade-up mx-auto mt-8 max-w-[920px] font-display text-[2.7rem] font-bold leading-[1.02] tracking-[-0.03em] text-text sm:text-6xl lg:text-[76px]"
        style={{ animationDelay: '0.08s' }}
      >
        Publie sur{' '}
        <span
          className="animate-shine"
          style={{
            background: 'linear-gradient(90deg,#22D3EE,#67E8F9,#22D3EE)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          100+ comptes
        </span>
        <br className="hidden sm:block" /> en{' '}
        <span
          className="animate-shine"
          style={{
            background: 'linear-gradient(90deg,#818CF8,#C084FC,#EC4899)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          un seul clic
        </span>.
      </h1>

      <p className="animate-fade-up mx-auto mt-7 max-w-[600px] text-base leading-relaxed text-text2 sm:text-lg" style={{ animationDelay: '0.18s' }}>
        Mass posting, programmation, warmup et remix vidéo réunis dans{' '}
        <strong className="font-bold text-text">un seul poste de pilotage</strong>. Ce qui te prenait la semaine se fait en 5 minutes.
      </p>

      <div className="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-3.5" style={{ animationDelay: '0.28s' }}>
        <a href={APP_URL} target="_blank" rel="noreferrer" className="btn-primary !px-8 !py-4 !text-[15px] !font-extrabold">
          Commencer gratuitement <IconArrowRight width={17} height={17} strokeWidth={2.3} />
        </a>
        <a href={dlUrl} className="btn-secondary !px-8 !py-4 !text-[15px] !font-bold">
          <IconDownload width={17} height={17} /> {dlLabel}
        </a>
      </div>

      <div className="animate-fade-up mt-5.5 flex flex-wrap items-center justify-center gap-x-[22px] gap-y-2 text-[13px] font-semibold text-text2" style={{ animationDelay: '0.34s' }}>
        {REASSURANCE.map(r => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <IconCheck width={13} height={13} strokeWidth={2.8} className="text-[#5EEAD4]" /> {r}
          </span>
        ))}
      </div>

      <div className="animate-fade-up mx-auto mt-14 grid max-w-[680px] grid-cols-1 gap-3.5 sm:grid-cols-3" style={{ animationDelay: '0.5s' }}>
        <StatCounter target={100} suffix="+" label="comptes en parallèle" />
        <StatCounter target={1_000_000} suffix="+" label="posts publiés" compact />
        <StatCounter target={15} suffix="h" label="gagnées / semaine" />
      </div>

      <div className="animate-fade-up mt-18" style={{ animationDelay: '0.6s' }}>
        <AppMockup />
      </div>
    </section>
  )
}
