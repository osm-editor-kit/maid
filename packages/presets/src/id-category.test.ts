// Adopted from iD test/spec/presets/category.js (ISC, © iD contributors), at commit 0194f3926.
// iD's fixture is one member, a category of one. The picker lists a category only with two or more members
// (defaults.ts, MIN_CATEGORY_MEMBERS), so the fixture here has two members.
import { describe, expect, it } from 'bun:test'
import { createPresets } from './presets.ts'
import type { PresetCategory, PresetData } from './types.ts'

const data: PresetData = {
  presets: {
    'highway/residential': {
      name: 'Residential Road',
      tags: { highway: 'residential' },
      geometry: ['line'],
    },
    'highway/tertiary': {
      name: 'Tertiary Road',
      tags: { highway: 'tertiary' },
      geometry: ['line'],
    },
  },
  fields: {},
  translations: {},
  categories: {
    road: { icon: 'iD-highway-unclassified', members: ['highway/residential', 'highway/tertiary'] },
  },
  defaults: { line: ['road'] },
}

const presets = createPresets(data)

describe('iD.presetCategory', () => {
  const category = presets.defaults(['line']).find((row) => row.id === 'road') as PresetCategory

  it('maps members names to preset instances', () => {
    expect(category.members[0]).toEqual(presets.preset('highway/residential'))
    expect(category.members[0]?.name).toBe('Residential Road')
  })

  describe('#matchGeometry', () => {
    it('matches the type of an entity', () => {
      expect(presets.matchGeometry(category, 'line')).toBe(true)
      expect(presets.matchGeometry(category, 'point')).toBe(false)
    })
  })
})
