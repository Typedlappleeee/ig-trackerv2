import { IconDownload, IconArrowRight, IconCheck } from './Icons'
import { AppMockup } from './AppMockup'

const WINDOWS_URL =
  'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow-Setup.exe'
const MAC_URL =
  'https://github.com/typedlappleeee/ig-trackerv2/releases/latest/download/ScaleFlow.dmg'
const RELEASES_URL = 'https://github.com/typedlappleeee/ig-trackerv2/releases'

const STATS = [
  { value: '100+', label: 'comptes pilotés en parallèle' },
  { value: '1M+', label: 'posts publiés' },
  { value: '24/7', label: 'support inclus' },
]

const REASSURANCE = [
  'Mac & Windows',
  'Version web sans installation',
  'Aucune carte requise pour tester',
]

export function Hero() {
  return (
    <section className="relative px-5 pt-36 pb-20 sm:pt-40">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-pulse-dot" />
            Automatisation Instagram multi-comptes
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] text-text sm:text-6xl">
            Pilote ton Instagram
            <br className="hidden sm:block" />{' '}
            <span className="gradient-text">à grande échelle.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-text2 sm:text-lg">
            Mass posting, programmation, warmup, IA et remix vidéo réunis dans un seul poste de
            pilotage. La seule app pensée pour gérer{' '}
            <span className="font-semibold text-text">des centaines de comptes</span> sans
            t'éparpiller.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={WINDOWS_URL} className="btn-primary w-full sm:w-auto">
              <IconDownload width={18} height={18} />
              Télécharger gratuitement
            </a>
            <a href="#features" className="btn-secondary w-full sm:w-auto">
              Voir les fonctionnalités
              <IconArrowRight width={18} height={18} />
            </a>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-text2">
            <a href={MAC_URL} className="cursor-pointer underline-offset-2 transition-colors duration-200 hover:text-text hover:underline">
              Version Mac (.dmg)
            </a>
            <span className="text-muted">·</span>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer underline-offset-2 transition-colors duration-200 hover:text-text hover:underline"
            >
              Toutes les versions
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-text2">
            {REASSURANCE.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <IconCheck width={15} height={15} className="text-cyan" />
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Trust stats */}
        <div className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-3">
          {STATS.map((s) => (
            <div key={s.label} className="glass rounded-2xl px-3 py-4 text-center">
              <div className="text-2xl font-extrabold text-text sm:text-3xl">{s.value}</div>
              <div className="mt-1 text-[11px] leading-snug text-text2 sm:text-xs">{s.label}</div>
            </div>
          ))}
        </div>

        {/* App mockup */}
        <div className="relative mt-16">
          <div
            className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-48 max-w-3xl rounded-full opacity-60 blur-3xl"
            style={{
              background:
                'linear-gradient(135deg, rgba(34,211,238,.25), rgba(129,140,248,.25), rgba(168,85,247,.25))',
            }}
          />
          <AppMockup />
        </div>
      </div>
    </section>
  )
}
