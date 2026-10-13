// Rules that iD follows and that its spec files do not test. Each was found by reading iD's code
// (modules/presets/preset.ts, index.js, collection.ts, field.ts, modules/actions/change_preset.js,
// modules/ui/field.js, modules/ui/sections/preset_fields.js) at commit 0194f3926. Each test name starts
// with "as iD:" and the comment above it names the iD code it follows. README.md, "Compared with iD", has the table.
import { describe, expect, it } from 'bun:test'
import { defaultPresets } from './default.ts'
import { createPresets } from './presets.ts'
import type { Geometry, Preset, Presets, Tags } from './types.ts'

type Raw = Record<string, unknown>

function presetsOf(presets: Record<string, Raw>, fields: Record<string, Raw> = {}): Presets {
  return createPresets({ presets, fields, translations: {} })
}

function get(presets: Presets, id: string): Preset {
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return preset
}

describe('as iD: field defaults', () => {
  // iD: preset.ts setTags adds `field.default` for the preset's own `fields` that match the geometry and
  // have no value yet. It does not look at prerequisiteTag (the UI does, in ui/field.js isAllowed).
  it('as iD: a field default is set even when its prerequisiteTag does not hold', () => {
    const presets = presetsOf(
      { test: { tags: { amenity: 'x' }, fields: ['f'] } },
      {
        f: {
          key: 'k',
          type: 'check',
          default: 'v',
          geometry: ['point'],
          prerequisiteTag: { key: 'other', value: 'yes' },
        },
      },
    )
    const test = get(presets, 'test')
    expect(presets.applyPreset({}, test, 'point')).toEqual({ amenity: 'x', k: 'v' })
    // the field itself is not shown, which is the UI's rule
    expect(presets.fieldsFor(test, { amenity: 'x' }, 'point').map((f) => f.id)).not.toContain('f')
  })

  // iD: setTags reads `this.fields()` only. moreFields and universal fields never add a default.
  it('as iD: only the fields of the preset give a default, not its moreFields', () => {
    const presets = presetsOf(
      { test: { tags: { amenity: 'x' }, moreFields: ['f'] } },
      { f: { key: 'k', type: 'check', default: 'v' } },
    )
    expect(presets.applyPreset({}, get(presets, 'test'), 'point')).toEqual({ amenity: 'x' })
  })

  // iD: setTags tests `!tags[field.key]`, so an empty value counts as not set and the default replaces it.
  it('as iD: an empty value counts as not set, so the default replaces it', () => {
    const presets = presetsOf(
      { test: { tags: { amenity: 'x' }, fields: ['f'] } },
      { f: { key: 'k', type: 'check', default: 'v' } },
    )
    expect(presets.applyPreset({ k: '' }, get(presets, 'test'), 'point')).toEqual({
      amenity: 'x',
      k: 'v',
    })
  })

  // iD: actionChangePreset passes skipFieldDefaults to the new preset's setTags.
  it('as iD: skipFieldDefaults adds the addTags but no field default', () => {
    const presets = presetsOf(
      { test: { tags: { amenity: 'x' }, fields: ['f'] } },
      { f: { key: 'k', type: 'check', default: 'v' } },
    )
    const test = get(presets, 'test')
    expect(presets.applyPreset({}, test, 'point', undefined, { skipFieldDefaults: true })).toEqual({
      amenity: 'x',
    })
    expect(presets.setTags({}, test, 'point', { skipFieldDefaults: true })).toEqual({
      amenity: 'x',
    })
  })

  // iD: actionChangePreset calls oldPreset.unsetTags(..., false), so skipFieldDefaults never keeps the
  // defaults of the old preset: they are removed as usual.
  it("as iD: skipFieldDefaults does not stop the old preset's field defaults from being removed", () => {
    const presets = presetsOf(
      {
        old: { tags: { amenity: 'p' }, geometry: ['area'], fields: ['f'] },
        next: { tags: { shop: 'q' }, geometry: ['area'] },
      },
      { f: { key: 'k', type: 'check', default: 'v', geometry: ['area'] } },
    )
    const tags = { amenity: 'p', k: 'v' }
    expect(
      presets.applyPreset(tags, get(presets, 'next'), 'area', get(presets, 'old'), {
        skipFieldDefaults: true,
      }),
    ).toEqual({ shop: 'q' })
  })
})

describe('as iD: the fields a preset shows', () => {
  // iD: a preset without fields of its own has none (presetPreset.fields() is the list of its data; no parent).
  it('as iD: a preset with no fields of its own shows none, as in iD (no parent inheritance)', () => {
    const mini = get(defaultPresets, 'highway/mini_roundabout')
    expect(defaultPresets.fieldsFor(mini, { highway: 'mini_roundabout' }, 'vertex')).toEqual([])
  })

  // iD: ui/field.js tagsContainFieldKey uses `_tags[key] !== undefined`, so an empty value is a value.
  it('as iD: a field whose key is in the tags is shown, even with an empty value', () => {
    const presets = presetsOf(
      { test: { tags: { amenity: 'x' }, moreFields: ['f'], fields: ['g'] } },
      {
        f: { key: 'k', type: 'text' },
        g: { key: 'j', type: 'text', prerequisiteTag: { key: 'other', value: 'yes' } },
      },
    )
    const test = get(presets, 'test')
    const shown = (tags: Tags) => presets.fieldsFor(test, tags, 'point').map((f) => f.id)
    expect(shown({ amenity: 'x', k: '' })).toEqual(['f'])
    expect(shown({ amenity: 'x', j: '' })).toEqual(['g'])
  })

  // iD: field.allKeys includes the prefixed keys of a multiCombo, and tagsContainFieldKey checks them.
  it('as iD: a multiCombo field is shown when a key under its prefix is set', () => {
    const presets = presetsOf(
      { test: { tags: { amenity: 'x' }, moreFields: ['f'] } },
      { f: { key: 'payment:', type: 'multiCombo' } },
    )
    const test = get(presets, 'test')
    expect(presets.fieldsFor(test, { amenity: 'x', 'payment:visa': 'yes' }, 'point')).toEqual([
      expect.objectContaining({ id: 'f' }),
    ])
    expect(presets.fieldsFor(test, { amenity: 'x' }, 'point')).toEqual([])
  })

  // iD: ui/field.js isAllowed tests valuesNot, valueNot, values, value, then "any value", and keyNot.
  it('as iD: prerequisiteTag values, valuesNot and keyNot hold as iD tests them', () => {
    const presets = presetsOf(
      { test: { tags: { amenity: 'x' }, fields: ['inList', 'notInList', 'absent'] } },
      {
        inList: { key: 'a', type: 'text', prerequisiteTag: { key: 'x', values: ['a', 'b'] } },
        notInList: { key: 'b', type: 'text', prerequisiteTag: { key: 'x', valuesNot: ['no'] } },
        absent: { key: 'c', type: 'text', prerequisiteTag: { keyNot: 'y' } },
      },
    )
    const test = get(presets, 'test')
    const shown = (tags: Tags) => presets.fieldsFor(test, tags, 'point').map((f) => f.id)
    expect(shown({ amenity: 'x', x: 'a' })).toEqual(['inList', 'notInList', 'absent'])
    expect(shown({ amenity: 'x', x: 'c' })).toEqual(['notInList', 'absent'])
    expect(shown({ amenity: 'x', x: 'no' })).toEqual(['absent'])
    // x is absent: not in values, so inList is hidden; keyNot y is set, so absent is hidden
    expect(shown({ amenity: 'x', y: '1' })).toEqual(['notInList'])
  })
})

describe('as iD: search', () => {
  // iD: collection.ts search, leadingTagKeyValues: the exact tags, then tags that start with the query,
  // then the same for addTags. The four lists are concatenated and a preset is listed once.
  it("as iD: the key=value tiers come in iD's order: tags exact, tags prefix, addTags exact, addTags prefix", () => {
    const presets = presetsOf({
      'tag-exact': { geometry: ['point'], tags: { amenity: 'school' } },
      'tag-prefix': { geometry: ['point'], tags: { amenity: 'schoolyard' } },
      'add-exact': { geometry: ['point'], tags: { zone: 'one' }, addTags: { amenity: 'school' } },
      'add-prefix': {
        geometry: ['point'],
        tags: { zone: 'two' },
        addTags: { amenity: 'schooling' },
      },
    })
    expect(presets.search('amenity=school', 'point').map((p) => p.id)).toEqual([
      'tag-exact',
      'tag-prefix',
      'add-exact',
      'add-prefix',
      'point',
    ])
  })

  // iD: collection.ts search joins the tiers, keeps MAXRESULTS - 1 = 49 entries of the join, and only then
  // removes duplicates (utilArrayUniq), so a preset that two tiers find takes two of those entries.
  it('as iD: the tiers are cut before duplicates are removed, so a duplicate uses up a place', () => {
    const presets = presetsOf({
      'cafe-dup': {
        name: 'Cafe Dup',
        geometry: ['point'],
        tags: { amenity: 'dup' },
        terms: ['cafe'],
      },
      'cafe-eatery': {
        name: 'Eatery',
        geometry: ['point'],
        tags: { amenity: 'eatery' },
        terms: ['cafeteria'],
      },
    })
    // limit 3: the name tier gives cafe-dup, the stripped-name tier gives cafe-dup again, and two entries are kept
    expect(presets.search('cafe', 'point', 3).map((p) => p.id)).toEqual(['cafe-dup', 'point'])
    // the default limit reaches the term tier
    expect(presets.search('cafe', 'point').map((p) => p.id)).toEqual([
      'cafe-dup',
      'cafe-eatery',
      'point',
    ])
  })

  // iD: the fallback is added to the joined list; utilArrayUniq keeps its first place, so a fallback that a
  // tier finds stays where the tier put it and is not listed twice.
  it('as iD: the geometry fallback keeps its place when a tier finds it, and is listed once', () => {
    const ids = defaultPresets.search('point', 'point').map((p) => p.id)
    expect(ids[0]).toBe('point')
    expect(ids.filter((id) => id === 'point')).toHaveLength(1)
  })

  // iD: collection.ts compares tag values and key=value strings as they are, and only the query is
  // lower-cased (`Object.values(a.tags)`, not lower-cased). So a mixed-case value is found by its lower-case form only if the data is lower case.
  it('as iD: a mixed-case tag value is not found by its lower-case query', () => {
    const presets = presetsOf({
      'mixed/case': { name: 'Thing', geometry: ['point'], tags: { type: 'associatedStreet' } },
      'lower/case': { name: 'Other', geometry: ['point'], tags: { type: 'associatedstreet' } },
    })
    expect(presets.search('associatedstreet', 'point').map((p) => p.id)).toEqual([
      'lower/case',
      'point',
    ])
  })
})

// The ten presets of the bundled data, applied to empty tags and to conflicting tags. The expected tags are
// worked out by reading iD's code (preset.ts setTags and unsetTags, actions/change_preset.js), not by running iD:
//  - setTags: addTags are set (a `*` becomes yes when the key is not set); area=yes is added to an area when
//    no tag of the preset is an areaKey (the keys of area presets, areaKeys in index.js); then each field default
//    of the preset's own fields that applies to the geometry is set when its key is empty.
//  - actionChangePreset: the old preset's field keys (not limited by geometry) and removeTags are removed, except
//    the keys that the new preset keeps (its addTags and its fields' keys that apply to the geometry).
type Row = {
  label: string
  preset: string
  geometry: Geometry
  tags: Tags
  expected: Tags
  /** the preset the feature had before, for a change of preset */
  previous?: string
}

const ROWS: Row[] = [
  // shop/bakery: addTags shop=bakery; shop is an areaKey, so no area=yes; {shop} brings building_area_yes
  // (key building, default yes, only for areas) into the fields.
  {
    label: 'shop/bakery on an empty area',
    preset: 'shop/bakery',
    geometry: 'area',
    tags: {},
    expected: { shop: 'bakery', building: 'yes' },
  },
  // building is set only when the key is empty, so the existing building=retail stays
  {
    label: 'shop/bakery on an area with shop=clothes and building=retail',
    preset: 'shop/bakery',
    geometry: 'area',
    tags: { shop: 'clothes', building: 'retail' },
    expected: { shop: 'bakery', building: 'retail' },
  },
  // highway/residential: addTags on a line; no area logic; no field of the preset has a default
  {
    label: 'highway/residential on an empty line',
    preset: 'highway/residential',
    geometry: 'line',
    tags: {},
    expected: { highway: 'residential' },
  },
  {
    label: 'highway/residential on a line with highway=primary and a name',
    preset: 'highway/residential',
    geometry: 'line',
    tags: { highway: 'primary', name: 'Main Street' },
    expected: { highway: 'residential', name: 'Main Street' },
  },
  // building/house: addTags building=house; building is an areaKey, so no area=yes; no default
  {
    label: 'building/house on an empty area',
    preset: 'building/house',
    geometry: 'area',
    tags: {},
    expected: { building: 'house' },
  },
  {
    label: 'building/house on an area with building=yes and a name',
    preset: 'building/house',
    geometry: 'area',
    tags: { building: 'yes', name: 'Hut' },
    expected: { building: 'house', name: 'Hut' },
  },
  // amenity/cafe: its fields include building_area_yes (key building, default yes, geometry area)
  {
    label: 'amenity/cafe on an empty area: the building default is added',
    preset: 'amenity/cafe',
    geometry: 'area',
    tags: {},
    expected: { amenity: 'cafe', building: 'yes' },
  },
  {
    label: 'amenity/cafe on an area with amenity=bar and building=house: building is kept',
    preset: 'amenity/cafe',
    geometry: 'area',
    tags: { amenity: 'bar', building: 'house' },
    expected: { amenity: 'cafe', building: 'house' },
  },
  // the same field on a point: its geometry is area only, so no default
  {
    label: 'amenity/cafe on an empty point: no building default',
    preset: 'amenity/cafe',
    geometry: 'point',
    tags: {},
    expected: { amenity: 'cafe' },
  },
  // highway/traffic_signals: its field traffic_signals has the default signal for every geometry
  {
    label: 'highway/traffic_signals on an empty vertex: traffic_signals=signal is added',
    preset: 'highway/traffic_signals',
    geometry: 'vertex',
    tags: {},
    expected: { highway: 'traffic_signals', traffic_signals: 'signal' },
  },
  {
    label: 'highway/traffic_signals on a vertex with highway=stop and traffic_signals=sign',
    preset: 'highway/traffic_signals',
    geometry: 'vertex',
    tags: { highway: 'stop', traffic_signals: 'sign' },
    expected: { highway: 'traffic_signals', traffic_signals: 'sign' },
  },
  // amenity/bench: none of its fields has a default, so only the addTags (the match tags) are set
  {
    label: 'amenity/bench on an empty point',
    preset: 'amenity/bench',
    geometry: 'point',
    tags: {},
    expected: { amenity: 'bench' },
  },
  {
    label: 'amenity/bench on a point with amenity=waste_basket and backrest=yes',
    preset: 'amenity/bench',
    geometry: 'point',
    tags: { amenity: 'waste_basket', backrest: 'yes' },
    expected: { amenity: 'bench', backrest: 'yes' },
  },
  // public_transport/stop_position_tram: addTags adds railway=tram_stop, which the match tags do not have
  {
    label: 'public_transport/stop_position_tram on an empty vertex: addTags are set',
    preset: 'public_transport/stop_position_tram',
    geometry: 'vertex',
    tags: {},
    expected: { public_transport: 'stop_position', tram: 'yes', railway: 'tram_stop' },
  },
  {
    label: 'public_transport/stop_position_tram on a vertex with public_transport=platform',
    preset: 'public_transport/stop_position_tram',
    geometry: 'vertex',
    tags: { public_transport: 'platform', railway: 'platform', name: 'Tram stop' },
    expected: {
      public_transport: 'stop_position',
      tram: 'yes',
      railway: 'tram_stop',
      name: 'Tram stop',
    },
  },
  // highway/residential after highway/construction: removeTags of construction are highway and construction=*;
  // highway stays, because the new preset keeps it; construction goes (also as a field key of the old preset).
  {
    label: 'highway/residential after highway/construction (removeTags): construction is removed',
    preset: 'highway/residential',
    geometry: 'line',
    tags: { highway: 'construction', construction: 'yes', name: 'Main' },
    expected: { highway: 'residential', name: 'Main' },
    previous: 'highway/construction',
  },
  // area: addTags area=yes, so the area rule is not applied; the fallback has no field defaults
  {
    label: 'area fallback on an empty area',
    preset: 'area',
    geometry: 'area',
    tags: {},
    expected: { area: 'yes' },
  },
  {
    label: 'area fallback on an area with area=no and a name',
    preset: 'area',
    geometry: 'area',
    tags: { area: 'no', name: 'Park' },
    expected: { area: 'yes', name: 'Park' },
  },
  // point: the fallback for points has no tags and no field default; the tags stay
  {
    label: 'point fallback on a point with amenity=cafe and a name',
    preset: 'point',
    geometry: 'point',
    tags: { amenity: 'cafe', name: 'Corner' },
    expected: { amenity: 'cafe', name: 'Corner' },
  },
]

describe('as iD: ten presets of the bundled data on empty and on conflicting tags', () => {
  for (const row of ROWS) {
    it(row.label, () => {
      const previous = row.previous === undefined ? undefined : get(defaultPresets, row.previous)
      const result = defaultPresets.applyPreset(
        row.tags,
        get(defaultPresets, row.preset),
        row.geometry,
        previous,
      )
      expect(result).toEqual(row.expected)
    })
  }
})
