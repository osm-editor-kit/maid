import { describe, expect, test } from 'bun:test'
import { applyOption, diffOption, isApplied } from './diff.ts'

const current = { highway: 'service', name: 'Weg', lit: 'yes' }

describe('diffOption', () => {
  const option = {
    set: { highway: 'cycleway', surface: 'asphalt', lit: 'yes' },
    remove: ['maxspeed', 'name'],
  }

  test('one change per key, sorted by key', () => {
    const changes = diffOption(current, option)
    expect(changes.map((c) => c.key)).toEqual(['highway', 'lit', 'maxspeed', 'name', 'surface'])
  })

  test('a set key with another value is a change, with from and to', () => {
    expect(diffOption(current, option)[0]).toEqual({
      key: 'highway',
      kind: 'change',
      from: 'service',
      to: 'cycleway',
    })
  })

  test('a set key with the same value is same', () => {
    expect(diffOption(current, option)[1]).toEqual({
      key: 'lit',
      kind: 'same',
      from: 'yes',
      to: 'yes',
    })
  })

  test('a removed key that is absent is same, without from', () => {
    expect(diffOption(current, option)[2]).toEqual({ key: 'maxspeed', kind: 'same' })
  })

  test('a removed key that is present is remove, with from', () => {
    expect(diffOption(current, option)[3]).toEqual({ key: 'name', kind: 'remove', from: 'Weg' })
  })

  test('a set key the feature lacks is add, with to', () => {
    expect(diffOption(current, option)[4]).toEqual({ key: 'surface', kind: 'add', to: 'asphalt' })
  })

  test('an option with only remove lists only removed keys', () => {
    expect(diffOption(current, { remove: ['name'] })).toEqual([
      { key: 'name', kind: 'remove', from: 'Weg' },
    ])
  })

  test('inherited names are not tags: constructor is an add, toString a same', () => {
    expect(diffOption({}, { set: { constructor: 'x' } })).toEqual([
      { key: 'constructor', kind: 'add', to: 'x' },
    ])
    expect(diffOption({}, { remove: ['toString'] })).toEqual([{ key: 'toString', kind: 'same' }])
  })

  test('the input is not changed', () => {
    const tags = { a: '1' }
    diffOption(tags, { set: { a: '2' } })
    expect(tags).toEqual({ a: '1' })
  })
})

describe('applyOption', () => {
  test('removes the removed keys, sets the set keys, keeps the rest', () => {
    const option = { set: { highway: 'cycleway', surface: 'asphalt' }, remove: ['name'] }
    expect(applyOption(current, option)).toEqual({
      highway: 'cycleway',
      lit: 'yes',
      surface: 'asphalt',
    })
  })

  test('returns a new object and leaves the input as it was', () => {
    const tags = { a: '1', b: '2' }
    const next = applyOption(tags, { set: { a: '9' }, remove: ['b'] })
    expect(next).not.toBe(tags)
    expect(tags).toEqual({ a: '1', b: '2' })
    expect(next).toEqual({ a: '9' })
  })

  test('removing an absent key changes nothing', () => {
    expect(applyOption(current, { remove: ['maxspeed'] })).toEqual(current)
  })
})

describe('isApplied', () => {
  test('true when every key is already as the option wants', () => {
    expect(isApplied(current, { set: { highway: 'service' }, remove: ['maxspeed'] })).toBe(true)
  })

  test('false when a set key differs or is missing', () => {
    expect(isApplied(current, { set: { highway: 'cycleway' } })).toBe(false)
    expect(isApplied(current, { set: { surface: 'asphalt' } })).toBe(false)
  })

  test('false when a removed key is present', () => {
    expect(isApplied(current, { remove: ['name'] })).toBe(false)
  })

  test('applying an option makes it applied', () => {
    const option = { set: { highway: 'cycleway' }, remove: ['name'] }
    expect(isApplied(applyOption(current, option), option)).toBe(true)
  })
})
