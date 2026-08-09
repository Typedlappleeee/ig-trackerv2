import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { activateKey } from '@/lib/license'
import { useOrg } from '@/lib/orgContext'
import { useTr } from '@/lib/i18n'

interface Props {
  userId: string
  email?: string | null
  onActivated: () => void
  initialStep?: Step
}

type Step = 'gate' | 'create_org' | 'expired'

const TELEGRAM_HANDLE = '@justquentin'
const TELEGRAM_URL    = 'https://t.me/justquentin'

const PLANS = [
  {
    name:    'Standard',
    price:   '$49.99',
    credits: '3 750',
    perAccount:   '~25 comptes · 2,00$/compte',
    perAccountEn: '~25 accounts · $2.00/account',
    phones:   '100 téléphones',
    phonesEn: '100 phones',
    posting:   'Mass posting 10 comptes',
    postingEn: 'Mass posting 10 accounts',
    accent:  '#818CF8',
  },
  {
    name:          'Pro',
    price:         '$99.99',
    credits:       '11 250',
    perAccount:    '~75 comptes · 1,33$/compte',
    perAccountEn:  '~75 accounts · $1.33/account',
    phones:        '200 téléphones',
    phonesEn:      '200 phones',
    posting:       'Mass posting illimité',
    postingEn:     'Unlimited mass posting',
    accent:        '#c084fc',
    popular:       true,
  },
  {
    name:          'Organisation',
    nameEn:        'Organization',
    price:         '$149.99',
    credits:       '22 500',
    perAccount:    '150 comptes · 1,00$/compte',
    perAccountEn:  '150 accounts · $1.00/account',
    phones:        'Téléphones illimités',
    phonesEn:      'Unlimited phones',
    posting:       'Mass posting illimité',
    postingEn:     'Unlimited mass posting',
    accent:        '#34d399',
    extra:         'Support 24/7 prioritaire · Proposition d’ajouts',
    extraEn:       'Priority 24/7 support · Feature requests',
  },
]

const Logo = ({ gradId }: { gradId: string }) => (
  <svg width="52" height="52" viewBox="0 0 100 100" fill="none" className="mb-4">
    <defs>
      <linearGradient id={`lg-main-${gradId}`} x1="10" y1="98" x2="82" y2="2" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="#1d4ed8"/>
        <stop offset="58%"  stopColor="#6366F1"/>
        <stop offset="100%" stopColor="#a855f7"/>
      </linearGradient>
      <linearGradient id={`lg-arr-${gradId}`} x1="66" y1="24" x2="90" y2="1" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="#db2777"/>
        <stop offset="100%" stopColor="#A5B4FC"/>
      </linearGradient>
    </defs>
    <path d="M 66 22 C 76 8 60 3 42 3 C 20 3 12 18 12 32 C 12 46 26 52 46 55 C 66 58 82 65 82 79 C 82 93 68 97 50 97 C 32 97 18 89 16 76"
      stroke={`url(#lg-main-${gradId})`} strokeWidth="16" strokeLinecap="round" fill="none"/>
    <line x1="66" y1="22" x2="88" y2="2" stroke={`url(#lg-arr-${gradId})`} strokeWidth="11" strokeLinecap="round"/>
    <line x1="77" y1="1"  x2="90" y2="1"  stroke="#A5B4FC" strokeWidth="9" strokeLinecap="round"/>
    <line x1="90" y1="1"  x2="90" y2="15" stroke="#A5B4FC" strokeWidth="9" strokeLinecap="round"/>
  </svg>
)

export function LicenseGate({ userId, email: _email, onActivated, initialStep = 'gate' }: Props) {
  const tr = useTr()
  const { myOrgs, switchOrg } = useOrg()
  const [step, setStep]       = useState<Step>(initialStep)
  const [view, setView]       = useState<'home' | 'join' | 'create'>('home')

  // Create org step
  const [orgName, setOrgName]         = useState('')
  const [orgCreateErr, setOrgCreateErr] = useState<string | null>(null)
  const [orgCreateLoading, setOrgCreateLoading] = useState(false)

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!orgName.trim()) return
    setOrgCreateLoading(true)
    setOrgCreateErr(null)
    const { data, error } = await supabase.rpc('create_org', { p_name: orgName.trim() })
    if (error) {
      setOrgCreateLoading(false)
      setOrgCreateErr(error.message)
      return
    }
    const orgId = data as string
    if (orgId) {
      // Ensure the creator has an organization_members row (the RPC may have missed it on older DB versions)
      await supabase.from('organization_members').upsert(
        { org_id: orgId, user_id: userId, role: 'owner', perm_overrides: {} },
        { onConflict: 'org_id,user_id', ignoreDuplicates: true }
      )
      localStorage.setItem('ig-tracker-current-org', orgId)
    }
    setOrgCreateLoading(false)
    onActivated()
  }

  // License key
  const [key, setKey]               = useState('')
  const [keyErr, setKeyErr]         = useState<string | null>(null)
  const [keyLoading, setKeyLoading] = useState(false)

  async function handleLicense(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    setKeyLoading(true)
    setKeyErr(null)
    const res = await activateKey(key, userId)
    if (res.success) {
      // If the user already has an org (e.g. renewing an expired key), skip the create_org step
      if (myOrgs.length > 0) {
        setKeyLoading(false)
        onActivated()
        return
      }
      setStep('create_org')
    } else {
      setKeyErr(res.error ?? tr('Erreur inconnue', 'Unknown error'))
    }
    setKeyLoading(false)
  }

  // Org invite
  const [code, setCode]           = useState('')
  const [orgErr, setOrgErr]       = useState<string | null>(null)
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgSuccess, setOrgSuccess] = useState(false)

  async function handleOrgJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setOrgLoading(true)
    setOrgErr(null)
    const { data, error } = await supabase.rpc('accept_org_invite', { p_token: code.trim() })
    setOrgLoading(false)
    if (error) {
      const msg = /invite_not_found/.test(error.message)    ? tr('Code invalide ou expiré', 'Invalid or expired code')
                : /invite_already_used/.test(error.message) ? tr('Ce code a déjà été utilisé', 'This code has already been used')
                : /invite_expired/.test(error.message)      ? tr('Code expiré', 'Code expired')
                : error.message
      setOrgErr(msg)
    } else {
      // accept_org_invite (SECURITY DEFINER) is the source of truth: if it
      // succeeded, the membership exists. We do NOT re-check the owner's license
      // here — the member can't read another user's license_keys under RLS, so
      // that check produced false "pas d'abonnement actif" errors. After reload,
      // checkLicense validates access via the org owner's plan (org_owner_plan).
      const orgId = data as string | null
      if (orgId) localStorage.setItem('ig-tracker-current-org', orgId)
      setOrgSuccess(true)
      setTimeout(() => window.location.reload(), 1500)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const SignOutButton = () => (
    <button
      onClick={signOut}
      className="fixed bottom-5 right-6 z-[10000] px-3 py-1.5 rounded-lg text-xs text-[#a89bd4] hover:text-white transition-colors"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.2)' }}
    >
      {tr('Se déconnecter →', 'Sign out →')}
    </button>
  )

  // ── Expired license step ─────────────────────────────────────────────────────
  if (step === 'expired') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307]">
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 50% 45%, #2a0b0b44 0%, transparent 70%)' }} />
        <div className="relative z-10 w-full max-w-sm mx-4">
          <div className="flex flex-col items-center mb-8">
            <Logo gradId="exp" />
            <h1 className="text-2xl font-black text-white tracking-tight">
              Scale<span style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
            </h1>
            <p className="text-[11px] text-[#7a3f3f] uppercase tracking-widest mt-1">{tr('Abonnement expiré', 'Subscription expired')}</p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="p-6 space-y-5">
              {/* Status banner */}
              <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>
                  <p className="text-white text-sm font-bold">{tr('Votre clé a expiré', 'Your key has expired')}</p>
                  <p className="text-[11px] text-[#9a6060] mt-0.5">{tr('Renouvelez votre abonnement pour continuer', 'Renew your subscription to continue')}</p>
                </div>
              </div>

              {/* Renew via Telegram */}
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl p-4 transition-all hover:scale-[1.01] no-underline"
                style={{ background: 'rgba(33,150,243,0.12)', border: '1px solid rgba(33,150,243,0.35)', textDecoration: 'none' }}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 flex-shrink-0" style={{ color: '#29b6f6' }}>
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                </svg>
                <div>
                  <div className="text-white text-sm font-bold">{tr('Renouveler via Telegram', 'Renew via Telegram')}</div>
                  <div className="text-[11px]" style={{ color: '#29b6f6' }}>{tr(`Contacte ${TELEGRAM_HANDLE} pour renouveler`, `Contact ${TELEGRAM_HANDLE} to renew`)}</div>
                </div>
                <div className="ml-auto text-[#29b6f6] text-lg">→</div>
              </a>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.15)' }} />
                <span className="text-[10px] text-[#4a3f7a]">{tr('déjà une nouvelle clé ?', 'already have a new key?')}</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.15)' }} />
              </div>

              {/* Activate new key */}
              <form onSubmit={handleLicense} className="space-y-3">
                <input
                  name="license-key"
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm font-mono tracking-widest placeholder:text-[#3a2f58] focus:outline-none focus:border-[#6366F1] transition-colors text-center uppercase"
                  spellCheck={false}
                  autoComplete="off"
                />
                {keyErr && <p className="text-xs text-red-400 text-center">{keyErr}</p>}
                <button
                  type="submit"
                  disabled={keyLoading || !key.trim()}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)' }}>
                  {keyLoading ? tr('Vérification…', 'Verifying…') : tr('Activer la clé →', 'Activate key →')}
                </button>
              </form>
            </div>
          </div>
          <p className="text-[10px] text-[#2a1f48] text-center mt-4">{tr('ScaleFlow — Accès restreint aux comptes autorisés', 'ScaleFlow — Access restricted to authorized accounts')}</p>
        </div>
        <SignOutButton />
      </div>
    )
  }

  // ── Create org step ──────────────────────────────────────────────────────────
  if (step === 'create_org') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307]">
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 50% 45%, #1e0b3a44 0%, transparent 70%)' }} />
        <div className="relative z-10 w-full max-w-sm mx-4">
          <div className="flex flex-col items-center mb-8">
            <Logo gradId="co" />
            <h1 className="text-2xl font-black text-white tracking-tight">
              Scale<span style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
            </h1>
            <p className="text-[11px] text-[#4a3f7a] uppercase tracking-widest mt-1">{tr('Créer mon organisation', 'Create my organization')}</p>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="p-6 space-y-4">
              <p className="text-xs text-[#6b5fa0] text-center">
                {tr('Ton abonnement est activé ! 🎉', 'Your subscription is active! 🎉')}<br/>
                {tr('Crée ton organisation pour commencer.', 'Create your organization to get started.')}
              </p>
              <form onSubmit={handleCreateOrg} className="space-y-3">
                <input
                  name="org-name"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder={tr('Nom de l’organisation', 'Organization name')}
                  className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#3a2f58] focus:outline-none focus:border-[#6366F1] transition-colors"
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                />
                {orgCreateErr && <p className="text-xs text-red-400 text-center">{orgCreateErr}</p>}
                <button
                  type="submit"
                  disabled={orgCreateLoading || !orgName.trim()}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)' }}
                >
                  {orgCreateLoading ? tr('Création…', 'Creating…') : tr('Créer mon organisation →', 'Create my organization →')}
                </button>
              </form>
            </div>
          </div>
          <p className="text-[10px] text-[#2a1f48] text-center mt-4">{tr('ScaleFlow — Accès restreint aux comptes autorisés', 'ScaleFlow — Access restricted to authorized accounts')}</p>
        </div>
        <SignOutButton />
      </div>
    )
  }

  // ── Main gate ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030307] overflow-y-auto py-8">
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 45%, #1e0b3a44 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-lg mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <Logo gradId="gate" />
          <h1 className="text-2xl font-black text-white tracking-tight">
            Scale<span style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Flow</span>
          </h1>
          <p className="text-[11px] text-[#4a3f7a] uppercase tracking-widest mt-1">{tr('Accès requis', 'Access required')}</p>
        </div>

        {/* Home: 2 options */}
        {view === 'home' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="p-6 space-y-3">
              <p className="text-xs text-[#6b5fa0] text-center mb-5">
                {tr('Bienvenue sur ScaleFlow. Comment veux-tu accéder ?', 'Welcome to ScaleFlow. How do you want to access it?')}
              </p>
              <button
                onClick={() => setView('join')}
                className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02] flex items-center gap-4"
                style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.28)' }}>
                <div style={{ color: '#3b82f6' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" /></svg>
                </div>
                <div>
                  <div className="text-white text-sm font-bold">{tr('Rejoindre une orga', 'Join an org')}</div>
                  <div className="text-[11px] text-[#6b5fa0] mt-0.5">{tr('Tu as un code d’invitation', 'You have an invite code')}</div>
                </div>
                <div className="ml-auto text-[#3b82f6] text-lg">→</div>
              </button>
              <button
                onClick={() => setView('create')}
                className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.02] flex items-center gap-4 relative overflow-hidden"
                style={{ background: 'linear-gradient(130deg,rgba(99,102,241,0.18),rgba(233,234,240,0.18))', border: '1px solid rgba(168,85,247,0.40)' }}>
                <div className="absolute top-2 right-2 text-[9px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)' }}>{tr('NOUVEAU', 'NEW')}</div>
                <div style={{ color: '#a855f7' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>
                </div>
                <div>
                  <div className="text-white text-sm font-bold">{tr('Créer une orga', 'Create an org')}</div>
                  <div className="text-[11px] text-[#6b5fa0] mt-0.5">{tr('Clé de licence via Telegram', 'License key via Telegram')}</div>
                </div>
                <div className="ml-auto text-[#a855f7] text-lg">→</div>
              </button>
            </div>
          </div>
        )}

        {/* Join org */}
        {view === 'join' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="p-6 space-y-4">
              <button onClick={() => setView('home')} className="flex items-center gap-1 text-[11px] text-[#4a3f7a] hover:text-[#6366F1] transition-colors mb-2">
                {tr('← Retour', '← Back')}
              </button>
              {myOrgs.length > 0 && (
                <div className="space-y-2 mb-2">
                  <p className="text-[10px] text-[#4a3f7a] uppercase tracking-widest text-center">{tr('Tes organisations', 'Your organizations')}</p>
                  {myOrgs.map(({ org }) => (
                    <button
                      key={org.id}
                      onClick={() => { switchOrg(org.id); window.location.reload() }}
                      className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all flex items-center gap-2"
                      style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      <span className="flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" /></svg>
                      </span>
                      <span className="flex-1 text-left truncate">{org.name}</span>
                      <span className="text-[11px] text-blue-400">{tr('Accéder →', 'Open →')}</span>
                    </button>
                  ))}
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px" style={{ background: 'rgba(74,63,122,0.4)' }} />
                    <span className="text-[10px] text-[#3a2f58]">{tr('ou code d’invitation', 'or invite code')}</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(74,63,122,0.4)' }} />
                  </div>
                </div>
              )}
              <p className="text-xs text-[#6b5fa0] text-center">
                {tr('Entre ton code d’invitation.', 'Enter your invite code.')}<br/>
                {tr('Tant que l’owner de l’orga a un abonnement actif, tu as accès.', 'As long as the org owner has an active subscription, you have access.')}
              </p>
              {orgSuccess ? (
                <div className="text-center py-4">
                  <p className="text-green-400 font-semibold text-sm">{tr('✓ Organisation rejointe !', '✓ Organization joined!')}</p>
                  <p className="text-xs text-[#6b5fa0] mt-1">{tr('Chargement en cours…', 'Loading…')}</p>
                </div>
              ) : (
                <form onSubmit={handleOrgJoin} className="space-y-3">
                  <input
                    name="invite-code"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder={tr('Code d’invitation', 'Invite code')}
                    className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-[#3a2f58] focus:outline-none focus:border-[#6366F1] transition-colors text-center"
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                  />
                  {orgErr && <p className="text-xs text-red-400 text-center">{orgErr}</p>}
                  <button
                    type="submit"
                    disabled={orgLoading || !code.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                    style={{ background: 'linear-gradient(130deg,#1d4ed8,#6366F1)' }}>
                    {orgLoading ? tr('Vérification…', 'Verifying…') : tr('Rejoindre →', 'Join →')}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Create / subscribe */}
        {view === 'create' && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <div className="p-6 space-y-4">
                <button onClick={() => setView('home')} className="flex items-center gap-1 text-[11px] text-[#4a3f7a] hover:text-[#6366F1] transition-colors">
                  {tr('← Retour', '← Back')}
                </button>

                {/* Plans */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[#4a3f7a] uppercase tracking-widest">{tr('Choisir un plan', 'Choose a plan')}</p>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }}>{tr('🔥 -40% jusqu’au 1er juillet', '🔥 -40% until July 1st')}</span>
                </div>
                <div className="space-y-2">
                  {PLANS.map(p => (
                    <div key={p.name}
                      className="rounded-xl p-3.5 relative"
                      style={{ background: p.popular ? 'linear-gradient(130deg,rgba(99,102,241,0.15),rgba(233,234,240,0.15))' : 'rgba(255,255,255,0.03)', border: `1px solid ${p.popular ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
                      {p.popular && (
                        <div className="absolute -top-2.5 right-4 text-[9px] font-black text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)' }}>{tr('POPULAIRE', 'POPULAR')}</div>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-black" style={{ color: p.accent }}>{tr(p.name, (p as any).nameEn ?? p.name)}</span>
                        <span className="flex items-baseline gap-1.5">
                          {(p as any).originalPrice && (
                            <span className="text-[11px] line-through" style={{ color: '#4a3f7a' }}>{(p as any).originalPrice}</span>
                          )}
                          <span className="text-white font-black text-sm">{p.price}<span className="text-[10px] text-[#6b5fa0] font-normal">{tr('/mois', '/mo')}</span></span>
                        </span>
                      </div>
                      {(p as any).perAccount && (
                        <div className="text-[11px] font-bold mb-1.5 px-2 py-1 rounded-md inline-block"
                          style={{ color: '#c4b5fd', background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.3)' }}>
                          {tr((p as any).perAccount, (p as any).perAccountEn ?? (p as any).perAccount)}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {[
                          tr(`${p.credits} crédits/mois`, `${p.credits} credits/mo`),
                          tr(p.phones, (p as any).phonesEn ?? p.phones),
                          tr(p.posting, (p as any).postingEn ?? p.posting),
                          tr('Support 24/7', '24/7 support'),
                          ...(p.extra ? [tr(p.extra, (p as any).extraEn ?? p.extra)] : []),
                        ].filter(Boolean).map(f => (
                          <span key={f} className="text-[10px]" style={{ color: '#6b5fa0' }}>· {f}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[9.5px] mt-2 px-1" style={{ color: '#6b5fa0', fontStyle: 'italic', lineHeight: 1.5 }}>
                  {tr(
                    "* Estimation comptes : utilisation standard 2 posts + 1 story / jour / compte (≈ 150 crédits/compte/mois). Crédits cumulables d'un mois sur l'autre.",
                    '* Account estimate: standard use of 2 posts + 1 story / day / account (≈ 150 credits/account/month). Credits roll over from one month to the next.'
                  )}
                </p>

                {/* Telegram CTA */}
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl p-4 transition-all hover:scale-[1.01] no-underline"
                  style={{ background: 'rgba(33,150,243,0.12)', border: '1px solid rgba(33,150,243,0.35)', textDecoration: 'none' }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 flex-shrink-0" style={{ color: '#29b6f6' }}>
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                  </svg>
                  <div>
                    <div className="text-white text-sm font-bold">{tr('Obtenir ma clé via Telegram', 'Get my key via Telegram')}</div>
                    <div className="text-[11px]" style={{ color: '#29b6f6' }}>{tr(`Contacte ${TELEGRAM_HANDLE} pour souscrire`, `Contact ${TELEGRAM_HANDLE} to subscribe`)}</div>
                  </div>
                  <div className="ml-auto text-[#29b6f6] text-lg">→</div>
                </a>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.15)' }} />
                  <span className="text-[10px] text-[#4a3f7a]">{tr('déjà une clé ?', 'already have a key?')}</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.15)' }} />
                </div>

                {/* Key activation */}
                <form onSubmit={handleLicense} className="space-y-3">
                  <input
                    name="license-key"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="w-full bg-[#0d0a1a] border border-[#2a1f48] rounded-xl px-4 py-3 text-white text-sm font-mono tracking-widest placeholder:text-[#3a2f58] focus:outline-none focus:border-[#6366F1] transition-colors text-center uppercase"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {keyErr && <p className="text-xs text-red-400 text-center">{keyErr}</p>}
                  <button
                    type="submit"
                    disabled={keyLoading || !key.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                    style={{ background: 'linear-gradient(130deg,#6366F1,#818CF8)' }}>
                    {keyLoading ? tr('Vérification…', 'Verifying…') : tr('Activer la clé →', 'Activate key →')}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-[#2a1f48] text-center mt-4">
          {tr('ScaleFlow — Accès restreint aux comptes autorisés', 'ScaleFlow — Access restricted to authorized accounts')}
        </p>
      </div>
      <SignOutButton />
    </div>
  )
}
