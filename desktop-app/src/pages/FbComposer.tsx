// Reels Facebook par l'API officielle Meta : on choisit des Pages connectées, des vidéos de la
// Banque et une légende ; chaque Page publie en parallèle, sans téléphone. La connexion des Pages
// (fenêtre Facebook) et la publication passent par /api/fb — les jetons restent sur le serveur.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { Btn, Chip, Panel, PanelHead, TEXTAREA, FIELD_SM, Segmented, SkeletonRows, Empty, Icon, toast, confirmDialog, useNarrow } from '@/lib/ui'
import { PageHeader } from '@/components/Kit'
import BankPicker from '@/components/BankPicker'
import CaptionPools from '@/components/CaptionPools'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'
import { startRun } from '@/lib/runStore'
import { listFbPages, fbConnectUrl, removeFbPage, publishFbReel, fbReelStatus, planFbJobs, captionFor, type FbPage, type FbError } from '@/lib/fbPages'

const FB = '#1877F2'
const PAGE_ICON = 'M4 4h16v16H4z|M13 20v-7h2.5l.5-3H13V8.5c0-.9.3-1.5 1.6-1.5H16V4.2A19 19 0 0 0 14 4c-2.2 0-3.6 1.3-3.6 3.8V10H8v3h2.4v7'
type Phase = 'pending' | 'sending' | 'processing' | 'published' | 'failed'
interface Item { key: string; page: string; pageName: string; file: string; title: string; phase: Phase; error?: string; link?: string | null }
const PARALLEL = 4
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export default function FbComposer({ theme, user, org, onBack }: { theme: Theme; user: User; org: OrgState; onBack: () => void }) {
  const orgId = org.currentOrg?.id ?? null
  const narrow = useNarrow()
  const [pages, setPages] = useState<FbPage[] | null>(null)
  const [state, setState] = useState<'ok' | 'not_configured' | 'no_sql' | 'error'>('ok')
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [videos, setVideos] = useState<{ id: string; title: string }[]>([])
  const [picker, setPicker] = useState(false)
  const [caption, setCaption] = useState('')
  const [mode, setMode] = useState<'rotate' | 'all'>('rotate')
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [waiting, setWaiting] = useState(false)   // fenêtre Facebook ouverte : on guette les nouvelles Pages
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async (quiet = false) => {
    try {
      const r = await listFbPages(orgId)
      if (!alive.current) return 0
      setPages(r.pages); setState(r.configured ? 'ok' : 'not_configured'); setErr(null)
      return r.pages.length
    } catch (e) {
      if (!alive.current) return 0
      const code = (e as FbError).code
      setPages([]); setState(code === 'no_sql' ? 'no_sql' : 'error'); if (!quiet) setErr(e instanceof Error ? e.message : String(e))
      return 0
    }
  }, [orgId])
  useEffect(() => { setPages(null); setSel(new Set()); void load() }, [load])

  async function connect() {
    try {
      const url = await fbConnectUrl(orgId)
      window.open(url, '_blank', 'noopener')
      // la fenêtre Facebook se termine ailleurs : on relit la liste toutes les 4 s pendant 3 min
      setWaiting(true)
      const before = pages?.length ?? 0
      for (let k = 0; k < 45 && alive.current; k++) { await sleep(4000); if (await load(true) > before) break }
      if (alive.current) setWaiting(false)
    } catch (e) {
      const code = (e as FbError).code
      if (code === 'not_configured') setState('not_configured')
      toast(e instanceof Error ? e.message : String(e), 'bad')
    }
  }
  async function remove(p: FbPage) {
    if (!await confirmDialog({ title: `Retirer la Page « ${p.name} » ?`, text: 'ScaleFlow ne pourra plus publier dessus. Rien n’est supprimé sur Facebook.', confirmLabel: 'Retirer', danger: true })) return
    try { await removeFbPage(orgId, p.id); setSel(s => { const n = new Set(s); n.delete(p.id); return n }); await load() } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
  }

  async function pickVideos(ids: string[]) {
    if (!ids.length) { setVideos([]); return }
    const { data } = await supabase.from('content_bank').select('id,title').in('id', ids)
    const byId = new Map(((data ?? []) as { id: string; title: string | null }[]).map(r => [r.id, r.title ?? 'Vidéo']))
    setVideos(ids.map(id => ({ id, title: byId.get(id) ?? 'Vidéo' })))
  }

  const chosen = (pages ?? []).filter(p => sel.has(p.id))
  const jobs = planFbJobs(chosen.map(p => p.id), videos.map(v => v.id), mode)
  const cost = jobs.length * CREDIT_COSTS.mass_posting
  const blocker = !chosen.length ? 'Choisis au moins une Page' : !videos.length ? 'Choisis au moins une vidéo' : null

  async function launch() {
    if (blocker || running) return
    const ownerId = org.currentOrg?.owner_id ?? user.id
    const credit = await startCreditRun(ownerId, CREDIT_COSTS.mass_posting, jobs.length)
    if (isCreditError(credit)) { toast(`Crédits insuffisants (il faut ${cost}).`, 'bad'); return }
    const list: Item[] = jobs.map((j, i) => ({
      key: `${j.page}:${j.file}:${i}`, page: j.page, pageName: chosen.find(p => p.id === j.page)?.name ?? 'Page',
      file: j.file, title: videos.find(v => v.id === j.file)?.title ?? 'Vidéo', phase: 'pending',
    }))
    setItems(list); setRunning(true)
    const R = startRun('cross', `${list.length} Reel${list.length > 1 ? 's' : ''} Facebook`, list.length)
    const set = (key: string, p: Partial<Item>) => { if (alive.current) setItems(l => l.map(x => x.key === key ? { ...x, ...p } : x)) }
    let next = 0
    const worker = async () => {
      for (;;) {
        const i = next++
        if (i >= list.length) return
        const it = list[i]
        if (R.isCancelled()) { credit.markFailed(); set(it.key, { phase: 'failed', error: 'Annulé' }); R.tick(false); continue }
        set(it.key, { phase: 'sending' })
        try {
          const videoId = await publishFbReel(orgId, it.page, it.file, captionFor(caption, i))
          set(it.key, { phase: 'processing' })
          // Meta traite la vidéo (souvent 30 s à 2 min) : on suit jusqu'à 4 min, sans jamais republier
          let done = false
          for (let k = 0; k < 40 && !done; k++) {
            await sleep(6000)
            try {
              const st = await fbReelStatus(orgId, it.page, videoId)
              if (st.phase === 'published') { set(it.key, { phase: 'published', link: st.link }); done = true }
              else if (st.phase === 'failed') throw Object.assign(new Error(st.error || 'refusée par Facebook'), { final: true })
            } catch (e) { if ((e as { final?: boolean }).final) throw e /* sinon : lecture ratée, on réessaie */ }
          }
          if (!done) set(it.key, { phase: 'published', error: 'Envoyée — Facebook finit le traitement, elle apparaîtra sur la Page dans quelques minutes.' })
          R.tick(true)
        } catch (e) {
          credit.markFailed()
          set(it.key, { phase: 'failed', error: e instanceof Error ? e.message : String(e) })
          R.tick(false)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker))
    const back = await credit.settle()
    if (back.refunded) toast(`${back.refunded} crédits remboursés (publications échouées)`, 'ok')
    R.finish()
    if (alive.current) { setRunning(false); void load(true) }
  }

  const doneN = items.filter(i => i.phase === 'published').length, failN = items.filter(i => i.phase === 'failed').length
  const tone = (p: Phase) => p === 'published' ? 'ok' : p === 'failed' ? 'bad' : p === 'pending' ? 'mute' : 'violet'
  const label = (p: Phase) => p === 'published' ? 'Publié' : p === 'failed' ? 'Échec' : p === 'pending' ? 'En attente' : p === 'sending' ? 'Envoi…' : 'Traitement Facebook…'
  void onBack

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHeader kicker="Facebook · API officielle" title="Reels Facebook" sub="Publie tes vidéos sur tes Pages Facebook, toutes en même temps et sans téléphone. Facebook ne permet la publication par API que sur des Pages (pas sur les profils personnels)."
        actions={<Btn theme={theme} tone="primary" label={running ? `Publication… ${doneN + failN}/${items.length}` : blocker ?? `Publier ${jobs.length} Reel${jobs.length > 1 ? 's' : ''} · ${cost} crédits`} disabled={!!blocker || running} onClick={() => void launch()} />} />

      {state === 'not_configured' && (
        <Panel theme={theme} style={{ marginBottom: 16 }}>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F5' }}>Application Meta pas encore branchée</span>
            <span style={{ fontSize: 13, lineHeight: 1.6, color: '#A1A1AA' }}>Le propriétaire de ScaleFlow doit créer une application sur developers.facebook.com puis poser META_APP_ID et META_APP_SECRET dans les variables Vercel. Ensuite, le bouton « Connecter Facebook » fonctionne.</span>
          </div>
        </Panel>
      )}
      {state === 'no_sql' && (
        <Panel theme={theme} style={{ marginBottom: 16 }}>
          <div style={{ padding: 18, fontSize: 13, lineHeight: 1.6, color: '#A1A1AA' }}>La table des Pages n’existe pas encore : lance le fichier SQL <span data-no-tr style={{ color: '#E4E4E7' }}>20261110_fb_pages.sql</span> dans Supabase.</div>
        </Panel>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel theme={theme}>
            <PanelHead title={`Pages${pages ? ` · ${chosen.length}/${pages.length}` : ''}`}
              right={<span style={{ display: 'flex', gap: 8 }}>
                {!!pages?.length && <Btn sm theme={theme} tone="quiet" label={chosen.length === pages.length ? 'Tout retirer' : 'Tout choisir'} onClick={() => setSel(chosen.length === pages.length ? new Set() : new Set(pages.map(p => p.id)))} />}
                <Btn sm theme={theme} label={waiting ? 'En attente de Facebook…' : 'Connecter Facebook'} disabled={waiting} onClick={() => void connect()} />
              </span>} />
            {pages === null ? <SkeletonRows rows={3} avatar />
              : !pages.length ? <Empty icon={PAGE_ICON} title="Aucune Page connectée" text={err ?? 'Clique « Connecter Facebook », connecte-toi avec le compte qui gère tes Pages et coche celles à utiliser.'} />
              : <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {pages.map(p => {
                  const on = sel.has(p.id)
                  return (
                    <div key={p.id} role="checkbox" aria-checked={on} tabIndex={0}
                      onClick={() => setSel(s => { const n = new Set(s); if (on) n.delete(p.id); else n.add(p.id); return n })}
                      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.currentTarget.click() } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', minHeight: 52, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', background: on ? 'rgba(24,119,242,0.07)' : 'transparent' }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'grid', placeItems: 'center', border: `1.5px solid ${on ? FB : 'rgba(255,255,255,0.2)'}`, background: on ? FB : 'transparent', color: '#fff' }}>{on && <Icon d="M5 12l5 5 9-10" size={11} />}</span>
                      {p.picture ? <img src={p.picture} alt="" style={{ width: 28, height: 28, borderRadius: 99, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 28, height: 28, borderRadius: 99, background: '#18181B', flexShrink: 0 }} />}
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span data-no-tr style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        {p.last_error && <span data-no-tr title={p.last_error} style={{ fontSize: 11.5, color: '#FCA5A5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.last_error}</span>}
                      </span>
                      <button type="button" aria-label="Retirer la Page" title="Retirer la Page" onClick={e => { e.stopPropagation(); void remove(p) }}
                        style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 6, background: 'transparent', color: '#7C7C86', cursor: 'pointer' }}><Icon d="M18 6L6 18|M6 6l12 12" size={12} /></button>
                    </div>
                  )
                })}
              </div>}
          </Panel>

          <Panel theme={theme}>
            <PanelHead title={`Vidéos${videos.length ? ` · ${videos.length}` : ''}`} right={<Btn sm theme={theme} label="Choisir dans la banque" onClick={() => setPicker(true)} />} />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {videos.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{videos.slice(0, 24).map(v => <Chip key={v.id} text={<span data-no-tr>{v.title}</span>} />)}{videos.length > 24 && <Chip text={`+${videos.length - 24}`} />}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: '#8B8B94' }}>Répartition</span>
                <Segmented sm value={mode} onChange={setMode} options={[{ v: 'rotate', l: 'Une vidéo par Page' }, { v: 'all', l: 'Toutes les vidéos sur chaque Page' }]} />
              </div>
              <span style={{ fontSize: 12.5, color: '#8B8B94' }}>Format Reel : vidéo verticale 9:16, de 3 à 90 secondes.</span>
            </div>
          </Panel>

          <Panel theme={theme}>
            <PanelHead title="Légende" sub="Une par ligne : elles sont distribuées à tour de rôle. Une seule ligne = la même partout." />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CaptionPools value={caption} onChange={setCaption} orgId={orgId} userId={user.id} selStyle={{ ...FIELD_SM, width: 'auto', minWidth: 200 }} btnStyle={{ border: '1px solid rgba(255,255,255,0.09)', background: '#161618', color: '#E4E4E7' }} />
              <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4} placeholder="Ta légende…" style={TEXTAREA} />
            </div>
          </Panel>
        </div>

        <Panel theme={theme}>
          <PanelHead title="Publication" right={items.length ? <span style={{ fontSize: 12.5, color: '#8B8B94' }}>{`${doneN} publié${doneN > 1 ? 's' : ''}${failN ? ` · ${failN} échec${failN > 1 ? 's' : ''}` : ''}`}</span> : undefined} />
          {!items.length ? <Empty icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" title="Rien en cours" text="Choisis des Pages et des vidéos, puis lance : chaque Page publie en parallèle et le suivi s’affiche ici." />
            : <div style={{ maxHeight: 620, overflowY: 'auto' }}>
              {items.map(it => (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span data-no-tr style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.pageName}</span>
                    <span data-no-tr style={{ fontSize: 12, color: '#8B8B94', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                    {it.error && <span data-no-tr style={{ fontSize: 12, lineHeight: 1.45, color: it.phase === 'failed' ? '#FCA5A5' : '#8B8B94' }}>{it.error}</span>}
                  </span>
                  {it.link && <a href={it.link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: theme.accentText, textDecoration: 'none' }}>Voir</a>}
                  <Chip text={label(it.phase)} tone={tone(it.phase)} />
                </div>
              ))}
            </div>}
        </Panel>
      </div>

      {picker && <BankPicker theme={theme} user={user} org={org} kind="videos" multi initialIds={videos.map(v => v.id)} title="Choisir des vidéos"
        onClose={() => setPicker(false)} onApply={r => { if (r.kind === 'videos') void pickVideos(r.ids) }} />}
    </div>
  )
}
