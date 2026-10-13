import { describe, expect, it } from 'bun:test'
import { deprecatedIndexOf, deprecatedTagsOf } from './deprecated.ts'

// iD's getDeprecatedTags, on a small list in iD's own shapes
const list: { old: Record<string, string>; replace?: Record<string, string> }[] = [
  { old: { highway: 'ford' }, replace: { ford: '*' } },
  { old: { highway: 'no' } },
  { old: { amenity: 'bench', capacity: '*' }, replace: { amenity: 'bench', seats: '$1' } },
  { old: { building: 'roof' }, replace: { building: 'roof', layer: '1' } },
  { old: { oldKey1: '*', oldKey2: '*' }, replace: { newKey1: '$1', newKey2: '$2' } },
]
const index = deprecatedIndexOf(list)

describe('deprecatedTagsOf', () => {
  it('matches an exact value, and none of the others', () => {
    expect(deprecatedTagsOf({ highway: 'ford' }, index)).toEqual([list[0]!])
    expect(deprecatedTagsOf({ highway: 'primary' }, index)).toEqual([])
  })

  it('matches a value inside a semicolon list', () => {
    expect(deprecatedTagsOf({ highway: 'no;ford' }, index)).toEqual([list[0]!, list[1]!])
  })

  it('matches a wildcard key of old, whatever its value', () => {
    expect(deprecatedTagsOf({ oldKey1: 'a', oldKey2: 'b' }, index)).toEqual([list[4]!])
    expect(deprecatedTagsOf({ oldKey1: 'a' }, index)).toEqual([])
  })

  it('leaves an entry out when its replace would overwrite a value that is there', () => {
    // capacity present, and seats already set to another value: the upgrade would overwrite it (iD #7843)
    expect(deprecatedTagsOf({ amenity: 'bench', capacity: '4', seats: '2' }, index)).toEqual([])
    expect(deprecatedTagsOf({ amenity: 'bench', capacity: '4' }, index)).toEqual([list[2]!])
  })

  it('returns the matches in the list order', () => {
    expect(deprecatedTagsOf({ building: 'roof', highway: 'no' }, index)).toEqual([
      list[1]!,
      list[3]!,
    ])
  })

  it('finds nothing without tags, and nothing in a list that is not one', () => {
    expect(deprecatedTagsOf({}, index)).toEqual([])
    expect(deprecatedIndexOf(undefined).size).toBe(0)
  })
})
