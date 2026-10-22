import { describe, expect, it } from 'bun:test'
import { tagDiffRows } from './tag-diff.ts'

describe('tagDiffRows', () => {
  it('lists the keys sorted, with the kind of each change', () => {
    const rows = tagDiffRows(
      { highway: 'residential', surface: 'asphalt', name: 'Old' },
      { highway: 'residential', maxspeed: '30', name: 'New' },
    )
    expect(rows).toEqual([
      { kind: 'unchanged', key: 'highway', value: 'residential' },
      { kind: 'added', key: 'maxspeed', value: '30' },
      { kind: 'changed', key: 'name', before: 'Old', after: 'New' },
      { kind: 'removed', key: 'surface', value: 'asphalt' },
    ])
  })

  it('returns no rows for equal tags and an empty diff for two empty objects', () => {
    expect(tagDiffRows({}, {})).toEqual([])
    expect(tagDiffRows({ a: '1' }, { a: '1' })).toEqual([
      { kind: 'unchanged', key: 'a', value: '1' },
    ])
  })

  it('does not take inherited object keys for tags', () => {
    const rows = tagDiffRows({}, { constructor: 'x' })
    expect(rows).toEqual([{ kind: 'added', key: 'constructor', value: 'x' }])
  })

  it('keeps an empty value as a value', () => {
    expect(tagDiffRows({ note: '' }, {})).toEqual([{ kind: 'removed', key: 'note', value: '' }])
  })
})
