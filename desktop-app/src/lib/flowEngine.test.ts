// Tests du moteur de flows : n'importe quelle combinaison de blocs doit fonctionner.
//
// GeeLark, Instagram (ADB), crédits et Supabase sont simulés et journalisent chaque
// action. On génère des centaines de flows aléatoires (tous types de blocs, doublons,
// blocs désactivés, délais, réessais, échecs aléatoires, téléphones qui ne démarrent
// pas, annulation en cours de route…) et on vérifie des règles qui doivent TOUJOURS
// tenir, quel que soit le flow.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const H = vi.hoisted(() => {
  const S = {
    events: [] as { gid: string; ev: string }[],
    managed: new Set<string>(),
    bootFail: new Set<string>(),
    failFn: (_gid: string, _type: string, _call: number) => false,
    calls: new Map<string, number>(),
    credits: [] as { cost: number; units: number; failed: number; aborted: boolean; settled: boolean }[],
    insufficient: false,
    cancelled: false,
    cancelAfterExec: -1,
    execCount: 0,
    bankRows: [] as Record<string, unknown>[],
    trashed: [] as string[],
    // Téléphone simulé : allumé ? Instagram ouvert (sur un écran quelconque) ? tâche GeeLark en cours ?
    phone: new Map<string, { on: boolean; igOpen: boolean; task: string | null }>(),
    aborted: new Set<string>(),
    hangFn: (_gid: string, _type: string, _call: number): '' | 'hang' | 'stuck' => '',
  }
  const reset = () => {
    S.events = []; S.managed = new Set(); S.bootFail = new Set(); S.failFn = () => false
    S.calls = new Map(); S.credits = []; S.insufficient = false; S.cancelled = false
    S.cancelAfterExec = -1; S.execCount = 0; S.trashed = []
    S.phone = new Map(); S.aborted = new Set(); S.hangFn = () => ''
  }
  const ph = (gid: string) => { if (!S.phone.has(gid)) S.phone.set(gid, { on: false, igOpen: false, task: null }); return S.phone.get(gid)! }
  // Primitive simulée : exige un état PROPRE (téléphone allumé, Instagram fermé, aucune
  // tâche GeeLark en cours), puis laisse Instagram ouvert sur un écran quelconque —
  // comme les vraies primitives. Peut aussi rester bloquée jusqu'à interruption
  // (« hang », tâche GeeLark laissée en cours) ou ne jamais rendre la main (« stuck »).
  const prim = (type: string) => async (_bearer: string, gid: string) => {
    const key = `${gid}:${type}`
    const call = (S.calls.get(key) ?? 0) + 1
    S.calls.set(key, call)
    S.events.push({ gid, ev: `block:${type}` })
    const st = ph(gid)
    if (!st.on || st.igOpen || st.task) S.events.push({ gid, ev: `dirty:${type}:${!st.on ? 'off' : st.igOpen ? 'ig-open' : 'task'}` })
    st.igOpen = true
    S.execCount++
    if (S.cancelAfterExec >= 0 && S.execCount >= S.cancelAfterExec) S.cancelled = true
    const hang = S.hangFn(gid, type, call)
    if (hang) {
      st.task = `${gid}-${type}-${call}`
      if (hang === 'stuck') return new Promise<never>(() => {})
      while (!S.aborted.has(gid)) await new Promise(r => setTimeout(r, 2))
      return { ok: false, error: 'Interrompu' }   // la tâche reste « en cours » : au moteur de l'annuler
    }
    return S.failFn(gid, type, call) ? { ok: false, error: `${type} KO` } : { ok: true }
  }
  return { S, reset, prim, ph }
})

vi.mock('@/lib/geelark', () => ({
  sleep: () => Promise.resolve(),
  // 1er appel (téléphone pas encore piloté) = démarrage ; ensuite = vérification avant chaque bloc.
  ensurePhoneRunning: async (_b: string, gid: string) => {
    const managed = H.S.managed.has(gid)
    const st = H.ph(gid)
    H.S.events.push({ gid, ev: managed ? (st.on ? 'check' : 'reboot') : 'boot' })
    if (H.S.bootFail.has(gid)) return { ok: false, reason: 'boot KO' }
    if (!st.on) { st.on = true; st.igOpen = false }   // démarrage à froid : Instagram fermé
    return { ok: true }
  },
  abortPhone: (gid: string) => { H.S.aborted.add(gid) },
  clearPhoneAbort: (gid: string) => { H.S.aborted.delete(gid) },
  cancelPhoneTask: async (_b: string, gid: string) => { const st = H.ph(gid); if (st.task) { H.S.events.push({ gid, ev: 'cancel' }); st.task = null } },
  setPhoneManaged: (gid: string, on: boolean) => {
    H.S.events.push({ gid, ev: on ? 'managed:on' : 'managed:off' })
    if (on) H.S.managed.add(gid); else H.S.managed.delete(gid)
  },
  stopPhoneSurely: async (_b: string, gid: string) => {
    H.S.events.push({ gid, ev: H.S.managed.has(gid) ? 'stop:while-managed' : 'stop' })
    const st = H.ph(gid); st.on = false; st.igOpen = false; st.task = null
    return true
  },
  loginInstagramOnPhone: H.prim('login'),
  editProfileOnPhone: H.prim('bio'),
  warmupAccountNative: H.prim('warmup'),
  postReelToPhone: H.prim('post'),
  postStoryToPhone: H.prim('story'),
  geelarkUploadVideo: async (_b: string, url: string) => `hosted:${url}`,
  geelarkUploadImage: async (_b: string, url: string) => `hosted:${url}`,
}))
vi.mock('@/lib/geelarkAdb', () => ({
  changeUsernameOnPhone: H.prim('username'),
  changeProfilePicOnPhone: H.prim('avatar'),
  // Remise à zéro : HOME + force-stop Instagram (n'annule PAS une tâche GeeLark en cours).
  resetInstagram: async (_b: string, gid: string) => { H.S.events.push({ gid, ev: 'reset' }); const st = H.ph(gid); if (st.on) st.igOpen = false; return true },
}))
vi.mock('@/lib/credits', () => ({
  CREDIT_COSTS: { posting: 2, mass_posting: 2, story: 1 },
  isCreditError: (r: { insufficient?: boolean }) => r.insufficient === true,
  startCreditRun: async (_owner: string, cost: number, units: number) => {
    if (H.S.insufficient) return { insufficient: true, error: 'pas assez' }
    const c = { cost, units, failed: 0, aborted: false, settled: false }
    H.S.credits.push(c)
    return {
      markFailed: () => { c.failed++ },
      abort: () => { c.aborted = true },
      settle: async () => { c.settled = true; return { refunded: (c.aborted ? c.units : Math.min(c.failed, c.units)) * c.cost } },
    }
  },
}))
vi.mock('@/lib/runStore', () => ({
  startRun: () => ({
    id: 'h', isCancelled: () => H.S.cancelled, setTotal: () => {}, tick: () => {}, detail: () => {}, finish: () => {},
  }),
}))
vi.mock('@/lib/phoneWatch', () => ({ heartbeatPhone: () => {} }))
vi.mock('./runHistory', () => ({ startRunHistory: async () => ({ set: () => {}, finish: async () => null }) }))
// Supabase simulé : constructeur de requêtes chaînable, juste ce que le moteur utilise.
vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    const st: { op: string; ids?: string[] } = { op: 'select' }
    const b: Record<string, unknown> = {}
    const chain = () => b
    Object.assign(b, {
      select: chain, eq: chain, is: chain, order: chain, upsert: chain, delete: chain,
      in: (_c: string, ids: string[]) => { st.ids = ids; return b },
      update: () => { st.op = 'update'; return b },
      then: (res: (v: unknown) => void) => {
        if (table === 'content_bank' && st.op === 'update') { H.S.trashed.push(...(st.ids ?? [])); return res({ data: null, error: null }) }
        if (table === 'content_bank') {
          const rows = st.ids ? H.S.bankRows.filter(r => st.ids!.includes(r.id as string)) : H.S.bankRows
          return res({ data: rows, error: null })
        }
        return res({ data: [], error: null })
      },
    })
    return b
  }
  return {
    supabase: {
      from: builder,
      storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `url:${path}` }, error: null }) }) },
    },
  }
})

import { runFlow, waitFlowRun, getFlowRun, newBlock, BLOCK, isActive, retriesOf, _setFlowTimeScaleForTests, type Flow, type FlowBlock, type BlockType } from './flowEngine'
// Délais max des blocs ramenés à quelques millisecondes (25 min → 15 ms).
_setFlowTimeScaleForTests(0.00001)

// ── Banque de test ───────────────────────────────────────────────────────────
const BANK = [
  ...[1, 2, 3, 4, 5].map(i => ({ id: `v${i}`, folder: 'A', title: `v${i}.mp4`, storage_path: `u/v${i}.mp4`, file_url: null, notes: null, deleted_at: null })),
  ...[1, 2, 3, 4].map(i => ({ id: `i${i}`, folder: 'B', title: `i${i}.jpg`, storage_path: `u/i${i}.jpg`, file_url: null, notes: null, deleted_at: null })),
  { id: 'vX', folder: 'A', title: 'old.mp4', storage_path: 'u/old.mp4', file_url: null, notes: null, deleted_at: '2026-01-01' },
  { id: 'sC', folder: 'C', title: 'C', storage_path: null, file_url: null, notes: '__sf_folder__', deleted_at: null },
  { id: 'v9', folder: null, title: 'loose.mov', storage_path: 'u/loose.mov', file_url: null, notes: null, deleted_at: null },
]

// PRNG reproductible : un échec de test se rejoue à l'identique avec la même graine.
function prng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const TYPES: BlockType[] = ['login', 'username', 'avatar', 'bio', 'warmup', 'pause', 'post', 'story']

function randomFlow(r: () => number): Flow {
  const one = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const blocks: FlowBlock[] = Array.from({ length: 1 + Math.floor(r() * 8) }, () => {
    const b = newBlock(one(TYPES))
    const p = b.params
    if (r() < 0.15) p.disabled = true
    p.retries = Math.floor(r() * 4)
    p.onError = one(['inherit', 'stop', 'continue'] as const)
    if (r() < 0.3) { p.delayMin = 0; p.delayMax = one([0.2, 1, 5]) }
    if (BLOCK[b.type].media) {
      p.source = one(['pick', 'folder', 'folder', 'all'] as const)
      p.folder = one(['A', 'B', 'C', 'Z'])
      p.mode = one(['seq', 'random'] as const)
      if (b.type === 'post') { p.videoIds = r() < 0.8 ? ['v1', 'v2'] : []; p.removeAfter = r() < 0.4; p.captions = 'a\nb' }
      else p.imageIds = r() < 0.8 ? ['i1', 'i2', 'i3'] : []
    }
    if (b.type === 'story') { p.linkMode = one(['same', 'perAccount'] as const); p.link = r() < 0.8 ? 'https://x.co' : ''; p.links = 'https://a.co\nhttps://b.co' }
    if (b.type === 'username') p.usernames = r() < 0.9 ? 'lea{4}' : ''
    if (b.type === 'bio') { p.bios = 'bio 1\nbio 2'; p.link = 'https://x.co' }
    if (b.type === 'warmup') { p.minMin = 1; p.maxMin = 4; p.keyword = r() < 0.5 ? 'mode\nfit' : '' }
    if (b.type === 'pause') { p.minMin = one([0, 1, 2, 4]); p.maxMin = (p.minMin ?? 0) + one([0, 2, 10]) }
    return b
  })
  return { id: 'f', name: 'test', blocks, onError: one(['stop', 'continue'] as const) }
}

async function launch(flow: Flow, nPhones: number, extra: Partial<{ concurrency: number; rotation: boolean; credsFor: number }> = {}) {
  const targets = Array.from({ length: nPhones }, (_, i) => ({ key: `k${i}`, geelarkId: `g${i}`, name: `@acc${i}` }))
  const creds: Record<string, { email: string; password: string; totp: string }> = {}
  targets.slice(0, extra.credsFor ?? nPhones).forEach(t => { creds[t.key] = { email: `${t.key}@m.co`, password: 'pw', totp: '' } })
  const id = await runFlow({
    bearer: 'b', flow, targets, creds, concurrency: extra.concurrency ?? 3, creditOwnerId: 'o',
    rotationUrls: extra.rotation ? ['https://rot'] : undefined, scope: { orgId: null, userId: 'u' },
  })
  await waitFlowRun(id)
  return { run: getFlowRun(id)!, targets }
}

// ── Règles vérifiées sur chaque run ──────────────────────────────────────────
function checkInvariants(flow: Flow, run: NonNullable<ReturnType<typeof getFlowRun>>, label: string, hasCreds = true) {
  const ctx = (m: string) => `${label} — ${m}`
  expect(run.status, ctx('statut final')).not.toBe('running')
  expect(run.status, ctx('pas d\'erreur interne')).not.toBe('error')
  const paid = flow.blocks.filter(b => isActive(b) && BLOCK[b.type].credits > 0)
  if (!H.S.insufficient) expect(H.S.credits.length, ctx('1 débit par bloc payant actif')).toBe(paid.length)

  run.phones.forEach((pr, i) => {
    const gid = `g${i}`
    const ev = H.S.events.filter(e => e.gid === gid).map(e => e.ev)
    const P = (m: string) => ctx(`compte ${i} : ${m} [${ev.join(' > ')}]`)
    // Aucun bloc ne reste en cours / en attente.
    pr.steps.forEach((s, k) => {
      expect(['ok', 'failed', 'skipped'], P(`bloc ${k} terminé (${s})`)).toContain(s)
      if (!isActive(flow.blocks[k])) expect(s, P(`bloc désactivé ${k} sauté`)).toBe('skipped')
    })
    expect(['done', 'failed', 'cancelled'], P('statut du compte')).toContain(pr.status)
    if (pr.status === 'done') expect(pr.steps.some(s => s === 'failed'), P('done ⇒ aucun échec')).toBe(false)
    if (ev.length === 0) { expect(pr.status, P('jamais lancé ⇒ annulé')).toBe('cancelled'); return }

    // ÉTAT PROPRE : aucun bloc n'a démarré sur un téléphone éteint, un Instagram resté
    // ouvert par le bloc précédent, ou une tâche GeeLark encore en cours.
    expect(ev.filter(e => e.startsWith('dirty:')), P('chaque bloc part d’un état propre')).toEqual([])
    // Un seul démarrage, avant tout bloc ; téléphone toujours rendu puis éteint à la fin.
    expect(ev.filter(e => e === 'boot').length, P('1 seul démarrage')).toBe(1)
    expect(ev[0], P('démarrage en premier')).toBe('boot')
    expect(ev[ev.length - 1], P('éteint en dernier')).toBe('stop')
    expect(ev.includes('stop:while-managed'), P('jamais éteint pendant qu\'il est géré')).toBe(false)
    expect(H.S.managed.has(gid), P('libéré à la fin')).toBe(false)

    // Les blocs exécutés = blocs actifs dans l'ordre, chacun ≤ 1 + réessais fois.
    const expected: string[] = []
    flow.blocks.forEach((b, k) => {
      expect(pr.attempts[k], P(`réessais du bloc ${k}`)).toBeLessThanOrEqual(1 + retriesOf(b.params))
      if (!isActive(b)) expect(pr.attempts[k], P(`bloc désactivé ${k} jamais exécuté`)).toBe(0)
      if (b.type !== 'pause' && pr.attempts[k] > 0 && pr.steps[k] !== 'skipped') {
        const primCalls = mediaOrTextMissing(b) || (b.type === 'login' && !hasCreds) ? 0 : pr.attempts[k]
        for (let a = 0; a < primCalls; a++) expected.push(`block:${b.type}`)
      }
    })
    // Annulation PENDANT un bloc : ce bloc a pu être lancé puis interrompu (→ « sauté »),
    // ou annulé juste avant son lancement.
    const actual = ev.filter(e => e.startsWith('block:'))
    const alt = [...expected]
    if (pr.status === 'cancelled') {
      const k = pr.steps.findIndex((s, j) => s === 'skipped' && pr.attempts[j] > 0 && flow.blocks[j].type !== 'pause' && isActive(flow.blocks[j]))
      if (k >= 0 && !mediaOrTextMissing(flow.blocks[k])) for (let a = 0; a < pr.attempts[k]; a++) alt.push(`block:${flow.blocks[k].type}`)
    }
    expect(JSON.stringify(actual) === JSON.stringify(alt) ? alt : actual, P('ordre des blocs')).toEqual(alt.length !== expected.length && JSON.stringify(actual) === JSON.stringify(alt) ? alt : expected)

    // Politique d'échec : « arrêter » ⇒ plus aucun bloc après l'échec.
    const firstFail = pr.steps.findIndex(s => s === 'failed')
    if (firstFail >= 0 && pr.status !== 'cancelled') {
      const b = flow.blocks[firstFail]
      const policy = b.params.onError && b.params.onError !== 'inherit' ? b.params.onError : flow.onError
      if (policy === 'stop') pr.steps.slice(firstFail + 1).forEach((s, j) => expect(s, P(`bloc ${firstFail + 1 + j} sauté après échec`)).toBe('skipped'))
    }
  })

  // Crédits : remboursement = comptes où le bloc payant n'a pas réussi.
  if (!H.S.insufficient) paid.forEach((b, j) => {
    const k = flow.blocks.indexOf(b)
    const notOk = run.phones.filter(p => p.steps[k] !== 'ok').length
    expect(H.S.credits[j].failed, ctx(`remboursements du bloc payant ${k}`)).toBe(notOk)
    expect(H.S.credits[j].settled, ctx('crédits réglés')).toBe(true)
  })
}

// Bloc qui échoue AVANT d'appeler GeeLark (média/texte manquant) → aucun appel attendu.
function mediaOrTextMissing(b: FlowBlock): boolean {
  const p = b.params
  if (BLOCK[b.type].media) {
    const src = p.source ?? 'pick'
    const ids = (b.type === 'post' ? p.videoIds : p.imageIds) ?? []
    const kind = BLOCK[b.type].media === 'video' ? 'v' : 'i'
    const poolEmpty = src === 'pick' ? ids.length === 0
      : src === 'all' ? false
      : !((p.folder === 'A' && kind === 'v') || (p.folder === 'B' && kind === 'i'))
    if (poolEmpty) return true
  }
  if (b.type === 'username' && !(p.usernames ?? '').trim()) return true
  if (b.type === 'story' && (p.linkMode ?? 'same') === 'same' && !(p.link ?? '').trim()) return true
  return false
}

beforeEach(() => { H.reset(); H.S.bankRows = BANK })

describe('combinaisons aléatoires de blocs', () => {
  it('400 flows aléatoires respectent toutes les règles', async () => {
    for (let seed = 1; seed <= 400; seed++) {
      H.reset(); H.S.bankRows = BANK
      const r = prng(seed)
      const flow = randomFlow(r)
      const nPhones = 1 + Math.floor(r() * 6)
      const failRate = [0, 0.25, 0.6][seed % 3]
      const failTable = new Map<string, boolean>()
      H.S.failFn = (gid, type, call) => {
        const k = `${gid}:${type}:${call}`
        if (!failTable.has(k)) failTable.set(k, r() < failRate)
        return failTable.get(k)!
      }
      if (seed % 7 === 0) H.S.bootFail.add('g0')
      // Blocs qui restent bloqués (délai max dépassé) ou ne rendent jamais la main.
      if (seed % 4 === 0) {
        const hangTable = new Map<string, '' | 'hang' | 'stuck'>()
        H.S.hangFn = (gid, type, call) => {
          const k = `${gid}:${type}:${call}`
          if (!hangTable.has(k)) { const x = r(); hangTable.set(k, x < 0.12 ? 'hang' : x < 0.15 ? 'stuck' : '') }
          return hangTable.get(k)!
        }
      }
      if (seed % 11 === 0) H.S.cancelAfterExec = 1 + Math.floor(r() * 4)
      const credsFor = seed % 5 === 0 ? 0 : nPhones
      const { run } = await launch(flow, nPhones, { concurrency: 1 + Math.floor(r() * 4), rotation: seed % 9 === 0, credsFor })
      checkInvariants(flow, run, `graine ${seed} (${flow.blocks.map(b => (b.params.disabled ? '~' : '') + b.type).join(',')}, ${nPhones} comptes)`, credsFor > 0)
    }
  }, 120_000)
})

describe('cas ciblés', () => {
  const flowOf = (...blocks: FlowBlock[]): Flow => ({ id: 'f', name: 't', blocks, onError: 'stop' })

  it('source « dossier » : seulement les vidéos du dossier, sans corbeille ni marqueur', async () => {
    const b = newBlock('post'); b.params.source = 'folder'; b.params.folder = 'A'; b.params.mode = 'seq'
    const { run } = await launch(flowOf(b), 5)
    expect(run.phones.every(p => p.steps[0] === 'ok')).toBe(true)
    expect(run.log.some(l => l.includes('5 média(s)'))).toBe(true)   // v1..v5, pas vX (corbeille)
  })

  it('source « toute la banque » : images seulement pour une story', async () => {
    const b = newBlock('story'); b.params.source = 'all'; b.params.link = 'https://x.co'
    const { run } = await launch(flowOf(b), 2)
    expect(run.log.some(l => l.includes('4 média(s)'))).toBe(true)   // i1..i4
    expect(run.phones.every(p => p.steps[0] === 'ok')).toBe(true)
  })

  it('dossier vide : échec propre avec message, téléphone éteint', async () => {
    const b = newBlock('post'); b.params.source = 'folder'; b.params.folder = 'C'
    const { run } = await launch(flowOf(b), 1)
    expect(run.phones[0].steps[0]).toBe('failed')
    expect(run.phones[0].errors[0]).toContain('dossier « C »')
    expect(H.S.events.at(-1)?.ev).toBe('stop')
    expect(H.S.credits[0].failed).toBe(1)   // remboursé
  })

  it('usage unique : seules les vidéos réellement publiées partent à la corbeille', async () => {
    const b = newBlock('post'); b.params.videoIds = ['v1', 'v2', 'v3']; b.params.mode = 'seq'; b.params.removeAfter = true
    H.S.failFn = gid => gid === 'g1'   // le compte 1 (vidéo v2) échoue
    await launch(flowOf(b), 3)
    expect(H.S.trashed.sort()).toEqual(['v1', 'v3'])
  })

  it('story : un lien par compte, dans l\'ordre', async () => {
    const seen: string[] = []
    const geelark = await import('@/lib/geelark')
    const spy = vi.spyOn(geelark, 'postStoryToPhone').mockImplementation(async (_b, _g, o) => { seen.push(o.linkUrl); return { ok: true } })
    const b = newBlock('story'); b.params.imageIds = ['i1']; b.params.linkMode = 'perAccount'; b.params.links = 'https://a.co\nhttps://b.co\nhttps://c.co'
    await launch(flowOf(b), 3, { concurrency: 1 })
    expect(seen).toEqual(['https://a.co', 'https://b.co', 'https://c.co'])
    spy.mockRestore()
  })

  it('pause en dernier bloc : terminé, téléphone éteint', async () => {
    const w = newBlock('warmup'), p = newBlock('pause'); p.params.minMin = 5; p.params.maxMin = 5
    const { run } = await launch(flowOf(w, p), 2)
    expect(run.phones.every(x => x.status === 'done')).toBe(true)
    for (const gid of ['g0', 'g1']) expect(H.S.events.filter(e => e.gid === gid).at(-1)?.ev).toBe('stop')
  })

  it('crédits insuffisants : aucun téléphone démarré, rien débité', async () => {
    H.S.insufficient = true
    const { run } = await launch(flowOf(newBlock('post')), 3)
    expect(H.S.events.length).toBe(0)
    expect(run.status).toBe('error')
    expect(run.phones.every(p => p.status === 'cancelled')).toBe(true)
  })

  it('bloc payant désactivé : aucun crédit débité', async () => {
    const post = newBlock('post'); post.params.disabled = true; post.params.videoIds = ['v1']
    await launch(flowOf(newBlock('warmup'), post), 2)
    expect(H.S.credits.length).toBe(0)
    expect(H.S.events.some(e => e.ev === 'block:post')).toBe(false)
  })

  it('réessais : 2 échecs puis succès avec 2 réessais → OK en 3 tentatives', async () => {
    const b = newBlock('warmup'); b.params.retries = 2
    H.S.failFn = (_g, _t, call) => call < 3
    const { run } = await launch(flowOf(b), 1)
    expect(run.phones[0].steps[0]).toBe('ok')
    expect(run.phones[0].attempts[0]).toBe(3)
  })

  it('« continuer » sur un bloc : les blocs suivants sont joués malgré l\'échec', async () => {
    const a = newBlock('bio'); a.params.bios = 'x'; a.params.onError = 'continue'
    const w = newBlock('warmup')
    H.S.failFn = (_g, t) => t === 'bio'
    const { run } = await launch(flowOf(a, w), 1)
    expect(run.phones[0].steps).toEqual(['failed', 'ok'])
    expect(run.phones[0].status).toBe('failed')
  })

  it('état propre garanti : @ puis chauffe puis post puis story, Instagram remis à zéro avant chaque bloc', async () => {
    const u = newBlock('username'); u.params.usernames = 'lea{3}'
    const s = newBlock('story'); s.params.imageIds = ['i1']; s.params.link = 'https://x.co'
    const post = newBlock('post'); post.params.videoIds = ['v1']
    const { run } = await launch(flowOf(u, newBlock('warmup'), post, s, newBlock('avatar')), 2)
    const ev = H.S.events.filter(e => e.gid === 'g0').map(e => e.ev)
    expect(ev.filter(e => e.startsWith('dirty:'))).toEqual([])
    // chaque bloc est précédé de « check » (téléphone allumé) puis « reset » (Instagram fermé)
    ev.forEach((e, k) => { if (e.startsWith('block:')) expect(ev.slice(k - 2, k)).toEqual(['check', 'reset']) })
    expect(run.phones[0].steps.slice(0, 4)).toEqual(['ok', 'ok', 'ok', 'ok'])
  })

  it('après une longue pause (téléphone éteint) le bloc suivant redémarre le téléphone', async () => {
    const geelark = await import('@/lib/geelark')
    const p = newBlock('pause'); p.params.minMin = 4; p.params.maxMin = 4
    const { run } = await launch(flowOf(newBlock('warmup'), p, newBlock('warmup')), 1)
    const ev = H.S.events.filter(e => e.gid === 'g0').map(e => e.ev)
    expect(ev).toContain('reboot')
    expect(run.phones[0].steps).toEqual(['ok', 'ok', 'ok'])
    void geelark
  })

  it('bloc bloqué : délai max → tâche GeeLark annulée, échec, le bloc suivant part propre', async () => {
    const a = newBlock('warmup'); a.params.onError = 'continue'
    H.S.hangFn = (_g, t, call) => (t === 'warmup' && call === 1 ? 'hang' : '')
    const { run } = await launch(flowOf(a, newBlock('warmup')), 1)
    const ev = H.S.events.filter(e => e.gid === 'g0').map(e => e.ev)
    expect(run.phones[0].steps).toEqual(['failed', 'ok'])
    expect(run.phones[0].errors[0]).toContain('Délai max')
    expect(ev).toContain('cancel')
    expect(ev.filter(e => e.startsWith('dirty:'))).toEqual([])
  })

  it('bloc qui ne rend jamais la main : étapes suivantes annulées, téléphone éteint quand même', async () => {
    const a = newBlock('bio'); a.params.bios = 'x'; a.params.onError = 'continue'
    H.S.hangFn = (_g, t) => (t === 'bio' ? 'stuck' : '')
    const { run } = await launch(flowOf(a, newBlock('warmup')), 1)
    expect(run.phones[0].steps).toEqual(['failed', 'skipped'])
    expect(run.phones[0].errors[0]).toContain('bloqué')
    expect(H.S.events.filter(e => e.gid === 'g0').at(-1)?.ev).toBe('stop')
  })

  it('annulation pendant un bloc en cours : interrompu vite, tâche annulée, reste sauté', async () => {
    const post = newBlock('post'); post.params.videoIds = ['v1']
    H.S.hangFn = (_g, t) => (t === 'warmup' ? 'hang' : '')
    setTimeout(() => { H.S.cancelled = true }, 5)
    const t0 = Date.now()
    const { run } = await launch(flowOf(newBlock('warmup'), post), 1)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(run.phones[0].status).toBe('cancelled')
    expect(run.phones[0].steps).toEqual(['skipped', 'skipped'])
    expect(H.S.events.some(e => e.ev === 'cancel')).toBe(true)
  })

  it('annulation pendant une pause : blocs restants sautés, téléphone éteint', async () => {
    const w = newBlock('warmup'), p = newBlock('pause'), post = newBlock('post')
    p.params.minMin = 1; p.params.maxMin = 1; post.params.videoIds = ['v1']
    H.S.cancelAfterExec = 1   // annulé juste après la chauffe
    const { run } = await launch(flowOf(w, p, post), 1)
    expect(run.phones[0].status).toBe('cancelled')
    expect(run.phones[0].steps).toEqual(['ok', 'skipped', 'skipped'])
    expect(H.S.events.at(-1)?.ev).toBe('stop')
    expect(H.S.credits[0].failed).toBe(1)   // post non joué → remboursé
  })
})
