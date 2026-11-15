// DuoPlus › Publier des Reels : vidéos de la Banque → téléphones DuoPlus choisis, une vidéo par
// téléphone à tour de rôle, légende + ville du compte (1 ville par compte, gardée sur ce PC).
// Les téléphones éteints peuvent être allumés pour l'occasion puis éteints à la fin.
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { Btn, Chip, Panel, PanelHead, FIELD, TEXTAREA, Toggle, toast } from '@/lib/ui'
import BankPicker from '@/components/BankPicker'
import { signedUrl } from '@/lib/signedUrls'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'
import { startRun } from '@/lib/runStore'
import { duoPhones, duoPower, type DuoPhone } from '@/lib/duoplus'
import { postReel, StopError } from '@/lib/duoplusAuto'

const CITIES = ['New York, New York', 'Los Angeles, California', 'Miami, Florida', 'Chicago, Illinois', 'Houston, Texas', 'Dallas, Texas', 'Las Vegas, Nevada', 'Atlanta, Georgia', 'Phoenix, Arizona', 'San Diego, California']
const PARALLEL = 3
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const cityKey = (id: string) => `sf-duo-city:${id}`
const readCity = (id: string) => { try { return localStorage.getItem(cityKey(id)) ?? '' } catch { return '' } }
type Phase = 'wait' | 'power' | 'run' | 'ok' | 'test' | 'fail'
interface Job { phone: DuoPhone; video: { id: string; title: string }; phase: Phase; log: string[]; error?: string }

/** Répartition : une vidéo par téléphone, à tour de rôle (téléphone 1 → vidéo 1, 2 → 2…). */
export function planDuoJobs<P, V>(phones: P[], videos: V[]): { phone: P; video: V }[] {
  return videos.length ? phones.map((phone, i) => ({ phone, video: videos[i % videos.length] })) : []
}

export default function DuoPosting({ theme, user, org, phones, onChanged }: { theme: Theme; user: User; org: OrgState; phones: DuoPhone[]; onChanged: () => void }) {
  const orgId = org.currentOrg?.id ?? null
  const [videos, setVideos] = useState<{ id: string; title: string; path: string | null; url: string | null }[]>([])
  const [picker, setPicker] = useState(false)
  const [caption, setCaption] = useState(() => { try { return localStorage.getItem('sf-duo-caption') ?? '' } catch { return '' } })
  const [cities, setCities] = useState<Record<string, string>>({})
  const [autoPower, setAutoPower] = useState(true)
  const [test, setTest] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [running, setRunning] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setCities(c => { const n = { ...c }; for (const p of phones) if (n[p.id] == null) n[p.id] = readCity(p.id); return n }) }, [phones])
  const setCity = (id: string, v: string) => { setCities(c => ({ ...c, [id]: v })); try { localStorage.setItem(cityKey(id), v) } catch { /* bloqué */ } }

  async function pickVideos(ids: string[]) {
    if (!ids.length) { setVideos([]); return }
    const { data } = await supabase.from('content_bank').select('id, title, storage_path, file_url').in('id', ids)
    const rows = (data ?? []) as { id: string; title: string | null; storage_path: string | null; file_url: string | null }[]
    setVideos(ids.map(id => rows.find(r => r.id === id)).filter(Boolean).map(r => ({ id: r!.id, title: r!.title || 'Vidéo', path: r!.storage_path, url: r!.file_url })))
  }
  const usable = phones.filter(p => p.status === 1 || (autoPower && p.status === 2))
  const plan = planDuoJobs(usable, videos)
  const blocker = !phones.length ? 'Coche des téléphones dans la liste au-dessus' : !usable.length ? 'Aucun téléphone allumé (active « Allumer les téléphones éteints »)' : !videos.length ? 'Choisis au moins une vidéo' : null

  async function launch() {
    if (blocker || running) return
    const ownerId = org.currentOrg?.owner_id ?? user.id
    const credit = test ? null : await startCreditRun(ownerId, CREDIT_COSTS.mass_posting, plan.length)
    if (credit && isCreditError(credit)) { toast(`Crédits insuffisants (il faut ${plan.length * CREDIT_COSTS.mass_posting}).`, 'bad'); return }
    const list: Job[] = plan.map(j => ({ phone: j.phone, video: { id: j.video.id, title: j.video.title }, phase: 'wait', log: [] }))
    setJobs(list); setRunning(true)
    const R = startRun('reels', `${list.length} Reel${list.length > 1 ? 's' : ''} DuoPlus${test ? ' (test)' : ''}`, list.length)
    const set = (id: string, p: Partial<Job> | ((j: Job) => Partial<Job>)) => { if (alive.current) setJobs(l => l.map(x => x.phone.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)) }
    const log = (id: string) => (m: string) => set(id, j => ({ log: [...j.log, m].slice(-30) }))
    // téléphones éteints : on les allume tous d'un coup, on attend qu'ils soient prêts
    const turnedOn: string[] = []
    const off = list.filter(j => j.phone.status === 2).map(j => j.phone.id)
    if (off.length) {
      for (const id of off) set(id, { phase: 'power' })
      try { const r = await duoPower(orgId, off, true); turnedOn.push(...r.success); for (const f of r.fail) set(f.id, { phase: 'fail', error: `allumage refusé : ${f.error || 'DuoPlus'}` }) }
      catch (e) { for (const id of off) set(id, { phase: 'fail', error: e instanceof Error ? e.message : String(e) }) }
      const end = Date.now() + 4 * 60_000
      while (turnedOn.length && Date.now() < end && !R.isCancelled()) {
        await sleep(8000)
        try { const l = await duoPhones(orgId); if (turnedOn.every(id => l.find(p => p.id === id)?.status === 1)) break } catch { /* on réessaie */ }
      }
    }
    let next = 0
    const worker = async () => {
      for (;;) {
        const it = list[next++]
        if (!it) return
        const id = it.phone.id
        if (off.includes(id) && !turnedOn.includes(id)) { credit?.markFailed(); R.tick(false); continue }
        if (R.isCancelled()) { credit?.markFailed(); set(id, { phase: 'fail', error: 'Annulé' }); R.tick(false); continue }
        set(id, { phase: 'run' })
        try {
          const v = videos.find(x => x.id === it.video.id)
          const url = v?.path ? await signedUrl(v.path) : v?.url
          if (!url) throw new Error('lien de la vidéo introuvable dans la Banque')
          const r = await postReel({ orgId, phone: id, log: log(id), shouldStop: () => R.isCancelled() }, { videoUrl: url, caption, location: cities[id] || undefined, dryRun: test })
          set(id, { phase: test ? 'test' : 'ok', error: r.note }); R.tick(true)
        } catch (e) {
          credit?.markFailed()
          set(id, { phase: 'fail', error: e instanceof StopError ? 'Annulé' : e instanceof Error ? e.message : String(e) }); R.tick(false)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker))
    if (autoPower && turnedOn.length) { try { await duoPower(orgId, turnedOn, false) } catch { toast('Pense à éteindre les téléphones allumés pour la publication', 'bad', 8000) } }
    if (credit) { const back = await credit.settle(); if (back.refunded) toast(`${back.refunded} crédits remboursés (publications échouées)`, 'ok') }
    R.finish()
    if (alive.current) { setRunning(false); onChanged() }
  }

  const tone = (p: Phase) => p === 'ok' || p === 'test' ? 'ok' : p === 'fail' ? 'bad' : p === 'wait' ? 'mute' : 'violet'
  const label = (p: Phase) => ({ wait: 'En attente', power: 'Allumage…', run: 'En cours…', ok: 'Publié', test: 'Test réussi', fail: 'Échec' })[p]

  return (
    <Panel theme={theme} style={{ marginBottom: 16 }}>
      <PanelHead title="Publier des Reels" sub="Une vidéo de la Banque par téléphone coché, avec la légende et la ville du compte." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Btn theme={theme} label={videos.length ? `${videos.length} vidéo(s) choisie(s)` : 'Choisir dans la Banque'} disabled={running} onClick={() => setPicker(true)} />
          {videos.slice(0, 4).map(v => <Chip key={v.id} text={<span data-no-tr>{v.title}</span>} />)}
          {videos.length > 4 && <Chip text={`+${videos.length - 4}`} />}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: '#A1A1AA' }}>Légende (accents et emojis acceptés, laisse vide pour aucune)</span>
          <textarea value={caption} disabled={running} onChange={e => { setCaption(e.target.value); try { localStorage.setItem('sf-duo-caption', e.target.value) } catch { /* bloqué */ } }} style={TEXTAREA} data-no-tr />
        </label>
        {!!phones.length && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: '#A1A1AA' }}>Ville de chaque compte (toujours la même pour un compte)</span>
            {phones.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span data-no-tr style={{ flex: '0 0 140px', fontSize: 13, color: '#E4E4E7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.id}</span>
                <input list="duo-cities" value={cities[p.id] ?? ''} disabled={running} onChange={e => setCity(p.id, e.target.value)} placeholder="Ville, État (ex. Miami, Florida)" style={{ ...FIELD, flex: 1 }} data-no-tr />
              </div>
            ))}
            <datalist id="duo-cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        )}
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Toggle on={autoPower} onChange={setAutoPower} disabled={running} label="Allumer les téléphones éteints, puis les éteindre à la fin" />
          <Toggle on={test} onChange={setTest} disabled={running} label="Test sans publier (s’arrête juste avant « Partager »)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Btn theme={theme} tone="primary" label={running ? 'En cours…' : test ? `Tester sur ${plan.length} téléphone(s)` : `Publier ${plan.length} Reel(s) · ${plan.length * CREDIT_COSTS.mass_posting} crédits`} disabled={!!blocker || running} onClick={() => void launch()} />
          {blocker && !running && <span style={{ fontSize: 12.5, color: '#7C7C86' }}>{blocker}</span>}
        </div>
        {!!jobs.length && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobs.map(j => (
              <div key={j.phone.id} style={{ border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span data-no-tr style={{ fontSize: 13.5, fontWeight: 600, color: '#F4F4F5', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.phone.name || j.phone.id} · {j.video.title}</span>
                  <Chip tone={tone(j.phase)} text={label(j.phase)} />
                </div>
                {j.error && <div data-no-tr style={{ fontSize: 12, color: j.phase === 'fail' ? '#F87171' : '#A1A1AA', marginTop: 6 }}>{j.error}</div>}
                {!!j.log.length && <pre data-no-tr style={{ margin: '6px 0 0', fontSize: 11.5, color: '#7C7C86', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'auto' }}>{j.log.slice(-6).join('\n')}</pre>}
              </div>
            ))}
          </div>
        )}
      </div>
      {picker && <BankPicker theme={theme} user={user} org={org} kind="videos" multi initialIds={videos.map(v => v.id)} title="Choisir des vidéos"
        onClose={() => setPicker(false)} onApply={r => { setPicker(false); if (r.kind === 'videos') void pickVideos(r.ids) }} />}
    </Panel>
  )
}
