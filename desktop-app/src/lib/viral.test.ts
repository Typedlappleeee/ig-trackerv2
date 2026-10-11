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
