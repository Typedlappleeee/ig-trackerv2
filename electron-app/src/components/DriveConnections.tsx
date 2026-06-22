// Modal de gestion des connexions Google Drive (modèle compte de service).
//
// L'utilisateur partage son dossier Drive avec l'email du compte de service,
// colle l'ID/URL du dossier ici, choisit un dossier de banque cible, puis la
// synchro serveur (cron horaire) importe les vidéos. Bouton « Synchroniser »
// pour déclencher à la demande.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import type { DriveConnection } from '@/lib/supabase'
import {
  listDriveConnections, saveDriveConnection, deleteDriveConnection,
  setDriveConnectionStatus, triggerDriveSync,
} from '@/lib/drive'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/Toast'

interface Props {
  user:        User
  orgId:       string | null
  folders:     string[]            // dossiers de banque existants (cible)
  serviceEmail?: string            // email du compte de service à partager
  onClose:     () => void
  onSynced:    () => void          // recharger la banque après import
}

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  x:       'M18 6 6 18M6 6l12 12',
  plus:    'M12 5v14M5 12h14',
  trash:   'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15',
  pause:   'M10 9v6m4-6v6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  play:    'M5 3l14 9-14 9V3z',
  drive:   'M7.71 3.5 1.15 15l3.42 6 6.56-11.5zM22.85 15 16.29 3.5H9.43L16 15zM5.43 16.5 2 22.5h13.14l3.43-6z',
}

function statusColor(s: DriveConnection['status']): { c: string; bg: string; label: string } {
  switch (s) {
    case 'active': return { c: '#059669', bg: 'rgba(5,150,105,0.1)',  label: 'Active' }
    case 'paused': return { c: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'En pause' }
    case 'error':  return { c: '#DC2626', bg: 'rgba(220,38,38,0.1)',  label: 'Erreur' }
  }
}

export function DriveConnectionsModal({ user, orgId, folders, serviceEmail, onClose, onSynced }: Props) {
  const toast = useToast()
  const [conns, setConns]       = useState<DriveConnection[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [saving, setSaving]     = useState(false)

  // Form (nouvelle connexion)
  const [showForm, setShowForm]   = useState(false)
  const [name, setName]           = useState('')
  const [folderId, setFolderId]   = useState('')
  const [target, setTarget]       = useState('')
  const [recursive, setRecursive] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConns(await listDriveConnections({ orgId, userId: user.id }))
    } catch (e) {
      toast.show({ title: 'Chargement échoué', body: e instanceof Error ? e.message : String(e), kind: 'error' })
    } finally {
      setLoading(false)
    }
  }, [orgId, user.id])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    if (!folderId.trim()) return
    setSaving(true)
    try {
      await saveDriveConnection({
        user_id: user.id,
        org_id: orgId,
        name,
        folder_id: folderId,
        target_folder: target.trim() || null,
        recursive,
      })
      setName(''); setFolderId(''); setTarget(''); setRecursive(true); setShowForm(false)
      await load()
      toast.show({ title: 'Connexion ajoutée', body: 'Lance une synchro pour importer les vidéos.', kind: 'ok' })
    } catch (e) {
      toast.show({ title: 'Enregistrement échoué', body: e instanceof Error ? e.message : String(e), kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDriveConnection(id)
      await load()
    } catch (e) {
      toast.show({ title: 'Suppression échouée', body: e instanceof Error ? e.message : String(e), kind: 'error' })
    }
  }

  async function handleToggle(c: DriveConnection) {
    try {
      await setDriveConnectionStatus(c.id, c.status === 'paused' ? 'active' : 'paused')
      await load()
    } catch (e) {
      toast.show({ title: 'Action échouée', body: e instanceof Error ? e.message : String(e), kind: 'error' })
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await triggerDriveSync()
      await load()
      if (res.imported > 0) onSynced()
      const errPart = res.errors?.length ? ` — ${res.errors.length} erreur(s)` : ''
      toast.show({
        title: 'Synchro terminée',
        body: `${res.imported} vidéo(s) importée(s)${errPart}`,
        kind: res.errors?.length ? 'error' : 'ok',
      })
    } catch (e) {
      toast.show({ title: 'Synchro échouée', body: e instanceof Error ? e.message : String(e), kind: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  const body = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card"
        style={{
          width: 620, maxWidth: '95vw', maxHeight: '88vh', borderRadius: 18,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818CF8',
          }}>
            <Icon d={ICONS.drive} size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Google Drive
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              Importe automatiquement les vidéos de tes dossiers Drive
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text2)', padding: 4, display: 'flex',
          }}>
            <Icon d={ICONS.x} size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>

          {/* Email compte de service à partager */}
          {serviceEmail && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
            }}>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 4px' }}>
                Partage tes dossiers Drive avec cet email (accès Lecteur) :
              </p>
              <code style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all',
              }}>{serviceEmail}</code>
            </div>
          )}

          {/* Connexions existantes */}
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              Chargement…
            </div>
          ) : conns.length === 0 ? (
            <div style={{
              padding: '28px 20px', textAlign: 'center', color: 'var(--text2)', fontSize: 13,
              border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 16,
            }}>
              Aucun dossier connecté. Ajoute-en un ci-dessous.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {conns.map(c => {
                const sc = statusColor(c.status)
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600, color: 'var(--text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{c.name}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
                          color: sc.c, background: sc.bg, border: `1px solid ${sc.c}33`,
                        }}>{sc.label}</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text2)', margin: '3px 0 0' }}>
                        {c.target_folder ? `→ ${c.target_folder}` : '→ racine'}
                        {' · '}{c.synced_count} importée(s)
                        {c.last_sync_at && ` · ${new Date(c.last_sync_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                      {c.status === 'error' && c.last_error && (
                        <p style={{ fontSize: 11, color: '#DC2626', margin: '3px 0 0', wordBreak: 'break-word' }}>
                          {c.last_error}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleToggle(c)} title={c.status === 'paused' ? 'Réactiver' : 'Mettre en pause'} style={{
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '5px 7px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
                    }}>
                      <Icon d={c.status === 'paused' ? ICONS.play : ICONS.pause} size={13} />
                    </button>
                    <button onClick={() => handleDelete(c.id)} title="Supprimer" style={{
                      background: 'transparent', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8,
                      padding: '5px 7px', cursor: 'pointer', color: '#DC2626', display: 'flex',
                    }}>
                      <Icon d={ICONS.trash} size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Formulaire d'ajout */}
          {showForm ? (
            <div style={{
              padding: 16, borderRadius: 12, border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 5 }}>Nom</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Mon Drive marketing"
                  className="sf-input" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 5 }}>ID ou URL du dossier Drive</label>
                <input value={folderId} onChange={e => setFolderId(e.target.value)} placeholder="https://drive.google.com/drive/folders/…"
                  className="sf-input" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 5 }}>Dossier de banque cible (optionnel)</label>
                <input value={target} onChange={e => setTarget(e.target.value)} placeholder="racine" list="sf-drive-folders"
                  className="sf-input" style={{ width: '100%' }} />
                <datalist id="sf-drive-folders">
                  {folders.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} />
                Inclure les sous-dossiers
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">Annuler</button>
                <Button onClick={handleSave} disabled={!folderId.trim() || saving} className="sf-btn-sm">
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="sf-btn sf-btn-ghost cursor-pointer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
              <Icon d={ICONS.plus} size={14} />
              Ajouter un dossier Drive
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            Synchro automatique toutes les heures
          </span>
          <Button onClick={handleSync} disabled={syncing || conns.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={syncing ? 'animate-spin' : ''} style={{ display: 'inline-flex' }}>
              <Icon d={ICONS.refresh} size={14} />
            </span>
            {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </Button>
        </div>
      </div>
    </div>
  )

  return createPortal(body, document.body)
}
