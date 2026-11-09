import { describe, it, expect } from 'vitest'
import { mediaKindOf, kindOfFile, extOfPath, withFav, isFav } from './mediaKind'

describe('mediaKind', () => {
  it('classe vidéo / image / son par extension', () => {
    expect(mediaKindOf({ storage_path: 'videos/orgs/x/a.mp4' })).toBe('video')
    expect(mediaKindOf({ storage_path: 'videos/orgs/x/a.MOV' })).toBe('video')
    expect(mediaKindOf({ storage_path: 'videos/orgs/x/a.jpg' })).toBe('image')
    expect(mediaKindOf({ storage_path: 'videos/orgs/x/a.mp3' })).toBe('audio')
    expect(mediaKindOf({ storage_path: null, file_url: 'https://cdn.x/s.m4a?token=1' })).toBe('audio')
  })
  it('un son n’est jamais pris pour une vidéo', () => {
    for (const e of ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'opus', 'flac']) expect(mediaKindOf({ storage_path: `a.${e}` })).toBe('audio')
  })
  it('sans extension lisible : vidéo (anciens médias)', () => {
    expect(mediaKindOf({ storage_path: 'videos/abc' })).toBe('video')
    expect(extOfPath('dossier.v2/fichier')).toBe('')
  })
  it('fichier du PC : MIME puis extension', () => {
    expect(kindOfFile({ name: 'son.mp3', type: 'audio/mpeg' })).toBe('audio')
    expect(kindOfFile({ name: 'son.m4a', type: '' })).toBe('audio')
    expect(kindOfFile({ name: 'clip.mov', type: '' })).toBe('video')
    expect(kindOfFile({ name: 'notes.txt', type: 'text/plain' })).toBeNull()
  })
  it('favori : ajout / retrait du tag sans toucher aux autres', () => {
    expect(withFav(['gj:1'], true)).toEqual(['gj:1', 'fav'])
    expect(withFav(['gj:1', 'fav'], false)).toEqual(['gj:1'])
    expect(withFav(['fav'], true)).toEqual(['fav'])
    expect(isFav({ tags: ['fav'] })).toBe(true)
    expect(isFav({ tags: null })).toBe(false)
  })
})
