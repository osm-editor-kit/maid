import { describe, expect, test } from 'bun:test'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { lensStyle } from '@osm-editor-kit/maid-style'
import { flatsLabels, flatsOf, type GraphLike } from './flats.ts'
import { BUILDING_COLOURS, buildingsLens, FLATS_RAMP } from './lens.ts'
import { BUILDING_FAVOURITES, buildingPresetChanges, withBuildingDefaults } from './presets.ts'

const style = (tags: Record<string, string>) => lensStyle(buildingsLens, tags, 'area')

describe('buildings lens (after the kaligrafy iD fork)', () => {
  test('every building is salmon, outlined and filled', () => {
    expect(style({ building: 'yes' })).toEqual({
      color: BUILDING_COLOURS.building,
      fillOpacity: 0.3,
    })
  })

  test('the type sets the outline, and for non-residential types the fill', () => {
    expect(style({ building: 'retail' })?.color).toBe(BUILDING_COLOURS.commercial)
    expect(style({ building: 'retail' })?.fillColor).toBe(BUILDING_COLOURS.commercial)
    expect(style({ building: 'office' })?.fillColor).toBe(BUILDING_COLOURS.officeFill)
    expect(style({ building: 'house' })?.color).toBe(BUILDING_COLOURS.house)
    expect(style({ building: 'house' })?.fillColor).toBe(BUILDING_COLOURS.building)
    expect(style({ building: 'yes', office: 'yes' })?.color).toBe(BUILDING_COLOURS.office)
  })

  test('the number of dwellings wins over the type, with a thicker outline', () => {
    expect(style({ building: 'house', 'building:flats': '1' })?.color).toBe(FLATS_RAMP[0])
    expect(style({ building: 'apartments', flats: '8' })?.color).toBe(FLATS_RAMP[7])
    expect(style({ building: 'yes', houses: '3' })?.width).toBeGreaterThan(1)
    expect(style({ building: 'apartments', 'building:flats': '24' })?.color).toBe(
      BUILDING_COLOURS.flatsMany,
    )
  })

  test('building:flats=0 keeps the look of the type, building=no and other features are drawn as usual', () => {
    expect(style({ building: 'garage', 'building:flats': '0' })).toEqual(
      style({ building: 'garage' }),
    )
    expect(style({ building: 'retail', 'building:flats': '0' })?.color).toBe(
      BUILDING_COLOURS.commercial,
    )
    expect(style({ building: 'no', amenity: 'parking' })).toEqual({})
    expect(style({ landuse: 'residential' })).toBeUndefined()
    expect(lensStyle(buildingsLens, { building: 'yes' }, 'point')).toBeUndefined()
  })
})

describe('flats', () => {
  test('the first of building:flats, flats and houses, above 0', () => {
    expect(flatsOf({ building: 'yes', 'building:flats': '4', flats: '2' })).toBe(4)
    expect(flatsOf({ building: 'yes', houses: '2' })).toBe(2)
    expect(flatsOf({ building: 'yes', 'building:flats': '0', flats: '3' })).toBeUndefined()
    expect(flatsOf({ building: 'yes', flats: 'many' })).toBeUndefined()
    expect(flatsOf({ landuse: 'residential', flats: '3' })).toBeUndefined()
    expect(flatsOf({ building: 'no', flats: '3' })).toBeUndefined()
  })

  test('a label at the middle of each building with a number, the local graph over the base', () => {
    const node = (id: string, loc: [number, number]) => ({ id, tags: {}, loc })
    const square = (id: string, flats?: string) => ({
      id,
      tags: { building: 'yes', ...(flats ? { 'building:flats': flats } : {}) },
      nodes: ['n1', 'n2', 'n3', 'n4', 'n1'],
    })
    const nodes = new Map<string, ReturnType<typeof node>>([
      ['n1', node('n1', [0, 0])],
      ['n2', node('n2', [2, 0])],
      ['n3', node('n3', [2, 2])],
      ['n4', node('n4', [0, 2])],
    ])
    const base = new Map<string, unknown>([
      ...nodes,
      ['w1', square('w1', '3')],
      ['w2', square('w2', '5')],
    ])
    const local = new Map<string, unknown>([
      ['w1', square('w1', '6')],
      ['w2', undefined],
      ['w3', square('w3')],
    ])
    const graph = {
      base: { entities: base },
      local: { entities: local },
      hasEntity: (id: string) => (local.has(id) ? local.get(id) : base.get(id)),
    } as unknown as GraphLike
    expect(flatsLabels(graph)).toEqual([{ id: 'w1', count: 6, at: [1, 1] }])
    // a node moved here moves the label of its building, which is unchanged in the local graph
    local.delete('w1')
    local.set('n3', node('n3', [6, 6]))
    const parentWays = (entity: { id: string }) => (entity.id === 'n3' ? [{ id: 'w1' }] : [])
    expect(flatsLabels({ ...graph, parentWays } as GraphLike)).toEqual([
      { id: 'w1', count: 3, at: [2, 2] },
    ])
  })
})

describe('building presets', () => {
  const base = defaultPresetData
  const data = withChanges(base, buildingPresetChanges(base))
  const presets = createPresets({ ...data, defaults: withBuildingDefaults(data.defaults) })
  const fieldIds = (id: string) => {
    const preset = presets.preset(id)
    if (!preset) throw new Error(`no preset ${id}`)
    return presets.fieldsFor(preset, preset.tags, 'area').map((field) => field.id)
  }

  test('levels, levels underground and roof levels on every building, in that order', () => {
    expect(fieldIds('building/house').slice(0, 6)).toEqual([
      'house',
      'name',
      'building/levels',
      'building/levels/underground',
      'roof_levels',
      'building/flats',
    ])
    const garage = fieldIds('building/garage')
    expect(garage).toContain('building/levels')
    expect(garage.indexOf('roof_levels')).toBe(garage.indexOf('building/levels/underground') + 1)
    expect(fieldIds('building/apartments').filter((id) => id === 'building/flats')).toHaveLength(1)
    expect(fieldIds('building/roof')).not.toContain('building/levels')
    expect(fieldIds('building/commercial')).not.toContain('building/flats')
  })

  test('the building types are offered first and every favourite is a preset', () => {
    expect(
      presets
        .defaults(['area'])
        .slice(0, 3)
        .map((row) => row.id),
    ).toEqual(['building', 'building/house', 'building/detached'])
    for (const { presetId } of BUILDING_FAVOURITES) expect(presets.preset(presetId)).toBeDefined()
  })
})
