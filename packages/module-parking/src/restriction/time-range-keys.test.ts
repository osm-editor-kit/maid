import { describe, expect, it } from 'bun:test'
import { addRangeKey, keysOf, mintRangeKey, removeRangeKey } from './time-range-keys.ts'

const fresh = (() => {
  let n = 0
  return () => `new-${++n}`
})()

describe('the keys of the time ranges', () => {
  it('keeps the keys of the rows that stay when a row is removed, so the other rows keep their focus', () => {
    const keys = ['a', 'b', 'c']
    expect(removeRangeKey(keys, 0)).toEqual(['b', 'c'])
    expect(removeRangeKey(keys, 1)).toEqual(['a', 'c'])
  })

  it('gives a new key to an added row and keeps the others', () => {
    expect(addRangeKey(['a', 'b'], fresh)).toEqual(['a', 'b', 'new-1'])
  })

  it('takes the stored keys and the position for a range without one', () => {
    expect(keysOf(['a', 'b'], 2)).toEqual(['a', 'b'])
    expect(keysOf(['a'], 3)).toEqual(['a', 'position-1', 'position-2'])
    expect(keysOf(['a', 'b', 'c'], 1)).toEqual(['a'])
    expect(keysOf([], 0)).toEqual([])
  })

  it('mints a different key each time', () => {
    const first = mintRangeKey()
    expect(mintRangeKey()).not.toBe(first)
  })
})
