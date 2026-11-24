// Filet de sécurité : une erreur dans une page affiche le message (copiable) au lieu d'une page noire.
import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode; name?: string; resetPrefix?: string }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) {
    try { console.error('[ErrorBoundary]', this.props.name, err) } catch { /* noop */ }
    // Après une mise à jour, l'ancien onglet cherche un morceau de code qui n'existe plus → on recharge UNE fois
    if (/dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Failed to fetch/i.test(err.message)) {
      try {
        const k = 'sf-chunk-reload'
        if (Date.now() - Number(sessionStorage.getItem(k) ?? 0) > 60_000) { sessionStorage.setItem(k, String(Date.now())); location.reload() }
      } catch { /* noop */ }
    }
  }
  render() {
    const { err } = this.state
    if (!err) return this.props.children
    const text = `${this.props.name ?? 'Page'} — ${err.message}\n${(err.stack ?? '').split('\n').slice(0, 8).join('\n')}`
    const btn = { height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#151517', color: '#E4E4E7', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const
    return (
      <div style={{ margin: '24px 0', padding: 18, borderRadius: 12, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)', color: '#F4F4F5' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>⚠ Cette page a rencontré une erreur</div>
        <div style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 12 }}>Copie l’erreur et envoie-la : elle dit exactement ce qui a planté.</div>
        <pre data-no-tr style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.5, background: '#0D0D0F', padding: 12, borderRadius: 8, maxHeight: 220, overflow: 'auto', margin: '0 0 12px' }}>{text}</pre>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn} onClick={() => { try { void navigator.clipboard.writeText(text) } catch { /* noop */ } }}>📋 Copier l’erreur</button>
          <button style={btn} onClick={() => this.setState({ err: null })}>↻ Réessayer</button>
          {this.props.resetPrefix && <button style={btn} onClick={() => {
            try { for (const k of Object.keys(localStorage)) if (k.startsWith(this.props.resetPrefix!)) localStorage.removeItem(k) } catch { /* noop */ }
            this.setState({ err: null })
          }}>🧹 Réinitialiser les réglages iRemoTech de ce navigateur</button>}
        </div>
      </div>
    )
  }
}
