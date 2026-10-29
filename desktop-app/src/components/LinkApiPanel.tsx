// Réglages › Intégrations : API ScaleFlow (clés) + site partenaire (banque du staff).
import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Btn, Chip, FIELD, MONO, Modal, Panel, PanelHead, Skeleton, toast, confirmDialog } from '@/lib/ui'
import { API_BASE, DOCS_URL, LINK_SQL, createToken, getPartner, isMissingSql, listTokens, revokeToken, savePartner, testPartner, type ApiToken, type Partner } from '@/lib/scaleflowLink'

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Copié ✓', 'ok') } catch { toast('Copie impossible : sélectionne le texte.', 'bad') }
}

export default function LinkApiPanel({ theme, org, canManage }: { theme: Theme; org: OrgState; canManage: boolean }) {
  const orgId = org.currentOrg?.id ?? null
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined)
  const [sqlMissing, setSqlMissing] = useState(false)
  const [name, setName] = useState('Site staff')
  const [fresh, setFresh] = useState<string | null>(null)        // clé tout juste créée (affichée une fois)
  const [busy, setBusy] = useState<string | null>(null)
  const [pName, setPName] = useState('')
  const [pUrl, setPUrl] = useState('')
  const [pKey, setPKey] = useState('')

  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([canManage ? listTokens(orgId) : Promise.resolve([]), getPartner(orgId)])
      setTokens(t); setPartner(p); setSqlMissing(false)
      setPName(p?.name ?? 'Staff'); setPUrl(p?.base_url ?? ''); setPKey('')
    } catch (e) {
      if (isMissingSql(e)) setSqlMissing(true)
      else toast(`API : ${e instanceof Error ? e.message : e}`, 'bad')
      setTokens([]); setPartner(null)
    }
  }, [orgId, canManage])
  useEffect(() => { void load() }, [load])

  async function create() {
    setBusy('create')
    try { setFresh(await createToken(orgId, name.trim() || 'Clé API')); await load() } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
    setBusy(null)
  }
  async function revoke(t: ApiToken) {
    if (!await confirmDialog({ title: `Révoquer « ${t.name} » ?`, text: 'Les sites qui utilisent cette clé perdront l’accès tout de suite.', confirmLabel: 'Révoquer', danger: true })) return
    try { await revokeToken(t.id); toast('Clé révoquée.', 'ok'); await load() } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
  }
  async function saveLink() {
    setBusy('save')
    try { await savePartner(orgId, pName, pUrl, pKey); toast('Site partenaire enregistré.', 'ok'); await load() } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
    setBusy(null)
  }
  async function removeLink() {
    if (!await confirmDialog({ title: 'Retirer la liaison ?', text: 'Sa banque ne sera plus visible dans ScaleFlow. Rien n’est supprimé chez lui.', confirmLabel: 'Retirer', danger: true })) return
    try { await savePartner(orgId, '', '', ''); toast('Liaison retirée.', 'ok'); await load() } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
  }
  async function test() {
    setBusy('test')
    try { await testPartner(orgId); toast('Connexion au site partenaire réussie ✓', 'ok') } catch (e) { toast(`Échec : ${e instanceof Error ? e.message : e}`, 'bad', 7000) }
    setBusy(null)
  }

  const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } as const
  const muted = { fontSize: 12, color: '#71717A', lineHeight: 1.5 } as const

  return (
    <>
      <Panel theme={theme}>
        <PanelHead title="API ScaleFlow" sub="Ton autre site (staff) voit ta banque, y récupère les vidéos et t’envoie du contenu." right={<Chip text={tokens?.length ? `${tokens.length} clé(s)` : 'Aucune clé'} tone={tokens?.length ? 'ok' : 'mute'} />} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
          {sqlMissing && <span style={{ fontSize: 12.5, color: '#FBBF24' }}>⚠ Colle d’abord le SQL <span style={{ fontFamily: MONO }}>{LINK_SQL}</span> dans Supabase → SQL Editor.</span>}
          <span style={row}>
            <span style={{ fontSize: 12.5, color: '#A1A1AA' }}>Adresse</span>
            <span data-no-tr style={{ fontFamily: MONO, fontSize: 12, color: '#EDEDEF', padding: '4px 8px', borderRadius: 6, background: '#141416', border: '1px solid rgba(255,255,255,0.08)' }}>{API_BASE}</span>
            <Btn theme={theme} sm label="Copier" onClick={() => void copy(API_BASE)} />
            <a href={DOCS_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#C4BBFB', textDecoration: 'none' }}>Documentation (à envoyer à ton dev) →</a>
          </span>
          {!canManage ? <span style={{ fontSize: 12, color: '#FBBF24' }}>Seuls owner / admin de l’organisation peuvent gérer les clés API.</span> : tokens === null ? <Skeleton h={32} r={6} /> : (
            <>
              {tokens.map(t => (
                <span key={t.id} style={{ ...row, padding: '8px 10px', borderRadius: 8, background: '#121214', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span data-no-tr style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>{t.name}</span>
                  <span data-no-tr style={{ fontFamily: MONO, fontSize: 11.5, color: '#8B8B94' }}>{t.prefix}…</span>
                  <span style={muted}>créée le {fmtDate(t.created_at)} · utilisée {t.last_used_at ? `le ${fmtDate(t.last_used_at)}` : 'jamais'}</span>
                  <span style={{ marginLeft: 'auto' }}><Btn theme={theme} sm tone="danger" label="Révoquer" onClick={() => void revoke(t)} /></span>
                </span>
              ))}
              <span style={row}>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de la clé (ex. Site staff)" style={{ ...FIELD, flex: 1, minWidth: 180 }} />
                <Btn theme={theme} sm tone="primary" label={busy === 'create' ? 'Création…' : 'Créer une clé'} disabled={!!busy || sqlMissing} onClick={() => void create()} />
              </span>
            </>
          )}
        </div>
      </Panel>

      <Panel theme={theme}>
        <PanelHead title="Site partenaire" sub="Sa banque apparaît dans Banque › bouton du partenaire, et tu peux y envoyer tes vidéos." right={partner === undefined ? undefined : <Chip text={partner ? `✓ ${partner.name}` : 'Non relié'} tone={partner ? 'ok' : 'mute'} />} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
          {partner === undefined ? <Skeleton h={32} r={6} /> : (
            <>
              <span style={row}>
                <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Nom (ex. Staff)" disabled={!canManage} style={{ ...FIELD, width: 160, flex: 'none' }} />
                <input value={pUrl} onChange={e => setPUrl(e.target.value)} placeholder="https://site-du-staff.com/api/scaleflow" disabled={!canManage} spellCheck={false} style={{ ...FIELD, flex: 1, minWidth: 220, fontFamily: MONO, fontSize: 12 }} />
              </span>
              <input value={pKey} onChange={e => setPKey(e.target.value)} type="password" autoComplete="off" disabled={!canManage} spellCheck={false}
                placeholder={partner ? `Clé inchangée (…${partner.key_hint}) — colle une nouvelle clé pour la remplacer` : 'Clé API que son site t’a donnée'} style={{ ...FIELD, fontFamily: MONO, fontSize: 12 }} />
              <span style={row}>
                {canManage && <Btn theme={theme} sm tone="primary" label={busy === 'save' ? 'Enregistrement…' : 'Enregistrer'} disabled={!!busy || sqlMissing || !pUrl.trim() || (!partner && !pKey.trim())} onClick={() => void saveLink()} />}
                {partner && <Btn theme={theme} sm label={busy === 'test' ? 'Test…' : 'Tester'} disabled={!!busy} onClick={() => void test()} />}
                {partner && canManage && <Btn theme={theme} sm tone="quiet" label="Retirer la liaison" onClick={() => void removeLink()} />}
              </span>
              <span style={muted}>Son site doit répondre aux mêmes routes que ScaleFlow (section 3 de la documentation) : la liste de ses dossiers, ses vidéos, et la réception de tes envois.</span>
            </>
          )}
        </div>
      </Panel>

      {fresh && (
        <Modal theme={theme} title="Ta nouvelle clé API" sub="Copie-la maintenant : elle ne sera plus jamais affichée." icon="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" onClose={() => setFresh(null)} width={560}
          footer={<><Btn theme={theme} label="Copier la clé" tone="primary" onClick={() => void copy(fresh)} /><Btn theme={theme} label="J’ai copié" onClick={() => setFresh(null)} /></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span data-no-tr style={{ fontFamily: MONO, fontSize: 12.5, color: '#EDEDEF', padding: '12px 14px', borderRadius: 10, background: '#141416', border: '1px solid rgba(255,255,255,0.1)', wordBreak: 'break-all', userSelect: 'all' }}>{fresh}</span>
            <span style={muted}>Donne-la seulement au serveur de ton autre site, avec l’adresse <span data-no-tr style={{ fontFamily: MONO }}>{API_BASE}</span>. Ne la colle jamais dans une page web ou une discussion. En cas de doute : révoque-la et crée-en une autre.</span>
          </div>
        </Modal>
      )}
    </>
  )
}
