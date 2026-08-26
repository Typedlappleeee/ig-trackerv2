import { useState, useEffect, useRef, useMemo, FormEvent, CSSProperties, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useTr, tr } from '@/lib/i18n'

type Tab = 'login' | 'register' | 'forgot' | 'reset'

/* ───────────────────────── Keyframes (une seule toile continue) ───────────────────────── */
const KEYFRAMES = `
@keyframes sfaGrain{0%,100%{transform:translate(0,0)}20%{transform:translate(-2%,1%)}40%{transform:translate(1%,-2%)}60%{transform:translate(-1%,2%)}80%{transform:translate(2%,-1%)}}
@keyframes sfaVeil{0%,100%{opacity:.34;transform:translate(0,0) scale(1)}50%{opacity:.8;transform:translate(2%,-2%) scale(1.1)}}
@keyframes sfaRise{from{opacity:0;transform:translateY(116%)}to{opacity:1;transform:translateY(0)}}
@keyframes sfaUp{from{opacity:0;transform:translateY(16px);filter:blur(6px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
@keyframes sfaFade{from{opacity:0}to{opacity:1}}
@keyframes sfaRule{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes sfaCard{from{opacity:0;transform:translateY(30px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes sfaShine{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes sfaBand{0%{transform:skewY(-9deg) translateX(-6%)}100%{transform:skewY(-9deg) translateX(6%)}}
@keyframes sfaBandB{0%{transform:skewY(9deg) translateX(6%)}100%{transform:skewY(9deg) translateX(-6%)}}
@keyframes sfaRigIn{from{opacity:0;transform:perspective(1700px) rotateY(21deg) rotateX(-9deg) rotateZ(3deg) translateY(54px) scale(.9)}to{opacity:1;transform:perspective(1700px) rotateY(14deg) rotateX(-5deg) rotateZ(3deg) translateY(0) scale(1)}}
@keyframes sfaRigFloat{0%,100%{transform:perspective(1700px) rotateY(14deg) rotateX(-5deg) rotateZ(3deg) translateY(0)}50%{transform:perspective(1700px) rotateY(11deg) rotateX(-4deg) rotateZ(3deg) translateY(-15px)}}
@keyframes sfaGhost{from{opacity:0;transform:translate(0,0) scale(.9)}to{opacity:1;transform:translate(var(--dx),var(--dy)) scale(var(--sc))}}
@keyframes sfaGlow{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes sfaRay{0%{opacity:0;stroke-dashoffset:1}18%{opacity:1}100%{opacity:.22;stroke-dashoffset:0}}
@keyframes sfaNode{0%{r:1.4;opacity:.3}22%{r:4.6;opacity:1}100%{r:2.6;opacity:.85}}
@keyframes sfaWave{0%{r:8;opacity:.62;stroke-width:1.6}100%{r:66;opacity:0;stroke-width:.4}}
@keyframes sfaCount{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes sfaRayLoop{0%{opacity:0;stroke-dashoffset:1}8%{opacity:1}30%{opacity:.9;stroke-dashoffset:0}72%{opacity:.24;stroke-dashoffset:0}100%{opacity:0;stroke-dashoffset:0}}
@keyframes sfaNodeLoop{0%{r:1.3;opacity:.22}10%{r:4.4;opacity:1}34%{r:2.6;opacity:.9}80%{r:2.2;opacity:.5}100%{r:1.3;opacity:.22}}
@keyframes sfaGloss{0%{transform:translateX(-130%) skewX(-16deg);opacity:0}18%{opacity:.5}42%{opacity:0}100%{transform:translateX(320%) skewX(-16deg);opacity:0}}
@keyframes sfaPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.28;transform:scale(.62)}}
@keyframes sfaSweep{0%{transform:translateX(-150%)}100%{transform:translateX(360%)}}
.sfa-narrative,.sfa-rig{display:none;}
@media (min-width:900px){.sfa-narrative{display:block;}.sfa-rig{display:block;}}
@media (prefers-reduced-motion: reduce){
  .sfa-root *{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important;}
}
`

/* ───────────────────────── Ferme d'appareils + diffusion radiale ───────────────────────── */
function DeviceFarm({ rigRef, haloRef }: {
  rigRef: React.RefObject<HTMLDivElement>
  haloRef: React.RefObject<HTMLSpanElement>
}) {
  // Diffusion radiale : trois orbites (7/12/17 nœuds) autour d'un cœur, rayons tracés
  // du centre vers chaque nœud dans l'ordre de publication, boucle 7,4 s.
  const burst = useMemo(() => {
    const RINGS = [{ n: 7, r: 26 }, { n: 12, r: 42 }, { n: 17, r: 58 }]
    const seats: { x: number; y: number; ri: number }[] = []
    RINGS.forEach((ring, ri) => {
      for (let k = 0; k < ring.n; k++) {
        const a = (-90 + (k / ring.n) * 360 + ri * 13) * Math.PI / 180
        seats.push({ x: 80 + Math.cos(a) * ring.r, y: 80 + Math.sin(a) * ring.r, ri })
      }
    })
    const order = seats.map((_, i) => (i * 11 + 5) % seats.length)
    const CYCLE = 7.4
    const rays: ReactNode[] = []
    const nodes: ReactNode[] = []
    seats.forEach((s2, i) => {
      const rank = order.indexOf(i)
      const delay = 2.5 + rank * 0.07
      rays.push(
        <line key={'r' + i} x1={80} y1={80} x2={+s2.x.toFixed(1)} y2={+s2.y.toFixed(1)}
          stroke={s2.ri === 2 ? '#67E8F9' : '#C084FC'} strokeWidth={0.65}
          strokeOpacity={0} pathLength={1} strokeDasharray={1} strokeDashoffset={1}
          style={{ animation: `sfaRay 1.5s cubic-bezier(0.3,0,0.2,1) ${delay.toFixed(2)}s forwards, sfaRayLoop ${CYCLE}s cubic-bezier(0.3,0,0.2,1) ${(delay + 2.1).toFixed(2)}s infinite` }} />
      )
      nodes.push(
        <circle key={'n' + i} cx={+s2.x.toFixed(1)} cy={+s2.y.toFixed(1)} r={1.4}
          fill={s2.ri === 2 ? '#A5F3FC' : s2.ri === 1 ? '#E9D5FF' : '#fff'} opacity={0.3}
          style={{ animation: `sfaNode 1.4s cubic-bezier(0.16,1,0.3,1) ${(delay + 0.18).toFixed(2)}s forwards, sfaNodeLoop ${CYCLE}s cubic-bezier(0.16,1,0.3,1) ${(delay + 2.28).toFixed(2)}s infinite` }} />
      )
    })
    return (
      <svg viewBox="0 0 160 160" width="100%" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id="sfaCore">
            <stop offset="0%" stopColor="#E9D5FF" stopOpacity={0.65} />
            <stop offset="100%" stopColor="#A855F7" stopOpacity={0} />
          </radialGradient>
        </defs>
        {RINGS.map((ring, i) => (
          <circle key={'o' + i} cx={80} cy={80} r={ring.r} fill="none" stroke="#fff" strokeOpacity={0.05} strokeDasharray="1 4" />
        ))}
        <circle cx={80} cy={80} r={34} fill="url(#sfaCore)" style={{ animation: 'sfaGlow 5s ease-in-out 3s infinite' }} />
        <g>{rays}</g>
        <g>{nodes}</g>
        {[0, 1.6, 3.2].map((d, i) => (
          <circle key={'w' + i} cx={80} cy={80} r={8} fill="none" stroke="#C4B5FD" strokeWidth={1.6} strokeOpacity={0}
            style={{ animation: `sfaWave 4.8s cubic-bezier(0.2,0.6,0.3,1) ${(3 + d).toFixed(1)}s infinite` }} />
        ))}
        <circle cx={80} cy={80} r={9.5} fill="#0D0A1C" stroke="#C084FC" strokeWidth={1.1} />
        <path d="M77 75.5 L84.5 80 L77 84.5 Z" fill="#E9D5FF" />
      </svg>
    )
  }, [])

  const screenChrome = (main: boolean): ReactNode => (
    <div style={{
      position: 'relative', borderRadius: 'clamp(17px,1.8vw,25px)', overflow: 'hidden',
      background: main ? 'linear-gradient(172deg,#120c26,#080611)' : 'rgba(11,8,22,0.94)',
      border: '1px solid rgba(255,255,255,0.06)', aspectRatio: '9 / 19',
      display: 'flex', flexDirection: 'column',
    }}>
      {main && <>
        <span style={{ position: 'absolute', top: 8, left: '50%', marginLeft: -18, width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.12)', zIndex: 4 }} />
        <span style={{ position: 'absolute', inset: 0, zIndex: 4, background: 'linear-gradient(116deg, rgba(255,255,255,0.1) 0%, transparent 30%, transparent 68%, rgba(255,255,255,0.05) 100%)' }} />
        <span style={{ position: 'absolute', top: '-12%', bottom: '-12%', width: '38%', zIndex: 5, pointerEvents: 'none', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)', filter: 'blur(3px)', animation: 'sfaGloss 9s cubic-bezier(0.4,0,0.5,1) 3.4s infinite' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 12px 16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 99, background: 'rgba(52,211,153,0.14)', color: '#34D399', fontSize: 5.5, fontWeight: 800, letterSpacing: '0.12em' }}>
            <span style={{ width: 2, height: 2, borderRadius: 99, background: '#34D399', animation: 'sfaPulse 1.8s ease-in-out infinite' }} />
            DIFFUSION
          </span>
          <div style={{ width: '100%', marginTop: 10 }}>{burst}</div>
          <span style={{ marginTop: 14, fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: '-0.04em', background: 'linear-gradient(96deg,#C084FC,#67E8F9)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'sfaCount 0.9s cubic-bezier(0.16,1,0.3,1) 4.6s both' }}>36 / 36</span>
          <span style={{ marginTop: 2, fontSize: 5.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(236,234,245,0.34)', animation: 'sfaCount 0.9s cubic-bezier(0.16,1,0.3,1) 4.72s both' }}>comptes touchés</span>
        </div>
      </>}
    </div>
  )

  const ghosts = [
    { dx: '-22%', dy: '-6%', sc: 0.88, op: 0.3, d: 0.9 },
    { dx: '-11%', dy: '-3%', sc: 0.94, op: 0.5, d: 0.76 },
  ]

  return (
    <div
      aria-hidden="true"
      ref={rigRef}
      className="sfa-rig"
      style={{ position: 'relative', flexShrink: 0, width: 'clamp(160px,17vw,248px)', transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)', willChange: 'transform' }}
    >
      <span ref={haloRef} style={{ position: 'absolute', inset: '-20% -46%', borderRadius: '99em', filter: 'blur(72px)', background: 'radial-gradient(ellipse, rgba(168,85,247,0.52), transparent 66%)', transition: 'transform 0.7s cubic-bezier(0.16,1,0.3,1)', willChange: 'transform' }} />
      <span style={{ position: 'absolute', left: '8%', right: '8%', bottom: '-5%', height: 26, borderRadius: '99em', filter: 'blur(26px)', background: 'rgba(168,85,247,0.44)' }} />
      <div style={{ position: 'relative', transformStyle: 'preserve-3d', animation: 'sfaRigIn 1.7s cubic-bezier(0.16,1,0.3,1) 0.58s both, sfaRigFloat 15s ease-in-out 2.4s infinite' }}>
        {ghosts.map((g, i) => (
          <div key={'g' + i} style={{
            position: 'absolute', inset: 0, opacity: g.op, filter: 'blur(1px)',
            ['--dx' as string]: g.dx, ['--dy' as string]: g.dy, ['--sc' as string]: String(g.sc),
            transformOrigin: 'center', animation: `sfaGhost 1.5s cubic-bezier(0.16,1,0.3,1) ${g.d}s both`,
          }}>
            <div style={{ borderRadius: 'clamp(22px,2.4vw,32px)', padding: 'clamp(6px,0.7vw,9px)', background: 'linear-gradient(158deg, rgba(216,180,254,0.28), rgba(139,92,246,0.14) 46%, rgba(9,7,18,0.9))', boxShadow: '0 30px 70px -30px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.16)' }}>
              {screenChrome(false)}
            </div>
          </div>
        ))}
        <div style={{ position: 'relative' }}>
          <div style={{ borderRadius: 'clamp(22px,2.4vw,32px)', padding: 'clamp(6px,0.7vw,9px)', background: 'linear-gradient(158deg, rgba(233,213,255,0.5), rgba(139,92,246,0.26) 44%, rgba(9,7,18,0.95))', boxShadow: '0 58px 118px -40px rgba(168,85,247,0.62), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
            {screenChrome(true)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Récit : les quatre piliers ───────────────────────── */
function Narrative() {
  const PILLARS = [
    { n: '01', t: 'Mass posting', d: 'Instagram & TikTok, en parallèle' },
    { n: '02', t: 'Cloud phones', d: 'Ta ferme, pilotée d’un écran' },
    { n: '03', t: 'Banque de contenu', d: 'Vidéos, images, captions' },
    { n: '04', t: 'Studio & IA', d: 'Remix, sous-titres, descriptions' },
  ]
  return (
    <div className="sfa-narrative" style={{ flex: 1, minWidth: 0, maxWidth: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, animation: 'sfaUp 1s cubic-bezier(0.16,1,0.3,1) 0.3s both' }}>
        <span style={{ width: 38, height: 1, background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.6))', transformOrigin: 'right', animation: 'sfaRule 1.1s cubic-bezier(0.16,1,0.3,1) 0.45s both' }} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(196,181,253,0.62)', whiteSpace: 'nowrap' }}>Le Studio</span>
      </div>
      <h1 style={{ margin: '22px 0 0', fontSize: 'clamp(34px,4.2vw,62px)', lineHeight: 0.98, letterSpacing: '-0.042em' }}>
        <span style={{ display: 'block', overflow: 'hidden', paddingBottom: 2 }}>
          <span style={{ display: 'block', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: '#F7F5FF', animation: 'sfaRise 1.15s cubic-bezier(0.16,1,0.3,1) 0.42s both' }}>Toute l'automatisation</span>
        </span>
        <span style={{ display: 'block', overflow: 'hidden', paddingBottom: 9 }}>
          <span style={{ display: 'block', fontFamily: "'Instrument Serif',Georgia,serif", fontWeight: 400, fontStyle: 'italic', background: 'linear-gradient(96deg,#A855F7,#C4B5FD 34%,#93C5FD 68%,#67E8F9)', backgroundSize: '220% auto', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'sfaRise 1.15s cubic-bezier(0.16,1,0.3,1) 0.56s both, sfaShine 10s ease-in-out 1.8s infinite' }}>à un seul endroit.</span>
        </span>
      </h1>
      <p style={{ margin: '18px 0 0', maxWidth: 370, fontSize: 14.5, lineHeight: 1.7, color: 'rgba(236,234,245,0.48)', animation: 'sfaUp 1s cubic-bezier(0.16,1,0.3,1) 0.74s both' }}>Publication, cloud phones, contenu, IA — un seul poste de pilotage pour toute ta ferme.</p>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30, maxWidth: 340 }}>
        {PILLARS.map((p, i) => (
          <div key={p.n} style={{ display: 'flex', alignItems: 'baseline', gap: 13, padding: '10px 0', borderTop: i === 0 ? '1px solid rgba(255,255,255,0.07)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.07)', animation: `sfaUp 0.85s cubic-bezier(0.16,1,0.3,1) ${(0.88 + i * 0.09).toFixed(2)}s both` }}>
            <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 12, fontStyle: 'italic', color: 'rgba(196,181,253,0.5)', width: 20, flexShrink: 0 }}>{p.n}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(247,245,255,0.9)', whiteSpace: 'nowrap' }}>{p.t}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(236,234,245,0.32)', textAlign: 'right' }}>{p.d}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface AuthPageProps {
  initialTab?: Tab
  onResetDone?: () => void
}

export function AuthPage({ initialTab, onResetDone }: AuthPageProps = {}) {
  const tr = useTr()
  const [tab, setTab]           = useState<Tab>(initialTab ?? 'login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [showPwd, setShowPwd]   = useState(false)

  // Purement visuel — n'affecte pas la logique d'auth
  const [focus, setFocus]       = useState<'mail' | 'pw' | 'confirm' | null>(null)
  const [ctaHover, setCtaHover] = useState(false)

  const rigRef  = useRef<HTMLDivElement>(null)
  const haloRef = useRef<HTMLSpanElement>(null)

  const clearMessages = () => { setError(null); setSuccess(null) }

  // Parallaxe : transform écrit DIRECTEMENT sur les nœuds via un seul rAF, sans état React.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf: number | null = null
    let tx = 0, ty = 0
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2
      ty = (e.clientY / window.innerHeight - 0.5) * 2
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        if (rigRef.current)  rigRef.current.style.transform  = `translate3d(${(tx * -14).toFixed(1)}px, ${(ty * -10).toFixed(1)}px, 0)`
        if (haloRef.current) haloRef.current.style.transform = `translate3d(${(tx * 22).toFixed(1)}px, ${(ty * 16).toFixed(1)}px, 0)`
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error

      } else if (tab === 'register') {
        if (password !== confirm) throw new Error(tr('Les mots de passe ne correspondent pas.', 'Passwords do not match.'))
        if (password.length < 6) throw new Error(tr('Le mot de passe doit faire au moins 6 caractères.', 'Password must be at least 6 characters.'))
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.user && !data.session) {
          setSuccess(tr('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.', 'Account created! Check your inbox to confirm your address.'))
        }

      } else if (tab === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setSuccess(tr('Email envoyé ! Clique sur le lien dans ta boîte mail pour réinitialiser ton mot de passe.', 'Email sent! Click the link in your inbox to reset your password.'))

      } else if (tab === 'reset') {
        if (password !== confirm) throw new Error(tr('Les mots de passe ne correspondent pas.', 'Passwords do not match.'))
        if (password.length < 6) throw new Error(tr('Le mot de passe doit faire au moins 6 caractères.', 'Password must be at least 6 characters.'))
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setSuccess(tr('Mot de passe mis à jour ! Connexion en cours…', 'Password updated! Signing in…'))
        setTimeout(() => {
          onResetDone?.()
          switchTab('login')
        }, 2000)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tr('Une erreur est survenue.', 'Something went wrong.')
      setError(friendlyError(msg))
    } finally {
      setLoading(false)
    }
  }

  function switchTab(t: Tab) {
    setTab(t)
    clearMessages()
    setPassword('')
    setConfirm('')
    setShowPwd(false)
    setFocus(null)
  }

  const isForgotOrReset = tab === 'forgot' || tab === 'reset'

  /* ── Validation visuelle ── */
  const mailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const pwLen = password.length
  const score = pwLen === 0 ? 0
    : pwLen < 6 ? 1
    : pwLen < 10 ? 2
    : /[A-Z]/.test(password) && /\d/.test(password) ? 4 : 3
  const SCORES = [
    { l: '', c: 'transparent' },
    { l: tr('Faible', 'Weak'), c: '#F0A0AB' },
    { l: tr('Moyen', 'Fair'), c: '#FBBF24' },
    { l: tr('Bon', 'Good'), c: '#67E8F9' },
    { l: tr('Solide', 'Strong'), c: '#34D399' },
  ]
  const scDef = SCORES[score]

  const needsEmail   = tab !== 'reset'
  const needsPw      = tab !== 'forgot'
  const needsConfirm = tab === 'register' || tab === 'reset'
  const ready =
    (!needsEmail || mailValid) &&
    (!needsPw || pwLen >= 6) &&
    (!needsConfirm || (confirm.length > 0 && confirm === password))

  const ctaLift = ctaHover && ready && !loading

  /* ── Métadonnées d'en-tête de carte selon l'onglet ── */
  const cardKicker =
    tab === 'login'    ? tr('Connexion', 'Sign in')
    : tab === 'register' ? tr('Inscription', 'Sign up')
    : tab === 'forgot'   ? tr('Récupération', 'Recovery')
    : tr('Sécurité', 'Security')
  const cardTitle =
    tab === 'login'    ? tr('Bon retour.', 'Welcome back.')
    : tab === 'register' ? tr('Bienvenue.', 'Welcome.')
    : tab === 'forgot'   ? tr('Mot de passe oublié', 'Forgot password')
    : tr('Nouveau mot de passe', 'New password')
  const cardSub =
    tab === 'login'    ? tr('Le Studio t\'attend.', 'The Studio awaits.')
    : tab === 'register' ? tr('Crée ton accès au Studio.', 'Create your Studio access.')
    : tab === 'forgot'   ? tr('Entre ton email — on t\'envoie un lien.', 'Enter your email — we\'ll send a link.')
    : tr('Choisis un nouveau mot de passe.', 'Choose a new password.')
  const ctaLabel =
    tab === 'login'    ? tr('Entrer au Studio', 'Enter the Studio')
    : tab === 'register' ? tr('Créer mon compte', 'Create my account')
    : tab === 'forgot'   ? tr('Envoyer le lien', 'Send link')
    : tr('Enregistrer', 'Save password')

  const labelColor = (f: 'mail' | 'pw' | 'confirm') =>
    focus === f ? '#C4B5FD' : 'rgba(236,234,245,0.32)'
  const labelStyle: CSSProperties = { display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', transition: 'color 0.28s ease' }
  const inputStyle: CSSProperties = { flex: 1, minWidth: 0, height: 42, padding: '0 2px', border: 'none', background: 'none', outline: 'none', color: '#ECEAF5', fontSize: 14.5, boxSizing: 'border-box', fontFamily: 'inherit' }
  const ruleBase: CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'rgba(255,255,255,0.1)' }
  const ruleFill = (w: string): CSSProperties => ({ position: 'absolute', left: 0, bottom: 0, width: w, height: 1, background: 'linear-gradient(90deg,#A855F7,#67E8F9)', transition: 'width 0.45s cubic-bezier(0.16,1,0.3,1)' })

  const EyeButton = () => (
    <button
      type="button"
      onClick={() => setShowPwd(v => !v)}
      aria-label={tr('Afficher le mot de passe', 'Show password')}
      tabIndex={-1}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, border: 'none', borderRadius: 8, background: 'none', color: showPwd ? '#A78BFA' : 'rgba(236,234,245,0.33)', cursor: 'pointer', transition: 'color 0.22s ease, background 0.22s ease' }}
    >
      {showPwd
        ? <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" /></svg>
        : <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" /><circle cx={12} cy={12} r={3} /></svg>}
    </button>
  )

  return (
    <div
      className="sfa-root"
      style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'radial-gradient(ellipse 130% 110% at 30% 44%, #1b1436 0%, #100c22 40%, #07060B 100%)', color: '#ECEAF5', fontFamily: "'Manrope', system-ui, sans-serif" }}
    >
      <style>{KEYFRAMES}</style>

      {/* ═══ ATMOSPHÈRE · une seule toile continue ═══ */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', top: '-18%', left: '-6%', width: 820, height: 760, borderRadius: '99em', filter: 'blur(126px)', background: 'radial-gradient(circle, rgba(139,92,246,0.34), transparent 68%)', animation: 'sfaVeil 14s ease-in-out infinite' }} />
        <span style={{ position: 'absolute', bottom: '-22%', left: '22%', width: 640, height: 560, borderRadius: '99em', filter: 'blur(116px)', background: 'radial-gradient(ellipse, rgba(34,211,238,0.15), transparent 70%)', animation: 'sfaVeil 19s ease-in-out infinite', animationDelay: '-6s' }} />
        <span style={{ position: 'absolute', top: '14%', right: '-12%', width: 600, height: 600, borderRadius: '99em', filter: 'blur(120px)', background: 'radial-gradient(circle, rgba(168,85,247,0.16), transparent 70%)', animation: 'sfaVeil 16s ease-in-out infinite', animationDelay: '-9s' }} />
        <span style={{ position: 'absolute', top: '24%', left: '-14%', width: '128%', height: 'clamp(70px,7.5vw,116px)', borderRadius: '99em', background: 'linear-gradient(90deg, rgba(168,85,247,0.15), rgba(196,181,253,0.07) 52%, transparent)', animation: 'sfaBand 24s ease-in-out infinite alternate' }} />
        <span style={{ position: 'absolute', top: '52%', left: '-14%', width: '128%', height: 'clamp(70px,7.5vw,116px)', borderRadius: '99em', background: 'linear-gradient(90deg, rgba(103,232,249,0.1), rgba(139,92,246,0.06) 52%, transparent)', animation: 'sfaBandB 30s ease-in-out infinite alternate' }} />
        <span style={{ position: 'absolute', inset: 0, opacity: 0.038, backgroundImage: 'linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '62px 62px', WebkitMaskImage: 'radial-gradient(ellipse 90% 90% at 40% 50%, #000 8%, transparent 78%)', maskImage: 'radial-gradient(ellipse 90% 90% at 40% 50%, #000 8%, transparent 78%)' }} />
      </div>

      {/* Grain + scanlines */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: '-50%', zIndex: 40, pointerEvents: 'none', opacity: 0.03, animation: 'sfaGrain 1.1s steps(4) infinite', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 39, pointerEvents: 'none', opacity: 0.38, background: 'repeating-linear-gradient(180deg, transparent 0 2px, rgba(255,255,255,0.011) 2px 3px)' }} />

      {/* ═══ BARRE ═══ */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(24px,2.8vw,38px) clamp(30px,4vw,60px)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 11, animation: 'sfaFade 0.9s ease 0.2s both' }}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(145deg,#A855F7,#7C3AED)', flexShrink: 0, boxShadow: '0 6px 18px -6px rgba(168,85,247,0.75), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
            <span style={{ width: 11, height: 2.5, borderRadius: 99, background: '#fff', transform: 'skewX(-14deg)' }} />
            <span style={{ width: 11, height: 2.5, borderRadius: 99, background: '#fff', transform: 'skewX(14deg)' }} />
          </span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: '-0.025em' }}>
            <span style={{ color: '#fff' }}>scale</span><span style={{ color: '#A855F7' }}>flow</span>
          </span>
        </span>
      </div>

      {/* ═══ SCÈNE ═══ */}
      <div style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(30px,5vw,86px)', padding: 'clamp(96px,10vh,120px) clamp(30px,5vw,72px) clamp(64px,8vh,84px)', boxSizing: 'border-box' }}>

        <Narrative />

        <DeviceFarm rigRef={rigRef} haloRef={haloRef} />

        {/* ═══ Carte de connexion ═══ */}
        <div style={{ flexShrink: 0, width: 'min(404px,92vw)', padding: 'clamp(26px,2.4vw,36px)', borderRadius: 22, background: 'linear-gradient(168deg, rgba(24,20,44,0.72), rgba(12,10,22,0.82))', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 44px 96px -34px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)', animation: 'sfaCard 1.2s cubic-bezier(0.16,1,0.3,1) 0.5s both', boxSizing: 'border-box' }}>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 14, fontStyle: 'italic', color: 'rgba(236,234,245,0.3)' }}>— 01</span>
            <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 14, fontStyle: 'italic', color: '#A78BFA' }}>{cardKicker}</span>
          </div>

          <h2 style={{ margin: '12px 0 0', fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(26px,2.6vw,34px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.02 }}>{cardTitle}</h2>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, color: 'rgba(236,234,245,0.44)' }}>{cardSub}</p>

          {isForgotOrReset && (
            <button
              type="button"
              onClick={() => switchTab('login')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, border: 'none', background: 'none', padding: 0, fontSize: 12, fontFamily: 'inherit', color: 'rgba(236,234,245,0.44)', cursor: 'pointer' }}
            >
              <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
              {tr('Retour à la connexion', 'Back to sign in')}
            </button>
          )}

          <form onSubmit={handleSubmit}>

            {/* Email — masqué en reset */}
            {needsEmail && (
              <div style={{ marginTop: 30 }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 9, color: labelColor('mail') }}>
                  {tr('Email', 'Email')}
                  {mailValid && (
                    <span style={{ display: 'inline-flex', color: '#34D399' }}>
                      <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                  )}
                </label>
                <div style={{ position: 'relative', marginTop: 10 }}>
                  <input
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocus('mail')} onBlur={() => setFocus(null)}
                    placeholder={tr('vous@exemple.com', 'you@example.com')}
                    required autoComplete="email"
                    style={inputStyle}
                  />
                  <span aria-hidden="true" style={ruleBase} />
                  <span aria-hidden="true" style={ruleFill(focus === 'mail' || mailValid ? '100%' : '0%')} />
                </div>
              </div>
            )}

            {/* Mot de passe — masqué en forgot */}
            {needsPw && (
              <div style={{ marginTop: 22 }}>
                <label style={{ ...labelStyle, color: labelColor('pw') }}>
                  {tab === 'reset' ? tr('Nouveau mot de passe', 'New password') : tr('Mot de passe', 'Password')}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 10 }}>
                  <input
                    type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocus('pw')} onBlur={() => setFocus(null)}
                    placeholder="••••••••"
                    required autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    style={{ ...inputStyle, letterSpacing: '0.04em' }}
                  />
                  <EyeButton />
                  <span aria-hidden="true" style={ruleBase} />
                  <span aria-hidden="true" style={ruleFill(focus === 'pw' || pwLen >= 6 ? '100%' : '0%')} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, minHeight: 16 }}>
                  {pwLen > 0 && (
                    <span style={{ display: 'flex', gap: 3 }}>
                      {Array.from({ length: 4 }, (_, i) => (
                        <span key={i} style={{ width: 17, height: 3, borderRadius: 99, background: i < score ? scDef.c : 'rgba(255,255,255,0.085)', transition: 'background 0.3s ease' }} />
                      ))}
                    </span>
                  )}
                  {pwLen > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: scDef.c }}>{scDef.l}</span>
                  )}
                  {tab === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchTab('forgot')}
                      style={{ marginLeft: 'auto', border: 'none', background: 'none', padding: 0, fontSize: 12, fontFamily: 'inherit', color: 'rgba(236,234,245,0.38)', cursor: 'pointer', transition: 'color 0.22s ease' }}
                    >
                      {tr('Mot de passe oublié ?', 'Forgot password?')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Confirmation */}
            {needsConfirm && (
              <div style={{ marginTop: 22 }}>
                <label style={{ ...labelStyle, color: labelColor('confirm') }}>
                  {tr('Confirmer le mot de passe', 'Confirm password')}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 10 }}>
                  <input
                    type={showPwd ? 'text' : 'password'} value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    onFocus={() => setFocus('confirm')} onBlur={() => setFocus(null)}
                    placeholder="••••••••"
                    required autoComplete="new-password"
                    style={{ ...inputStyle, letterSpacing: '0.04em' }}
                  />
                  <span aria-hidden="true" style={ruleBase} />
                  <span aria-hidden="true" style={ruleFill(focus === 'confirm' || (confirm.length > 0 && confirm === password) ? '100%' : '0%')} />
                </div>
              </div>
            )}

            {/* Bannières */}
            {error && (
              <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 20, padding: '10px 12px', borderRadius: 10, background: 'rgba(240,61,85,0.1)', border: '1px solid rgba(240,61,85,0.24)', color: '#F0A0AB', fontSize: 13 }}>
                <span aria-hidden style={{ marginTop: 1 }}>⚠</span>
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 20, padding: '10px 12px', borderRadius: 10, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.24)', color: '#34D399', fontSize: 13 }}>
                <span aria-hidden style={{ marginTop: 1 }}>✓</span>
                <span>{success}</span>
              </div>
            )}

            {/* CTA */}
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => setCtaHover(true)}
              onMouseLeave={() => setCtaHover(false)}
              style={{
                position: 'relative', overflow: 'hidden', width: '100%', height: 50, marginTop: 28,
                border: 'none', borderRadius: 12,
                background: ready ? 'linear-gradient(135deg,#A855F7,#7C3AED)' : 'rgba(255,255,255,0.055)',
                color: ready ? '#fff' : 'rgba(236,234,245,0.3)',
                fontFamily: "'Manrope',sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase',
                cursor: loading ? 'wait' : ready ? 'pointer' : 'not-allowed',
                boxShadow: ctaLift ? '0 22px 52px -18px rgba(168,85,247,0.95)' : ready ? '0 14px 34px -14px rgba(168,85,247,0.7)' : 'none',
                transform: ctaLift ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1), box-shadow 0.28s ease, background 0.3s ease',
                boxSizing: 'border-box', opacity: loading ? 0.85 : 1,
              }}
            >
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 11 }}>
                {loading ? tr('Un instant…', 'One moment…') : ctaLabel}
                <span style={{ display: 'flex', transform: ctaLift ? 'translateX(6px)' : 'translateX(0)', transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>
                </span>
              </span>
              {ready && !loading && (
                <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, width: 42, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)', animation: 'sfaSweep 4s ease-in-out infinite' }} />
              )}
            </button>
          </form>

          {/* Bascule connexion / inscription */}
          {!isForgotOrReset && (
            <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 12.5, color: 'rgba(236,234,245,0.4)' }}>
              {tab === 'login' ? tr('Pas encore de compte ? ', 'No account yet? ') : tr('Déjà un compte ? ', 'Already have an account? ')}
              <button
                type="button"
                onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
                style={{ border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, color: '#A78BFA', fontWeight: 700, cursor: 'pointer', borderBottom: '1px solid rgba(167,139,250,0.3)', paddingBottom: 1 }}
              >
                {tab === 'login' ? tr('S\'inscrire', 'Sign up') : tr('Se connecter', 'Sign in')}
              </button>
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="rgba(236,234,245,0.26)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x={4} y={10.5} width={16} height={11} rx={2.5} /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(236,234,245,0.26)' }}>{tr('Connexion chiffrée · données synchronisées', 'Encrypted connection · synced data')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function friendlyError(raw: string): string {
  const r = raw.toLowerCase()
  // Client-side validation messages (checked first to avoid the generic 'password' match below)
  if (r.includes('ne correspondent pas') || r.includes('do not match'))
    return tr('Les mots de passe ne correspondent pas.', 'Passwords do not match.')
  if (r.includes('au moins 6') || r.includes('at least 6'))
    return tr('Le mot de passe doit faire au moins 6 caractères.', 'Password must be at least 6 characters.')
  if (r.includes('invalid login') || r.includes('invalid credentials'))
    return tr('Email ou mot de passe incorrect.', 'Incorrect email or password.')
  if (r.includes('email not confirmed'))
    return tr('Email non confirmé — vérifie ta boîte mail.', 'Email not confirmed — check your inbox.')
  if (r.includes('user already registered') || r.includes('already registered'))
    return tr('Un compte existe déjà avec cet email.', 'An account already exists with this email.')
  if (r.includes('password'))
    return tr('Mot de passe trop court (6 caractères minimum).', 'Password too short (6 characters minimum).')
  if (r.includes('rate limit'))
    return tr('Trop de tentatives. Réessaie dans quelques minutes.', 'Too many attempts. Try again in a few minutes.')
  if (r.includes('network') || r.includes('fetch'))
    return tr('Erreur réseau. Vérifie ta connexion internet.', 'Network error. Check your internet connection.')
  if (r.includes('expired') || r.includes('invalid') || r.includes('otp'))
    return tr('Lien expiré ou invalide. Redemande un nouveau lien.', 'Link expired or invalid. Request a new one.')
  return raw
}
