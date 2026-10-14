import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { scoreReels } from '../../../supabase/functions/run-scheduled-posts/viral-score'
import { filterReels } from '@/pages/ViralWatch'


describe('veille des Reels viraux', () => {
  it('score = vues / médiane du compte', () => {
    const r = (code: string, views: number) => ({ postedAt: '2026-10-10T10:00:00Z', views, likes: 0, comments: 0, url: `https://www.instagram.com/reel/${code}/`, thumb: null })
    const s = scoreReels([r('a', 10000), r('b', 20000), r('c', 30000), r('d', 600000)])
    expect(s.find(x => x.code === 'd')).toMatchObject({ baseline: 25000, score: 24 })
    expect(s.find(x => x.code === 'a')?.score).toBe(0.4)
  })
  it('filtres et tris', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    const reels = [
      { watch_id: 'w1', code: '1', username: 'a', views: 100, likes: 0, comments: 0, taken_at: '2026-10-12T08:00:00Z', thumb: null, url: null, baseline: 10, score: 10 },
      { watch_id: 'w2', code: '2', username: 'b', views: 900, likes: 0, comments: 0, taken_at: '2026-10-11T08:00:00Z', thumb: null, url: null, baseline: 600, score: 1.5 },
      { watch_id: 'w2', code: '3', username: 'b', views: 5000, likes: 0, comments: 0, taken_at: '2026-09-01T08:00:00Z', thumb: null, url: null, baseline: 600, score: 8 },
    ]
    const watch = [{ id: 'w1', username: 'a', niche: 'FR', fetched_at: null, last_error: null }, { id: 'w2', username: 'b', niche: 'US', fetched_at: null, last_error: null }]
    expect(filterReels(reels, watch, { range: '7', niche: '', account: '', sort: 'score' }, now).map(r => r.code)).toEqual(['1', '2'])
    expect(filterReels(reels, watch, { range: '7', niche: '', account: '', sort: 'views' }, now).map(r => r.code)).toEqual(['2', '1'])
    expect(filterReels(reels, watch, { range: '1', niche: 'FR', account: '', sort: 'score' }, now).map(r => r.code)).toEqual(['1'])
  })
})

describe('veille des Reels — fiche', () => {
  it('proxy vidéo limité au CDN Instagram', async () => {
    const { isIgCdn } = await import('../../../supabase/functions/run-scheduled-posts/viral-score')
    expect(isIgCdn('https://scontent-cdg4-1.cdninstagram.com/o1/v/t16/x.mp4?a=1')).toBe(true)
    expect(isIgCdn('https://video.fbcdn.net/v.mp4')).toBe(true)
    expect(isIgCdn('http://scontent.cdninstagram.com/x.mp4')).toBe(false)
    expect(isIgCdn('https://evil.com/cdninstagram.com.mp4')).toBe(false)
    expect(isIgCdn('https://cdninstagram.com.evil.com/x')).toBe(false)
  })
  it('engagement = (likes + commentaires) / vues', async () => {
    const { engagement } = await import('@/pages/ViralWatch')
    expect(engagement({ views: 1000, likes: 45, comments: 5 })).toBe(5)
    expect(engagement({ views: 0, likes: 3, comments: 0 })).toBe(0)
  })
})

describe('veille des Reels — filtre pays', () => {
  it('FR / US / tous', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    const r = (watch_id: string, code: string) => ({ watch_id, code, username: watch_id, views: 1, likes: 0, comments: 0, taken_at: '2026-10-12T08:00:00Z', thumb: null, url: null, baseline: 1, score: 1 })
    const watch = [{ id: 'a', username: 'a', niche: '', fetched_at: null, last_error: null, region: 'fr' as const }, { id: 'b', username: 'b', niche: '', fetched_at: null, last_error: null, region: 'us' as const }, { id: 'c', username: 'c', niche: '', fetched_at: null, last_error: null }]
    const reels = [r('a', '1'), r('b', '2'), r('c', '3')]
    const codes = (region: '' | 'fr' | 'us') => filterReels(reels, watch, { range: '7', niche: '', account: '', sort: 'views', region }, now).map(x => x.code).sort()
    expect(codes('fr')).toEqual(['1', '3'])   // sans pays = FR
    expect(codes('us')).toEqual(['2'])
    expect(codes('')).toEqual(['1', '2', '3'])
  })
})

describe('Veille v4 — médias, score, midi Paris', async () => {
  const { parseMedia, scoreBy, lastParisNoon } = await import('../../../supabase/functions/run-scheduled-posts/viral-score')
  it('lit un Reel HikerAPI avec vidéo, légende et durée', () => {
    const m = parseMedia({ code: 'DAbC12_xYz', media_type: 2, product_type: 'clips', play_count: 1200, like_count: 50, comment_count: 3, taken_at: 1760000000, thumbnail_url: 'https://x.cdninstagram.com/t.jpg', video_url: 'https://x.cdninstagram.com/v.mp4', caption_text: 'hello', video_duration: 14.2 }, 'reel')
    expect(m?.kind).toBe('reel'); expect(m?.views).toBe(1200); expect(m?.videoUrl).toContain('v.mp4'); expect(m?.caption).toBe('hello'); expect(m?.duration).toBe(14.2)
    expect(m?.url).toBe('https://www.instagram.com/reel/DAbC12_xYz/'); expect(m?.postedAt).toBe(new Date(1760000000 * 1000).toISOString())
  })
  it('lit un carrousel du feed avec ses images', () => {
    const m = parseMedia({ code: 'C9xYz-12AB', media_type: 8, like_count: 900, resources: [{ thumbnail_url: 'https://a/1.jpg' }, { thumbnail_url: 'https://a/2.jpg' }], taken_at: '2026-10-10T10:00:00Z' })
    expect(m?.kind).toBe('feed'); expect(m?.images).toEqual(['https://a/1.jpg', 'https://a/2.jpg']); expect(m?.url).toBe('https://www.instagram.com/p/C9xYz-12AB/')
  })
  it('ignore un média sans code valide', () => { expect(parseMedia({ like_count: 3 })).toBeNull() })
  it('score par métrique (médiane)', () => {
    const s = scoreBy([{ v: 10 }, { v: 20 }, { v: 30 }], x => x.v)
    expect(s[1].baseline).toBe(20); expect(s[2].score).toBe(1.5)
  })
  it('dernier midi à Paris (été et hiver)', () => {
    expect(lastParisNoon(new Date('2026-07-15T13:00:00Z')).toISOString()).toBe('2026-07-15T10:00:00.000Z') // 15h Paris → midi du jour
    expect(lastParisNoon(new Date('2026-07-15T09:00:00Z')).toISOString()).toBe('2026-07-14T10:00:00.000Z') // 11h Paris → midi la veille
    expect(lastParisNoon(new Date('2026-12-15T12:30:00Z')).toISOString()).toBe('2026-12-15T11:00:00.000Z') // hiver : UTC+1
    expect(lastParisNoon(new Date('2026-12-15T23:30:00Z')).toISOString()).toBe('2026-12-15T11:00:00.000Z') // 00h30 Paris le 16 → midi du 15
  })
})

describe('Veille v4 — pas de doublon, Reels / feed séparés', () => {
  it('un même Reel suivi deux fois n’apparaît qu’une fois ; le feed est filtré à part', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    const base = { likes: 0, comments: 0, taken_at: '2026-10-12T08:00:00Z', thumb: null, url: null, baseline: 10, score: 2 }
    const reels = [
      { ...base, watch_id: 'pub', code: 'X', username: 'a', views: 100 },
      { ...base, watch_id: 'priv', code: 'X', username: 'a', views: 120 },
      { ...base, watch_id: 'pub', code: 'P', username: 'a', views: 0, likes: 50, kind: 'feed' as const },
    ]
    const watch = [{ id: 'pub', username: 'a', niche: '', fetched_at: null, last_error: null }, { id: 'priv', username: 'a', niche: '', fetched_at: null, last_error: null }]
    const r = filterReels(reels, watch, { range: '7', niche: '', account: '', sort: 'views', kind: 'reel' }, now)
    expect(r.map(x => x.code)).toEqual(['X']); expect(r[0].views).toBe(120)
    expect(filterReels(reels, watch, { range: '7', niche: '', account: '', sort: 'views', kind: 'feed' }, now).map(x => x.code)).toEqual(['P'])
  })
})
