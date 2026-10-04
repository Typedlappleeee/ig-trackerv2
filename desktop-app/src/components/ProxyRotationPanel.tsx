import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Btn, Panel, PanelHead } from '@/lib/ui'
import { useProxyRotation, testRotationUrl, type ProxyRotationConfig } from '@/lib/proxyRotation'

// Config « Rotation d'IP proxy » : appelée avant chaque boot de téléphone.
// Partagée entre Paramètres et Connexions. Même format que le web (config.proxy).
export default function ProxyRotationPanel({ theme, user, org }: { theme: Theme; user: User; org: OrgState }) {
  const { cfg, setCfg, save, loading } = useProxyRotation(user, org)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tests, setTests] = useState<Record<number, { ok: boolean; msg: string } | 'run'>>({})

  const patch = (p: Partial<ProxyRotationConfig>) => setCfg({ ...cfg, ...p })
  const setUrl = (i: number, v: string) => { const urls = [...cfg.urls]; urls[i] = v; patch({ urls }) }
  const setName = (i: number, v: string) => { const names = [...(cfg.names ?? cfg.urls.map(() => ''))]; names[i] = v; patch({ names }) }
  const addRow = () => patch({ urls: [...cfg.urls, ''], names: [...(cfg.names ?? cfg.urls.map(() => '')), ''] })
  const removeRow = (i: number) => patch({ urls: cfg.urls.filter((_, j) => j !== i), names: (cfg.names ?? []).filter((_, j) => j !== i) })
  async function test(i: number) {
    const url = (cfg.urls[i] ?? '').trim(); if (!url) return
    setTests(t => ({ ...t, [i]: 'run' }))
    const r = await testRotationUrl(url)
    setTests(t => ({ ...t, [i]: { ok: r.ok, msg: r.ok ? 'Proxy joignable — IP changée ✓' : `Échec : ${r.detail}` } }))
  }
  async function doSave() { setSaving(true); const r = await save(cfg); setSaving(false); if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) } }

  const inp: CSSProperties = { flex: 1, minWidth: 0, height: 32, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12, outline: 'none' }
  const rows = cfg.urls.length ? cfg.urls : ['']

  return (
    <Panel theme={theme}>
      <PanelHead title="Rotation d'IP proxy" sub="Appelée avant chaque téléphone pour repartir sur une IP fraîche (posting, story, cross, warmup)."
        right={
          <span onClick={() => patch({ enabled: !cfg.enabled })} style={{ display: 'flex', alignItems: 'center', justifyContent: cfg.enabled ? 'flex-end' : 'flex-start', width: 40, height: 22, padding: 2, borderRadius: 99, cursor: 'pointer', background: cfg.enabled ? theme.accentBtn : 'rgba(255,255,255,0.12)' }}>
            <span style={{ width: 18, height: 18, borderRadius: 99, background: '#fff' }} />
          </span>
        } />
      <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 8, opacity: loading ? 0.5 : 1 }}>
        {rows.map((u, i) => {
          const t = tests[i]
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={u} onChange={e => setUrl(i, e.target.value)} placeholder="https://…/changeip?u=…" style={inp} />
                <input value={cfg.names?.[i] ?? ''} onChange={e => setName(i, e.target.value)} placeholder="Nom (optionnel)" style={{ ...inp, flex: '0 0 130px' }} />
                <Btn theme={theme} sm tone="quiet" label={t === 'run' ? '…' : 'Tester'} onClick={() => test(i)} />
                <button onClick={() => removeRow(i)} title="Retirer" style={{ width: 30, height: 32, flexShrink: 0, borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#71717A', cursor: 'pointer' }}>✕</button>
              </div>
              {t && t !== 'run' && <span style={{ fontSize: 11, color: t.ok ? '#34D399' : '#F87171', paddingLeft: 2 }}>{t.msg}</span>}
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Btn theme={theme} sm tone="quiet" icon="M12 5v14|M5 12h14" label="Ajouter un proxy" onClick={addRow} />
          <span style={{ flex: 1 }} />
          {saved && <span style={{ fontSize: 11.5, color: '#34D399' }}>Enregistré ✓</span>}
          <Btn theme={theme} sm tone="primary" label={saving ? 'Enregistrement…' : 'Enregistrer'} disabled={saving} onClick={doSave} />
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#52525B', lineHeight: 1.5 }}>
          Ex. Prox'Easy : <code>https://dongle.proxeasy.tech/android/changeip?u=…</code>. Un proxy ⇒ posting en série (1 IP à la fois). Plusieurs proxys ⇒ tu peux poster en parallèle.
        </p>
      </div>
    </Panel>
  )
}
