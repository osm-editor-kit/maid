import { describe, expect, it } from 'bun:test'
import { MAPTERHORN, parseAsTerrain } from './terrain.ts'

describe('terrain', () => {
  it('reads relief and 3d from the URL, nothing else', () => {
    expect(parseAsTerrain.parse('relief')).toBe('relief')
    expect(parseAsTerrain.parse('3d')).toBe('3d')
    expect(parseAsTerrain.parse('off')).toBeNull()
    expect(parseAsTerrain.parse('3D')).toBeNull()
  })
  it('uses Mapterhorn’s Terrarium tiles of 512 px up to zoom 15, credited to its attribution page', () => {
    expect(MAPTERHORN).toMatchObject({ encoding: 'terrarium', tileSize: 512, maxzoom: 15 })
    expect(MAPTERHORN.attribution).toContain('mapterhorn.com/attribution')
  })
})
