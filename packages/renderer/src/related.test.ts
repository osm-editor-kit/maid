import { describe, expect, test } from 'bun:test'
import { boundsOf, relatedIds, type MemberRef } from './related'

/** Relations by id, as plain member lists; a relation missing from the map is not loaded */
function relationsOf(relations: Record<string, MemberRef[]>) {
  return (id: string) => relations[id]
}

describe('relatedIds', () => {
  test("a relation's members, the relation itself left out", () => {
    const membersOf = relationsOf({
      r1: [
        { id: 'n1', type: 'node' },
        { id: 'w2', type: 'way' },
        { id: 'r1', type: 'relation' },
      ],
    })
    expect(relatedIds('r1', membersOf)).toEqual(['n1', 'w2'])
  })

  test('the members of a member relation, one level down and not further', () => {
    // a boundary with a multipolygon member (r2), which has a relation member (r3) with a way (w9)
    const membersOf = relationsOf({
      r1: [
        { id: 'w1', type: 'way' },
        { id: 'r2', type: 'relation' },
      ],
      r2: [
        { id: 'w5', type: 'way' },
        { id: 'r3', type: 'relation' },
      ],
      r3: [{ id: 'w9', type: 'way' }],
    })
    expect(relatedIds('r1', membersOf)).toEqual(['w1', 'r2', 'w5', 'r3'])
  })

  test('an id that is both a member and in a nested relation is listed once', () => {
    const membersOf = relationsOf({
      r1: [
        { id: 'w1', type: 'way' },
        { id: 'r2', type: 'relation' },
      ],
      r2: [{ id: 'w1', type: 'way' }],
    })
    expect(relatedIds('r1', membersOf)).toEqual(['w1', 'r2'])
  })

  test('a member relation that points back to the relation does not loop', () => {
    const membersOf = relationsOf({
      r1: [
        { id: 'w1', type: 'way' },
        { id: 'r2', type: 'relation' },
      ],
      r2: [
        { id: 'r1', type: 'relation' },
        { id: 'w2', type: 'way' },
      ],
    })
    expect(relatedIds('r1', membersOf)).toEqual(['w1', 'r2', 'w2'])
  })

  test('a relation that is not loaded covers nothing; a member that is not loaded is still listed', () => {
    expect(relatedIds('r9', relationsOf({}))).toEqual([])
    const membersOf = relationsOf({ r1: [{ id: 'n404', type: 'node' }] })
    expect(relatedIds('r1', membersOf)).toEqual(['n404'])
  })
})

describe('boundsOf', () => {
  // Geometry of a small map: nodes n1..n4 on a square, way w1 along the bottom, w2 with n4 only
  const locs: Record<string, [number, number]> = {
    n1: [13.4, 52.5],
    n2: [13.5, 52.5],
    n3: [13.5, 52.6],
    n4: [13.3, 52.7],
  }
  const ways: Record<string, string[]> = { w1: ['n1', 'n2'], w2: ['n3', 'n4', 'n404'] }
  const relations: Record<string, MemberRef[]> = {
    r1: [
      { id: 'w1', type: 'way' },
      { id: 'n4', type: 'node' },
    ],
    r2: [{ id: 'w2', type: 'way' }],
    r3: [
      { id: 'w1', type: 'way' },
      { id: 'r2', type: 'relation' },
    ],
  }
  const geometry = {
    loc: (id: string) => locs[id],
    nodesOf: (id: string) => ways[id],
    membersOf: relationsOf(relations),
  }

  test('a node is its point, a way is its nodes', () => {
    expect(boundsOf(['n1'], geometry)).toEqual([13.4, 52.5, 13.4, 52.5])
    expect(boundsOf(['w1'], geometry)).toEqual([13.4, 52.5, 13.5, 52.5])
  })

  test('several entities: the box around all of them, unloaded nodes ignored', () => {
    expect(boundsOf(['w1', 'n4', 'n404'], geometry)).toEqual([13.3, 52.5, 13.5, 52.7])
  })

  test('a relation stands for its members and the members of member relations', () => {
    // r3 has w1 and r2; r2 has w2 (n3, n4 and the unloaded n404), so the box grows to n3
    expect(boundsOf(['r3'], geometry)).toEqual([13.3, 52.5, 13.5, 52.7])
    // r2 alone: w2 only
    expect(boundsOf(['r2'], geometry)).toEqual([13.3, 52.6, 13.5, 52.7])
  })

  test('nothing loaded gives no bounds', () => {
    expect(boundsOf(['n404', 'w404', 'r404'], geometry)).toBeUndefined()
    expect(boundsOf([], geometry)).toBeUndefined()
  })
})
