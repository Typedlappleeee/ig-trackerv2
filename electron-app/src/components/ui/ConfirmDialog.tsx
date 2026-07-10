// Dialog de confirmation partagé — remplace les confirm()/suppressions 1-clic.
// Usage déclaratif :
//   const [confirmDelete, setConfirmDelete] = useState<Item | null>(null)
//   <ConfirmDialog
//     open={!!confirmDelete}
//     title="Supprimer la vidéo ?"
//     message={`« ${confirmDelete?.title} » sera définitivement supprimée.`}
//     confirmLabel="Supprimer"
//     danger
//     onConfirm={() => { doDelete(confirmDelete!); setConfirmDelete(null) }}
//     onCancel={() => setConfirmDelete(null)}
//   />
import { Modal } from './Modal'
import { useTr } from '@/lib/i18n'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style rouge pour les actions destructives */
  danger?: boolean
  /** Désactive les boutons pendant une opération async */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel, cancelLabel,
  danger = false, busy = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const tr = useTr()
  const confirmText = confirmLabel ?? tr('Confirmer', 'Confirm')
  const cancelText  = cancelLabel ?? tr('Annuler', 'Cancel')
  return (
    <Modal open={open} onClose={onCancel} width={420} locked={busy}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: danger ? 'rgba(248,113,113,0.1)' : 'rgba(99,102,241,0.1)',
            border: `1px solid ${danger ? 'rgba(248,113,113,0.3)' : 'rgba(99,102,241,0.3)'}`,
            color: danger ? '#F87171' : '#818CF8',
          }}>
            {danger ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory, #E9EAF0)', margin: 0, letterSpacing: '-0.01em' }}>
              {title}
            </h3>
            {message && (
              <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(233,234,240,0.55)', margin: '6px 0 0' }}>
                {message}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="sf-btn sf-btn-secondary"
            style={{ padding: '8px 16px', fontSize: 13 }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="sf-btn"
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: danger ? 'rgba(248,113,113,0.14)' : 'var(--accent, #6366F1)',
              border: `1px solid ${danger ? 'rgba(248,113,113,0.45)' : 'transparent'}`,
              color: danger ? '#F87171' : '#fff',
              borderRadius: 8, cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? '…' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
