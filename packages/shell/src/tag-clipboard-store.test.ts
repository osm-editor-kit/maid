import { describe, expect, it } from 'bun:test'
import { pastedTags } from './tag-clipboard-store'

describe('pastedTags', () => {
  const current = { highway: 'service', name: 'Old', surface: 'gravel' }
  const copied = { highway: 'residential', maxspeed: '30' }

  it('merges: the copied tags are added and overwrite the same keys, the others stay', () => {
    expect(pastedTags(current, copied, 'merge')).toEqual({
      highway: 'residential',
      name: 'Old',
      surface: 'gravel',
      maxspeed: '30',
    })
  })

  it('replaces: the feature gets exactly the copied tags', () => {
    expect(pastedTags(current, copied, 'replace')).toEqual(copied)
  })

  it('with empty copied tags, merge keeps the tags and replace removes them all', () => {
    expect(pastedTags(current, {}, 'merge')).toEqual(current)
    expect(pastedTags(current, {}, 'replace')).toEqual({})
  })

  it('does not change the objects it is given', () => {
    const before = { ...current }
    pastedTags(current, copied, 'merge')
    pastedTags(current, copied, 'replace')
    expect(current).toEqual(before)
  })
})
