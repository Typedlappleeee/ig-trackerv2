// Carte de suivi d'un run du moteur de flows (Flow Builder, édition en masse) :
// progression, étapes par compte, erreur par compte, journal, Arrêter / Masquer.
import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, Panel, PanelHead, MONO } from '@/lib/ui'
import { cancelRun } from '@/lib/runStore'
import { blockName, dismissFlowRun, type FlowRun, type StepStatus } from '@/lib/flowEngine'

const STEP_COLOR: Record<StepStatus, string> = { pending: 'rgba(255,255,255,0.1)', running: '#FBBF24', ok: '#4ADE80', failed: '#F87171', skipped: 'rgba(255,255,255,0.04)' }
const PHONE_TONE = { pending: 'mute', booting: 'warn', running: 'warn', done: 'ok', failed: 'bad', cancelled: 'mute' } as const
const PHONE_LABEL = { pending: 'En attente', booting: 'Démarrage', running: 'En cours', done: 'Terminé', failed: 'Échec', cancelled: 'Annulé' } as const

export default function RunCard({ theme, run }: { theme: Theme; run: FlowRun }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'failed'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const done = run.phones.filter(p => p.status === 'done').length
  const failed = run.phones.filter(p => p.status === 'failed').length
  const active = run.status === 'preparing' || run.status === 'running'
  const list = run.phones.filter(p => filter === 'all' || (filter === 'failed' ? p.status === 'failed' : p.status === 'booting' || p.status === 'running'))
  const LIMIT = 150
  const elapsed = Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 60_000)
  return (
    <Panel theme={theme}>
      <PanelHead
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{run.flowName}<Chip text={run.status === 'preparing' ? 'Préparation' : run.status === 'running' ? 'En cours' : run.status === 'done' ? 'Terminé' : run.status === 'cancelled' ? 'Annulé' : 'Erreur'} tone={active ? 'warn' : run.status === 'done' ? 'ok' : run.status === 'error' ? 'bad' : 'mute'} /></span>}
        sub={`${done} OK · ${failed} échec(s) · ${run.phones.length} compte(s) · ${elapsed} min`}
        right={<span style={{ display: 'flex', gap: 6 }}>
          {active
            ? <Btn theme={theme} sm tone="danger" label="Arrêter" onClick={() => cancelRun(run.handleId)} />
            : <Btn theme={theme} sm tone="quiet" label="Masquer" onClick={() => dismissFlowRun(run.id)} />}
        </span>}
      />
      {/* Progression globale */}
      <div style={{ height: 3, margin: '12px 16px 0', borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
        <span style={{ width: `${(done / Math.max(1, run.phones.length)) * 100}%`, background: '#4ADE80', transition: 'width .3s ease' }} />
        <span style={{ width: `${(failed / Math.max(1, run.phones.length)) * 100}%`, background: '#F87171', transition: 'width .3s ease' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, margin: '12px 16px 8px', padding: 2, width: 'fit-content', borderRadius: 7, background: '#111113', border: '1px solid rgba(255,255,255,0.07)' }}>
        {([['all', 'Tous'], ['active', 'En cours'], ['failed', `Échecs${failed ? ` (${failed})` : ''}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ height: 24, padding: '0 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filter === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: filter === k ? '#EDEDEF' : '#8B8B94' }}>{l}</button>
        ))}
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {list.slice(0, LIMIT).map(p => {
          const isOpen = open === p.key
          const curLabel = p.status === 'booting' ? 'Démarrage du téléphone' : p.current >= 0 && p.status === 'running' ? blockName(run.blocks[p.current]) : ''
          const err = p.errors.find(Boolean)
          return (
            <div key={p.key} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={() => setOpen(isOpen ? null : p.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 44, padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {p.steps.map((s, i) => (
                    <span key={i} title={`${i + 1}. ${blockName(run.blocks[i])} — ${s}${p.errors[i] ? ` : ${p.errors[i]}` : ''}`}
                      style={{ width: 16, height: 6, borderRadius: 2, background: STEP_COLOR[s], animation: s === 'running' ? 'aPulse 1.4s ease-in-out infinite' : undefined }} />
                  ))}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: err && p.status === 'failed' ? '#F87171' : '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.status === 'failed' && err ? err : curLabel}
                </span>
                <Chip text={PHONE_LABEL[p.status]} tone={PHONE_TONE[p.status]} />
              </button>
              {isOpen && (
                <div style={{ margin: '0 16px 12px', padding: '8px 12px', borderRadius: 6, background: '#0C0C0E', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 220, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
                  {p.logs.length ? p.logs.join('\n') : 'En attente…'}
                </div>
              )}
            </div>
          )
        })}
        {list.length > LIMIT && <div style={{ padding: '10px 16px', fontSize: 12, color: '#71717A', borderTop: '1px solid rgba(255,255,255,0.05)' }}>… et {list.length - LIMIT} autre(s) — filtre « En cours » ou « Échecs » pour les voir.</div>}
      </div>
      {run.log.length > 0 && (
        <div style={{ margin: '4px 16px 16px', padding: '8px 12px', borderRadius: 6, background: '#0C0C0E', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 90, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: '#71717A', whiteSpace: 'pre-wrap' }}>
          {run.log.join('\n')}
        </div>
      )}
    </Panel>
  )
}
