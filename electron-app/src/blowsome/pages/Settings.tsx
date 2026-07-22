// Blowsome — page Paramètres (agence VIP). State local uniquement, aucune persistance.
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowPageHeader, BlowBadge, BlowButton,
} from '../ui'

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED, marginBottom: 7 }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="blow-tap"
        style={{
          width: '100%', height: 44, padding: '0 15px', borderRadius: 12, outline: 'none',
          color: INK, fontSize: 14, fontWeight: 500,
          background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}`,
        } as CSSProperties}
        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)' }}
        onBlur={e => { e.currentTarget.style.borderColor = HAIR }}
      />
    </label>
  )
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <BlowCard style={{ padding: 22, animation: 'blow-rise .5s cubic-bezier(.16,1,.3,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#D8B4FE', background: 'rgba(168,85,247,0.12)', border: `1px solid ${HAIR}` }}><Ico d={icon} size={17} /></span>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: INK }}>{title}</h3>
      </div>
      {children}
    </BlowCard>
  )
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="blow-tap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 2px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{label}</span>
      <span style={{ width: 42, height: 24, borderRadius: 99, padding: 3, background: on ? GRAD : 'rgba(255,255,255,0.1)', transition: 'background .2s', flexShrink: 0 }}>
        <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(18px)' : 'none', transition: 'transform .2s cubic-bezier(.16,1,.3,1)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
      </span>
    </button>
  )
}

const MEMBERS = [
  { name: 'Toi', role: 'Propriétaire', initial: 'T', tone: 'gold' as const },
  { name: 'Camille R.', role: 'Manager', initial: 'C', tone: 'accent' as const },
  { name: 'Yanis B.', role: 'Éditeur', initial: 'Y', tone: 'muted' as const },
]

const VIP_FEATURES = ['Support prioritaire 24/7', 'Features exclusives en avant-première', 'Onboarding & stratégie dédiés', 'Limites augmentées sur les flottes']

export function BlowSettings({ user }: { user: User }) {
  useBlowCSS()
  const [name, setName] = useState('Blowsome Agency')
  const [email, setEmail] = useState(user.email ?? 'contact@blowsome.co')
  const [prefs, setPrefs] = useState({ emailNotif: true, dark: true, weekly: true })
  const [saved, setSaved] = useState(false)

  const toggle = (k: keyof typeof prefs) => setPrefs(p => ({ ...p, [k]: !p[k] }))
  const save = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1800) }

  return (
    <div>
      <BlowPageHeader title="Paramètres" subtitle="Configure ton espace agence Blowsome" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

        {/* Agence */}
        <Section icon={ICON.spark} title="Agence">
          <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ width: 58, height: 58, flexShrink: 0, borderRadius: 16, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 24, background: GRAD, boxShadow: '0 12px 26px -12px rgba(168,85,247,0.8)' }}>{name.slice(0, 1).toUpperCase()}</span>
            <button className="blow-tap" style={{ height: 36, padding: '0 14px', borderRadius: 10, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.04)', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Changer le logo</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nom de l'agence" value={name} onChange={setName} placeholder="Mon agence" />
            <Field label="Email de contact" value={email} onChange={setEmail} placeholder="contact@…" />
          </div>
        </Section>

        {/* Plan VIP */}
        <Section icon={ICON.heart} title="Abonnement">
          <div style={{ position: 'relative', padding: 18, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(150deg, rgba(233,196,106,0.12), rgba(168,85,247,0.1))', border: '1px solid rgba(233,196,106,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <BlowBadge tone="gold">✦ VIP</BlowBadge>
              <span style={{ fontSize: 13, fontWeight: 800 }}><Grad>Blowsome</Grad></span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
              {VIP_FEATURES.map(f => (
                <span key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: INK }}>
                  <span style={{ color: GOLD, flexShrink: 0 }}><Ico d="M20 6 9 17l-5-5" size={15} sw={2.4} /></span>{f}
                </span>
              ))}
            </div>
            <BlowButton style={{ width: '100%', justifyContent: 'center' }}><Ico d={ICON.spark} size={15} /> Gérer l'abonnement</BlowButton>
          </div>
        </Section>

        {/* Membres */}
        <Section icon={ICON.users} title="Membres">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MEMBERS.map(m => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14, background: GRAD }}>{m.initial}</span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: INK }}>{m.name}</span>
                <BlowBadge tone={m.tone}>{m.role}</BlowBadge>
              </div>
            ))}
          </div>
          <button className="blow-tap" style={{ marginTop: 16, width: '100%', height: 40, borderRadius: 11, border: `1px dashed ${HAIR}`, background: 'rgba(255,255,255,0.03)', color: '#D8B4FE', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Inviter un membre</button>
        </Section>

        {/* Préférences */}
        <Section icon={ICON.gear} title="Préférences">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Toggle label="Notifications e-mail" on={prefs.emailNotif} onToggle={() => toggle('emailNotif')} />
            <div style={{ height: 1, background: HAIR }} />
            <Toggle label="Mode sombre" on={prefs.dark} onToggle={() => toggle('dark')} />
            <div style={{ height: 1, background: HAIR }} />
            <Toggle label="Rapports hebdomadaires" on={prefs.weekly} onToggle={() => toggle('weekly')} />
          </div>
        </Section>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
        <BlowButton onClick={save}><Ico d="M20 6 9 17l-5-5" size={15} sw={2.4} /> Enregistrer</BlowButton>
        {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#6EE7B7', animation: 'blow-rise .3s ease both' }}>✓ Modifications enregistrées</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: FAINT }}>Espace <Grad style={{ fontWeight: 800 }}>Blowsome</Grad> · VIP</span>
      </div>
    </div>
  )
}

export default BlowSettings
