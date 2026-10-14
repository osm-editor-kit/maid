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

/**
 * The list read the way iD's getDeprecatedTags reads it, one entry after the other: no index, so this is the
 * reference the index must agree with.
 */
function deprecatedByScan(tags: Record<string, string>, entries: typeof list) {
  return entries.filter(({ old, replace }) => {
    const oldKeys = Object.keys(old)
    if (replace) {
      const transfer = oldKeys.filter((key) => old[key] === '*')
      const overwrites = Object.keys(replace).some((replaceKey) => {
        if (!tags[replaceKey] || old[replaceKey]) return false
        const replaceValue = replace[replaceKey] ?? ''
        if (replaceValue === '*') return false
        if (
          replaceValue.startsWith('$1') &&
          tags[replaceKey] === tags[transfer[Number(replaceValue.substring(1)) - 1] ?? '']
        )
          return false
        return replaceValue !== tags[replaceKey]
      })
      if (overwrites) return false
    }
    return oldKeys.every((oldKey) => {
      const value = tags[oldKey]
      if (!value) return false
      const oldValue = old[oldKey]
      if (oldValue === '*' || oldValue === value) return true
      const values = value.split(';').filter(Boolean)
      return values.length > 1 && values.includes(oldValue ?? '')
    })
  })
}

describe('deprecatedTagsOf agrees with a scan of the list', () => {
  it('for many tag sets built from the list, with semicolon values and empty values', () => {
    // every key and value of the list, plus a value that no entry has, in semicolon forms
    const keys = [...new Set(list.flatMap((entry) => Object.keys(entry.old)))].concat(['name'])
    const values = (key: string) => {
      const found = new Set(['other', ''])
      for (const entry of list) {
        const value = entry.old[key]
        if (value === undefined) continue
        found.add(value === '*' ? 'x' : value)
        found.add(`${value};other`)
        found.add(`other;${value}`)
        found.add(`${value};${value}`)
      }
      return [...found]
    }
    let state = 7
    const next = (n: number) => {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      return state % n
    }
    let matched = 0
    for (let i = 0; i < 3000; i++) {
      const tags: Record<string, string> = {}
      const count = 1 + next(3)
      for (let k = 0; k < count; k++) {
        const key = keys[next(keys.length)]!
        const options = values(key)
        tags[key] = options[next(options.length)]!
      }
      const expected = deprecatedByScan(tags, list)
      const actual = deprecatedTagsOf(tags, index)
      matched += actual.length
      expect(actual).toEqual(expected)
    }
    expect(matched).toBeGreaterThan(0)
  })
})
