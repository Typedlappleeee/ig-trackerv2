import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { fetchAllPhones, postInstagramStory, stopPhone, type GeelarkPhone } from '@/lib/geelark'
import { BankPicker } from '@/pages/Bank'
import { playSuccess, playError } from '@/lib/sounds'

type LogLine = { msg: string; t: number }

export default function StoryLink({ user }: { user: User }) {
  const conns  = useConnections(user)
  const bearer = conns.bearer
  const { currentOrg } = useOrg()

  const [phones, setPhones]       = useState<GeelarkPhone[]>([])
  const [loadingPhones, setLoadingPhones] = useState(false)
  const [phoneSearch, setPhoneSearch]     = useState('')
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

  const [imageUrl, setImageUrl]   = useState('')
  const [imageName, setImageName] = useState('')
  const [linkUrl, setLinkUrl]     = useState('')
  const [linkText, setLinkText]   = useState('')

  const [showBank, setShowBank]   = useState(false)
  const [running, setRunning]     = useState(false)
  const [logs, setLogs]           = useState<LogLine[]>([])
  const [result, setResult]       = useState<'ok' | 'error' | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // ── Load phones ───────────────────────────────────────────────────────────
  async function loadPhones() {
    if (!bearer) return
    setLoadingPhones(true)
    try {
      const list = await fetchAllPhones(bearer)
      setPhones(list)
    } catch (_) { /* ignore */ }
    setLoadingPhones(false)
  }
  useEffect(() => { if (bearer && !conns.loading) loadPhones() }, [bearer, conns.loading])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  function addLog(msg: string) {
    setLogs(prev => [...prev, { msg, t: Date.now() }])
  }

  const canRun = !!bearer && !!selectedPhone && !!imageUrl.trim() && !!linkUrl.trim() && !running

  async function run() {
    if (!canRun || !bearer || !selectedPhone) return
    setRunning(true); setResult(null); setLogs([])
    try {
      const res = await postInstagramStory(
        bearer, selectedPhone,
        { imageUrl: imageUrl.trim(), linkUrl: linkUrl.trim(), linkText: linkText.trim() || undefined },
        addLog,
      )
      if (res.ok) { setResult('ok'); playSuccess() }
      else { setResult('error'); addLog(`❌ ${res.error ?? 'Échec'}`); playError() }
    } catch (e) {
      setResult('error'); addLog(`❌ ${e instanceof Error ? e.message : String(e)}`); playError()
    } finally {
      try { await stopPhone(bearer, selectedPhone) } catch (_) { /* ignore */ }
      setRunning(false)
    }
  }

  const phoneName = (p: GeelarkPhone) => p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)
  const filteredPhones = phones.filter(p =>
    !phoneSearch || phoneName(p).toLowerCase().includes(phoneSearch.toLowerCase()))

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!conns.loading && !bearer) {
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <p style={{ fontSize: 32, marginBottom: 14 }}>🔌</p>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e8e6f0', marginBottom: 8 }}>GéeLark non connecté</h2>
          <p style={{ fontSize: 13.5, color: 'rgba(148,163,184,0.6)', lineHeight: 1.6 }}>
            Ajoute ta clé GéeLark dans les Réglages pour automatiser des stories.
          </p>
        </div>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px', borderRadius: 11, fontSize: 14,
    background: 'rgba(14,14,22,0.8)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#e8e6f0', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
  }
  const focusOn  = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)' }
  const focusOff = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 8, display: 'block' }

  return (
    <div style={{ minHeight: '100%', padding: '32px 36px 72px' }}>
      {showBank && (
        <BankPicker
          user={user}
          mode="single"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            if (paths[0]) { setImageUrl(paths[0]); setImageName(titles?.[0] ?? 'image banque') }
            setShowBank(false)
          }}
          onClose={() => setShowBank(false)}
        />
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', animation: 'page-fade-in 0.4s ease both' }}>

        {/* Header */}
        <div style={{ position: 'relative', marginBottom: 28 }}>
          <div style={{ position: 'absolute', top: -50, left: 0, width: 360, height: 150, background: 'radial-gradient(ellipse, rgba(236,72,153,0.13) 0%, transparent 70%)', filter: 'blur(45px)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(236,72,153,0.22), rgba(236,72,153,0.06))',
              border: '1px solid rgba(236,72,153,0.25)', color: '#f472b6',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: '#f2f0ff' }}>Story + Lien</h1>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.28)' }}>BETA</span>
              </div>
              <p style={{ fontSize: 13.5, color: 'rgba(148,163,184,0.62)', marginTop: 5 }}>
                Publie une story avec une image et un sticker lien cliquable (en bas à droite).
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 24 }}>

          {/* ── Left: form ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* Account */}
            <div>
              <label style={labelStyle}>1 · Compte</label>
              <input
                value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                placeholder="Rechercher un compte…" style={{ ...inputStyle, marginBottom: 10 }}
                onFocus={focusOn} onBlur={focusOff}
              />
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 8, background: 'rgba(13,13,20,0.5)' }}>
                {loadingPhones ? (
                  <p style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.5)', padding: 12, textAlign: 'center' }}>Chargement…</p>
                ) : filteredPhones.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.5)', padding: 12, textAlign: 'center' }}>Aucun compte</p>
                ) : filteredPhones.map(p => {
                  const sel = selectedPhone === p.id
                  return (
                    <button key={p.id} onClick={() => setSelectedPhone(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                        background: sel ? 'rgba(236,72,153,0.14)' : 'transparent',
                        border: `1px solid ${sel ? 'rgba(236,72,153,0.4)' : 'transparent'}`,
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: sel ? '#f472b6' : 'rgba(148,163,184,0.3)' }} />
                      <span style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? '#fff' : 'rgba(226,232,240,0.7)' }}>{phoneName(p)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Image */}
            <div>
              <label style={labelStyle}>2 · Image de la story</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowBank(true)}
                  className="sf-press"
                  style={{ flexShrink: 0, height: 44, padding: '0 16px', borderRadius: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}>
                  📁 Banque
                </button>
                <input
                  value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageName('') }}
                  placeholder="…ou colle une URL d'image" style={inputStyle}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              {imageName && <p style={{ fontSize: 12, color: '#4ade80', marginTop: 8 }}>✓ {imageName}</p>}
            </div>

            {/* Link URL */}
            <div>
              <label style={labelStyle}>3 · Lien (URL)</label>
              <input
                value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://exemple.com" style={inputStyle}
                onFocus={focusOn} onBlur={focusOff}
              />
            </div>

            {/* Link text */}
            <div>
              <label style={labelStyle}>4 · Texte du sticker <span style={{ textTransform: 'none', color: 'rgba(148,163,184,0.4)', fontWeight: 400 }}>(optionnel)</span></label>
              <input
                value={linkText} onChange={e => setLinkText(e.target.value)}
                placeholder="Ex: Voir plus 👀" style={inputStyle}
                onFocus={focusOn} onBlur={focusOff}
              />
            </div>

            {/* Run */}
            <button onClick={run} disabled={!canRun}
              className="sf-press"
              style={{
                height: 50, borderRadius: 13, fontSize: 15, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed',
                background: canRun ? 'linear-gradient(135deg, #7c3aed, #ec4899)' : 'rgba(255,255,255,0.05)',
                border: 'none', color: canRun ? '#fff' : 'rgba(148,163,184,0.4)',
                boxShadow: canRun ? '0 8px 24px -8px rgba(236,72,153,0.5)' : 'none',
                transition: 'all 0.2s',
              }}>
              {running ? '⏳ Publication en cours…' : '🚀 Publier la story'}
            </button>
          </div>

          {/* ── Right: live log ────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>Journal en direct</label>
            <div style={{
              flex: 1, minHeight: 320, borderRadius: 14, padding: 16,
              background: 'rgba(8,8,14,0.9)', border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.7,
              overflowY: 'auto', maxHeight: 480,
            }}>
              {logs.length === 0 ? (
                <p style={{ color: 'rgba(148,163,184,0.35)' }}>En attente de lancement…</p>
              ) : logs.map((l, i) => (
                <div key={i} style={{ color: 'rgba(226,232,240,0.75)', animation: 'slide-in-left 0.2s ease both' }}>
                  <span style={{ color: 'rgba(148,163,184,0.35)', marginRight: 8 }}>
                    {new Date(l.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {l.msg}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
            {result === 'ok' && (
              <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 11, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', fontSize: 13, fontWeight: 600 }}>
                ✅ Story publiée avec succès !
              </div>
            )}
            {result === 'error' && (
              <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 11, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                ❌ Échec — l'UI Instagram a peut-être changé. Vérifie le journal.
              </div>
            )}
          </div>
        </div>

        {/* Fragility notice */}
        <div style={{ marginTop: 28, padding: '14px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <p style={{ fontSize: 12.5, color: 'rgba(251,191,36,0.85)', lineHeight: 1.6 }}>
            <strong>Fonction expérimentale.</strong> L'automation pilote l'app Instagram directement (pas d'API officielle pour les stories). Si Instagram met à jour son interface, certaines étapes peuvent échouer — le journal indique où. {currentOrg ? '' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
