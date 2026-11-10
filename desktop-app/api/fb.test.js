import { describe, it, expect } from 'vitest'
import { signState, readState, esc, reelPhase, SCOPES } from './fb.js'

const U = '00000000-0000-4000-8000-000000000001', O = '00000000-0000-4000-8000-0000000000aa'
describe('Facebook (API Meta) — connexion', () => {
  it('state signé : relu tel quel, refusé si modifié, expiré ou signé avec un autre secret', () => {
    const s = signState('secret', U, O, 60_000, 1000)
    expect(readState('secret', s, 2000)).toEqual({ userId: U, orgId: O })
    expect(readState('secret', signState('secret', U, null, 60_000, 1000), 2000)).toEqual({ userId: U, orgId: null })
    expect(readState('autre', s, 2000)).toBeNull()
    expect(readState('secret', s, 1000 + 60_001)).toBeNull()
    const [p, sig] = s.split('.')
    const forged = Buffer.from(JSON.stringify({ u: O, o: null, e: 9e15 })).toString('base64url')
    expect(readState('secret', `${forged}.${sig}`, 2000)).toBeNull()
    expect(readState('secret', p, 2000)).toBeNull()
    expect(readState('secret', U, 2000)).toBeNull()   // l'ancien « state = id utilisateur » n'est plus accepté
  })
  it('aucun HTML venu de l’adresse', () => { expect(esc('<script>alert(1)</script>"\'&')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;') })
  it('droits demandés : Pages seulement', () => { expect(SCOPES).toEqual(['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']) })
})
describe('Facebook (API Meta) — suivi du Reel', () => {
  it('en cours, publié, refusé', () => {
    expect(reelPhase({ video_status: 'processing', uploading_phase: { status: 'complete' }, processing_phase: { status: 'in_progress' } }).phase).toBe('processing')
    expect(reelPhase({ video_status: 'ready', publishing_phase: { status: 'complete', publish_status: 'published' } }).phase).toBe('published')
    expect(reelPhase({ video_status: 'error', processing_phase: { status: 'error', errors: [{ message: 'Format non pris en charge' }] } })).toEqual({ phase: 'failed', error: 'Format non pris en charge' })
    expect(reelPhase(undefined).phase).toBe('processing')
  })
})
