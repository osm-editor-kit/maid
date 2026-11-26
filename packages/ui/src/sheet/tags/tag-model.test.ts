import { describe, expect, it } from 'bun:test'
import type { SheetBatch } from '../types.ts'
import { changeTagModel, initialTagModel, settleTagModel, syncTagModel } from './tag-model.ts'
import { rowKey, rowValue } from './tags.ts'

const TAGS = { name: 'A', highway: 'residential' }

function keysOf(model: { rows: { rows: { id: string }[] } }) {
  return model.rows.rows.map((row) => row.id)
}

describe('the Tags model: the order events', () => {
  it('a new feature is sorted and has no incomplete rows', () => {
    const model = initialTagModel('way/1', TAGS)
    expect(model.rows.rows.map(rowKey)).toEqual(['highway', 'name'])
    expect(model.order).toBe('sorted')
  })

  it('an edit holds the order: a new key goes last and the incomplete row stays', () => {
    const model = initialTagModel('way/1', TAGS)
    const batch: SheetBatch = {
      cause: 'edit',
      changes: [{ type: 'insert', row: 't0', cells: { key: 'access' } }],
    }
    const change = changeTagModel(model, TAGS, batch)
    expect(change.model.order).toBe('hold')
    expect(change.model.rows.rows.map(rowKey)).toEqual(['highway', 'name', 'access'])
    expect(change.label).toBeUndefined()
  })

  it('a paste sorts at once and bumps the version (the re-sort is animated)', () => {
    const model = initialTagModel('way/1', TAGS)
    const batch: SheetBatch = {
      cause: 'paste',
      changes: [{ type: 'insert', row: 'new-1', cells: { key: 'access', value: 'no' } }],
    }
    const change = changeTagModel(model, TAGS, batch)
    expect(change.model.rows.rows.map(rowKey)).toEqual(['access', 'highway', 'name'])
    expect(change.model.version).toBe(model.version + 1)
    expect(change.label).toBeDefined()
  })

  it('leaving the sheet sorts and drops the incomplete rows; a sorted list is not animated again', () => {
    const model = initialTagModel('way/1', TAGS)
    const typed = changeTagModel(model, TAGS, {
      cause: 'edit',
      changes: [{ type: 'insert', row: 't0', cells: { key: 'access' } }],
    }).model
    const settled = settleTagModel(typed)
    expect(settled.rows.rows.map(rowKey)).toEqual(['highway', 'name'])
    expect(settled.order).toBe('sorted')
    expect(settleTagModel(settled).version).toBe(settled.version)
  })

  it('a host change of the tags follows them, in the model order (sorted once a feature is selected)', () => {
    const model = initialTagModel('way/1', TAGS)
    const synced = syncTagModel(model, { ...TAGS, access: 'no' })
    expect(synced.rows.rows.map(rowKey)).toEqual(['access', 'highway', 'name'])
    const held = syncTagModel({ ...model, order: 'hold' }, { ...TAGS, access: 'no' })
    expect(held.rows.rows.map(rowKey)).toEqual(['highway', 'name', 'access'])
    expect(synced.seen).not.toBe(model.seen)
  })
})

describe('the Tags model: the batch is one label and one set of tags', () => {
  it('a value change gives the next tags and the label', () => {
    const model = initialTagModel('way/1', TAGS)
    const row = model.rows.rows.find((candidate) => rowKey(candidate) === 'name')
    const change = changeTagModel(model, TAGS, {
      cause: 'edit',
      changes: [{ type: 'set', row: row?.id ?? '', col: 'value', text: 'B' }],
    })
    expect(change.tags).toEqual({ name: 'B', highway: 'residential' })
    expect(change.label).toBe('Changed tags')
    expect(rowValue(change.model.rows.rows[1] ?? change.model.rows.rows[0]!)).toBeDefined()
    expect(keysOf(change.model)).toHaveLength(2)
  })
})

describe('the Tags model: a row made under another row', () => {
  it('the new key goes right under that row and the sheet does not sort it away', () => {
    const tags = { access: 'yes', highway: 'residential', name: 'A' }
    const model = initialTagModel('way/1', tags)
    const after = model.rows.rows[0]?.id
    if (after === undefined) throw new Error('no row')
    const batch: SheetBatch = {
      cause: 'edit',
      changes: [{ type: 'insert', row: 't1', cells: { key: 'zzz' }, after }],
    }
    const change = changeTagModel(model, tags, batch)
    expect(change.model.rows.rows.map(rowKey)).toEqual(['access', 'zzz', 'highway', 'name'])
    expect(change.model.order).toBe('hold')
    expect(change.model.version).toBe(model.version)
    expect(change.model.rows.rows[1]?.id).toBe('t1')
  })

  it('a key and a value under a row is a tag, in that place', () => {
    const tags = { access: 'yes', name: 'A' }
    const model = initialTagModel('way/1', tags)
    const after = model.rows.rows[0]?.id
    if (after === undefined) throw new Error('no row')
    const batch: SheetBatch = {
      cause: 'edit',
      changes: [{ type: 'insert', row: 't1', cells: { key: 'zzz', value: '1' }, after }],
    }
    const change = changeTagModel(model, tags, batch)
    expect(change.tags).toEqual({ access: 'yes', name: 'A', zzz: '1' })
    expect(change.model.rows.rows.map(rowKey)).toEqual(['access', 'zzz', 'name'])
  })
})
