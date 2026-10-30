// Outils Studio via l'API (/api/v1/tools) :
//  1) PARITÉ : la copie serveur (_studio.js) produit exactement les mêmes réglages ffmpeg que l'app ;
//  2) TRAITEMENT RÉEL (si FFMPEG_PATH est défini) : spoof / remix vidéo, spoof photo, métadonnées.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import piexif from 'piexifjs'

vi.mock('../src/lib/supabase', () => ({ supabase: {} }))
vi.mock('../src/lib/ffmpeg', () => ({ runFfmpeg: async () => new Uint8Array(), fetchInput: async () => new Uint8Array() }))
vi.mock('../src/lib/bankStorage', () => ({ uploadThumbFor: async () => ({ thumbPath: null, duration: null }) }))
vi.mock('../src/lib/subtitles', () => ({ transcribeWordsGroq: async () => [] }))
const H = vi.hoisted(() => ({ db: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => H.db.client() }))

import * as srv from './_studio.js'
import * as appFilters from '../src/lib/studioFilters'
import * as appGps from '../src/lib/gps'
import * as appTools from '../src/lib/studioTools'
import tools from './v1-tools.js'

describe('Parité serveur ↔ app (mêmes réglages ffmpeg)', () => {
  const seeds = [1, 7, 42, 1234, 98765, 2_000_000_000, 0.5]
  const toggles = [appFilters.remixParams.length && { color: true, speed: true, crop: true, mirror: false }, { color: false, speed: true, crop: true, mirror: true }, { color: true, speed: false, crop: false, mirror: false }]
  it('Spoof : zoom et filtre identiques', () => {
    for (const s of seeds) for (const i of ['subtle', 'normal', 'strong']) {
      expect(srv.spoofZoomFactor(s, i)).toBe(appTools.spoofZoomFactor(s, i))
      expect(srv.spoofFilter(s, i)).toBe(appTools.spoofFilter(s, i))
    }
  })
  it('Remix : paramètres et filtres identiques', () => {
    for (const s of seeds) for (const i of ['subtle', 'normal', 'strong']) for (const t of toggles) {
      const a = appFilters.remixParams(s, i, t), b = srv.remixParams(s, i, t)
      expect(b).toEqual(a)
      expect(srv.remixFilter(b)).toBe(appFilters.remixFilter(a))
      expect(srv.remixAudioFilter(b)).toBe(appFilters.remixAudioFilter(a))
    }
  })
  it('Encodage identique (avec les métadonnées appareil conservées)', () => {
    expect(srv.H264).toEqual(appTools.H264)
    expect(srv.H264.join(' ')).toContain('use_metadata_tags')
  })
  it('Appareils et GPS identiques', () => {
    expect(srv.SPOOF_DEVICES).toEqual(appTools.SPOOF_DEVICES)
    for (const d of appTools.SPOOF_DEVICES) expect(srv.deviceMetaArgs(d.k)).toEqual(appTools.deviceMetaArgs(d.k))
    expect(srv.GPS_CITIES).toEqual(appGps.GPS_CITIES)
    for (const c of appGps.GPS_CITIES.filter(c => !['france', 'usa'].includes(c.k))) expect(srv.gpsFor(c.k)).toEqual(appGps.gpsFor(c.k))
    for (let n = 0; n < 50; n++) {
      const f = srv.gpsFor('france'), u = srv.gpsFor('usa')
      expect(f.lat).toBeGreaterThan(41); expect(f.lat).toBeLessThan(51.5)
      expect(u.lon).toBeGreaterThan(-125); expect(u.lon).toBeLessThan(-66)
    }
  })
})

// ── Traitement réel (ffmpeg natif) ─────────────────────────────────────────────
const FF = process.env.FFMPEG_PATH
const sha = b => createHash('sha256').update(b).digest('hex')
function makeDb() {
  const t = { content_bank: [], sf_api_tokens: [], organizations: [], organization_members: [], sf_api_log: [] }
  const objects = new Map()
  function query(table) {
    const f = []
    let op = 'select', payload = null, single = false, maybe = false
    const b = {
      select() { return b }, insert(r) { op = 'insert'; payload = Array.isArray(r) ? r : [r]; return b }, update(r) { op = 'update'; payload = r; return b },
      eq(k, v) { f.push(r => r[k] === v); return b }, is(k, v) { f.push(r => (r[k] ?? null) === v); return b },
      single() { single = true; return b }, maybeSingle() { maybe = true; return b }, order() { return b }, range() { return b },
      then(res, rej) {
        let out
        if (op === 'insert') { const rows = payload.map(r => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), deleted_at: null, ...r })); t[table].push(...rows); out = { data: single ? rows[0] : rows, error: null } }
        else { const list = t[table].filter(r => f.every(fn => fn(r))); if (op === 'update') { list.forEach(r => Object.assign(r, payload)); out = { data: null, error: null } } else out = { data: single || maybe ? list[0] ?? null : list, error: null } }
        return Promise.resolve(out).then(res, rej)
      },
    }
    return b
  }
  const client = () => ({
    from: query,
    auth: { getUser: async jwt => ({ data: { user: (H.db.sessions && H.db.sessions.get(jwt)) || null } }) },
    rpc: async () => ({ data: true, error: null }),
    storage: { from: () => ({
      upload: async (p, buf) => { objects.set(p, Buffer.from(buf)); return { error: null } },
      remove: async ps => { ps.forEach(p => objects.delete(p)); return { error: null } },
      download: async p => objects.has(p) ? { data: new Blob([objects.get(p)]), error: null } : { data: null, error: { message: 'absent' } },
      createSignedUrls: async ps => ({ data: ps.map(p => ({ path: p, signedUrl: `https://proj.supabase.co/storage/v1/object/sign/content/${p}?token=t` })) }),
    }) },
  })
  return { t, objects, client }
}
function ffmpeg(args) { const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args]); if (r.status !== 0) throw new Error(String(r.stderr)); }
function metaOf(path) { return String(spawnSync(FF, ['-hide_banner', '-i', path, '-f', 'ffmetadata', '-']).stdout) }
function call(path, { method = 'POST', body, auth }) {
  const qs = new URLSearchParams(path ? { tool: path } : {})
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(s) { resolve({ status: this.statusCode, body: JSON.parse(s) }) } }
    tools({ method, url: `/api/v1-tools?${qs}`, headers: { authorization: auth }, body }, res)
  })
}

describe.skipIf(!FF)('Outils via l’API — traitement réel', () => {
  let D, TOKEN, ORG, VID, IMG, dir
  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
    D = makeDb(); H.db = D
    ORG = crypto.randomUUID(); const USER = crypto.randomUUID()
    D.t.organizations.push({ id: ORG, owner_id: USER })
    TOKEN = 'sf_' + 'c3'.repeat(24)
    D.t.sf_api_tokens.push({ id: 't1', owner_id: USER, space_org: ORG, token_hash: sha(TOKEN), revoked_at: null })
    dir = mkdtempSync(join(tmpdir(), 'sft-'))
    // Vidéo source 2 s avec son + métadonnées d'origine à effacer ; photo source.
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-metadata', 'title=ORIGINAL-SECRET', '-metadata', 'encoder=CapCut', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(dir, 'src.mp4')])
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=900x1200', '-frames:v', '1', join(dir, 'src.jpg')])
    for (const [k, ext] of [['VID', 'mp4'], ['IMG', 'jpg']]) {
      const id = crypto.randomUUID(), path = `videos/orgs/${ORG}/${id}.${ext}`
      D.objects.set(path, readFileSync(join(dir, `src.${ext}`)))
      D.t.content_bank.push({ id, org_id: ORG, user_id: USER, title: k === 'VID' ? 'clip' : 'photo', folder: 'Montage', storage_path: path, thumbnail_path: null, file_url: null, notes: null, deleted_at: null, created_at: new Date().toISOString() })
      if (k === 'VID') VID = id; else IMG = id
    }
  })
  const auth = () => 'Bearer ' + TOKEN
  const outPath = f => D.t.content_bank.find(r => r.id === f.id).storage_path

  it('catalogue', async () => {
    const r = await call('', { method: 'GET', auth: auth() })
    expect(r.body.tools.map(t => t.id)).toEqual(['spoof', 'remix'])
    expect(r.body.devices.some(d => d.id === 'iphone15pro')).toBe(true)
  })
  it('spoof vidéo : nouvelle vidéo unique, métadonnées d’origine effacées, iPhone + GPS réécrits, miniature', async () => {
    const r = await call('spoof', { body: { file_id: VID, device: 'iphone15pro', gps: 'paris', intensity: 'normal', folder: 'Spoofées' }, auth: auth() })
    expect(r.status).toBe(200)
    expect(r.body.file).toMatchObject({ folder: 'Spoofées', kind: 'video', title: 'clip · spoof' })
    const out = D.objects.get(outPath(r.body.file))
    expect(sha(out)).not.toBe(sha(D.objects.get(D.t.content_bank.find(x => x.id === VID).storage_path)))
    const p = join(dir, 'out.mp4'); require('node:fs').writeFileSync(p, out)
    const meta = metaOf(p)
    expect(meta).not.toContain('ORIGINAL-SECRET'); expect(meta).not.toContain('CapCut')
    expect(meta).toMatch(/make=Apple/); expect(meta).toMatch(/model=iPhone 15 Pro/); expect(meta).toMatch(/location=\+48\.8566\+002\.3522\//)
    expect(D.t.content_bank.find(x => x.id === r.body.file.id).thumbnail_path).toMatch(/_thumb\.jpg$/)
    expect(r.body.settings).toMatchObject({ intensity: 'normal', device: 'iphone15pro', gps: 'paris' })
  }, 60_000)
  it('remix vidéo (miroir) + même seed ⇒ mêmes réglages', async () => {
    const r = await call('remix', { body: { file_id: VID, seed: 42, toggles: { mirror: true }, intensity: 'strong' }, auth: auth() })
    expect(r.status).toBe(200)
    expect(r.body.settings.seed).toBe(42)
    expect(r.body.file.title).toBe('clip · remix')
    expect(srv.remixArgs({ seed: 42, intensity: 'strong', toggles: { ...srv.DEFAULT_TOGGLES, mirror: true } }).join(' ')).toContain('hflip')
  }, 60_000)
  it('spoof photo : JPEG ré-encodé, EXIF appareil + GPS', async () => {
    const r = await call('spoof', { body: { file_id: IMG, device: 'iphone14', gps: { lat: 40.7128, lon: -74.006 } }, auth: auth() })
    expect(r.status).toBe(200)
    expect(r.body.file.kind).toBe('image')
    const out = D.objects.get(outPath(r.body.file))
    expect(out[0]).toBe(0xff); expect(out[1]).toBe(0xd8)
    const ex = piexif.load(out.toString('binary'))
    expect(ex['0th'][piexif.ImageIFD.Make]).toBe('Apple')
    expect(ex['0th'][piexif.ImageIFD.Model]).toBe('iPhone 14')
    expect(ex.GPS[piexif.GPSIFD.GPSLatitudeRef]).toBe('N')
    expect(ex.GPS[piexif.GPSIFD.GPSLongitudeRef]).toBe('W')
    expect(r.body.settings.gps).toBe('custom')
  }, 30_000)
  it('depuis l’app : session utilisateur (JWT) au lieu d’une clé ; lecteur refusé', async () => {
    const USER = D.t.organizations[0].owner_id
    H.db.sessions = new Map([['jwt-owner', { id: USER }], ['jwt-viewer', { id: 'v1' }]])
    D.t.organization_members.push({ org_id: ORG, user_id: 'v1', role: 'viewer' })
    const ok = await call('spoof', { body: { file_id: VID, org_id: ORG, device: 'iphone15', gps: 'france', folder: 'Genjutsu' }, auth: 'Bearer jwt-owner' })
    expect(ok.status).toBe(200)
    expect(ok.body.file.folder).toBe('Genjutsu')
    expect(ok.body.settings).toMatchObject({ device: 'iphone15', gps: 'france' })
    expect((await call('spoof', { body: { file_id: VID, org_id: ORG }, auth: 'Bearer jwt-viewer' })).status).toBe(403)
    expect((await call('spoof', { body: { file_id: VID, org_id: ORG }, auth: 'Bearer jwt-inconnu' })).status).toBe(401)
  }, 60_000)
  it('erreurs claires', async () => {
    expect((await call('spoof', { body: { file_id: VID }, auth: 'Bearer nope' })).status).toBe(401)
    expect((await call('spoof', { body: { file_id: VID, device: 'nokia3310' }, auth: auth() })).body.code).toBe('invalid_device')
    expect((await call('spoof', { body: { file_id: VID, gps: 'mars' }, auth: auth() })).body.code).toBe('invalid_gps')
    expect((await call('remix', { body: { file_id: IMG }, auth: auth() })).body.code).toBe('invalid_file')
    expect((await call('spoof', { body: {}, auth: auth() })).status).toBe(422)
    expect((await call('spoof', { body: { file_id: crypto.randomUUID() }, auth: auth() })).status).toBe(404)
    expect((await call('blur', { body: { file_id: VID }, auth: auth() })).status).toBe(404)
  })
})
