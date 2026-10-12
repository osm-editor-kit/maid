import { describe, expect, it } from 'bun:test'
import type { Preset } from '@osm-editor-kit/maid-presets'
import { mainTagLabel, moveActive } from './picker-logic.ts'

function preset(tags: Record<string, string>): Preset {
  return {
    id: 'x',
    name: 'X',
    geometry: ['point'],
    tags,
    addTags: {},
    removeTags: {},
    matchScore: 1,
    searchable: true,
    terms: [],
    aliases: [],
  }
}

describe('moveActive', () => {
  it('moves down and up by one', () => {
    expect(moveActive(0, 1, 3)).toBe(1)
    expect(moveActive(2, -1, 3)).toBe(1)
  })

  it('wraps at both ends', () => {
    expect(moveActive(2, 1, 3)).toBe(0)
    expect(moveActive(0, -1, 3)).toBe(2)
  })

  it('starts from the first row going down and the last going up', () => {
    expect(moveActive(-1, 1, 3)).toBe(0)
    expect(moveActive(-1, -1, 3)).toBe(2)
    expect(moveActive(7, 1, 3)).toBe(0)
  })

  it('returns -1 without rows', () => {
    expect(moveActive(0, 1, 0)).toBe(-1)
    expect(moveActive(-1, -1, 0)).toBe(-1)
  })

  it('stays on the only row', () => {
    expect(moveActive(0, 1, 1)).toBe(0)
    expect(moveActive(0, -1, 1)).toBe(0)
  })
})

describe('mainTagLabel', () => {
  it('shows the first tag as key=value', () => {
    expect(mainTagLabel(preset({ amenity: 'cafe', name: 'x' }))).toBe('amenity=cafe')
  })

  it('is undefined without tags', () => {
    expect(mainTagLabel(preset({}))).toBeUndefined()
  })
})
