// Studio vidéo : accueil (Auto-contenu expliqué en tête, tous les outils de création issus de lib/tools.ts)
// + espace de travail par outil (components/studio/Workspace). Tout tourne sur l'ordinateur
// (ffmpeg.wasm), aucun crédit. Les résultats de la session restent quand on change d'outil.
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { takeOpenArg, openTool } from '@/lib/openTool'
import { TOOLS } from '@/lib/tools'
import { Icon, useNarrow } from '@/lib/ui'
import { curated } from '@/lib/curated'
import { usePhotos, pickerFor, ToolCard, SectionHead } from '@/pages/Explore'
import { SPOT_KEYFRAMES } from '@/components/LaunchSpotlight'
import { PageHeader, UnderlineTabs } from '@/components/Kit'
import { Workspace } from '@/components/studio/Workspace'
import { Results, type StudioResult } from '@/components/studio/Results'
import type { StudioToolId } from '@/components/studio/Preview'

// Outils du Studio (ordre d'affichage) — libellés, icônes et couleurs viennent de lib/tools.ts.
const IDS: StudioToolId[] = ['remix', 'spoof', 'mixer', 'subs', 'overlay', 'montage', 'imgspoof']
const STUDIO = IDS.map(id => TOOLS.find(t => t.id === id)!).filter(Boolean)
const isStudioTool = (k: unknown): k is StudioToolId => typeof k === 'string' && (IDS as string[]).includes(k)

// ── Auto-contenu expliqué : texte en 3 étapes + visuel « ta vidéo → 3 comptes, 3 textes » ──
const AUTO_TEXTS: { t: string; style: 'snap' | 'outline' }[] = [
  { t: 'POV : tu restes jusqu’à la fin 👀', style: 'snap' },
  { t: 'Attends la fin…', style: 'outline' },
  { t: 'Personne ne parle de ça 🤫', style: 'snap' },
]
const AUTO_CSS = `
  @keyframes acFloat{0%,100%{translate:0 0}50%{translate:0 -7px}}
  @keyframes acIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion: reduce){.sf-ac *{animation:none!important}}
`
function Phone({ img, w, text, style, label, filter, pos, rot = 0, delay = 0 }: { img: string; w: number; text?: string; style?: 'snap' | 'outline'; label: string; filter?: string; pos?: string; rot?: number; delay?: number }) {
  return (
    <span style={{ position: 'relative', display: 'block', flexShrink: 0, width: w, aspectRatio: '9 / 16', borderRadius: Math.round(w / 7), overflow: 'hidden', background: '#141416', border: '2px solid rgba(255,255,255,0.16)', boxShadow: '0 30px 60px -24px rgba(0,0,0,.95)', transform: `rotate(${rot}deg)`, animation: `acIn .6s ${delay}s cubic-bezier(.2,.8,.2,1) both` }}>
      <span style={{ position: 'absolute', inset: 0, animation: `acFloat ${5 + delay * 4}s ease-in-out ${-delay * 3}s infinite` }}>
        <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos ?? 'center 30%', filter }} />
      </span>
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35), transparent 22%, transparent 70%, rgba(0,0,0,.35))' }} />
      <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 99, background: text ? 'rgba(10,10,11,.7)' : '#F4F4F5', color: text ? '#fff' : '#0A0A0B', fontSize: Math.max(9.5, w / 13), fontWeight: 800, backdropFilter: 'blur(6px)', whiteSpace: 'nowrap' }}>{label}</span>
      {text && (style === 'snap'
        ? <span style={{ position: 'absolute', left: 0, right: 0, top: '60%', padding: `${Math.round(w / 28)}px ${Math.round(w / 14)}px`, background: 'rgba(40,40,40,0.62)', color: '#fff', fontSize: Math.max(9.5, w / 11.5), fontWeight: 500, lineHeight: 1.25, textAlign: 'center', fontFamily: 'Helvetica, Arial, sans-serif' }}>{text}</span>
        : <span style={{ position: 'absolute', left: 6, right: 6, top: '64%', color: '#fff', fontSize: Math.max(11, w / 9), fontWeight: 900, lineHeight: 1.15, textAlign: 'center', WebkitTextStroke: '0.5px #000', textShadow: '0 1px 0 #000, 0 0 3px #000, 0 2px 8px rgba(0,0,0,.8)', fontFamily: 'system-ui, Arial, sans-serif' }}>{text}</span>)}
    </span>
  )
}
function AutoContentHero({ narrow, onOpen }: { narrow: boolean; onOpen: () => void }) {
  const [h, setH] = useState(false)
  const img = curated(9)
  const W = narrow ? 84 : 118
  const steps = ['Choisis une ou plusieurs vidéos.', 'Écris tes textes, un par ligne.', 'Génère : chaque variante reçoit un texte différent, plus une coupe, une vitesse et des métadonnées uniques.']
  return (
    <section className="sf-ac" role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.1fr)', alignItems: 'center', gap: narrow ? 24 : 28, padding: narrow ? '26px 18px' : '36px 40px', marginBottom: 40, borderRadius: 26, cursor: 'pointer', outline: 'none',
        background: '#0B0B0D', border: `1px solid ${h ? 'rgba(196,181,253,0.45)' : 'rgba(255,255,255,0.08)'}`, transform: h ? 'translateY(-2px)' : 'none', boxShadow: h ? '0 30px 70px -36px rgba(139,92,246,.7)' : 'none', transition: 'transform .3s cubic-bezier(.2,.8,.2,1), border-color .3s ease, box-shadow .3s ease' }}>
      <style>{AUTO_CSS}</style>
      <span style={{ position: 'absolute', zIndex: -1, left: '-10%', top: '-50%', width: '60%', height: '200%', borderRadius: 999, background: 'radial-gradient(circle, rgba(139,92,246,0.32), transparent 62%)', filter: 'blur(10px)' }} />
      <span style={{ position: 'absolute', zIndex: -1, right: '-8%', bottom: '-60%', width: '55%', height: '200%', borderRadius: 999, background: 'radial-gradient(circle, rgba(236,72,153,0.22), transparent 62%)', filter: 'blur(10px)' }} />
      {/* Texte */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', height: 26, padding: '0 11px', borderRadius: 99, background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '.02em', boxShadow: '0 8px 20px -8px rgba(236,72,153,.8)' }}>✦ Recommandé · gratuit</span>
        <div>
          <h2 style={{ margin: 0, fontSize: narrow ? 32 : 44, fontWeight: 850, letterSpacing: '-0.045em', lineHeight: 1, color: '#F4F4F5' }}>Auto-contenu</h2>
          <p style={{ margin: '10px 0 0', fontSize: narrow ? 16 : 18, lineHeight: 1.45, color: '#D4D4D8', maxWidth: 480 }}>Une vidéo → des dizaines de vidéos uniques, <b style={{ color: '#fff' }}>chacune avec son propre texte</b>.</p>
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((st, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0, borderRadius: 99, background: 'rgba(167,139,250,0.14)', border: '1px solid rgba(167,139,250,0.35)', color: '#DDD6FE', fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: '#A1A1AA', paddingTop: 2 }}>{st}</span>
            </li>
          ))}
        </ol>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', borderRadius: 13, background: '#F4F4F5', color: '#0A0A0B', fontSize: 14.5, fontWeight: 800 }}>Lancer l’Auto-contenu<Icon d="M5 12h14|M13 6l6 6-6 6" size={15} sw={2.4} /></span>
          <span style={{ fontSize: 12.5, color: '#71717A' }}>Gratuit · sur ton ordinateur</span>
        </span>
      </div>
      {/* Visuel : ta vidéo → 3 comptes, 3 textes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: narrow ? 8 : 16, minWidth: 0 }}>
        {!narrow && <Phone img={img} w={Math.round(W * 0.9)} label="Ta vidéo" />}
        {!narrow && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flexShrink: 0, borderRadius: 99, background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', color: '#fff', boxShadow: '0 10px 24px -10px rgba(236,72,153,.9)' }}><Icon d="M5 12h14|M13 6l6 6-6 6" size={16} sw={2.6} /></span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: narrow ? 6 : 10 }}>
          {AUTO_TEXTS.map((x, i) => (
            <span key={i} style={{ position: 'relative', display: 'block', zIndex: i === 1 ? 3 : 2, marginTop: i === 1 ? 0 : narrow ? 12 : 20 }}>
              <Phone img={img} w={W} text={x.t} style={x.style} label={`Compte ${i + 1}`} rot={(i - 1) * 3} delay={0.1 + i * 0.12}
                pos={['center 22%', 'center 34%', 'center 28%'][i]} filter={['saturate(1.12) brightness(1.03)', 'none', 'contrast(1.06) hue-rotate(-6deg)'][i]} />
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Studio({ theme, user, org, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onNavigate?: (p: string) => void
}) {
  const narrow = useNarrow(760)
  const photos = usePhotos(user, org)
  const [openArg] = useState(() => takeOpenArg<{ tool?: string; ids?: string[] }>('studio'))
  const [tool, setTool] = useState<StudioToolId | null>(() => isStudioTool(openArg?.tool) ? openArg!.tool as StudioToolId : null)
  const [results, setResults] = useState<StudioResult[]>([])
  // Les fichiers générés restent jusqu'à la sortie du Studio ; on libère alors la mémoire.
  const live = useRef(results); live.current = results
  useEffect(() => () => { live.current.forEach(r => URL.revokeObjectURL(r.url)) }, [])
  const top = () => { try { document.querySelector('main')?.scrollTo?.({ top: 0 }) } catch { /* ignore */ } }
  const go = (k: StudioToolId) => { setTool(k); top() }

  if (!tool) {
    const extras = TOOLS.filter(t => t.id === 'autocontent')
    const auto = extras[0]
    return (
      <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
        <style>{SPOT_KEYFRAMES}</style>
        <PageHeader kicker={`${STUDIO.length + (onNavigate ? 1 : 0)} outils · gratuits`} title="Studio vidéo" sub="Rends chaque vidéo unique, ajoute du texte, une photo, des sous-titres, coupe et assemble. Tout tourne sur ton ordinateur, aucun crédit." />
        {/* Auto-contenu expliqué : 1 vidéo → plusieurs variantes, chacune avec son texte */}
        {auto && onNavigate && <AutoContentHero narrow={narrow} onOpen={() => openTool(onNavigate, auto.page, auto.arg, auto.id)} />}
        <SectionHead title="Tous les outils" count={STUDIO.length + (onNavigate ? extras.length : 0)} />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${narrow ? 200 : 250}px, 100%), 1fr))`, gap: narrow ? '22px 12px' : '28px 18px' }}>
          {onNavigate && extras.map((t, i) => <ToolCard key={t.id} t={t} i={i} pick={pickerFor(t, 11 + i, photos)} fav={false} onOpen={() => openTool(onNavigate, t.page, t.arg, t.id)} />)}
          {STUDIO.map((t, i) => <ToolCard key={t.id} t={t} i={i + 1} pick={pickerFor(t, i + 3, photos)} fav={false} onOpen={() => go(t.id as StudioToolId)} />)}
        </div>
        <Results results={results} onClear={() => { results.forEach(r => URL.revokeObjectURL(r.url)); setResults([]) }}
          onBank={onNavigate ? () => openTool(onNavigate, 'bank', { tab: 'video' }) : undefined} onPublish={onNavigate ? () => openTool(onNavigate, 'publish', { mode: 'reels' }) : undefined} />
      </div>
    )
  }

  const T = STUDIO.find(t => t.id === tool)!
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <UnderlineTabs back={{ label: 'Studio', onClick: () => { setTool(null); top() } }} items={STUDIO.map(t => ({ k: t.id as StudioToolId, l: t.label, icon: t.icon }))} value={tool} onChange={go} />
      <Workspace key="ws" theme={theme} user={user} org={org} tool={tool} label={T.label} desc={T.desc} icon={T.icon} a={T.a} b={T.b}
        onNavigate={onNavigate} initialIds={openArg?.ids} addResult={r => setResults(rs => [r, ...rs])} />
      <Results results={results} onClear={() => { results.forEach(r => URL.revokeObjectURL(r.url)); setResults([]) }}
        onBank={onNavigate ? () => openTool(onNavigate, 'bank', { tab: tool === 'imgspoof' ? 'image' : 'video' }) : undefined}
        onPublish={onNavigate ? () => openTool(onNavigate, 'publish', { mode: 'reels' }) : undefined} />
    </div>
  )
}
