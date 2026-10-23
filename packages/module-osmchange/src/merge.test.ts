import { describe, expect, test } from 'bun:test'
import { CLOSE_METRES, fileChangeOf, mergeChange, metresBetween, type Status } from './merge.ts'
import type { FileChange, OsmElement, ServerState } from './types.ts'

const node = (
  version: number,
  tags: Record<string, string>,
  lat = 52.4,
  lon = 13.4,
): OsmElement => ({
  type: 'node',
  id: 1,
  version,
  tags,
  lat,
  lon,
})
const modify = (element: OsmElement): FileChange => ({ action: 'modify', element, ifUnused: false })
const remove = (element: OsmElement): FileChange => ({ action: 'delete', element, ifUnused: true })
/** Degrees of latitude for a distance in metres */
const north = (metres: number) => metres / 111_195

describe('tags, per key (StreetComplete rules)', () => {
  const base = node(10, { amenity: 'toilets', fee: 'yes', wheelchair: 'yes' })

  test('the server has the file version: the file applies as it is', () => {
    const merged = mergeChange(
      modify(node(10, { amenity: 'toilets', fee: 'no' })),
      { current: base },
      {},
    )
    expect(merged.status).toBe('clean')
    expect(merged.result).toMatchObject({ version: 10, tags: { amenity: 'toilets', fee: 'no' } })
  })

  test('the server changed another key since: both changes, no question', () => {
    const current = node(12, { ...base.tags, changing_table: 'no', wheelchair: 'limited' })
    const file = node(10, { ...base.tags, fee: 'no' })
    const merged = mergeChange(modify(file), { current, base }, {})
    expect(merged.status).toBe('auto')
    expect(merged.conflicts).toEqual([])
    expect(merged.result).toMatchObject({
      version: 12,
      tags: { amenity: 'toilets', fee: 'no', wheelchair: 'limited', changing_table: 'no' },
    })
    expect(merged.notes).toEqual([
      { id: 'osmchange_note_server_tags', values: { keys: 'changing_table, wheelchair' } },
    ])
  })

  test('both changed a key to the same value, and both removed one: no question', () => {
    const current = node(12, { amenity: 'toilets', fee: 'no' })
    const file = node(10, { amenity: 'toilets', fee: 'no' })
    const merged = mergeChange(modify(file), { current, base }, {})
    expect(merged.status).toBe('skip')
    expect(merged.notes.at(-1)).toEqual({ id: 'osmchange_note_already_applied' })
    expect(merged.result).toBeUndefined()
  })

  test('both changed a key differently: a decision, and the choice is written', () => {
    const current = node(12, { ...base.tags, wheelchair: 'no' })
    const file = node(10, { ...base.tags, wheelchair: 'limited' })
    const open = mergeChange(modify(file), { current, base }, {})
    expect(open.status).toBe('decide')
    expect(open.conflicts).toEqual([
      {
        id: 'n1:tag:wheelchair',
        kind: 'tag',
        key: 'wheelchair',
        base: 'yes',
        file: 'limited',
        current: 'no',
      },
    ])
    expect(open.result).toBeUndefined()
    const mine = mergeChange(modify(file), { current, base }, { 'n1:tag:wheelchair': 'file' })
    expect(mine.result).toMatchObject({ tags: { wheelchair: 'limited' }, version: 12 })
    const theirs = mergeChange(modify(file), { current, base }, { 'n1:tag:wheelchair': 'current' })
    expect(theirs.status).toBe('decide')
    expect(theirs.result).toMatchObject({ tags: { wheelchair: 'no' } })
  })

  test('the file removed a key the server changed: a decision; the file removed an unchanged key: removed', () => {
    const current = node(12, { amenity: 'toilets', fee: 'maybe', wheelchair: 'yes' })
    const file = node(10, { amenity: 'toilets' })
    const merged = mergeChange(modify(file), { current, base }, { 'n1:tag:fee': 'file' })
    expect(merged.conflicts.map((conflict) => conflict.id)).toEqual(['n1:tag:fee'])
    expect(merged.result).toMatchObject({ tags: { amenity: 'toilets' } })
  })

  test('without a base (no version, or the history has none) every differing key is a decision', () => {
    const current = node(12, { amenity: 'toilets', fee: 'yes', changing_table: 'no' })
    const file = node(10, { amenity: 'toilets', fee: 'no' })
    const merged = mergeChange(modify(file), { current }, {})
    expect(merged.conflicts.map((conflict) => conflict.id).sort()).toEqual([
      'n1:tag:changing_table',
      'n1:tag:fee',
    ])
    expect(merged.notes[0]).toEqual({ id: 'osmchange_note_no_base', values: { version: 10 } })
    const { version: _, ...unversioned } = file
    expect(mergeChange(modify(unversioned), { current }, {}).notes[0]!.id).toBe(
      'osmchange_note_no_version',
    )
  })
})

describe('a node position', () => {
  const base = node(10, { amenity: 'bench' })

  test('one side moved it: that side', () => {
    const moved = { ...base, lat: base.lat! + north(10) }
    const serverMoved = mergeChange(modify(base), { current: { ...moved, version: 11 }, base }, {})
    expect(serverMoved.status).toBe('skip')
    const fileMoved = mergeChange(
      modify(moved),
      { current: { ...base, version: 11, tags: { amenity: 'bench', backrest: 'no' } }, base },
      {},
    )
    expect(fileMoved.status).toBe('auto')
    expect(fileMoved.result).toMatchObject({ lat: moved.lat, tags: { backrest: 'no' } })
  })

  test(`both moved it, less than ${CLOSE_METRES} m apart: the file's position, with a note; further: a decision`, () => {
    const server = { ...base, version: 11, lat: base.lat! + north(2) }
    const close = { ...base, lat: base.lat! + north(3.5) }
    const merged = mergeChange(modify(close), { current: server, base }, {})
    expect(merged.status).toBe('auto')
    expect(merged.result).toMatchObject({ lat: close.lat })
    expect(merged.notes).toEqual([{ id: 'osmchange_note_moved_close', values: { metres: 1.5 } }])
    const far = { ...base, lat: base.lat! - north(5) }
    const open = mergeChange(modify(far), { current: server, base }, {})
    expect(open.conflicts).toEqual([{ id: 'n1:position', kind: 'position', metres: 7 }])
    expect(
      mergeChange(modify(far), { current: server, base }, { 'n1:position': 'current' }).result,
    ).toMatchObject({
      lat: server.lat,
    })
  })

  test('metres between two positions', () => {
    expect(Math.round(metresBetween({ lat: 52, lon: 13 }, { lat: 52 + north(100), lon: 13 }))).toBe(
      100,
    )
  })
})

describe('a way and a relation', () => {
  const way = (version: number, nodes: number[]): OsmElement => ({
    type: 'way',
    id: 2,
    version,
    tags: { highway: 'path' },
    nodes,
  })

  test('both changed the node list in different places: merged by diff3', () => {
    const base = way(5, [1, 2, 3, 4, 5])
    const file = way(5, [1, 2, 9, 3, 4, 5])
    const current = way(6, [1, 2, 3, 4, 8, 5])
    const merged = mergeChange(modify(file), { current, base }, {})
    expect(merged.status).toBe('auto')
    expect(merged.result).toMatchObject({ nodes: [1, 2, 9, 3, 4, 8, 5], version: 6 })
    expect(merged.notes).toEqual([{ id: 'osmchange_note_nodes_merged' }])
  })

  test('both changed the same place: a decision', () => {
    const base = way(5, [1, 2, 3])
    const merged = mergeChange(modify(way(5, [1, 7, 3])), { current: way(6, [1, 8, 3]), base }, {})
    expect(merged.conflicts).toEqual([{ id: 'w2:nodes', kind: 'nodes' }])
  })

  test('relation members: one side changed them → that side; both → a decision', () => {
    const relation = (version: number, refs: number[]): OsmElement => ({
      type: 'relation',
      id: 3,
      version,
      tags: { type: 'route' },
      members: refs.map((ref) => ({ type: 'way', ref, role: '' })),
    })
    const base = relation(1, [1, 2])
    const serverOnly = mergeChange(
      modify({ ...relation(1, [1, 2]), tags: { type: 'route', ref: '7' } }),
      { current: relation(2, [1, 2, 3]), base },
      {},
    )
    expect(serverOnly.result).toMatchObject({
      tags: { ref: '7' },
      members: [{ ref: 1 }, { ref: 2 }, { ref: 3 }],
    })
    expect(serverOnly.notes).toEqual([{ id: 'osmchange_note_server_members' }])
    const both = mergeChange(
      modify(relation(1, [2, 1])),
      { current: relation(2, [1, 2, 3]), base },
      {},
    )
    expect(both.conflicts).toEqual([{ id: 'r3:members', kind: 'members' }])
  })
})

describe('deletes and elements deleted on the server', () => {
  const current = node(4, { amenity: 'bench' })

  test('unchanged and unused: deleted', () => {
    expect(mergeChange(remove(node(4, {})), { current }, {})).toMatchObject({
      status: 'clean',
      result: 'delete',
    })
  })

  test('changed on the server since, or still used: a decision that starts on "keep"', () => {
    const changed = mergeChange(remove(node(3, {})), { current }, {})
    expect(changed.conflicts).toEqual([
      { id: 'n1:delete', kind: 'delete', changed: true, usedBy: [], default: 'current' },
    ])
    expect(changed.result).toBeUndefined()
    expect(mergeChange(remove(node(3, {})), { current }, { 'n1:delete': 'file' }).result).toBe(
      'delete',
    )
    const used = mergeChange(remove(node(4, {})), { current }, {}, ['w7'])
    expect(used.conflicts).toMatchObject([{ changed: false, usedBy: ['w7'] }])
  })

  test('deleted on the server: nothing to do, for a delete and for a modify', () => {
    const deleted: ServerState = { current: 'deleted' }
    expect(mergeChange(remove(node(4, {})), deleted, {})).toMatchObject({
      status: 'skip',
      notes: [{ id: 'osmchange_note_already_deleted' }],
    })
    expect(mergeChange(modify(node(4, {})), deleted, {})).toMatchObject({
      status: 'skip',
      notes: [{ id: 'osmchange_note_deleted_on_server' }],
    })
  })
})

// As the combinatorial case of iD #12814: every action of the file against every state of the server
describe('every file action against every server state', () => {
  const base = node(5, { amenity: 'bench', colour: 'red' })
  const serverStates: Record<string, ServerState> = {
    unchanged: { current: base },
    'other key changed': {
      current: { ...base, version: 6, tags: { ...base.tags, backrest: 'yes' } },
      base,
    },
    'same key changed': {
      current: { ...base, version: 6, tags: { ...base.tags, colour: 'blue' } },
      base,
    },
    deleted: { current: 'deleted' },
  }
  const fileChanges: Record<string, FileChange> = {
    modify: modify({ ...base, tags: { ...base.tags, colour: 'green' } }),
    delete: remove(base),
  }
  const expected: Record<string, Record<string, Status>> = {
    modify: {
      unchanged: 'clean',
      'other key changed': 'auto',
      'same key changed': 'decide',
      deleted: 'skip',
    },
    delete: {
      unchanged: 'clean',
      'other key changed': 'decide',
      'same key changed': 'decide',
      deleted: 'skip',
    },
  }
  for (const [action, change] of Object.entries(fileChanges)) {
    for (const [state, server] of Object.entries(serverStates)) {
      test(`${action} × ${state}`, () => {
        expect(mergeChange(change, server, {}).status).toBe(expected[action]![state]!)
      })
    }
  }
  test('create × (no server state): clean', () => {
    const element: OsmElement = { type: 'node', id: -1, tags: {}, lat: 1, lon: 1 }
    expect(
      mergeChange({ action: 'create', element, ifUnused: false }, undefined, {}),
    ).toMatchObject({
      status: 'clean',
      result: element,
    })
  })
})

describe('fileChangeOf', () => {
  const base = node(4, { amenity: 'bench' })
  test('what the file changed against its base: keys, a move in metres', () => {
    const file = { ...base, lat: base.lat! + north(2.1), tags: { amenity: 'bench', colour: 'red' } }
    expect(fileChangeOf(modify(file), { current: { ...base, version: 5 }, base })).toEqual({
      tags: ['colour'],
      metres: 2.1,
      nodes: false,
      members: false,
    })
  })
  test('only moved: no keys; against the server when the file has its version', () => {
    const file = { ...base, lat: base.lat! + north(1) }
    expect(fileChangeOf(modify(file), { current: base })).toEqual({
      tags: [],
      metres: 1,
      nodes: false,
      members: false,
    })
  })
  test('nothing to say for a create, a delete, or without a base of the same version', () => {
    expect(fileChangeOf(remove(base), { current: base })).toBeUndefined()
    expect(fileChangeOf(modify(base), { current: { ...base, version: 9 } })).toBeUndefined()
  })
})
