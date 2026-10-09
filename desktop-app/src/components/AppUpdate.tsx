// Barre du haut : langue, date de la dernière mise à jour, notes de mise à jour.
//   • UpdateChip   — pastille « MAJ 9 oct. » ; clic → les 3 dernières mises à jour.
//   • WhatsNewBar  — notif visible après chaque mise à jour (récap), une seule fois.
//   • UpdateBanner — « nouvelle version en ligne » + ce qu'elle apporte, bouton Rafraîchir.
//   • LangSwitch   — FR / EN.
import { useState, useSyncExternalStore } from 'react'
import type { Theme } from '@/lib/theme'
import { Btn, Modal } from '@/lib/ui'
import { APP_BUILD, fmtBuild, useAppUpdate } from '@/lib/appVersion'
import { useRuns } from '@/lib/runStore'
import { IS_WEB } from '@/lib/platform'
import { CHANGELOG, LATEST, type ChangelogEntry } from '@/lib/changelog'
import { locale, pick, setLang, useLang } from '@/lib/i18n'

const DISMISS_KEY = 'sf-update-dismissed'
const SEEN_KEY = 'sf-changelog-seen'

// ── « Nouveautés vues » (partagé entre la pastille et la notif) ─────────────
let seen: string | null = (() => { try { return localStorage.getItem(SEEN_KEY) } catch { return null } })()
const seenListeners = new Set<() => void>()
function markSeen(): void {
  seen = LATEST.id
  try { localStorage.setItem(SEEN_KEY, LATEST.id) } catch { /* ignore */ }
  seenListeners.forEach(f => f())
}
function useUnseen(): boolean {
  const s = useSyncExternalStore(cb => { seenListeners.add(cb); return () => { seenListeners.delete(cb) } }, () => seen, () => seen)
  return !!LATEST && s !== LATEST.id
}

function fmtDay(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Sélecteur de langue ──────────────────────────────────────────────────────
export function LangSwitch({ theme }: { theme: Theme }) {
  const lang = useLang()
  return (
    <span role="group" aria-label="Langue / Language" data-no-tr style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
      {(['fr', 'en'] as const).map(l => (
        <button key={l} type="button" onClick={() => { void setLang(l) }} aria-pressed={lang === l} style={{
          height: 22, padding: '0 7px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 500,
          background: lang === l ? 'rgba(255,255,255,0.09)' : 'transparent', color: lang === l ? '#EDEDEF' : '#71717A',
        }}>{l.toUpperCase()}</button>
      ))}
    </span>
  )
}

// ── Liste des mises à jour (panneau) ─────────────────────────────────────────
function EntryView({ e, theme, isNew }: { e: ChangelogEntry; theme: Theme; isNew: boolean }) {
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#EDEDEF' }}>{pick(e.title)}</span>
        {isNew && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 500, color: theme.accentText, background: `rgba(${theme.tone},0.12)`, border: `1px solid rgba(${theme.tone},0.25)` }}>{pick({ fr: 'Dernière', en: 'Latest' })}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#71717A', whiteSpace: 'nowrap' }}>{fmtDay(e.date)}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {pick(e.items).map((t, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: '#A1A1AA' }}>{t}</li>)}
      </ul>
    </div>
  )
}

// Les 3 dernières par défaut ; « Voir toutes les mises à jour » déplie tout l'historique,
// regroupé par mois. `entries` force une liste précise (nouvelle version pas encore chargée).
export function WhatsNewModal({ theme, onClose, entries, startAll = false }: { theme: Theme; onClose: () => void; entries?: ChangelogEntry[]; startAll?: boolean }) {
  useLang()
  const [all, setAll] = useState(startAll && !entries)
  const list = entries ?? (all ? CHANGELOG : CHANGELOG.slice(0, 3))
  const months: { key: string; label: string; items: ChangelogEntry[] }[] = []
  for (const e of list) {
    const key = e.date.slice(0, 7)
    let g = months.find(m => m.key === key)
    if (!g) {
      const d = new Date(e.date + 'T12:00:00')
      const label = d.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
      g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] }
      months.push(g)
    }
    g.items.push(e)
  }
  const canExpand = !entries && CHANGELOG.length > 3
  return (
    <Modal theme={theme} icon="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z"
      title={pick({ fr: 'Nouveautés', en: "What's new" })}
      sub={all
        ? pick({ fr: `Toutes les mises à jour de ScaleFlow (${CHANGELOG.length})`, en: `All ScaleFlow updates (${CHANGELOG.length})` })
        : pick({ fr: 'Les 3 dernières mises à jour de ScaleFlow', en: 'The last 3 ScaleFlow updates' })}
      onClose={onClose} width={560}
      footer={<>
        {canExpand && <span style={{ marginRight: 'auto' }}>
          <Btn theme={theme} tone="ghost" label={all
            ? pick({ fr: 'Voir seulement les 3 dernières', en: 'Show only the last 3' })
            : pick({ fr: `Voir toutes les mises à jour (${CHANGELOG.length})`, en: `See all updates (${CHANGELOG.length})` })}
            onClick={() => setAll(a => !a)} />
        </span>}
        <Btn theme={theme} tone="primary" label={pick({ fr: 'OK', en: 'Got it' })} onClick={onClose} />
      </>}>
      <div data-no-tr style={{ marginTop: -14 }}>
        {all ? months.map(m => (
          <div key={m.key}>
            <div style={{ position: 'sticky', top: -18, zIndex: 1, padding: '14px 0 6px', background: '#111113', fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{m.label}</div>
            {m.items.map(e => <EntryView key={e.id} e={e} theme={theme} isNew={e.id === CHANGELOG[0].id} />)}
          </div>
        )) : list.map((e, i) => <EntryView key={e.id} e={e} theme={theme} isNew={i === 0} />)}
      </div>
    </Modal>
  )
}

// ── Pastille « MAJ 9 oct. » ──────────────────────────────────────────────────
export function UpdateChip({ theme }: { theme: Theme }) {
  const upd = useAppUpdate()
  const unseen = useUnseen()
  useLang()
  const [open, setOpen] = useState(false)
  const full = new Date(APP_BUILD.builtAt).toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' })
  const hot = unseen || !!upd
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); markSeen() }}
        title={pick({ fr: `Version ${APP_BUILD.id} — mise à jour le ${full}. Clique pour voir les nouveautés.`, en: `Version ${APP_BUILD.id} — updated ${full}. Click to see what's new.` })}
        data-no-tr style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', flexShrink: 0, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', borderRadius: 6,
          color: hot ? '#D4D4D8' : '#8B8B94', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: hot ? theme.accentText : '#34D399', animation: unseen ? 'aPulse 1.6s ease-in-out infinite' : undefined }} />
        {pick({ fr: 'MAJ', en: 'Updated' })} {pick({ fr: fmtBuild(), en: new Date(APP_BUILD.builtAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) })}
        {unseen && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 500, color: '#fff', background: theme.accentBtn }}>{pick({ fr: 'Nouveau', en: 'New' })}</span>}
      </button>
      {open && <WhatsNewModal theme={theme} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Notif après une mise à jour : récap des nouveautés (une fois) ───────────
export function WhatsNewBar({ theme }: { theme: Theme }) {
  const unseen = useUnseen()
  useLang()
  const [open, setOpen] = useState(false)
  if (!unseen && !open) return null
  return (
    <>
      {unseen && (
        <div role="status" data-no-tr style={{
          flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', padding: '11px 20px',
          background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.07)', boxShadow: `inset 2px 0 0 ${theme.accent}`,
          animation: 'aIn .35s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <span style={{ fontSize: 15, lineHeight: '20px' }}>✨</span>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>
              {pick({ fr: 'ScaleFlow a été mis à jour', en: 'ScaleFlow has been updated' })}
              <span style={{ color: theme.accentText }}> · {pick(LATEST.title)}</span>
              <span style={{ fontWeight: 500, color: '#71717A' }}> — {fmtDay(LATEST.date)}</span>
            </span>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {pick(LATEST.items).slice(0, 3).map((t, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: '#A1A1AA' }}>{t}</li>)}
            </ul>
          </div>
          <span style={{ display: 'flex', gap: 8, alignSelf: 'center' }}>
            <Btn sm theme={theme} tone="quiet" label={pick({ fr: 'Toutes les MAJ', en: 'All updates' })} onClick={() => { setOpen(true); markSeen() }} />
            <Btn sm theme={theme} tone="primary" label={pick({ fr: 'OK, compris', en: 'Got it' })} onClick={markSeen} />
          </span>
        </div>
      )}
      {open && <WhatsNewModal theme={theme} onClose={() => setOpen(false)} startAll />}
    </>
  )
}

// ── Nouvelle version en ligne (web) ──────────────────────────────────────────
export function UpdateBanner({ theme }: { theme: Theme }) {
  const upd = useAppUpdate()
  const runs = useRuns()
  useLang()
  const [confirm, setConfirm] = useState(false)
  const [notes, setNotes] = useState(false)
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) } catch { return null } })
  if (!IS_WEB || !upd || dismissed === upd.id) return null

  const active = runs.filter(r => r.status === 'running').length
  const reload = () => window.location.reload()
  const later = () => { try { localStorage.setItem(DISMISS_KEY, upd.id) } catch { /* */ } setDismissed(upd.id) }
  const when = upd.builtAt ? pick({ fr: ` (publiée le ${fmtBuild(upd.builtAt)})`, en: ` (published ${new Date(upd.builtAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })})` }) : ''
  // Ce que la nouvelle version apporte (si ses notes diffèrent de celles déjà chargées).
  const fresh = (upd.changes ?? []).filter(c => !CHANGELOG.some(x => x.id === c.id))

  return (
    <>
      <div role="status" data-no-tr style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 20px',
        background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.07)', boxShadow: `inset 2px 0 0 ${theme.accent}`, color: '#E4E4E7', fontSize: 12.5,
      }}>
        <span style={{ fontWeight: 600, color: '#EDEDEF' }}>{pick({ fr: 'Nouvelle version de ScaleFlow en ligne', en: 'A new version of ScaleFlow is live' })}{when}.</span>
        {fresh.length > 0
          ? <span style={{ color: '#C4C4CC' }}>{pick({ fr: 'Au programme : ', en: "What's in it: " })}<b style={{ color: '#E4E4E7' }}>{pick(fresh[0].title)}</b>
              {' · '}<button type="button" onClick={() => setNotes(true)} style={{ border: 'none', background: 'none', padding: 0, color: theme.accentText, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline' }}>{pick({ fr: 'détails', en: 'details' })}</button></span>
          : <span style={{ color: '#A1A1AA' }}>{pick({ fr: "Rafraîchis la page pour l'avoir — ton onglet utilise l'ancienne.", en: 'Refresh the page to get it — this tab is still on the old one.' })}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn sm theme={theme} tone="quiet" label={pick({ fr: 'Plus tard', en: 'Later' })} onClick={later} />
          <Btn sm theme={theme} tone="primary" label={pick({ fr: 'Rafraîchir', en: 'Refresh' })} onClick={() => active ? setConfirm(true) : reload()} />
        </span>
      </div>
      {notes && <WhatsNewModal theme={theme} onClose={() => setNotes(false)} entries={fresh.slice(0, 3)} />}
      {confirm && (
        <Modal theme={theme} title={pick({ fr: 'Rafraîchir maintenant ?', en: 'Refresh now?' })}
          sub={pick({ fr: `${active} lancement${active > 1 ? 's' : ''} en cours`, en: `${active} run${active > 1 ? 's' : ''} in progress` })} onClose={() => setConfirm(false)}
          footer={<><Btn theme={theme} tone="ghost" label={pick({ fr: 'Attendre', en: 'Wait' })} onClick={() => setConfirm(false)} /><Btn theme={theme} tone="primary" label={pick({ fr: 'Rafraîchir quand même', en: 'Refresh anyway' })} onClick={reload} /></>}>
          <div data-no-tr style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.55 }}>
            {pick({
              fr: 'Un lancement est en cours dans cet onglet. Si tu rafraîchis, les publications déjà envoyées continuent sur les téléphones, mais tu perds le suivi en direct ici. Mieux vaut attendre la fin.',
              en: "A run is in progress in this tab. If you refresh, posts already sent keep going on the phones, but you lose live tracking here. Better to wait until it's done.",
            })}
          </div>
        </Modal>
      )}
    </>
  )
}
