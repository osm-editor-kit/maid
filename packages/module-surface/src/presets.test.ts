import { describe, expect, it } from 'bun:test'
import {
  createPresets,
  withChanges,
  type Geometry,
  type Presets,
} from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import {
  SURFACE_SMOOTHNESS_FIELD_ID,
  SURFACE_SMOOTHNESS_FIELD_TYPE,
  surfacePresetChanges,
} from './presets.ts'

const presets: Presets = createPresets(withChanges(defaultPresetData, surfacePresetChanges))
const baseline: Presets = createPresets(defaultPresetData)

function fieldsOf(tags: Record<string, string>, geometry: Geometry = 'line', from = presets) {
  const preset = from.match(tags, geometry)
  return from.fieldsFor(preset, tags, geometry)
}

function idsOf(tags: Record<string, string>, geometry: Geometry = 'line', from = presets) {
  return fieldsOf(tags, geometry, from).map((field) => field.id)
}

describe('surfacePresetChanges', () => {
  it('applies to the default data without an error', () => {
    expect(() => withChanges(defaultPresetData, surfacePresetChanges)).not.toThrow()
  })

  it('shows the field once on a residential road, with the field type of the module and both keys', () => {
    const tags = { highway: 'residential' }
    expect(presets.match(tags, 'line').id).toBe('highway/residential')
    const fields = fieldsOf(tags)
    const matching = fields.filter((field) => field.id === SURFACE_SMOOTHNESS_FIELD_ID)
    expect(matching).toHaveLength(1)
    expect(matching[0]?.type).toBe(SURFACE_SMOOTHNESS_FIELD_TYPE)
    expect(matching[0]?.keys).toEqual(['surface', 'smoothness'])
    expect(matching[0]?.label).toBe('Surface and smoothness')
  })

  it('takes the plain surface field out of the residential road, and places the new one where it was', () => {
    const before = idsOf({ highway: 'residential' }, 'line', baseline)
    const after = idsOf({ highway: 'residential' })
    expect(before).toContain('surface')
    expect(after).not.toContain('surface')
    expect(after.indexOf(SURFACE_SMOOTHNESS_FIELD_ID)).toBe(before.indexOf('surface'))
  })

  it('does not offer the plain smoothness field for a residential road with a smoothness value', () => {
    const tags = { highway: 'residential', smoothness: 'good' }
    const ids = idsOf(tags)
    expect(ids).not.toContain('smoothness')
    expect(ids.filter((id) => id === SURFACE_SMOOTHNESS_FIELD_ID)).toHaveLength(1)
  })

  it('shows the field once on a path, a footway and a cycleway, and takes out both plain fields of the cycleway', () => {
    const cases: Record<string, string>[] = [
      { highway: 'path', bicycle: 'designated' },
      { highway: 'footway' },
      { highway: 'cycleway' },
    ]
    for (const tags of cases) {
      const ids = idsOf(tags)
      expect(ids.filter((id) => id === SURFACE_SMOOTHNESS_FIELD_ID)).toHaveLength(1)
      expect(ids).not.toContain('surface')
      expect(ids).not.toContain('smoothness')
    }
  })

  it('keeps the cycleway field where the plain surface was, before the width', () => {
    const ids = idsOf({ highway: 'cycleway' })
    expect(ids.indexOf(SURFACE_SMOOTHNESS_FIELD_ID)).toBeLessThan(ids.indexOf('width'))
    expect(ids.indexOf(SURFACE_SMOOTHNESS_FIELD_ID)).toBeGreaterThan(ids.indexOf('oneway'))
  })

  it('gives the field once to secondary, tertiary, unclassified and road, each named on its own', () => {
    for (const tags of [
      { highway: 'secondary' },
      { highway: 'tertiary' },
      { highway: 'unclassified' },
      { highway: 'road' },
    ]) {
      const ids = idsOf(tags)
      expect(ids.filter((id) => id === SURFACE_SMOOTHNESS_FIELD_ID)).toHaveLength(1)
      expect(ids).not.toContain('surface')
      expect(ids).not.toContain('smoothness')
    }
  })

  it('leaves the presets it does not edit alone (track keeps its plain surface and smoothness)', () => {
    const ids = idsOf({ highway: 'track' })
    expect(ids).toContain('surface')
    expect(ids).not.toContain(SURFACE_SMOOTHNESS_FIELD_ID)
  })

  it('keeps the other fields of the presets in their order', () => {
    const before = idsOf({ highway: 'primary' }, 'line', baseline).filter((id) => id !== 'surface')
    const after = idsOf({ highway: 'primary' }).filter((id) => id !== SURFACE_SMOOTHNESS_FIELD_ID)
    expect(after).toEqual(before)
  })
})
