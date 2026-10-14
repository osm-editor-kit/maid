import { describe, expect, it } from 'bun:test'
import { withChanges } from './changes.ts'
import type { PresetChanges } from './changes.ts'
import { defaultPresetData } from './default.ts'
import { createPresets } from './presets.ts'
import type { PresetData } from './types.ts'

// A small data set in the shape of the schema's files. Cycleway: fields name, surface, width; moreFields lit.
// Cafe: fields name; moreFields cuisine. Bench: fields surface only. Name is universal.
const base: PresetData = {
  presets: {
    'highway/cycleway': {
      icon: 'maki-bicycle',
      tags: { highway: 'cycleway' },
      geometry: ['line'],
      fields: ['name', 'surface', 'width'],
      moreFields: ['lit'],
    },
    'amenity/cafe': {
      icon: 'maki-cafe',
      tags: { amenity: 'cafe' },
      geometry: ['point', 'area'],
      fields: ['name'],
      moreFields: ['cuisine'],
    },
    'amenity/bench': { tags: { amenity: 'bench' }, geometry: ['point'], fields: ['surface'] },
  },
  fields: {
    name: { key: 'name', type: 'localized', universal: true },
    surface: { key: 'surface', type: 'combo', options: ['paved', 'unpaved'] },
    width: { key: 'width', type: 'number' },
    lit: { key: 'lit', type: 'check' },
    cuisine: { key: 'cuisine', type: 'combo', options: ['coffee_shop'] },
  },
  translations: {
    en: {
      presets: {
        presets: {
          'highway/cycleway': { name: 'Cycle Path', terms: 'bike path' },
          'amenity/cafe': { name: 'Cafe' },
          'amenity/bench': { name: 'Bench' },
        },
        fields: {
          name: { label: 'Name' },
          surface: { label: 'Surface', options: { paved: 'Paved', unpaved: 'Unpaved' } },
          width: { label: 'Width' },
          lit: { label: 'Lit' },
          cuisine: { label: 'Cuisine' },
        },
      },
    },
  },
}

/** The ids of the fields a preset shows for these tags (fieldsFor), in order. */
function shownIds(
  changed: PresetData,
  id: string,
  tags: Record<string, string>,
  geometry: 'line' | 'point' | 'area',
) {
  const presets = createPresets(changed)
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return presets.fieldsFor(preset, tags, geometry).map((field) => field.id)
}

function moreIds(
  changed: PresetData,
  id: string,
  tags: Record<string, string>,
  geometry: 'line' | 'point' | 'area',
) {
  const presets = createPresets(changed)
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return presets.moreFieldsFor(preset, tags, geometry).map((field) => field.id)
}

const cyclewayTags = { highway: 'cycleway' }
const cafeTags = { amenity: 'cafe' }

describe('withChanges: fields', () => {
  it('adds a field with its English label and option labels', () => {
    const changed = withChanges(base, {
      fields: {
        separation: {
          type: 'combo',
          label: 'Separation',
          key: 'separation',
          geometry: ['line'],
          options: { bollard: 'Bollards', kerb: 'Kerb' },
        },
      },
      presetEdits: { 'highway/cycleway': { addFields: ['separation'] } },
    })
    const presets = createPresets(changed)
    const field = presets
      .fieldsFor(presets.preset('highway/cycleway')!, cyclewayTags, 'line')
      .find((item) => item.id === 'separation')
    expect(field?.label).toBe('Separation')
    expect(field?.type).toBe('combo')
    expect(field?.options).toEqual([
      { value: 'bollard', label: 'Bollards' },
      { value: 'kerb', label: 'Kerb' },
    ])
    expect(presets.field('separation')?.label).toBe('Separation')
  })

  it('keeps the order of an options list given as {value, label} entries', () => {
    const changed = withChanges(base, {
      fields: {
        buffer: {
          type: 'combo',
          label: 'Buffer',
          key: 'buffer',
          options: [
            { value: 'no', label: 'No buffer' },
            { value: '1', label: '1 m' },
            { value: '0.5', label: '0.5 m' },
          ],
        },
      },
    })
    const buffer = createPresets(changed).field('buffer')
    expect(buffer?.options.map((option) => option.value)).toEqual(['no', '1', '0.5'])
    expect(buffer?.options.map((option) => option.label)).toEqual(['No buffer', '1 m', '0.5 m'])
  })

  it('replaces a field with the same id, with the whole definition', () => {
    const changed = withChanges(base, {
      fields: { surface: { type: 'text', label: 'Surface (free text)', key: 'surface' } },
    })
    const surface = createPresets(changed).field('surface')
    expect(surface?.type).toBe('text')
    expect(surface?.label).toBe('Surface (free text)')
    expect(surface?.options).toEqual([])
  })
})

describe('withChanges: presets', () => {
  const link = {
    name: 'Cycleway Link',
    tags: { highway: 'cycleway', cycleway: 'link' },
    geometry: ['line'] as const,
    terms: ['connection'],
    fields: ['name'],
  }

  it('adds a preset that match finds and search offers by its name', () => {
    const changed = withChanges(base, { presets: { 'highway/cycleway/link': link } })
    const presets = createPresets(changed)
    expect(presets.match({ highway: 'cycleway', cycleway: 'link' }, 'line').id).toBe(
      'highway/cycleway/link',
    )
    expect(presets.match({ highway: 'cycleway', cycleway: 'link' }, 'line').name).toBe(
      'Cycleway Link',
    )
    expect(presets.search('cycleway link', 'line').map((preset) => preset.id)).toContain(
      'highway/cycleway/link',
    )
    expect(presets.search('connection', 'line').map((preset) => preset.id)).toContain(
      'highway/cycleway/link',
    )
  })

  it('replaces a preset with the same id, fields included', () => {
    const changed = withChanges(base, {
      presets: {
        'amenity/cafe': {
          name: 'Coffee House',
          tags: { amenity: 'cafe' },
          geometry: ['point'],
          fields: ['cuisine'],
        },
      },
    })
    const presets = createPresets(changed)
    const cafe = presets.preset('amenity/cafe')
    expect(cafe?.name).toBe('Coffee House')
    expect(cafe?.geometry).toEqual(['point'])
    expect(presets.fieldsFor(cafe!, cafeTags, 'point').map((field) => field.id)).toEqual([
      'cuisine',
    ])
  })

  it('does not find a hidden preset by search, but still matches it', () => {
    const changed = withChanges(base, { presetEdits: { 'amenity/cafe': { hide: true } } })
    const presets = createPresets(changed)
    expect(presets.search('cafe', 'point').map((preset) => preset.id)).not.toContain('amenity/cafe')
    expect(presets.match(cafeTags, 'point').id).toBe('amenity/cafe')
    expect(
      createPresets(withChanges(changed, { presetEdits: { 'amenity/cafe': { hide: false } } }))
        .search('cafe', 'point')
        .map((preset) => preset.id),
    ).toContain('amenity/cafe')
  })

  it('a preset added as hidden is not searchable', () => {
    const changed = withChanges(base, {
      presets: { 'highway/cycleway/link': { ...link, searchable: false } },
    })
    const presets = createPresets(changed)
    expect(presets.search('cycleway link', 'line').map((preset) => preset.id)).not.toContain(
      'highway/cycleway/link',
    )
    expect(presets.match({ highway: 'cycleway', cycleway: 'link' }, 'line').id).toBe(
      'highway/cycleway/link',
    )
  })
})

describe('withChanges: edits to presets in the data', () => {
  it('changes the name', () => {
    const changed = withChanges(base, { presetEdits: { 'amenity/cafe': { name: 'Coffee' } } })
    expect(createPresets(changed).preset('amenity/cafe')?.name).toBe('Coffee')
  })

  it('keeps the terms of a renamed preset', () => {
    const changed = withChanges(base, {
      presetEdits: { 'highway/cycleway': { name: 'Bike Lane' } },
    })
    const cycleway = createPresets(changed).preset('highway/cycleway')
    expect(cycleway?.name).toBe('Bike Lane')
    expect(cycleway?.terms).toEqual(['bike path'])
  })

  it('removes fields and moreFields', () => {
    const changed = withChanges(base, {
      presetEdits: { 'highway/cycleway': { removeFields: ['name'], removeMoreFields: ['lit'] } },
    })
    expect(shownIds(changed, 'highway/cycleway', cyclewayTags, 'line')).toEqual([
      'surface',
      'width',
    ])
    expect(moreIds(changed, 'highway/cycleway', cyclewayTags, 'line')).not.toContain('lit')
  })

  it('replaces the whole list with setFields, in the given order', () => {
    const changed = withChanges(base, {
      presetEdits: { 'highway/cycleway': { setFields: ['width', 'name'] } },
    })
    expect(shownIds(changed, 'highway/cycleway', cyclewayTags, 'line')).toEqual(['width', 'name'])
  })

  it('adds to moreFields, offered by moreFieldsFor', () => {
    const changed = withChanges(base, {
      presetEdits: { 'highway/cycleway': { addMoreFields: ['cuisine'] } },
    })
    expect(moreIds(changed, 'highway/cycleway', cyclewayTags, 'line')).toContain('cuisine')
    expect(shownIds(changed, 'highway/cycleway', cyclewayTags, 'line')).not.toContain('cuisine')
  })

  it('replaces moreFields with setMoreFields', () => {
    const changed = withChanges(base, {
      presetEdits: { 'highway/cycleway': { setMoreFields: ['cuisine'] } },
    })
    expect(moreIds(changed, 'highway/cycleway', cyclewayTags, 'line')).toEqual(['cuisine'])
  })

  it('a field added with before and after lands at that place', () => {
    const changed = withChanges(base, {
      fields: {
        a: { type: 'text', label: 'A', key: 'a' },
        b: { type: 'text', label: 'B', key: 'b' },
        c: { type: 'text', label: 'C', key: 'c' },
      },
      presetEdits: {
        'highway/cycleway': {
          addFields: [{ id: 'a', before: 'name' }, { id: 'b', after: 'surface' }, 'c'],
        },
      },
    })
    expect(
      shownIds(
        changed,
        'highway/cycleway',
        { highway: 'cycleway', a: '1', b: '1', c: '1' },
        'line',
      ),
    ).toEqual(['a', 'name', 'surface', 'b', 'width', 'c'])
  })

  it("as iD: a preset with no fields of its own shows none, not its parent's, and an edit starts from an empty list", () => {
    // iD does not inherit fields: highway/cycleway/crossing has no fields, and highway/cycleway has some
    const data: PresetData = {
      ...base,
      presets: {
        ...base.presets,
        'highway/cycleway/crossing': {
          tags: { highway: 'cycleway', cycleway: 'crossing' },
          geometry: ['line'],
        },
      },
    }
    const crossingTags = { highway: 'cycleway', cycleway: 'crossing' }
    expect(shownIds(data, 'highway/cycleway/crossing', crossingTags, 'line')).toEqual([])
    const changed = withChanges(data, {
      presetEdits: { 'highway/cycleway/crossing': { addFields: ['lit'] } },
    })
    expect(shownIds(changed, 'highway/cycleway/crossing', crossingTags, 'line')).toEqual(['lit'])
  })

  it('as iD: an edit to a parent does not reach its child', () => {
    const data: PresetData = {
      ...base,
      presets: {
        ...base.presets,
        'highway/cycleway/crossing': {
          tags: { highway: 'cycleway', cycleway: 'crossing' },
          geometry: ['line'],
        },
      },
    }
    const changed = withChanges(data, {
      presetEdits: {
        'highway/cycleway/crossing': { addFields: ['lit'] },
        'highway/cycleway': { removeFields: ['width'] },
      },
    })
    expect(
      shownIds(
        changed,
        'highway/cycleway/crossing',
        { highway: 'cycleway', cycleway: 'crossing' },
        'line',
      ),
    ).toEqual(['lit'])
    expect(shownIds(changed, 'highway/cycleway', cyclewayTags, 'line')).not.toContain('width')
  })
})

describe('withChanges: universal fields', () => {
  it('adds a field that every feature offers', () => {
    const changed = withChanges(base, { universalFields: { add: ['lit'] } })
    expect(shownIds(changed, 'amenity/bench', { amenity: 'bench', lit: 'yes' }, 'point')).toContain(
      'lit',
    )
  })

  it('removes a field that every feature offers', () => {
    const changed = withChanges(base, { universalFields: { remove: ['name'] } })
    expect(
      shownIds(changed, 'amenity/bench', { amenity: 'bench', name: 'Park bench' }, 'point'),
    ).toEqual(['surface'])
    expect(
      shownIds(base, 'amenity/bench', { amenity: 'bench', name: 'Park bench' }, 'point'),
    ).toEqual(['surface', 'name'])
  })
})

describe('withChanges: errors', () => {
  it('names an unknown preset id in an edit', () => {
    expect(() => withChanges(base, { presetEdits: { 'amenity/cafee': { hide: true } } })).toThrow(
      'presetEdits["amenity/cafee"]: no preset "amenity/cafee"',
    )
  })

  it('names an unknown field id in addFields, removeFields, setFields and universalFields', () => {
    expect(() =>
      withChanges(base, { presetEdits: { 'highway/cycleway': { addFields: ['sidpath'] } } }),
    ).toThrow('no field "sidpath"')
    expect(() =>
      withChanges(base, { presetEdits: { 'highway/cycleway': { removeFields: ['nmae'] } } }),
    ).toThrow('"nmae" is not in the list')
    expect(() =>
      withChanges(base, { presetEdits: { 'highway/cycleway': { setFields: ['name', 'nope'] } } }),
    ).toThrow('no field "nope"')
    expect(() => withChanges(base, { universalFields: { add: ['nope'] } })).toThrow(
      'no field "nope"',
    )
  })

  it('names the id that addFields places the field before or after, when it is not in the list', () => {
    expect(() =>
      withChanges(base, {
        fields: { a: { type: 'text', label: 'A' } },
        presetEdits: { 'highway/cycleway': { addFields: [{ id: 'a', before: 'lit' }] } },
      }),
    ).toThrow('"lit" is not in the list')
  })

  it('refuses a field that is already in the list, and both before and after', () => {
    expect(() =>
      withChanges(base, { presetEdits: { 'highway/cycleway': { addFields: ['name'] } } }),
    ).toThrow('already in the list')
    expect(() =>
      withChanges(base, {
        fields: { a: { type: 'text', label: 'A' } },
        presetEdits: {
          'highway/cycleway': { addFields: [{ id: 'a', before: 'name', after: 'surface' }] },
        },
      }),
    ).toThrow('before or after, not both')
  })

  it('refuses setFields combined with addFields', () => {
    expect(() =>
      withChanges(base, {
        presetEdits: { 'highway/cycleway': { setFields: ['name'], addFields: ['width'] } },
      }),
    ).toThrow('setFields cannot be combined with addFields')
  })

  it('as iD: a preset may end with no fields, which shows none (no inheritance)', () => {
    const changed = withChanges(base, {
      presetEdits: { 'highway/cycleway': { removeFields: ['name', 'surface', 'width'] } },
    })
    expect(shownIds(changed, 'highway/cycleway', cyclewayTags, 'line')).toEqual([])
  })

  it('names a field without a type or a label, and a misspelt key', () => {
    expect(() => withChanges(base, { fields: { x: { label: 'X' } as never } })).toThrow(
      'fields["x"]: type is required',
    )
    expect(() => withChanges(base, { fields: { x: { type: 'text' } as never } })).toThrow(
      'fields["x"]: label is required',
    )
    expect(() =>
      withChanges(base, { presetEdits: { 'highway/cycleway': { addField: ['width'] } as never } }),
    ).toThrow('unknown key "addField"')
  })

  it('names a preset without a geometry, and a field it lists that does not exist', () => {
    expect(() =>
      withChanges(base, {
        presets: {
          'highway/x': { name: 'X', tags: { highway: 'x' }, geometry: ['road' as never] },
        },
      }),
    ).toThrow('presets["highway/x"].geometry')
    expect(() =>
      withChanges(base, {
        presets: {
          'highway/x': { name: 'X', tags: { highway: 'x' }, geometry: ['line'], fields: ['nope'] },
        },
      }),
    ).toThrow('presets["highway/x"].fields[0]: no field "nope"')
  })

  it('reports every problem in one error', () => {
    let message = ''
    try {
      withChanges(base, {
        presetEdits: {
          'amenity/cafee': { hide: true },
          'highway/cycleway': { addFields: ['sidpath'] },
        },
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('2 problems')
    expect(message).toContain('amenity/cafee')
    expect(message).toContain('sidpath')
  })
})

describe('withChanges: the base is not changed', () => {
  it('leaves the data it was given as it was', () => {
    const before = structuredClone(base)
    withChanges(base, {
      fields: {
        separation: { type: 'combo', label: 'Separation', options: { bollard: 'Bollards' } },
      },
      presets: {
        'highway/cycleway/link': {
          name: 'Link',
          tags: { highway: 'cycleway' },
          geometry: ['line'],
        },
      },
      presetEdits: {
        'highway/cycleway': {
          addFields: ['separation'],
          removeFields: ['width'],
          name: 'Lane',
          hide: true,
        },
        'amenity/cafe': { setMoreFields: [] },
      },
      universalFields: { add: ['lit'], remove: ['name'] },
    })
    expect(base).toEqual(before)
  })

  it('gives a new object with the changes, and the same one for no changes', () => {
    const changed: PresetChanges = {}
    const result = withChanges(base, changed)
    expect(result).not.toBe(base)
    expect(createPresets(result).preset('amenity/cafe')?.name).toBe('Cafe')
  })
})

describe('withChanges on the default data', () => {
  it('adds an is_sidepath check to the cycleway presets and reads it back through fieldsFor', () => {
    const check = {
      type: 'check',
      label: 'Along a Road (Sidepath)',
      key: 'is_sidepath',
      geometry: ['line'] as const,
    }
    const changed = withChanges(defaultPresetData, {
      fields: { is_sidepath: check },
      presetEdits: {
        'highway/cycleway': { addFields: [{ id: 'is_sidepath', before: 'surface' }] },
        'highway/cycleway/bicycle_foot': { addFields: ['is_sidepath'] },
      },
    })
    const presets = createPresets(changed)
    const cycleway = presets.match({ highway: 'cycleway' }, 'line')
    expect(cycleway.id).toBe('highway/cycleway')
    const shown = presets.fieldsFor(cycleway, { highway: 'cycleway' }, 'line')
    const ids = shown.map((field) => field.id)
    expect(ids).toContain('is_sidepath')
    expect(ids.indexOf('is_sidepath')).toBeLessThan(ids.indexOf('surface'))
    expect(shown.find((field) => field.id === 'is_sidepath')?.label).toBe('Along a Road (Sidepath)')
    expect(presets.preset('highway/cycleway/bicycle_foot')?.id).toBe(
      'highway/cycleway/bicycle_foot',
    )
    expect(
      presets
        .fieldsFor(
          presets.preset('highway/cycleway/bicycle_foot')!,
          { highway: 'cycleway', bicycle: 'designated', foot: 'designated' },
          'line',
        )
        .map((field) => field.id),
    ).toContain('is_sidepath')
    // the schema's data is unchanged: the same preset without the change does not show the field
    expect(
      createPresets(defaultPresetData)
        .fieldsFor(cycleway, { highway: 'cycleway' }, 'line')
        .map((field) => field.id),
    ).not.toContain('is_sidepath')
  })
})

describe('withChanges: a check field defined in the changes', () => {
  it('its option "undefined" is the unset value "", as for a check field of the schema', () => {
    const changed = withChanges(base, {
      fields: {
        staggered: {
          type: 'check',
          label: 'Staggered',
          key: 'staggered',
          geometry: ['line'],
          options: { undefined: 'Unknown', yes: 'Yes', no: 'No' },
        },
      },
      presetEdits: { 'highway/cycleway': { addFields: ['staggered'] } },
    })
    const presets = createPresets(changed)
    expect(presets.field('staggered')?.options).toEqual([
      { value: '', label: 'Unknown' },
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ])
  })
})
