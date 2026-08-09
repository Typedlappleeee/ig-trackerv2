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
import { useTr, tr } from '@/lib/i18n'

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
    case 'active': return { c: '#059669', bg: 'rgba(5,150,105,0.1)',  label: tr('Active', 'Active') }
    case 'paused': return { c: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: tr('En pause', 'Paused') }
    case 'error':  return { c: '#DC2626', bg: 'rgba(220,38,38,0.1)',  label: tr('Erreur', 'Error') }
  }
}

export function DriveConnectionsModal({ user, orgId, folders, serviceEmail, onClose, onSynced }: Props) {
  const toast = useToast()
  const tr = useTr()
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
  const [copied, setCopied]       = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  async function copyEmail() {
    if (!serviceEmail) return
    try {
      await navigator.clipboard.writeText(serviceEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConns(await listDriveConnections({ orgId, userId: user.id }))
    } catch (e) {
      toast.show({ title: tr('Chargement échoué', 'Load failed'), body: e instanceof Error ? e.message : String(e), kind: 'error' })
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
      toast.show({ title: tr('Connexion ajoutée', 'Connection added'), body: tr('Lance une synchro pour importer les vidéos.', 'Run a sync to import the videos.'), kind: 'ok' })
    } catch (e) {
      toast.show({ title: tr('Enregistrement échoué', 'Save failed'), body: e instanceof Error ? e.message : String(e), kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDriveConnection(id)
      await load()
    } catch (e) {
      toast.show({ title: tr('Suppression échouée', 'Delete failed'), body: e instanceof Error ? e.message : String(e), kind: 'error' })
    }
  }

  async function handleToggle(c: DriveConnection) {
    try {
      await setDriveConnectionStatus(c.id, c.status === 'paused' ? 'active' : 'paused')
      await load()
    } catch (e) {
      toast.show({ title: tr('Action échouée', 'Action failed'), body: e instanceof Error ? e.message : String(e), kind: 'error' })
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await triggerDriveSync()
      await load()
      if (res.imported > 0) onSynced()
      const errPart = res.errors?.length ? tr(` — ${res.errors.length} erreur(s)`, ` — ${res.errors.length} error(s)`) : ''
      toast.show({
        title: tr('Synchro terminée', 'Sync complete'),
        body: tr(`${res.imported} vidéo(s) importée(s)${errPart}`, `${res.imported} video(s) imported${errPart}`),
        kind: res.errors?.length ? 'error' : 'ok',
      })
    } catch (e) {
      toast.show({ title: tr('Synchro échouée', 'Sync failed'), body: e instanceof Error ? e.message : String(e), kind: 'error' })
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
              {tr('Importe automatiquement les vidéos de tes dossiers Drive', 'Automatically import videos from your Drive folders')}
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

          {/* Guide « Comment connecter ton Drive » */}
          <div style={{
            borderRadius: 12, marginBottom: 16, overflow: 'hidden',
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
          }}>
            <button
              onClick={() => setShowGuide(g => !g)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 16 }}>💡</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {tr('Comment connecter ton Drive ?', 'How to connect your Drive?')}
              </span>
              <span style={{
                display: 'inline-flex', transform: showGuide ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s', color: 'var(--text2)',
              }}>
                <Icon d="M19 9l-7 7-7-7" size={14} />
              </span>
            </button>

            {showGuide && (
              <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Étape 1 — partager */}
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                    {tr('1. Partage ton dossier Drive', '1. Share your Drive folder')}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 6px', lineHeight: 1.5 }}>
                    {tr('Dans Google Drive : clic droit sur ton dossier →', 'In Google Drive: right-click your folder →')} <b>{tr('Partager', 'Share')}</b> {tr('→ colle cet email en accès', '→ paste this email with')} <b>{tr('Lecteur', 'Viewer')}</b> {tr('access :', 'access:')}
                  </p>
                  {serviceEmail ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{
                        flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all',
                        padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--border)',
                      }}>{serviceEmail}</code>
                      <button onClick={copyEmail} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer"
                        style={{ flexShrink: 0, color: copied ? '#059669' : undefined }}>
                        {copied ? tr('✓ Copié', '✓ Copied') : tr('Copier', 'Copy')}
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11.5, color: '#f59e0b', margin: 0 }}>
                      {tr('(Email du compte de service à configurer côté admin — variable VITE_DRIVE_SERVICE_EMAIL.)', '(Service account email to be configured by the admin — VITE_DRIVE_SERVICE_EMAIL variable.)')}
                    </p>
                  )}
                </div>
                {/* Étape 2 — coller le lien */}
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                    {tr('2. Copie le lien du dossier', '2. Copy the folder link')}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
                    {tr('Clic droit sur le dossier →', 'Right-click the folder →')} <b>{tr('Copier le lien', 'Copy link')}</b>{tr(', puis colle-le ci-dessous dans « Ajouter un dossier Drive ».', ', then paste it below in “Add a Drive folder”.')}
                  </p>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text2)', margin: 0, fontStyle: 'italic' }}>
                  {tr("C'est tout — tes vidéos arrivent dans la banque et se mettent à jour toutes les heures.", 'That’s it — your videos land in the bank and refresh every hour.')}
                </p>
              </div>
            )}
          </div>

          {/* Connexions existantes */}
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              {tr('Chargement…', 'Loading…')}
            </div>
          ) : conns.length === 0 ? (
            <div style={{
              padding: '28px 20px', textAlign: 'center', color: 'var(--text2)', fontSize: 13,
              border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 16,
            }}>
              {tr('Aucun dossier connecté. Ajoute-en un ci-dessous.', 'No folder connected. Add one below.')}
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
                        {c.target_folder ? `→ ${c.target_folder}` : tr('→ racine', '→ root')}
                        {' · '}{tr(`${c.synced_count} importée(s)`, `${c.synced_count} imported`)}
                        {c.last_sync_at && ` · ${new Date(c.last_sync_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                      {c.status === 'error' && c.last_error && (
                        <p style={{ fontSize: 11, color: '#DC2626', margin: '3px 0 0', wordBreak: 'break-word' }}>
                          {c.last_error}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleToggle(c)} title={c.status === 'paused' ? tr('Réactiver', 'Resume') : tr('Mettre en pause', 'Pause')} style={{
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '5px 7px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
                    }}>
                      <Icon d={c.status === 'paused' ? ICONS.play : ICONS.pause} size={13} />
                    </button>
                    <button onClick={() => handleDelete(c.id)} title={tr('Supprimer', 'Delete')} style={{
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 5 }}>{tr('Nom', 'Name')}</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Mon Drive marketing', 'My marketing Drive')}
                  className="sf-input" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 5 }}>{tr('ID ou URL du dossier Drive', 'Drive folder ID or URL')}</label>
                <input value={folderId} onChange={e => setFolderId(e.target.value)} placeholder="https://drive.google.com/drive/folders/…"
                  className="sf-input" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 5 }}>{tr('Dossier de banque cible (optionnel)', 'Target bank folder (optional)')}</label>
                <input value={target} onChange={e => setTarget(e.target.value)} placeholder={tr('racine', 'root')} list="sf-drive-folders"
                  className="sf-input" style={{ width: '100%' }} />
                <datalist id="sf-drive-folders">
                  {folders.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} />
                {tr('Inclure les sous-dossiers', 'Include subfolders')}
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">{tr('Annuler', 'Cancel')}</button>
                <Button onClick={handleSave} disabled={!folderId.trim() || saving} className="sf-btn-sm">
                  {saving ? tr('Enregistrement…', 'Saving…') : tr('Enregistrer', 'Save')}
                </Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="sf-btn sf-btn-ghost cursor-pointer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
              <Icon d={ICONS.plus} size={14} />
              {tr('Ajouter un dossier Drive', 'Add a Drive folder')}
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 20px', borderTop: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {tr('Synchro automatique toutes les heures', 'Automatic sync every hour')}
          </span>
          <Button onClick={handleSync} disabled={syncing || conns.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={syncing ? 'animate-spin' : ''} style={{ display: 'inline-flex' }}>
              <Icon d={ICONS.refresh} size={14} />
            </span>
            {syncing ? tr('Synchronisation…', 'Syncing…') : tr('Synchroniser maintenant', 'Sync now')}
          </Button>
        </div>
      </div>
    </div>
  )

  return createPortal(body, document.body)
}
