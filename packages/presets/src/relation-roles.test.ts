import { describe, expect, it } from 'bun:test'
import { defaultPresets } from './default.ts'
import { createPresets } from './presets.ts'
import type { PresetData, Presets, Tags } from './types.ts'

// Fixtures shaped like id-tagging-schema 7.x: `relation` on the preset, labels under the preset's translation as
// iD's preset.t('relation.role_labels.<role>') reads them. The restriction schema is PR 12768's test fixture.
const data: PresetData = {
  presets: {
    'type/restriction': {
      tags: { type: 'restriction' },
      geometry: ['relation'],
      relation: {
        reference: 'restriction',
        allowDuplicateMembers: false,
        role_labels: { from: 'von', via: 'über', to: 'nach' },
        members: [
          { role: 'from', geometry: ['line'], matchTags: [{ highway: '*' }] },
          { role: 'via', geometry: ['vertex', 'line'] },
          { role: 'to', geometry: ['line'], matchTags: [{ highway: '*' }] },
        ],
      },
    },
    'type/restriction/no_left_turn': {
      tags: { type: 'restriction', restriction: 'no_left_turn' },
      geometry: ['relation'],
    },
    'type/boundary': {
      tags: { type: 'boundary' },
      geometry: ['relation'],
      relation: {
        reference: 'boundary',
        role_labels: { inner: '{area.role_labels.inner}', outer: '{area.role_labels.outer}' },
        members: [
          { role: 'inner', geometry: ['line', 'area'] },
          { role: 'outer', geometry: ['line', 'area'], min: 1 },
        ],
      },
    },
    'type/multipolygon': {
      tags: { type: 'multipolygon' },
      geometry: ['relation'],
      relation: { members: [{ role: 'outer', geometry: ['line'] }] },
    },
    area: { tags: { area: 'yes' }, geometry: ['area'] },
  },
  fields: {},
  translations: {
    en: {
      presets: {
        presets: {
          // from and via are translated, to is not: its label falls back to the schema's text
          'type/restriction': {
            name: 'Turn restriction',
            relation: { role_labels: { from: 'From way', via: 'Via' } },
          },
          area: { name: 'Area', relation: { role_labels: { inner: 'Enclosed' } } },
        },
      },
    },
  },
}

const presets: Presets = createPresets(data)

describe('relationRoles (iD utilGetRelationSchema)', () => {
  it('returns the roles of the best preset for a relation, with labels and member rules', () => {
    expect(presets.relationRoles({ type: 'restriction' })).toStrictEqual({
      from: {
        label: 'From way',
        member: { role: 'from', geometry: ['line'], matchTags: [{ highway: '*' }] },
      },
      via: { label: 'Via', member: { role: 'via', geometry: ['vertex', 'line'] } },
      to: {
        label: 'nach',
        member: { role: 'to', geometry: ['line'], matchTags: [{ highway: '*' }] },
      },
    })
  })

  it('takes the roles of the preset matching the type when the best preset has no relation', () => {
    const indirect = presets.relationRoles({ type: 'restriction', restriction: 'no_left_turn' })
    expect(Object.keys(indirect)).toStrictEqual(['from', 'via', 'to'])
    expect(indirect.from?.label).toBe('From way')
  })

  it('is empty when neither the preset nor the type has a relation', () => {
    expect(presets.relationRoles({ type: 'something' })).toStrictEqual({})
    expect(presets.relationRoles({})).toStrictEqual({})
    expect(presets.relationRoles({ amenity: 'cafe' })).toStrictEqual({})
  })

  it('takes a role label that refers to another preset, and leaves it empty when that one has none', () => {
    const roles = presets.relationRoles({ type: 'boundary' })
    expect(roles.inner?.label).toBe('Enclosed')
    expect(roles.outer?.label).toBe('')
  })

  it('gives an empty label for a role with no translation and no schema text', () => {
    expect(presets.relationRoles({ type: 'multipolygon' })).toStrictEqual({
      outer: { label: '', member: { role: 'outer', geometry: ['line'] } },
    })
  })

  it('returns the same object for the same tags object', () => {
    const tags: Tags = { type: 'restriction' }
    expect(presets.relationRoles(tags)).toBe(presets.relationRoles(tags))
  })

  it('reads the relation of a preset as the schema has it', () => {
    expect(presets.preset('type/restriction')?.relation?.allowDuplicateMembers).toBe(false)
    expect(presets.preset('type/restriction/no_left_turn')?.relation).toBeUndefined()
  })

  it('reads inner and outer for type=boundary alone (its own schema since id-tagging-schema 7.3.0)', () => {
    expect(Object.keys(defaultPresets.relationRoles({ type: 'boundary' }))).toStrictEqual([
      'inner',
      'outer',
    ])
  })
})

// The bundled id-tagging-schema 7.3.0 data (dist/presets.json and translations/en.json), not a fixture.
describe('relationRoles on the bundled data (id-tagging-schema 7.3.0)', () => {
  it('reads the four member roles of an administrative boundary, in the schema order', () => {
    const roles = defaultPresets.relationRoles({ type: 'boundary', boundary: 'administrative' })
    expect(Object.keys(roles)).toStrictEqual(['inner', 'outer', 'label', 'admin_centre'])
  })

  it('reads the member rules as the schema has them (geometry, matchTags, min, max)', () => {
    const roles = defaultPresets.relationRoles({ type: 'boundary', boundary: 'administrative' })
    expect(roles.inner?.member).toStrictEqual({ role: 'inner', geometry: ['line', 'area'] })
    expect(roles.outer?.member).toStrictEqual({ role: 'outer', geometry: ['line', 'area'], min: 1 })
    expect(roles.label?.member).toStrictEqual({
      role: 'label',
      geometry: ['point', 'vertex'],
      matchTags: [{ place: '*' }],
      max: 1,
    })
    expect(roles.admin_centre?.member).toStrictEqual({
      role: 'admin_centre',
      geometry: ['point', 'vertex'],
      matchTags: [{ place: '*' }],
      max: 1,
    })
  })

  it('takes the labels from the preset translation (relation.role_labels)', () => {
    const roles = defaultPresets.relationRoles({ type: 'boundary', boundary: 'administrative' })
    expect(roles.inner?.label).toBe('Inner Edge')
    expect(roles.outer?.label).toBe('Outer Edge')
    expect(roles.label?.label).toBe('Label')
    expect(roles.admin_centre?.label).toBe('Capital / Seat')
  })

  it('does not allow duplicate members in an administrative boundary (allowDuplicateMembers: false)', () => {
    const admin = { type: 'boundary', boundary: 'administrative' }
    expect(defaultPresets.allowsDuplicateMembers(admin)).toBe(false)
  })

  it('reads the relation of the area preset (reference multipolygon): inner, and outer at least one', () => {
    const relation = defaultPresets.preset('area')?.relation
    expect(relation?.reference).toBe('multipolygon')
    expect(relation?.members.map((member) => member.role)).toStrictEqual(['inner', 'outer'])
    expect(relation?.members[1]).toStrictEqual({
      role: 'outer',
      geometry: ['line', 'area'],
      min: 1,
    })
  })
})

describe('allowsDuplicateMembers (iD utilRelationAllowsDuplicateMembers)', () => {
  it('is false when the schema says allowDuplicateMembers: false', () => {
    expect(presets.allowsDuplicateMembers({ type: 'restriction' })).toBe(false)
  })

  it('is false for a preset that inherits the schema of its type', () => {
    expect(
      presets.allowsDuplicateMembers({ type: 'restriction', restriction: 'no_left_turn' }),
    ).toBe(false)
  })

  it('is true by default: the schema has no flag, or there is no schema', () => {
    expect(presets.allowsDuplicateMembers({ type: 'multipolygon' })).toBe(true)
    expect(presets.allowsDuplicateMembers({ type: 'boundary' })).toBe(true)
    expect(presets.allowsDuplicateMembers({ type: 'something' })).toBe(true)
    expect(defaultPresets.allowsDuplicateMembers({ type: 'route' })).toBe(true)
  })

  it('is false on the bundled data for multipolygons, boundaries and turn restrictions (id-tagging-schema 7.3.0)', () => {
    for (const type of ['multipolygon', 'boundary', 'restriction'])
      expect(defaultPresets.allowsDuplicateMembers({ type })).toBe(false)
  })
})
