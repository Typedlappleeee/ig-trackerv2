import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { planFbJobs } from './fbPages'

describe('Reels Facebook — répartition', () => {
  it('une vidéo par Page, à tour de rôle', () => {
    expect(planFbJobs(['p1', 'p2', 'p3'], ['a', 'b'], 'rotate')).toEqual([{ page: 'p1', file: 'a' }, { page: 'p2', file: 'b' }, { page: 'p3', file: 'a' }])
  })
  it('toutes les vidéos sur chaque Page', () => {
    expect(planFbJobs(['p1', 'p2'], ['a', 'b'], 'all')).toHaveLength(4)
    expect(planFbJobs([], ['a'], 'all')).toEqual([]); expect(planFbJobs(['p1'], [], 'rotate')).toEqual([])
  })
})
