import { describe, expect, test } from 'bun:test'
import { lensStyle, type Lens } from '@osm-editor-kit/maid-style'
import { BUILT_IN_LENSES, litLens, maxspeedLens, surfaceLens, WARNING } from './builtin.ts'

const at = (lens: Lens, tags: Record<string, string>, geometry: 'line' | 'area' = 'line') =>
  lensStyle(lens, tags, geometry)

describe('built-in lenses', () => {
  test('each has a unique id and a name', () => {
    const ids = BUILT_IN_LENSES.map((lens) => lens.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const lens of BUILT_IN_LENSES) expect(lens.name.length).toBeGreaterThan(0)
  })

  test('surface: paved, unpaved, other and missing', () => {
    expect(at(surfaceLens, { highway: 'residential', surface: 'asphalt' })?.color).toBe('#2b6cb0')
    expect(at(surfaceLens, { highway: 'track', surface: 'gravel' })?.color).toBe('#b7791f')
    expect(at(surfaceLens, { highway: 'path', surface: 'cobblestone:flattened' })?.color).toBe(
      '#718096',
    )
    expect(at(surfaceLens, { highway: 'footway' })?.color).toBe(WARNING)
  })

  test('surface: other features are dimmed, areas are not covered', () => {
    expect(at(surfaceLens, { building: 'yes' })).toEqual({ opacity: 0.25 })
    expect(at(surfaceLens, { highway: 'primary' }, 'area')).toBeUndefined()
  })

  test('lit: lit, not lit and missing', () => {
    expect(at(litLens, { highway: 'footway', lit: '24/7' })?.color).toBe('#f6c700')
    expect(at(litLens, { highway: 'footway', lit: 'no' })?.color).toBe('#2d3748')
    expect(at(litLens, { highway: 'footway' })?.color).toBe(WARNING)
  })

  test('max speed: bands in km/h and mph, other values and missing', () => {
    expect(at(maxspeedLens, { highway: 'residential', maxspeed: '30' })?.color).toBe('#1a9850')
    expect(at(maxspeedLens, { highway: 'residential', maxspeed: '20 mph' })?.color).toBe('#1a9850')
    expect(at(maxspeedLens, { highway: 'primary', maxspeed: '50' })?.color).toBe('#e6b800')
    expect(at(maxspeedLens, { highway: 'motorway', maxspeed: '130' })?.color).toBe('#a50026')
    expect(at(maxspeedLens, { highway: 'motorway', maxspeed: 'none' })?.color).toBe('#a50026')
    expect(at(maxspeedLens, { highway: 'primary', maxspeed: 'DE:urban' })?.color).toBe('#7b61ff')
    expect(at(maxspeedLens, { highway: 'primary' })?.color).toBe(WARNING)
  })

  test('max speed: a path without maxspeed is not warned about', () => {
    expect(at(maxspeedLens, { highway: 'footway' })).toEqual({ opacity: 0.25 })
  })
})
