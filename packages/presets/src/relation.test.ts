import { describe, expect, it } from 'bun:test'
import { matchTagPatterns, relationSchemaOf, validRelationRoles } from './relation.ts'
import type { Geometry, RelationRoles, Tags } from './types.ts'

// The cases are iD's osmMatchTags tests (test/spec/osm/tags.js, from PR 12988), in the same order.
describe('matchTagPatterns (iD osmMatchTags)', () => {
  const cases: Array<[Tags[], Tags, boolean]> = [
    [[{ a: '*' }], {}, false],
    [[{ a: '*' }], { a: '' }, false],
    [[{ a: '*' }], { a: '1' }, true],
    [[{ a: '1' }], {}, false],
    [[{ a: '1' }], { a: '' }, false],
    [[{ a: '1' }], { a: '1' }, true],
    [[{ a: '1' }], { a: '2' }, false],
    [[{ a: '1' }, { a: '2' }], { a: '1' }, true],
    [[{ a: '1' }, { a: '2' }], { a: '2' }, true],
    [[{ a: '1' }, { a: '2' }], { a: '3' }, false],
    // an empty list means none
    [[], { a: '1' }, false],
    [[], {}, false],
    // an empty pattern means any
    [[{}], {}, true],
    [[{ a: '1', b: '1' }, { b: '2' }], { a: '1' }, false],
    [[{ a: '1', b: '1' }, { b: '2' }], { a: '1', b: '1' }, true],
    [[{ a: '1', b: '1' }, { b: '2' }], { b: '2' }, true],
    [[{ a: '1', b: '1' }, { b: '2' }], { b: '1' }, false],
    // a value with semicolons is a list of values
    [[{ a: '1' }], { a: '1;2' }, true],
    [[{ a: '2' }], { a: '1;2' }, true],
    [[{ a: '3' }], { a: '1;2' }, false],
    [[{ a: '1' }], { a: ';' }, false],
  ]

  it.each(cases)('matchTagPatterns(%j, %j) is %s', (patterns, tags, expected) => {
    expect(matchTagPatterns(patterns, tags)).toBe(expected)
  })

  it('does not take an inherited property of the object for a tag', () => {
    expect(matchTagPatterns([{ constructor: '*' }], {})).toBe(false)
  })
})

// The fixture is the restriction schema of PR 12768's test (test/spec/util/relation_schema.ts).
const viaRole: RelationRoles[string] = {
  label: 'Via',
  member: { role: 'via', geometry: ['vertex', 'line'] },
}
const restrictionRoles: RelationRoles = {
  from: {
    label: 'From',
    member: { role: 'from', geometry: ['line'], matchTags: [{ highway: '*' }] },
  },
  via: viaRole,
  to: {
    label: 'To',
    member: { role: 'to', geometry: ['line'], matchTags: [{ highway: '*' }] },
  },
}

// The cases are iD's utilGetValidRelationRoles tests (test/spec/util/relation_schema.ts, PR 12768).
describe('validRelationRoles (iD utilGetValidRelationRoles)', () => {
  const cases: Array<[Geometry | undefined, Tags | undefined, string[]]> = [
    [undefined, undefined, ['from', 'via', 'to']],
    ['vertex', undefined, ['via']],
    ['line', undefined, ['from', 'via', 'to']],
    [undefined, { highway: 'service' }, ['from', 'via', 'to']],
    [undefined, { amenity: 'park' }, ['via']],
  ]

  it.each(cases)('geom=%s tags=%j keeps %j', (geometry, tags, matches) => {
    expect(Object.keys(validRelationRoles(restrictionRoles, geometry, tags))).toStrictEqual(matches)
  })

  it('keeps the labels and the member rules of the roles it keeps', () => {
    expect(validRelationRoles(restrictionRoles, 'vertex', undefined)).toStrictEqual({
      via: viaRole,
    })
  })
})

describe('relationSchemaOf (the relation field of a raw preset)', () => {
  it('reads the members, their filters and the schema flags', () => {
    expect(
      relationSchemaOf({
        relation: {
          reference: 'boundary',
          allowDuplicateMembers: false,
          role_labels: { inner: '{area.role_labels.inner}' },
          members: [
            { role: 'inner', geometry: ['line', 'area'], matchTags: [{ boundary: '*' }] },
            { role: 'outer', min: 1, max: 2 },
            { geometry: ['line'] },
            'not a member',
          ],
        },
      }),
    ).toStrictEqual({
      reference: 'boundary',
      allowDuplicateMembers: false,
      role_labels: { inner: '{area.role_labels.inner}' },
      members: [
        { role: 'inner', geometry: ['line', 'area'], matchTags: [{ boundary: '*' }] },
        { role: 'outer', min: 1, max: 2 },
      ],
    })
  })

  it('is undefined when the preset has no relation, and empty members when they are missing', () => {
    expect(relationSchemaOf({ name: 'x' })).toBeUndefined()
    expect(relationSchemaOf({ relation: { reference: 'x' } })).toStrictEqual({
      reference: 'x',
      members: [],
    })
  })
})
