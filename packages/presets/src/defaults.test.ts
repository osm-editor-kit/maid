import { describe, expect, it } from 'bun:test'
import { withChanges } from './changes.ts'
import { defaultPresetData, defaultPresets } from './default.ts'
import {
  categoriesOf,
  categoryNameOf,
  createDefaults,
  defaultIdsOf,
  defaultRowsFor,
  isCategoryRow,
  MIN_CATEGORY_MEMBERS,
  offered,
} from './defaults.ts'
import { createPresets } from './presets.ts'
import type { Geometry, Preset, PresetCategory, PresetData, PresetRow } from './types.ts'

function preset(id: string, geometry: Geometry[], extra: Partial<Preset> = {}): Preset {
  return {
    id,
    name: id,
    geometry,
    tags: { [id]: 'yes' },
    addTags: {},
    removeTags: {},
    matchScore: 1,
    searchable: true,
    terms: [],
    aliases: [],
    ...extra,
  }
}

/** A lookup over a list of presets, as the presets instance gives one */
function lookup(presets: Preset[]) {
  return (id: string) => presets.find((found) => found.id === id)
}

const ids = (rows: readonly PresetRow[]) => rows.map((row) => row.id)

// Expected values were read from the id-tagging-schema 6.19.2 data (dist/*.min.json), not from this code.

describe('offered (iD: searchable and matchAllGeometry)', () => {
  it('offers a searchable preset that matches every geometry', () => {
    expect(offered(preset('a', ['point', 'vertex']), ['point', 'vertex'])).toBe(true)
  })

  it('leaves out a preset that is hidden, even when it matches', () => {
    expect(offered(preset('a', ['point'], { searchable: false }), ['point'])).toBe(false)
  })

  it('leaves out a preset that does not match one of the geometries', () => {
    expect(offered(preset('a', ['point']), ['point', 'vertex'])).toBe(false)
  })

  it('offers every preset for an empty list of geometries', () => {
    expect(offered(preset('a', ['line']), [])).toBe(true)
  })
})

describe('categoriesOf and defaultIdsOf (the raw data)', () => {
  it('keeps the members and the icon of a category', () => {
    const categories = categoriesOf({
      'category-a': { icon: 'maki-a', members: ['x', 'y'] },
      'category-b': { members: ['z'] },
    })
    expect(categories.get('category-a')).toEqual({ icon: 'maki-a', members: ['x', 'y'] })
    expect(categories.get('category-b')).toEqual({ members: ['z'] })
  })

  it('leaves out a category without a members list', () => {
    expect(categoriesOf({ 'category-a': { icon: 'maki-a' }, 'category-b': 'nope' }).size).toBe(0)
  })

  it('reads the defaults of the geometries and ignores other keys', () => {
    expect(defaultIdsOf({ point: ['a', 'b'], suggestion: ['c'], line: 'nope' })).toEqual({
      point: ['a', 'b'],
    })
  })
})

describe('categoryNameOf', () => {
  const translations = {
    en: { presets: { categories: { 'category-building': { name: 'Building Features' } } } },
  }

  it('reads the English name of the category, as preset names are read', () => {
    expect(categoryNameOf(translations, 'category-building')).toBe('Building Features')
  })

  it('falls back to the id when the translation has no name', () => {
    expect(categoryNameOf(translations, 'category-water')).toBe('category-water')
    expect(categoryNameOf(undefined, 'category-water')).toBe('category-water')
  })
})

describe('defaultRowsFor', () => {
  const area = preset('area-a', ['area'])
  const point = preset('point-a', ['point', 'vertex'])
  const hidden = preset('hidden', ['point'], { searchable: false })
  const line = preset('line-a', ['line'])

  it('lists the offered presets in order, once each, and leaves out unknown, hidden and other-geometry ones', () => {
    const rows = defaultRowsFor({
      geometries: ['point'],
      ids: ['point-a', 'missing', 'hidden', 'line-a', 'point-a', 'point-a'],
      categories: new Map(),
      categoryName: (id) => id,
      preset: lookup([area, point, hidden, line]),
    })
    expect(ids(rows)).toEqual(['point-a'])
  })

  it('lists a category with two or more offered members, with only those members', () => {
    const members = [
      preset('m1', ['point']),
      preset('m2', ['point']),
      preset('m3', ['point'], { searchable: false }),
    ]
    const rows = defaultRowsFor({
      geometries: ['point'],
      ids: ['category-x'],
      categories: new Map([['category-x', { icon: 'maki-x', members: ['m1', 'm2', 'm3'] }]]),
      categoryName: () => 'Things',
      preset: lookup(members),
    })
    expect(rows).toHaveLength(1)
    const [category] = rows as PresetCategory[]
    expect(category?.id).toBe('category-x')
    expect(category?.name).toBe('Things')
    expect(category?.icon).toBe('maki-x')
    expect(category?.members.map((member) => member.id)).toEqual(['m1', 'm2'])
  })

  it('leaves out a category with one offered member, as iD does (more than one is needed)', () => {
    expect(MIN_CATEGORY_MEMBERS).toBe(2)
    const rows = defaultRowsFor({
      geometries: ['point'],
      ids: ['category-x'],
      categories: new Map([['category-x', { members: ['m1', 'm2'] }]]),
      categoryName: () => 'Things',
      preset: lookup([preset('m1', ['point']), preset('m2', ['point'], { searchable: false })]),
    })
    expect(rows).toEqual([])
  })

  it('leaves out a category with no offered member', () => {
    const rows = defaultRowsFor({
      geometries: ['area'],
      ids: ['category-x'],
      categories: new Map([['category-x', { members: ['m1', 'm2'] }]]),
      categoryName: () => 'Things',
      preset: lookup([preset('m1', ['point']), preset('m2', ['point'])]),
    })
    expect(rows).toEqual([])
  })

  it('gives a category the geometries of its members together, and no tags, as a row shaped like a preset', () => {
    const rows = defaultRowsFor({
      geometries: ['line'],
      ids: ['category-x'],
      categories: new Map([['category-x', { members: ['m1', 'm2'] }]]),
      categoryName: () => 'Things',
      preset: lookup([preset('m1', ['line', 'area']), preset('m2', ['line', 'relation'])]),
    })
    const [category] = rows
    expect(category && isCategoryRow(category)).toBe(true)
    expect(category?.geometry).toEqual(['line', 'area', 'relation'])
    expect(category?.tags).toEqual({})
    expect(category?.searchable).toBe(false)
  })

  it('tells a category from a preset', () => {
    expect(isCategoryRow(preset('a', ['point']))).toBe(false)
  })
})

describe('createDefaults', () => {
  const data: PresetData = {
    presets: {},
    fields: {},
    translations: {},
    categories: {
      'category-x': { icon: 'maki-x', members: ['m1', 'm2'] },
    },
    defaults: {
      point: ['category-x', 'p1'],
      vertex: ['p2'],
    },
  }
  const presets = [
    preset('point', ['point', 'vertex']),
    preset('m1', ['point']),
    preset('m2', ['point']),
    preset('p1', ['point']),
    preset('p2', ['point', 'vertex']),
  ]
  const defaults = createDefaults(data, lookup(presets))

  it('lists the defaults of the geometry in order, with the fallback of the geometry last', () => {
    expect(ids(defaults(['point']))).toEqual(['category-x', 'p1', 'point'])
  })

  it('gives a vertex the defaults of a vertex, and the point as its fallback', () => {
    expect(ids(defaults(['vertex']))).toEqual(['p2', 'point'])
  })

  it('gives nothing for an empty list of geometries', () => {
    expect(defaults([])).toEqual([])
  })

  it('gives only the fallback when the data has no defaults', () => {
    const bare = createDefaults({ presets: {}, fields: {}, translations: {} }, lookup(presets))
    expect(ids(bare(['point']))).toEqual(['point'])
  })
})

describe('the bundled defaults (id-tagging-schema 6.19.2)', () => {
  it('lists the categories and the presets of the point defaults, the fallback last', () => {
    const rows = defaultPresets.defaults(['point'])
    expect(rows[0]?.id).toBe('category-natural')
    expect(isCategoryRow(rows[0] as PresetRow)).toBe(true)
    expect(rows.at(-1)?.id).toBe('point')
  })

  it('lists the building category for areas, with the building presets that are offered', () => {
    const building = defaultPresets.defaults(['area']).find((row) => row.id === 'category-building')
    expect(building && isCategoryRow(building)).toBe(true)
    const members = (building as PresetCategory).members.map((member) => member.id)
    expect(members).toContain('building')
    expect(members).toContain('building/house')
    expect(members.length).toBeGreaterThanOrEqual(MIN_CATEGORY_MEMBERS)
  })

  it('lists the route category for relations', () => {
    const ids = defaultPresets.defaults(['relation']).map((row) => row.id)
    expect(ids).toContain('category-route')
  })

  it('lists a category only for the geometry its members match', () => {
    for (const geometry of ['point', 'line', 'area', 'vertex', 'relation'] as const) {
      for (const row of defaultPresets.defaults([geometry])) {
        if (!isCategoryRow(row)) continue
        expect(row.members.length).toBeGreaterThanOrEqual(MIN_CATEGORY_MEMBERS)
        for (const member of row.members) expect(member.geometry).toContain(geometry)
      }
    }
  })

  it('keeps the bundled defaults in the data it was built from', () => {
    expect(defaultPresetData.categories).toBeDefined()
    expect(defaultPresetData.defaults).toBeDefined()
  })
})

describe('the app changes apply to the categories', () => {
  const buildings = [
    'building',
    'building/house',
    'building/apartments',
    'building/garage',
    'building/retail',
    'building/commercial',
    'building/industrial',
    'building/residential',
  ]
  const hide = (names: string[]) => Object.fromEntries(names.map((name) => [name, { hide: true }]))
  const buildingCategory = (presets: ReturnType<typeof createPresets>) =>
    presets.defaults(['area']).find((row) => row.id === 'category-building') as
      | PresetCategory
      | undefined

  it('does not list a member the app hid', () => {
    const changed = createPresets(
      withChanges(defaultPresetData, { presetEdits: hide(['building/house']) }),
    )
    const members = buildingCategory(changed)?.members.map((member) => member.id) ?? []
    expect(members).not.toContain('building/house')
    expect(members).toContain('building')
    expect(members.length).toBe(buildings.length - 1)
  })

  it('leaves out a category when the app hid all but one of its members', () => {
    const changed = createPresets(
      withChanges(defaultPresetData, { presetEdits: hide(buildings.slice(1)) }),
    )
    expect(buildingCategory(changed)).toBeUndefined()
  })

  it('does not change the base data', () => {
    createPresets(withChanges(defaultPresetData, { presetEdits: hide(buildings) }))
    expect(buildingCategory(defaultPresets)?.members.length).toBe(buildings.length)
  })
})
