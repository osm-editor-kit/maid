import { describe, expect, test } from 'bun:test'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { processBikelanes } from '@tilda-geo/bicycle-infrastructure'
import { bikeCollection, type GraphEntity, type GraphLike } from './collect.ts'
import { bikeWayFeatures, signParts, signPoint, type BikeWay } from './features.ts'
import { ALL_CATEGORIES, GROUPS, groupOf, NO_INFRASTRUCTURE } from './groups.ts'
import { BIKE_LAYERS, sideOffset } from './layers.ts'
import { bikeInfrastructureLens } from './lens.ts'
import { BIKE_PRESET_LIST, bikePresetChanges, presetId, SIDEPATH_FIELD } from './presets.ts'
import { bikeInfraShown, connectBikeInfra, showsBikeInfra } from './shown.ts'

const LINE: [number, number][] = [
  [13.4, 52.5],
  [13.401, 52.5],
]
const way = (tags: Record<string, string>, id = 'w1'): BikeWay => ({ id, tags, coordinates: LINE })

describe('groups', () => {
  test('every TILDA category has a group or is one without infrastructure', () => {
    const none: readonly string[] = NO_INFRASTRUCTURE
    for (const category of ALL_CATEGORIES) {
      expect(groupOf(category) !== undefined || none.includes(category)).toBe(true)
    }
  })

  test('a category is in one group only, and every grouped category exists', () => {
    const seen = GROUPS.flatMap((group) => group.categories)
    expect(new Set(seen).size).toBe(seen.length)
    for (const category of seen) expect(ALL_CATEGORIES).toContain(category)
  })

  test('blue for bicycles alone, pink for paths shared with people on foot', () => {
    expect(groupOf('cycleway_adjoining')?.colour).toBe('#174ed9')
    expect(groupOf('cyclewayOnHighway_exclusive')?.colour).toBe('#0098f0')
    expect(groupOf('footAndCyclewayShared_isolated')?.colour).toBe('#e949ac')
    expect(groupOf('footwayBicycleYes_adjoining')?.dashed).toBe(true)
  })
})

describe('features', () => {
  test('a sidewalk with bicycles allowed and its sign (the way of the report, w896061943)', () => {
    const features = bikeWayFeatures(
      way({
        highway: 'footway',
        footway: 'sidewalk',
        bicycle: 'yes',
        traffic_sign: 'DE:239,1022-10',
      }),
    )
    expect(features.map((f) => f.properties)).toEqual([
      {
        kind: 'infra',
        wayId: 'w1',
        side: 'self',
        category: 'footwayBicycleYes_adjoining',
        group: 'footwayBicycle',
        colour: '#f08ed5',
        dashed: true,
        sidepath: 'yes',
        sign: 'DE:239,1022-10',
      },
      { kind: 'sign', wayId: 'w1', side: 'self', sign: 'DE:239,1022-10' },
    ])
  })

  test('road sides: a lane on the right, a sidewalk with bicycles allowed on the left, a separate cycleway', () => {
    const features = bikeWayFeatures(
      way({
        highway: 'secondary',
        'cycleway:right': 'lane',
        'cycleway:right:lane': 'exclusive',
        'sidewalk:left': 'yes',
        'sidewalk:left:bicycle': 'yes',
        'cycleway:left': 'separate',
      }),
    )
    const parts = features.map((f) => [
      f.properties.kind,
      f.properties.side,
      'prefix' in f.properties ? f.properties.prefix : undefined,
      'category' in f.properties ? f.properties.category : undefined,
    ])
    expect(parts).toContainEqual(['infra', 'right', 'cycleway', 'cyclewayOnHighway_exclusive'])
    expect(parts).toContainEqual(['infra', 'left', 'sidewalk', 'footwayBicycleYes_adjoining'])
    expect(parts).toContainEqual(['separate', 'left', 'cycleway', undefined])
  })

  test('no features for a road without bicycle infrastructure, a non-highway or a point-like way', () => {
    expect(bikeWayFeatures(way({ highway: 'residential' }))).toEqual([])
    expect(bikeWayFeatures(way({ building: 'yes' }))).toEqual([])
    expect(
      bikeWayFeatures({ id: 'w', tags: { highway: 'cycleway' }, coordinates: [LINE[0]!] }),
    ).toEqual([])
  })

  test('the tags of the way are not changed by the processing', () => {
    const tags = { highway: 'secondary', 'cycleway:both': 'lane' }
    bikeWayFeatures(way(tags))
    expect(tags).toEqual({ highway: 'secondary', 'cycleway:both': 'lane' })
  })

  test('sign parts carry the country over and leave out none', () => {
    expect(signParts('DE:239,1022-10')).toEqual(['DE:239', 'DE:1022-10'])
    expect(signParts('DE:240;DE:1020-30')).toEqual(['DE:240', 'DE:1020-30'])
    expect(signParts('none')).toEqual([])
  })

  test('the sign of a side stands beside the way: left of an eastbound way is north', () => {
    const [lon, lat] = signPoint(LINE, 'self')!
    expect(lon).toBeCloseTo(13.4005, 6)
    expect(lat).toBeCloseTo(52.5, 6)
    expect(signPoint(LINE, 'left')![1]).toBeGreaterThan(52.5)
    expect(signPoint(LINE, 'right')![1]).toBeLessThan(52.5)
  })
})

describe('collect', () => {
  const node = (id: string, loc: [number, number]): GraphEntity => ({ id, tags: {}, loc })
  const base = new Map<string, GraphEntity | undefined>([
    ['n1', node('n1', LINE[0]!)],
    ['n2', node('n2', LINE[1]!)],
    ['w1', { id: 'w1', tags: { highway: 'cycleway', is_sidepath: 'yes' }, nodes: ['n1', 'n2'] }],
    ['w2', { id: 'w2', tags: { highway: 'residential' }, nodes: ['n1', 'n2'] }],
  ])
  const graphOf = (local: Map<string, GraphEntity | undefined>): GraphLike => ({
    base: { entities: base },
    local: { entities: local },
    hasEntity: (id) => (local.has(id) ? local.get(id) : base.get(id)),
    parentWays: (entity) =>
      [...base.values()].filter((e): e is GraphEntity => !!e?.nodes?.includes(entity.id)),
  })

  test('the loaded ways, then an edit that tags the road: only the edited way is built again', () => {
    const first = bikeCollection(graphOf(new Map()))
    expect(first.features.map((f) => f.properties?.category)).toEqual(['cycleway_adjoining'])
    expect(bikeCollection(graphOf(new Map()))).toBe(first)
    const edited = new Map<string, GraphEntity | undefined>([
      [
        'w2',
        { id: 'w2', tags: { highway: 'residential', bicycle_road: 'yes' }, nodes: ['n1', 'n2'] },
      ],
    ])
    const second = bikeCollection(graphOf(edited))
    const categories = second.features.map((f) => String(f.properties?.category))
    expect(categories.sort((a, b) => a.localeCompare(b))).toEqual([
      'bicycleRoad',
      'cycleway_adjoining',
    ])
  })
})

describe('layers', () => {
  test('ids are unique and every layer reads the feature colour or a fixed one', () => {
    const ids = BIKE_LAYERS.map((layer) => layer.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('the right side is offset to the right (positive), a sidewalk further out than a cycleway', () => {
    const right = sideOffset(1)
    const sidewalk = sideOffset(1, 5)
    expect(right[4]).toBe(6)
    expect(sidewalk[4]).toBe(11)
    expect(sideOffset(-1)[4]).toBe(-6)
  })
})

describe('lens', () => {
  test('the legend lists each group and the separately mapped side, and keeps the highways', () => {
    const labels = bikeInfrastructureLens.rules.map((rule) => rule.label).filter(Boolean)
    expect(labels).toHaveLength(GROUPS.length + 1)
    expect(bikeInfrastructureLens.rules.at(-1)).toEqual({ match: { highway: true }, opacity: 1 })
  })

  test('drawn without a lens and with its own lens, hidden under another', () => {
    expect(showsBikeInfra(null)).toBe(true)
    expect(showsBikeInfra('bike-infrastructure')).toBe(true)
    expect(showsBikeInfra('surface')).toBe(false)
    let active: string | null = 'surface'
    const listeners = new Set<() => void>()
    const stop = connectBikeInfra({
      getActiveId: () => active,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    })
    expect(bikeInfraShown()).toBe(false)
    active = null
    for (const listener of listeners) listener()
    expect(bikeInfraShown()).toBe(true)
    stop()
    expect(bikeInfraShown()).toBe(false)
  })
})

describe('presets', () => {
  test.each(BIKE_PRESET_LIST.map((preset) => [preset.id, preset] as const))(
    '%s: its tags give its TILDA category',
    (_, preset) => {
      const categories = processBikelanes({ ...preset.tags }).map((result) => result.category)
      expect(categories).toEqual([preset.category])
    },
  )

  const presets = createPresets(
    withChanges(defaultPresetData, bikePresetChanges(defaultPresetData)),
  )

  test.each(BIKE_PRESET_LIST.map((preset) => [preset.id, preset] as const))(
    '%s: is the preset its tags match, with a name and the fields of its iD preset',
    (_, preset) => {
      const geometry = preset.geometry?.[0] ?? 'line'
      const matched = presets.match(preset.tags, geometry)
      expect(matched.id).toBe(presetId(preset))
      expect(matched.name.length).toBeGreaterThan(3)
      const fieldIds = presets.fieldsFor(matched, preset.tags, geometry).map((field) => field.id)
      expect(fieldIds).toContain('surface')
      if (preset.sidepathField) expect(fieldIds).toContain(SIDEPATH_FIELD)
    },
  )

  test('the report: a sidewalk with bicycle=yes and its sign is "Sidewalk, bicycles allowed"', () => {
    const tags = {
      highway: 'footway',
      footway: 'sidewalk',
      bicycle: 'yes',
      traffic_sign: 'DE:239,1022-10',
    }
    expect(presets.match(tags, 'line').id).toBe('bicycle-infrastructure/footway/sidewalk')
  })
})
