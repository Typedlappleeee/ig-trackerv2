// Abonnements : les 3 offres ScaleFlow, ce qui change entre elles et l'offre actuelle.
// Paiement / activation : contact (Telegram) puis clé d'activation (Réglages → Licence).
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Icon } from '@/lib/ui'
import { useBankUsage } from '@/lib/bankStorage'

const CONTACT = 'https://t.me/justquentin'
const V = '#A78BFA'
interface Plan { k: string; name: string; price: string; tag: string; credits: number; phones: string; mass: string; storage: string; extra: string[]; best?: boolean }
const PLANS: Plan[] = [
  { k: 'standard', name: 'Standard', price: '49,99', tag: 'Pour lancer ta première ferme de comptes', credits: 2500, phones: '50 téléphones', mass: 'Mass Posting · 10 comptes', storage: '5 Go de banque', extra: ['Toutes les fonctionnalités', 'Support 24/7'] },
  { k: 'pro', name: 'Pro', price: '99,99', tag: 'Le choix des agences qui scalent', credits: 5500, phones: '200 téléphones', mass: 'Mass Posting illimité', storage: '15 Go de banque', extra: ['Organisation multi-membres', 'Auto-warmup', 'Support 24/7'], best: true },
  { k: 'organisation', name: 'Organisation', price: '149,99', tag: 'Pour piloter des centaines de comptes', credits: 11000, phones: 'Téléphones illimités', mass: 'Mass Posting illimité', storage: '50 Go de banque', extra: ['Organisation multi-membres', 'Support prioritaire', 'Accès direct aux devs'] },
]
const ROWS: [string, string[]][] = [
  ['Crédits / mois', ['2 500', '5 500', '11 000']],
  ['≈ Reels publiés / mois', ['1 250', '2 750', '5 500']],
  ['Téléphones', ['50', '200', 'Illimités']],
  ['Mass Posting', ['10 comptes', 'Illimité', 'Illimité']],
  ['Espace banque', ['5 Go', '15 Go', '50 Go']],
  ['Organisation & membres', ['—', '✓', '✓']],
  ['Support', ['24/7', '24/7', 'Prioritaire']],
]

export default function Pricing({ org }: { theme: Theme; org: OrgState }) {
  const { usage } = useBankUsage(org.currentOrg?.id ?? null)
  const current = usage?.plan === 'business' ? 'organisation' : usage?.plan
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '30px 30px 26px', marginBottom: 18, background: '#0C0C0D', border: `1px solid ${V}55` }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: V }}>✦ Abonnements ScaleFlow</span>
        <h1 style={{ margin: '10px 0 8px', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, textTransform: 'uppercase', fontSize: 'clamp(30px, 3.6vw, 48px)', color: '#F4F4F5' }}>Scale tes comptes <span style={{ color: '#71717A' }}>sans limite</span></h1>
        <p style={{ margin: 0, fontSize: 14, color: '#A1A1AA' }}>Toutes les fonctionnalités dans chaque offre. Plus de crédits, de téléphones et d’espace quand tu grandis.</p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 14, marginBottom: 22 }}>
        {PLANS.map(p => {
          const isCur = current === p.k
          return (
            <div key={p.k} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, padding: 20, borderRadius: 20, background: '#111113', border: `1px solid ${p.best ? V : 'rgba(255,255,255,0.08)'}`, boxShadow: p.best ? `0 24px 60px -30px ${V}` : 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', color: '#F4F4F5' }}>{p.name}</span>
                {p.best && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', padding: '3px 7px', borderRadius: 6, background: 'linear-gradient(135deg,#8B5CF6,#EC4899)', color: '#fff' }}>Le plus choisi</span>}
                {isCur && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', padding: '3px 7px', borderRadius: 6, border: `1px solid ${V}`, color: V }}>Ton offre</span>}
              </span>
              <span style={{ fontSize: 13, color: '#8B8B94', marginTop: -8 }}>{p.tag}</span>
              <div style={{ padding: '12px 14px', borderRadius: 14, background: '#0C0C0D', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#EDEDEF' }}>{p.credits.toLocaleString('fr-FR')} crédits / mois</div>
                <div style={{ fontSize: 12.5, color: '#8B8B94', marginTop: 4 }}>≈ {(p.credits / 2).toLocaleString('fr-FR')} Reels publiés · ou {p.credits.toLocaleString('fr-FR')} stories</div>
              </div>
              <div><span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: '#F4F4F5' }}>{p.price}$</span><span style={{ fontSize: 13, color: '#8B8B94' }}> / mois</span></div>
              <a href={CONTACT} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 11, textDecoration: 'none', fontSize: 14, fontWeight: 750, color: p.best ? '#fff' : '#0A0A0B', background: p.best ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : '#F4F4F5', boxShadow: p.best ? '0 4px 0 #6D28D9' : '0 4px 0 #A1A1AA' }}>{isCur ? 'Renouveler' : `Choisir ${p.name}`}</a>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                {[p.phones, p.mass, p.storage, ...p.extra].map(x => (
                  <span key={x} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#D4D4D8' }}>
                    <span style={{ display: 'flex', color: V }}><Icon d="M20 6L9 17l-5-5" size={13} sw={2.4} /></span>{x}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <section style={{ borderRadius: 20, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', fontSize: 18, fontWeight: 900, letterSpacing: '-0.03em', textTransform: 'uppercase', color: '#F4F4F5' }}>Comparer les offres</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['', ...PLANS.map(p => p.name)].map((h, i) => <th key={i} style={{ textAlign: i ? 'center' : 'left', padding: '10px 20px', color: i === 2 ? V : '#8B8B94', fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>)}</tr></thead>
            <tbody>{ROWS.map(([l, v]) => <tr key={l}>{[l, ...v].map((c, i) => <td key={i} style={{ textAlign: i ? 'center' : 'left', padding: '11px 20px', color: i ? (c === '—' ? '#52525B' : '#EDEDEF') : '#A1A1AA', fontWeight: i ? 600 : 400, borderTop: '1px solid rgba(255,255,255,0.06)' }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
      <p style={{ marginTop: 14, fontSize: 12.5, color: '#71717A' }}>Pour souscrire ou changer d’offre, contacte-nous : tu reçois une clé à activer dans Réglages → Licence & crédits.</p>
    </div>
  )
}
