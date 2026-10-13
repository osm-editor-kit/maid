import { describe, expect, it } from 'bun:test'
import type { UploadResult } from 'osm-api'
import { assignedIds, changesetsOf, entityId, selectionAfterUpload } from './after-upload.ts'
import type { OsmChange } from './osm-change.ts'

/** The answer of the server to an upload of one changeset, as osm-api gives it */
const answer: UploadResult = {
  42: {
    diffResult: {
      node: {
        '-1': { newId: 901, newVersion: 1 },
        '5': { newId: 5, newVersion: 8 },
        '-2': { newId: 902, newVersion: 1 },
      },
      way: { '-3': { newId: 903, newVersion: 1 } },
      relation: { '7': { newId: 7, newVersion: 4 } },
    },
  },
}

describe('assignedIds', () => {
  it('maps a new element to the id the server gave it, and an existing one to its new version', () => {
    const assigned = assignedIds(answer)
    expect(assigned.get('n-1')).toEqual({ id: 'n901', version: 1 })
    expect(assigned.get('n5')).toEqual({ id: 'n5', version: 8 })
    expect(assigned.get('w-3')).toEqual({ id: 'w903', version: 1 })
    expect(assigned.get('r7')).toEqual({ id: 'r7', version: 4 })
    expect(assigned.get('n-9')).toBeUndefined()
  })

  it('counts every changeset of a chunked upload', () => {
    const chunked: UploadResult = {
      10: { diffResult: { node: { '-1': { newId: 100, newVersion: 1 } } } },
      11: { diffResult: { way: { '-2': { newId: 200, newVersion: 1 } } } },
    }
    const assigned = assignedIds(chunked)
    expect(assigned.get('n-1')?.id).toBe('n100')
    expect(assigned.get('w-2')?.id).toBe('w200')
    expect(assigned.size).toBe(2)
  })

  it('is empty for an upload with no diff result', () => {
    expect(assignedIds({ 1: { diffResult: {} } }).size).toBe(0)
  })
})

describe('changesetsOf', () => {
  it('gives the changeset numbers of an upload, in order', () => {
    expect(changesetsOf(answer)).toEqual([42])
    expect(changesetsOf({ 10: { diffResult: {} }, 11: { diffResult: {} } })).toEqual([10, 11])
  })
})

describe('entityId', () => {
  it('writes the model ids of nodes, ways and relations, negative for a new one', () => {
    expect(entityId('node', -1)).toBe('n-1')
    expect(entityId('way', 12)).toBe('w12')
    expect(entityId('relation', 3)).toBe('r3')
  })
})

describe('selectionAfterUpload', () => {
  const change: OsmChange = {
    create: [],
    modify: [],
    delete: [{ type: 'node', id: 8, version: 2, tags: {}, lat: 0, lon: 0 }],
  }

  it('gives a new feature its real id, and keeps an existing one as it is', () => {
    const selection = selectionAfterUpload(['n-1', 'n5', 'w9'], change, assignedIds(answer))
    expect(selection).toEqual(['n901', 'n5', 'w9'])
  })

  it('drops a feature that was deleted', () => {
    expect(selectionAfterUpload(['n8', 'n5'], change, assignedIds(answer))).toEqual(['n5'])
  })

  it('keeps the order and leaves out duplicates', () => {
    expect(selectionAfterUpload(['n-1', 'n5', 'n-1'], change, assignedIds(answer))).toEqual([
      'n901',
      'n5',
    ])
  })

  it('is empty for an empty selection', () => {
    expect(selectionAfterUpload([], change, assignedIds(answer))).toEqual([])
  })
})
