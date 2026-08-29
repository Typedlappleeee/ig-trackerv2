import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, Empty } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import {
  useMetaConfig, buildMetaAuthUrl, fetchMetaConnections, syncMetaInsights,
  type MetaConnection,
} from '@/lib/meta'
import { useProxyRotation, testRotationUrl, type ProxyRotationConfig } from '@/lib/proxyRotation'

function fmtDate(iso: string | null): string {
  if (!iso) return 'jamais'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Connections({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const cfg = useMetaConfig(user, org)
  const [conns, setConns] = useState<MetaConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try { setConns(await fetchMetaConnections(user, org)) } catch { setConns([]) }
    setLoading(false)
  }, [org.currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  const configured = !!cfg.appId && !!cfg.redirectUri

  function connect() {
    if (!configured) return
    const state = org.currentOrg ? `${user.id}:${org.currentOrg.id}` : user.id
    const url = buildMetaAuthUrl(cfg.appId, cfg.redirectUri, state)
    // En Electron, un lien http s'ouvre dans le navigateur système (setWindowOpenHandler).
    window.open(url, '_blank')
  }

  async function sync() {
    if (conns.length === 0 || syncing) return
    setSyncing(true); setLogs([])
    const push = (m: string) => setLogs(l => [...l.slice(-200), m])
    const r = await syncMetaInsights(user, org, conns, push)
    push(`✔ Terminé — ${r.updated} compte(s) mis à jour${r.errors ? `, ${r.errors} erreur(s)` : ''}.`)
    setSyncing(false)
    load()
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Connexions Instagram"
        sub="Relie tes comptes via l'API officielle Meta (façon Metricool) pour remonter vues et abonnés natifs dans Performances."
        actions={
          <Btn theme={theme} tone="primary" icon="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"
            label="Connecter un compte" disabled={!configured} onClick={connect} />
        }
      />

      {/* État de la config App Meta */}
      {!cfg.loading && !configured && (
        <Panel theme={theme} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, padding: '14px 16px', alignItems: 'flex-start' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.24)', color: '#FBBF24' }}>
              <Icon d="M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" size={15} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F6' }}>App Meta pas encore branchée</div>
              <p style={{ margin: '5px 0 0', fontSize: 12, lineHeight: 1.6, color: '#A1A1AA', maxWidth: 620 }}>
                Crée une App Meta (developers.facebook.com, produit « Instagram Graph API »), pose <b>META_APP_ID</b>, <b>META_APP_SECRET</b> et <b>META_REDIRECT_URI</b> en variables d'env Vercel, et renseigne <code>meta_app_id</code> + <code>meta_redirect_uri</code> dans ta config. La connexion s'activera alors ici automatiquement.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* Comptes connectés */}
      <Panel theme={theme}>
        <PanelHead
          title="Comptes connectés"
          sub={configured ? 'Reliés via Facebook Login' : 'Disponible une fois l\'App Meta branchée'}
          right={conns.length > 0 ? (
            <Btn theme={theme} sm icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16"
              label={syncing ? 'Sync…' : 'Synchroniser les stats'} disabled={syncing} onClick={sync} />
          ) : undefined}
        />
        {loading ? (
          <div style={{ padding: 36, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
        ) : conns.length === 0 ? (
          <Empty icon="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"
            title="Aucun compte connecté"
            text={configured
              ? "Clique « Connecter un compte », accepte dans Facebook, et tes comptes IG Business reliés à une Page apparaîtront ici."
              : "Branche d'abord ton App Meta pour pouvoir connecter des comptes."} />
        ) : conns.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: i < conns.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.22)', color: '#34D399' }}>
              <Icon d="M20 6L9 17l-5-5" size={14} sw={2.4} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F4F4F6' }}>@{c.ig_username ?? c.ig_user_id}</span>
              <span style={{ fontSize: 11, color: '#52525B' }}>Page {c.page_id ?? '—'} · sync {fmtDate(c.last_synced_at)}</span>
            </span>
            <Chip text="connecté" tone="ok" />
          </div>
        ))}

        {logs.length > 0 && (
          <div style={{ margin: '0 15px 13px', padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.05)', maxHeight: 200, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
            {logs.join('\n')}
          </div>
        )}
      </Panel>

      <div style={{ marginTop: 12 }}>
        <ProxyRotationPanel theme={theme} user={user} org={org} />
      </div>
    </div>
  )
}

// ── Rotation d'IP proxy (Change-IP URLs appelées avant chaque boot) ────────────
function ProxyRotationPanel({ theme, user, org }: { theme: Theme; user: User; org: OrgState }) {
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

  const inp: React.CSSProperties = { flex: 1, minWidth: 0, height: 32, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12, outline: 'none' }
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
