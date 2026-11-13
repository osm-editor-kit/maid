import { describe, expect, test } from 'bun:test'
import {
  applyTagChange,
  diffTagChange,
  extractCooperativeWork,
  isTagFix,
  parseElementId,
  resolveTagFix,
  tagFixOptions,
} from './cooperative.ts'

const tagFix = (operations: unknown[], meta: unknown = { version: 2, type: 1 }) => ({
  cooperativeWork: { meta, operations },
})

const modify = (id: unknown, operations: unknown[]) => ({
  operationType: 'modifyElement',
  data: { id, operations },
})

describe('isTagFix and extractCooperativeWork', () => {
  test('type 1 is a tag fix, type 2 (OSC) is not', () => {
    expect(isTagFix(tagFix([]))).toBe(true)
    expect(isTagFix(tagFix([modify('way/1', [])], { type: 2 }))).toBe(false)
  })

  test('an old version 1 or untyped work needs a modifyElement', () => {
    expect(isTagFix(tagFix([modify('w1', [])], { version: 1 }))).toBe(true)
    expect(isTagFix(tagFix([{ operationType: 'other' }], { version: 1 }))).toBe(false)
    expect(isTagFix({ cooperativeWork: { operations: [modify('w1', [])] } })).toBe(true)
  })

  test('cooperative work under geometries, or none', () => {
    const task = { geometries: tagFix([modify('w1', [])]) }
    expect(extractCooperativeWork(task)?.meta?.type).toBe(1)
    expect(
      extractCooperativeWork({
        geometries: { cooperativeWork: { meta: { type: 1 } } },
      })?.meta?.type,
    ).toBe(1)
    expect(extractCooperativeWork(null)).toBeNull()
    expect(isTagFix({})).toBe(false)
  })
})

describe('parseElementId', () => {
  test('long and short forms', () => {
    expect(parseElementId('way/123')).toBe('w123')
    expect(parseElementId('n5')).toBe('n5')
    expect(parseElementId(7)).toBeNull()
    expect(parseElementId(null)).toBeNull()
  })
})

describe('tagFixOptions', () => {
  test('one option with an operation per entity', () => {
    const options = tagFixOptions(
      tagFix([
        modify('way/1', [
          {
            operation: 'setTags',
            data: { highway: 'cycleway', lanes: 2, oneway: true },
          },
          { operation: 'unsetTags', data: ['fixme'] },
        ]),
        modify('node/2', [{ operationType: 'setTags', data: { a: 'b' } }]),
      ]),
    )
    expect(options).toEqual([
      {
        id: 'default',
        operations: [
          {
            entityId: 'w1',
            set: { highway: 'cycleway', lanes: '2', oneway: 'true' },
            unset: ['fixme'],
          },
          { entityId: 'n2', set: { a: 'b' }, unset: [] },
        ],
      },
    ])
  })

  test('blocks of one entity merge in order; the later wins', () => {
    const [option] = tagFixOptions(
      tagFix([
        modify('w1', [{ operation: 'setTags', data: { a: '1' } }]),
        modify('way/1', [{ operation: 'unsetTags', data: ['a'] }]),
        modify('w1', [{ operation: 'setTags', data: { b: '2' } }]),
        modify('w1', [
          { operation: 'unsetTags', data: ['b'] },
          { operation: 'setTags', data: { b: '3' } },
        ]),
      ]),
    )
    expect(option?.operations).toEqual([{ entityId: 'w1', set: { b: '3' }, unset: ['a'] }])
  })

  test('null values and bad ids are skipped; not a tag fix gives none', () => {
    const [option] = tagFixOptions(
      tagFix([
        modify('nonsense', [{ operation: 'setTags', data: { a: 'b' } }]),
        modify('w1', [{ operation: 'setTags', data: { a: null, b: 'x' } }]),
      ]),
    )
    expect(option?.operations).toEqual([{ entityId: 'w1', set: { b: 'x' }, unset: [] }])
    expect(tagFixOptions({})).toEqual([])
    expect(tagFixOptions(tagFix([modify('nonsense', [])]))).toEqual([])
  })
})

describe('applyTagChange, diffTagChange, resolveTagFix', () => {
  const change = { set: { highway: 'cycleway', new: 'v' }, unset: ['fixme'] }
  const tags = { highway: 'path', fixme: 'yes', name: 'X' }

  test('apply does not change the input', () => {
    expect(applyTagChange(tags, change)).toEqual({
      highway: 'cycleway',
      new: 'v',
      name: 'X',
    })
    expect(tags).toEqual({ highway: 'path', fixme: 'yes', name: 'X' })
    expect(applyTagChange(null, change)).toEqual({
      highway: 'cycleway',
      new: 'v',
    })
  })

  test('diff has a row per key, sorted', () => {
    expect(diffTagChange(tags, change)).toEqual([
      { key: 'fixme', before: 'yes', kind: 'removed' },
      { key: 'highway', before: 'path', after: 'cycleway', kind: 'changed' },
      { key: 'name', before: 'X', after: 'X', kind: 'unchanged' },
      { key: 'new', after: 'v', kind: 'added' },
    ])
  })

  test('resolveTagFix splits entities the caller has from the others', () => {
    const option = {
      id: 'default',
      operations: [
        { entityId: 'w1', ...change },
        { entityId: 'w2', set: {}, unset: [] },
      ],
    }
    const result = resolveTagFix(option, (id) => (id === 'w1' ? tags : null))
    expect(result.unmatched).toEqual(['w2'])
    expect(result.matched[0]?.after).toEqual({
      highway: 'cycleway',
      new: 'v',
      name: 'X',
    })
    expect(result.matched[0]?.before).toEqual(tags)
  })
})
