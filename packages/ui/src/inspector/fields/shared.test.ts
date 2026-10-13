import { describe, expect, test } from 'bun:test'
import { tagChangeOf, writeEdits } from './shared.ts'

const EDITS = [
  { key: 'parking:both', value: undefined },
  { key: 'parking:left', value: 'no' },
  { key: 'parking:right', value: 'lane' },
]

describe('writeEdits', () => {
  test('several keys go as one change where the inspector takes one', () => {
    const batches: unknown[] = []
    const single: unknown[] = []
    writeEdits(
      {
        onChange: (key, value) => single.push([key, value]),
        onChangeTags: (edits) => batches.push(edits),
      },
      EDITS,
    )
    expect(batches).toEqual([EDITS])
    expect(single).toEqual([])
  })

  test('without it each key is written on its own, in order', () => {
    const single: unknown[] = []
    writeEdits({ onChange: (key, value) => single.push([key, value]) }, EDITS)
    expect(single).toEqual([
      ['parking:both', undefined],
      ['parking:left', 'no'],
      ['parking:right', 'lane'],
    ])
  })

  test('no edits write nothing', () => {
    let calls = 0
    writeEdits({ onChangeTags: () => calls++ }, [])
    expect(calls).toBe(0)
  })
})

describe('tagChangeOf', () => {
  test('values are set, missing and empty values are removed', () => {
    expect(tagChangeOf([...EDITS, { key: 'name', value: '' }])).toEqual({
      set: { 'parking:left': 'no', 'parking:right': 'lane' },
      remove: ['parking:both', 'name'],
    })
  })
})
