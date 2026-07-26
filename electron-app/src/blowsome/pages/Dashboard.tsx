// Blowsome — Dashboard. Données RÉELLES uniquement (aucune info inventée) :
// postings en cours (registre activeRuns), nb de téléphones et de vidéos (Supabase).
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { getActiveRuns, subscribeActiveRuns, type ActiveRun } from '@/lib/activeRuns'
import { useTr } from '@/lib/i18n'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowStat, BlowBadge, BlowButton, BlowEmpty,
} from '../ui'

export function BlowDashboard({ user, onGo, onPublish }: { user: User; onGo: (t: 'posting' | 'bank' | 'phonefarm') => void; onPublish: () => void }) {
  useBlowCSS()
  const tr = useTr()
  const TYPE_LABEL: Record<ActiveRun['type'], string> = {
    mass: tr('Mass posting', 'Mass posting'), story: tr('Story', 'Story'), warmup: tr('Warmup', 'Warmup'), threads: tr('Threads', 'Threads'),
  }
  const { currentOrg } = useOrg()
  const firstName = (user.email?.split('@')[0] ?? 'VIP').replace(/[._]/g, ' ')

  const [runs, setRuns] = useState<ActiveRun[]>(() => getActiveRuns())
  const [phoneCount, setPhoneCount] = useState<number | null>(null)
  const [videoCount, setVideoCount] = useState<number | null>(null)

  useEffect(() => {
    const unsub = subscribeActiveRuns(() => setRuns(getActiveRuns()))
    const id = window.setInterval(() => setRuns(getActiveRuns()), 4000)
    return () => { unsub(); window.clearInterval(id) }
  }, [])

  useEffect(() => {
    let alive = true
    const scope = <T,>(q: T): T => (currentOrg
      ? (q as any).eq('org_id', currentOrg.id)
      : (q as any).eq('user_id', user.id).is('org_id', null))
    const phonesQ = scope(supabase.from('phones').select('id', { count: 'exact', head: true }))
    const bankQ = scope(supabase.from('content_bank').select('id', { count: 'exact', head: true }))
    Promise.all([phonesQ, bankQ]).then(([p, b]) => {
      if (!alive) return
      setPhoneCount(p.count ?? 0)
      setVideoCount(b.count ?? 0)
    }).catch(() => { if (alive) { setPhoneCount(0); setVideoCount(0) } })
    return () => { alive = false }
  }, [currentOrg?.id, user.id])

  const running = runs.filter(r => r.status === 'running')

  return (
    <div>
      {/* Hero */}
      <BlowCard style={{ padding: 28, marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -60, right: -30, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.28), transparent 66%)', animation: 'blow-glow 6s ease-in-out infinite' }} />
        <div style={{ position: 'relative' }}>
          <BlowBadge tone="accent">✦ {tr('Espace Blowsome', 'Blowsome Space')}</BlowBadge>
          <h1 style={{ margin: '14px 0 6px', fontSize: 34, fontWeight: 900, letterSpacing: '-.035em', textTransform: 'capitalize' }}>
            {tr('Bonjour,', 'Hello,')} <Grad style={{ animation: 'blow-shimmer 6s linear infinite' }}>{firstName}</Grad>
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: MUTED, maxWidth: 520 }}>
            {tr('Ton cockpit VIP — publie, pilote tes flottes et retrouve toute ta banque, sans quitter Blowsome.', 'Your VIP cockpit — publish, manage your fleets and find your whole bank, without leaving Blowsome.')}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <BlowButton onClick={onPublish}><Ico d={ICON.send} size={15} /> {tr('Publier maintenant', 'Publish now')}</BlowButton>
            <BlowButton variant="ghost" onClick={() => onGo('bank')}><Ico d={ICON.folder} size={15} /> {tr('Ouvrir la banque', 'Open the bank')}</BlowButton>
          </div>
        </div>
      </BlowCard>

      {/* KPIs réels */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <BlowStat label={tr('Postings en cours', 'Postings in progress')} value={running.length} icon={<Ico d={ICON.send} size={16} />} accent="#A855F7" delay={0.05} />
        <BlowStat label={tr('Téléphones', 'Phones')} value={phoneCount === null ? '…' : phoneCount} icon={<Ico d={ICON.phone} size={16} />} accent="#EC4899" delay={0.1} />
        <BlowStat label={tr('Vidéos en banque', 'Videos in bank')} value={videoCount === null ? '…' : videoCount} icon={<Ico d={ICON.folder} size={16} />} accent="#6366F1" delay={0.15} />
      </div>

      {/* Deux colonnes : postings en cours (réel) + carte publier */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <BlowCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>{tr('Postings en cours', 'Postings in progress')}</span>
            <button onClick={() => onGo('posting')} style={{ fontSize: 11.5, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{tr('Tout voir', 'View all')} →</button>
          </div>
          {running.length === 0 ? (
            <BlowEmpty title={tr('Rien en cours', 'Nothing in progress')} hint={tr('Lance une publication — elle apparaîtra ici en direct.', 'Start a publication — it will appear here live.')} icon={<Ico d={ICON.send} size={20} />} />
          ) : (
            running.slice(0, 4).map((r, i) => {
              const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
              return (
                <div key={r.id} style={{ padding: '13px 20px', borderBottom: i < Math.min(running.length, 4) - 1 ? `1px solid ${HAIR}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    <BlowBadge tone="accent">{TYPE_LABEL[r.type]}</BlowBadge>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: GRAD, borderRadius: 99, transition: 'width .5s ease' }} />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: FAINT }}>{r.done}/{r.total} {tr('comptes', 'accounts')} · {pct}%</p>
                </div>
              )
            })
          )}
        </BlowCard>

        <BlowCard style={{ padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', bottom: -40, right: -20, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(233,196,106,0.16), transparent 68%)' }} />
          <BlowBadge tone="gold">✦ VIP</BlowBadge>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.35, position: 'relative' }}>
            {tr('Publie sur toutes tes flottes', 'Publish to all your fleets')} <Grad>{tr('en un clic', 'in one click')}</Grad>.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.5, position: 'relative' }}>
            {tr('Ouvre le posting ScaleFlow directement ici, sans quitter ton espace Blowsome.', 'Open ScaleFlow posting directly here, without leaving your Blowsome space.')}
          </p>
          <BlowButton onClick={onPublish} style={{ alignSelf: 'flex-start', marginTop: 4 }}><Ico d={ICON.send} size={15} /> {tr('Publier maintenant', 'Publish now')}</BlowButton>
        </BlowCard>
      </div>
    </div>
  )
}

export default BlowDashboard
