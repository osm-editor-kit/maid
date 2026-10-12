// Adopted from iD test/spec/actions/change_preset.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { createPresets } from './presets.ts'
import type { Presets, Tags } from './types.ts'

type Raw = Record<string, unknown>

// iD's actionChangePreset(entityID, oldPreset, newPreset) is applyPreset(tags, newPreset, geometry, oldPreset).
// Entities here are nodes (geometry 'point'), as in iD's tests. Removing a preset without a new one is unsetTags.
function presetsOf(presets: Record<string, Raw>, fields: Record<string, Raw> = {}): Presets {
  return createPresets({ presets, fields, translations: {} })
}

function change(
  presets: Presets,
  tags: Record<string, string | undefined>,
  oldId: string | undefined,
  newId: string,
): Tags {
  // the table rows below have keys that are undefined in other rows: those are left out
  const defined: Tags = Object.fromEntries(
    Object.entries(tags).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  const next = presets.preset(newId)
  if (!next) throw new Error(`no preset ${newId}`)
  const old = oldId === undefined ? undefined : presets.preset(oldId)
  if (oldId !== undefined && !old) throw new Error(`no preset ${oldId}`)
  return presets.applyPreset(defined, next, 'point', old)
}

describe('iD.actionChangePreset', () => {
  it("changes from one preset's tags to another's", () => {
    const presets = presetsOf({ old: { tags: { old: 'true' } }, new: { tags: { new: 'true' } } })
    expect(change(presets, { old: 'true' }, 'old', 'new')).toEqual({ new: 'true' })
  })

  it('adds the tags of a new preset to an entity without an old preset', () => {
    const presets = presetsOf({ new: { tags: { new: 'true' } } })
    expect(change(presets, {}, undefined, 'new')).toEqual({ new: 'true' })
  })

  it('removes the tags of an old preset from an entity without a new preset', () => {
    const presets = presetsOf({ old: { tags: { old: 'true' } } })
    const old = presets.preset('old')
    if (!old) throw new Error('no preset old')
    expect(presets.unsetTags({ old: 'true' }, old, 'point')).toEqual({})
  })

  it('preserves the tags that are defined in neither preset when changing from one preset to another', () => {
    const presets = presetsOf({ old: { tags: { old: 'true' } }, new: { tags: { new: 'true' } } })
    expect(change(presets, { old: 'true', other: 'other' }, 'old', 'new')).toEqual({
      new: 'true',
      other: 'other',
    })
  })

  // https://github.com/openstreetmap/iD/issues/8159
  it("preserves the tags of a new preset's addTags", () => {
    const presets = presetsOf({
      old: {
        tags: { power: 'plant', 'plant:source': 'coal' },
        addTags: {
          power: 'plant',
          'plant:source': 'coal',
          'plant:method': 'combustion',
          'plant:output:electricity': '*',
        },
      },
      new: {
        tags: { power: 'plant', 'plant:source': 'solar', 'plant:method': 'photovoltaic' },
        addTags: {
          power: 'plant',
          'plant:source': 'solar',
          'plant:method': 'photovoltaic',
          'plant:output:electricity': '*',
        },
      },
    })
    expect(
      change(
        presets,
        {
          power: 'plant',
          'plant:source': 'coal',
          'plant:method': 'combustion',
          'plant:output:electricity': '10 MW',
        },
        'old',
        'new',
      ),
    ).toEqual({
      power: 'plant',
      'plant:source': 'solar',
      'plant:method': 'photovoltaic',
      'plant:output:electricity': '10 MW',
    })
  })

  // https://github.com/openstreetmap/iD/issues/9341
  // https://github.com/openstreetmap/iD/issues/9104
  it('preserves the tags when there is a matching field in the new preset', () => {
    const presets = presetsOf(
      {
        old: { tags: { building: 'yes' } },
        new: { tags: { amenity: 'school' }, fields: ['field'] },
      },
      { field: { key: 'building' } },
    )
    expect(change(presets, { building: 'yes' }, 'old', 'new')).toEqual({
      amenity: 'school',
      building: 'yes',
    })
  })

  it('does not preserves the tags of a non-matching field in the new preset', () => {
    const presets = presetsOf(
      {
        old: { tags: { building: 'yes' } },
        new: { tags: { amenity: 'school' }, fields: ['field'] },
      },
      { field: { key: 'building', geometry: ['area'] } },
    )
    expect(change(presets, { building: 'yes' }, 'old', 'new')).toEqual({ amenity: 'school' })
  })

  // https://github.com/openstreetmap/iD/pull/11696
  it('does not preserve field tags which only exist in the old preset, not in the new preset', () => {
    const presets = presetsOf(
      {
        'building/yes': { tags: { building: 'yes' }, fields: ['roof:colour', 'check_date'] },
        'leisure/pitch': { tags: { leisure: 'pitch' }, fields: ['check_date', 'surface'] },
      },
      {
        'roof:colour': { key: 'roof:colour', geometry: ['point'] },
        check_date: { key: 'check_date', geometry: ['point'] },
        surface: { key: 'surface', geometry: ['point'] },
      },
    )
    const tags = {
      building: 'yes', // case 1: the preset's own tags.
      'roof:colour': 'pink', // case 2: a field which exists in the old preset, but not the new one.
      check_date: '2025-12-05', // case 3: a field which exists in the old AND new preset.
      surface: 'grass', // case 4: a field which exists only in the new preset, not in the old one.
      'ref:SG:address_id': '1234', // case 5: a tag which does not exist in either preset
    }
    expect(change(presets, tags, 'building/yes', 'leisure/pitch')).toStrictEqual({
      leisure: 'pitch', // case 1: the preset's own tags were replaced.
      // case 2: the field which exists in the old preset was removed (roof:colour).
      check_date: '2025-12-05', // case 3: the field which exists in the old AND new preset was kept.
      surface: 'grass', // case 4: a field which exists only in the new preset was also kept.
      'ref:SG:address_id': '1234', // case 5: tags which do not exist in either preset are kept
    })
  })

  it('preserves all tags when re-selecting the same preset', () => {
    const presets = presetsOf(
      { 'building/yes': { tags: { building: 'yes' }, fields: ['building:colour'] } },
      { 'building:colour': { key: 'building:colour', geometry: ['point'] } },
    )
    expect(
      change(
        presets,
        {
          building: 'yes', // the preset's own tags.
          'building:colour': 'green', // a field which exists in the preset
          name: 'The Frog House', // a tag which does not exist in the preset
        },
        'building/yes',
        'building/yes',
      ),
    ).toStrictEqual({
      // all tags are preserved
      building: 'yes',
      'building:colour': 'green',
      name: 'The Frog House',
    })
  })

  // https://github.com/openstreetmap/iD/issues/12075
  it.each([
    {
      fieldType: 'multiCombo',
      fieldId: 'recycling',
      fieldKey: 'recycling:',
      fieldKeys: [],
      oldTags: { 'recycling:paper': 'yes', 'recycling:others': 'no' },
      tagsToPreserve: {},
    },
    {
      fieldType: 'localized',
      fieldId: 'name',
      fieldKey: 'name',
      fieldKeys: [],
      oldTags: { name: 'foo', 'name:en': 'bar', 'name:etymology:wikidata': 'Q860' },
      tagsToPreserve: { 'name:etymology:wikidata': 'Q860' },
    },
    {
      fieldType: 'directionalCombo',
      fieldId: 'cycleway',
      fieldKey: 'cycleway',
      fieldKeys: ['cycleway:left', 'cycleway:right'],
      oldTags: { 'cycleway:left': 'no', 'cycleway:both': 'separate', 'cycleway:foo': 'bar' },
      tagsToPreserve: { 'cycleway:foo': 'bar' },
    },
  ])(
    'does not preserve $fieldType field tags that are only present in the old preset',
    ({ fieldType, fieldId, fieldKey, fieldKeys, oldTags: oldRaw, tagsToPreserve: keptRaw }) => {
      const oldTags = oldRaw as Record<string, string | undefined>
      const tagsToPreserve = keptRaw as Record<string, string | undefined>
      const presets = presetsOf(
        {
          'amenity/recycling': { tags: { amenity: 'recycling' }, fields: [fieldId] },
          'amenity/bench': { tags: { amenity: 'bench' }, fields: [] },
        },
        { [fieldId]: { type: fieldType, key: fieldKey, keys: fieldKeys } },
      )
      expect(
        change(
          presets,
          { amenity: 'recycling', ...oldTags, unrelatedTagKey: 'unrelatedTagValue' },
          'amenity/recycling',
          'amenity/bench',
        ),
      ).toStrictEqual({
        // no field tags are preserved
        ...tagsToPreserve,
        unrelatedTagKey: 'unrelatedTagValue',
        amenity: 'bench',
      })
    },
  )

  // https://github.com/openstreetmap/iD/pull/12218#issuecomment-4314204446
  it.each([
    {
      fieldType: 'multiCombo',
      fieldId: 'recycling',
      fieldKey: 'recycling:',
      fieldKeys: [],
      oldTags: { 'recycling:paper': 'yes', 'recycling:others': 'no' },
    },
    {
      fieldType: 'localized',
      fieldId: 'name',
      fieldKey: 'name',
      fieldKeys: [],
      oldTags: { name: 'foo', 'name:en': 'bar', 'name:etymology:wikidata': 'Q860' },
    },
    {
      fieldType: 'directionalCombo',
      fieldId: 'cycleway',
      fieldKey: 'cycleway',
      fieldKeys: ['cycleway:left', 'cycleway:right'],
      oldTags: { 'cycleway:left': 'no', 'cycleway:both': 'separate', 'cycleway:foo': 'bar' },
    },
  ])(
    'preserve $fieldType field tags when they are present in the old and the new preset',
    ({ fieldType, fieldId, fieldKey, fieldKeys, oldTags: oldRaw }) => {
      const oldTags = oldRaw as Record<string, string | undefined>
      const presets = presetsOf(
        {
          'amenity/recycling': { tags: { amenity: 'recycling' }, fields: [fieldId] },
          'amenity/bench': { tags: { amenity: 'bench' }, fields: [fieldId] },
        },
        { [fieldId]: { type: fieldType, key: fieldKey, keys: fieldKeys } },
      )
      expect(
        change(presets, { amenity: 'recycling', ...oldTags }, 'amenity/recycling', 'amenity/bench'),
      ).toStrictEqual({
        // all field tags are preserved
        ...oldTags,
        amenity: 'bench', // override primary preset tag
      })
    },
  )

  // https://github.com/openstreetmap/iD/issues/12071
  it("preserves tags of the old preset when selecting a new preset with a field for the old preset's primary tag", () => {
    const presets = presetsOf(
      {
        'building/yes': { tags: { building: 'yes' }, fields: ['building:colour'] },
        'amenity/school': { tags: { amenity: 'school' }, fields: ['building'] },
      },
      {
        'building:colour': { key: 'building:colour' },
        building: { key: 'building' },
      },
    )
    expect(
      change(
        presets,
        {
          building: 'yes', // the preset's own tags.
          'building:colour': 'green', // a field which exists in the preset
        },
        'building/yes',
        'amenity/school',
      ),
    ).toStrictEqual({
      // all tags are preserved
      amenity: 'school',
      building: 'yes',
      'building:colour': 'green',
    })
  })

  // https://github.com/openstreetmap/iD/issues/9372
  it("does not preserve old preset's primary tags when changing from a subpreset to its parent", () => {
    const presets = presetsOf(
      {
        'highway/service/driveway': {
          tags: { highway: 'service', service: 'driveway' },
          fields: ['name'],
        },
        'highway/service': { tags: { highway: 'service' }, fields: ['field', 'name'] },
      },
      {
        field: { key: 'service' },
        name: { key: 'name' },
      },
    )
    expect(
      change(
        presets,
        { highway: 'service', service: 'driveway', name: 'foo bar' },
        'highway/service/driveway',
        'highway/service',
      ),
    ).toEqual({ highway: 'service', name: 'foo bar' })
  })
})
