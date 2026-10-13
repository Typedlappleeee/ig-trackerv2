// Abonnements : les 3 offres ScaleFlow, ce qui change entre elles et l'offre actuelle.
// Paiement / activation : contact (Telegram) puis clé d'activation (Réglages → Licence).
import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Icon, useNarrow } from '@/lib/ui'
import { useBankUsage } from '@/lib/bankStorage'

const CONTACT = 'https://t.me/justquentin'
const V = '#A78BFA'
const GRAD = 'linear-gradient(135deg,#8B5CF6,#EC4899)'
const CHECK = 'M20 6L9 17l-5-5'
const IC = {
  credits: 'M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.2L2 10l7.1-1.1z',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M11 18h2',
  mass: 'M3 7h18|M3 12h18|M3 17h18',
  storage: 'M21 5c0 1.7-4 3-9 3S3 6.7 3 5s4-3 9-3 9 1.3 9 3z|M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5|M3 12c0 1.7 4 3 9 3s9-1.3 9-3',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 7a4 4 0 1 0 0 .01|M23 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8',
  support: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
}

interface Plan { k: string; name: string; price: string; tag: string; credits: number; feats: [string, string][]; best?: boolean }
const PLANS: Plan[] = [
  { k: 'standard', name: 'Standard', price: '49,99', tag: 'Pour lancer ta première ferme de comptes', credits: 2500,
    feats: [[IC.phone, '50 téléphones'], [IC.mass, 'Mass Posting · 10 comptes'], [IC.storage, '5 Go de banque'], [CHECK, 'Toutes les fonctionnalités'], [IC.support, 'Support 24/7']] },
  { k: 'pro', name: 'Pro', price: '99,99', tag: 'Le choix des agences qui scalent', credits: 5500, best: true,
    feats: [[IC.phone, '200 téléphones'], [IC.mass, 'Mass Posting illimité'], [IC.storage, '15 Go de banque'], [IC.team, 'Organisation multi-membres'], [CHECK, 'Auto-warmup'], [IC.support, 'Support 24/7']] },
  { k: 'organisation', name: 'Organisation', price: '149,99', tag: 'Pour piloter des centaines de comptes', credits: 11000,
    feats: [[IC.phone, 'Téléphones illimités'], [IC.mass, 'Mass Posting illimité'], [IC.storage, '50 Go de banque'], [IC.team, 'Organisation multi-membres'], [IC.support, 'Support prioritaire'], [CHECK, 'Accès direct aux devs']] },
]
const MAX_CREDITS = 11000
const ROWS: [string, string[]][] = [
  ['Crédits / mois', ['2 500', '5 500', '11 000']],
  ['≈ Reels publiés / mois', ['1 250', '2 750', '5 500']],
  ['≈ Stories / mois', ['2 500', '5 500', '11 000']],
  ['Téléphones', ['50', '200', 'Illimités']],
  ['Mass Posting', ['10 comptes', 'Illimité', 'Illimité']],
  ['Espace banque', ['5 Go', '15 Go', '50 Go']],
  ['Toutes les fonctionnalités', ['✓', '✓', '✓']],
  ['Organisation & membres', ['—', '✓', '✓']],
  ['Support', ['24/7', '24/7', 'Prioritaire']],
]
const COSTS: [string, string, string][] = [
  ['Reel / post', '2', 'crédits par téléphone'],
  ['Story', '1', 'crédit par téléphone'],
  ['Tâche automatique', '50', 'crédits / jour + 2 par téléphone'],
  ['Studio vidéo', '0', 'remix, spoof, montage'],
]
const FAQ: [string, string][] = [
  ['Comment je m’abonne ?', 'Contacte-nous sur Telegram : on te donne une clé d’activation. Tu la colles dans Réglages → Licence & crédits et ton offre est active tout de suite.'],
  ['Combien coûte une publication ?', 'Un Reel ou un post coûte 2 crédits par téléphone (même tarif en direct, en masse ou programmé). Une story coûte 1 crédit. Les outils du Studio vidéo sont gratuits.'],
  ['Que se passe-t-il si ma banque est pleine ?', 'Une alerte s’affiche à 80 %. À 100 %, les nouveaux envois sont bloqués jusqu’à ce que tu libères de l’espace. La corbeille compte dans l’espace utilisé.'],
  ['Je peux changer d’offre ?', 'Oui, à tout moment : écris-nous et on bascule ton compte sur l’offre qui te va.'],
]

function PlanCard({ p, current, narrow }: { p: Plan; current: boolean; narrow: boolean }) {
  const [h, setH] = useState(false)
  const perCredit = (Number(p.price.replace(',', '.')) / p.credits * 1000).toFixed(1).replace('.', ',')
  const card = (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', gap: 18, padding: narrow ? 20 : 24, borderRadius: p.best ? 21 : 22, boxSizing: 'border-box',
      background: p.best ? 'linear-gradient(180deg,#17131F 0%,#111113 45%)' : '#111113', border: p.best ? 'none' : `1px solid ${h ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}`, transition: 'border-color .2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: p.best ? '#C4B5FD' : '#A1A1AA' }}>{p.name}</span>
        {p.best && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 8px', borderRadius: 99, background: GRAD, color: '#fff' }}>Le plus choisi</span>}
        {current && <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 8px', borderRadius: 99, border: `1px solid ${V}`, color: V }}>Ton offre</span>}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: narrow ? 46 : 56, fontWeight: 900, letterSpacing: '-0.055em', lineHeight: 0.9, color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{p.price}$</span>
          <span style={{ fontSize: 13.5, color: '#71717A' }}>/ mois</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 13.5, color: '#A1A1AA', lineHeight: 1.45 }}>{p.tag}</div>
      </div>

      <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{p.credits.toLocaleString('fr-FR')}</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#71717A' }}>crédits / mois</span>
        </div>
        <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ width: `${(p.credits / MAX_CREDITS) * 100}%`, height: '100%', borderRadius: 99, background: p.best ? GRAD : V, animation: 'aIn .8s cubic-bezier(0.16,1,0.3,1) both' }} />
        </div>
        <div style={{ marginTop: 9, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#8B8B94' }}>
          <span>≈ {(p.credits / 2).toLocaleString('fr-FR')} Reels</span>
          <span>{perCredit} $ / 1 000 cr.</span>
        </div>
      </div>

      <a href={CONTACT} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, textDecoration: 'none', fontSize: 14.5, fontWeight: 800,
        color: p.best ? '#fff' : '#0A0A0B', background: p.best ? GRAD : '#F4F4F5', boxShadow: p.best ? '0 4px 0 #6D28D9, 0 14px 30px -12px rgba(236,72,153,.6)' : '0 4px 0 #A1A1AA', transform: h ? 'translateY(-1px)' : 'none', transition: 'transform .15s ease' }}>
        {current ? 'Renouveler' : `Choisir ${p.name}`} <span aria-hidden>→</span>
      </a>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {p.feats.map(([d, x]) => (
          <span key={x} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: '#D4D4D8' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: 'rgba(167,139,250,0.12)', color: V }}><Icon d={d} size={12} sw={2.2} /></span>{x}
          </span>
        ))}
      </div>
    </div>
  )
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: 'relative', borderRadius: 22, padding: p.best ? 1 : 0, background: p.best ? 'linear-gradient(160deg,#A78BFA,rgba(236,72,153,.7) 40%,rgba(255,255,255,0.08) 80%)' : 'transparent',
        boxShadow: p.best ? '0 30px 80px -40px rgba(139,92,246,.9)' : 'none', transform: h ? 'translateY(-4px)' : narrow || !p.best ? 'none' : 'translateY(-10px)', transition: 'transform .3s cubic-bezier(0.16,1,0.3,1)' }}>
      {card}
    </div>
  )
}

export default function Pricing({ org }: { theme: Theme; org: OrgState }) {
  const narrow = useNarrow(760)
  const { usage } = useBankUsage(org.currentOrg?.id ?? null)
  const current = usage?.plan === 'business' ? 'organisation' : usage?.plan
  const [faq, setFaq] = useState<number | null>(0)
  const H2: React.CSSProperties = { margin: 0, fontSize: narrow ? 22 : 28, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1, textTransform: 'uppercase', color: '#F4F4F5' }
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both', maxWidth: 1180, margin: '0 auto' }}>
      {/* En-tête */}
      <section style={{ textAlign: 'center', padding: narrow ? '12px 0 28px' : '22px 0 44px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 12px', borderRadius: 99, border: '1px solid rgba(167,139,250,0.35)', background: 'rgba(167,139,250,0.08)', fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#C4B5FD' }}>✦ Abonnements ScaleFlow</span>
        <h1 style={{ margin: '18px auto 0', maxWidth: 820, fontWeight: 900, letterSpacing: '-0.055em', lineHeight: 0.92, textTransform: 'uppercase', fontSize: narrow ? 38 : 'clamp(44px, 5.6vw, 76px)', color: '#F4F4F5' }}>
          Scale tes comptes<br /><span style={{ background: 'linear-gradient(90deg,#C4B5FD,#F472B6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>sans limite</span>
        </h1>
        <p style={{ margin: '18px auto 0', maxWidth: 560, fontSize: 15, lineHeight: 1.55, color: '#A1A1AA' }}>Toutes les fonctionnalités dans chaque offre. Plus de crédits, de téléphones et d’espace quand tu grandis.</p>
      </section>

      {/* Offres */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: narrow ? 14 : 18, alignItems: 'stretch', marginBottom: narrow ? 36 : 56 }}>
        {PLANS.map(p => <PlanCard key={p.k} p={p} current={current === p.k} narrow={narrow} />)}
      </div>

      {/* Ce que valent les crédits */}
      <section style={{ marginBottom: narrow ? 36 : 56 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h2 style={H2}>Ce que coûte <span style={{ color: '#52525B' }}>chaque action</span></h2>
          <span style={{ fontSize: 13, color: '#8B8B94' }}>Même tarif en direct, en masse ou programmé.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10 }}>
          {COSTS.map(([l, v, s]) => (
            <div key={l} style={{ padding: '18px 18px 16px', borderRadius: 16, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8B8B94' }}>{l}</div>
              <div style={{ marginTop: 10, fontSize: 40, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.9, color: v === '0' ? V : '#F4F4F5' }}>{v === '0' ? 'Gratuit' : v}</div>
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#71717A' }}>{s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparatif */}
      <section style={{ marginBottom: narrow ? 36 : 56 }}>
        <h2 style={{ ...H2, marginBottom: 16 }}>Comparer <span style={{ color: '#52525B' }}>les offres</span></h2>
        <div style={{ borderRadius: 20, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr>{['', ...PLANS.map(p => p.name)].map((h, i) => (
              <th key={i} style={{ textAlign: i ? 'center' : 'left', padding: '16px 20px', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: i === 2 ? '#C4B5FD' : '#8B8B94', background: i === 2 ? 'rgba(167,139,250,0.07)' : 'transparent' }}>
                {h}{PLANS[i - 1]?.k === current && <span style={{ display: 'block', marginTop: 3, fontSize: 10, color: V }}>Ton offre</span>}
              </th>
            ))}</tr></thead>
            <tbody>{ROWS.map(([l, v]) => (
              <tr key={l}>{[l, ...v].map((c, i) => (
                <td key={i} style={{ textAlign: i ? 'center' : 'left', padding: '13px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', background: i === 2 ? 'rgba(167,139,250,0.07)' : 'transparent',
                  color: !i ? '#A1A1AA' : c === '—' ? '#3F3F46' : '#EDEDEF', fontWeight: i ? 650 : 450, fontVariantNumeric: 'tabular-nums' }}>
                  {c === '✓' ? <span style={{ display: 'inline-flex', color: V }}><Icon d={CHECK} size={15} sw={2.6} /></span> : c}
                </td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.6fr)', gap: narrow ? 16 : 32, marginBottom: narrow ? 28 : 44 }}>
        <div>
          <h2 style={H2}>Questions <span style={{ color: '#52525B' }}>fréquentes</span></h2>
          <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.55, color: '#8B8B94' }}>Une autre question ? Écris à l’équipe sur Telegram.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FAQ.map(([q, a], i) => {
            const on = faq === i
            return (
              <div key={q} style={{ borderRadius: 14, background: '#111113', border: `1px solid ${on ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.07)'}`, transition: 'border-color .2s ease' }}>
                <button type="button" onClick={() => setFaq(on ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 18px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 14.5, fontWeight: 700, color: '#F4F4F5' }}>
                  {q}<span style={{ display: 'flex', color: on ? V : '#71717A', transform: on ? 'rotate(45deg)' : 'none', transition: 'transform .2s ease' }}><Icon d="M12 5v14|M5 12h14" size={15} /></span>
                </button>
                {on && <div style={{ padding: '0 18px 16px', fontSize: 13.5, lineHeight: 1.6, color: '#A1A1AA', animation: 'aIn .25s ease both' }}>{a}</div>}
              </div>
            )
          })}
        </div>
      </section>

      {/* Contact */}
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: narrow ? 20 : '26px 30px', borderRadius: 22, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div style={{ fontSize: narrow ? 20 : 24, fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', color: '#F4F4F5' }}>Prêt à passer à la vitesse supérieure ?</div>
          <div style={{ marginTop: 6, fontSize: 13.5, color: '#8B8B94' }}>Écris-nous sur Telegram : on t’envoie ta clé d’activation.</div>
        </div>
        <a href={CONTACT} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 12, textDecoration: 'none', fontSize: 14.5, fontWeight: 800, color: '#fff', background: GRAD, boxShadow: '0 4px 0 #6D28D9' }}>Parler à l’équipe <span aria-hidden>→</span></a>
      </section>
    </div>
  )
}
