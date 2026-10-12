// Structure-preserving edits of member ways: split, join and reverse keep a route's order and its roles.
// Members are compared by their node strings (`abc` is a way through a, b, c) so the test does not depend on
// which half of a split keeps the original id. Adopted in spirit from iD's actions/split.js, join.js and reverse.js.
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'

const context = new Rapid.MockContext()

const pt = (id: string, x: number, y = 0) => new Rapid.OsmNode(context, { id, loc: [x, y] })
const way = (id: string, nodes: string[]) => new Rapid.OsmWay(context, { id, nodes })
type M = { id: string; type?: 'node' | 'way' | 'relation'; role?: string }
const route = (id: string, members: M[], tags: Record<string, string> = { type: 'route' }) =>
  new Rapid.OsmRelation(context, {
    id,
    tags,
    members: members.map((m) => ({ id: m.id, type: m.type ?? 'way', role: m.role ?? '' })),
  })

/** The members of a relation as node strings (`abc`), or the id for a member that is not loaded. */
function shape(graph: Rapid.Graph, relationID: string): string[] {
  return (graph.entity(relationID) as Rapid.OsmRelation).members.map((m) => {
    const entity = graph.hasEntity(m.id)
    return entity instanceof Rapid.OsmWay ? entity.nodes.join('') : m.id
  })
}
function roles(graph: Rapid.Graph, relationID: string): string[] {
  return (graph.entity(relationID) as Rapid.OsmRelation).members.map((m) => m.role)
}

describe('split of a member way', () => {
  it('keeps the new part right after the old one when the route runs in the way direction', () => {
    // z-a route: w0 (za), w (a-b-c-d), w2 (de). Split at c: the route is za, abc, cd, de.
    const base = new Rapid.Graph(context, [
      pt('z', -1), pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('e', 4),
      way('w0', ['z', 'a']),
      way('w', ['a', 'b', 'c', 'd']),
      way('w2', ['d', 'e']),
      route('r', [{ id: 'w0' }, { id: 'w' }, { id: 'w2' }]),
    ])
    const graph = Rapid.actionSplit('c', ['=(new)'])(new Rapid.Graph(base))
    expect(shape(graph, 'r')).toEqual(['za', 'abc', 'cd', 'de'])
  })

  // F-relations-3: the new part was placed after the old one when the longer half kept the id (split swaps the
  // halves then), because the join decided the order of the pair by the stored node order. Data: route
  // [w2 ed, w dcba, w0 az] split at c. Before the fix: [ed, cba, dc, az]; expected [ed, dc, cba, az].
  // Same class as F-actions-b-36. Maid: differs from Rapid here (F-relations-3).
  it('keeps the new part before the old one when the route runs against the way direction', () => {
    const base = new Rapid.Graph(context, [
      pt('z', -1), pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('e', 4),
      way('w2', ['e', 'd']),
      way('w', ['d', 'c', 'b', 'a']),
      way('w0', ['a', 'z']),
      route('r', [{ id: 'w2' }, { id: 'w' }, { id: 'w0' }]),
    ])
    const graph = Rapid.actionSplit('c', ['=(new)'])(new Rapid.Graph(base))
    expect(shape(graph, 'r')).toEqual(['ed', 'dc', 'cba', 'az'])
  })

  it('keeps the entries of members that are not loaded in place when a loaded member is split', () => {
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3),
      way('w', ['a', 'b', 'c', 'd']),
      route('r', [{ id: 'wM' }, { id: 'w' }, { id: 'wZ' }]),
    ])
    const graph = Rapid.actionSplit('c', ['=(new)'])(new Rapid.Graph(base))
    const members = shape(graph, 'r')
    expect(members[0]).toBe('wM')
    expect(members[members.length - 1]).toBe('wZ')
    expect(members.slice(1, -1).sort()).toEqual(['abc', 'cd'])
  })

  it('places both parts of a way that a route uses in both directions, out and back', () => {
    // a-b (A), b-m-c (B). The route goes out on A and B, comes back on B and A.
    // Splitting B at m: the out leg is bm then mc, the back leg is mc then bm.
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('m', 1.5), pt('c', 2),
      way('A', ['a', 'b']),
      way('B', ['b', 'm', 'c']),
      route('r', [{ id: 'A' }, { id: 'B' }, { id: 'B' }, { id: 'A' }]),
    ])
    const graph = Rapid.actionSplit('m', ['=(new)'])(new Rapid.Graph(base))
    expect(shape(graph, 'r')).toEqual(['ab', 'bm', 'mc', 'mc', 'bm', 'ab'])
  })

  // F-actions-b-31 (iD: simple_roundabout): a closed way in a route is refused. See split.test.ts, `disabled`.
  it.todo('returns simple_roundabout for a closed way in a route', () => {})
})

describe('join of member ways', () => {
  it('joins two member ways into one entry at the place of the first', () => {
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('z', -1),
      way('w0', ['z', 'a']),
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
      way('w3', ['c', 'd']),
      route('r', [{ id: 'w0' }, { id: 'w1' }, { id: 'w2' }, { id: 'w3' }]),
    ])
    const graph = Rapid.actionJoin(['w1', 'w2'])(new Rapid.Graph(base))
    expect(shape(graph, 'r')).toEqual(['za', 'abc', 'cd'])
  })

  it('keeps a member that is not loaded in its place when two member ways are joined around it', () => {
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('c', 2),
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
      route('r', [{ id: 'w1' }, { id: 'wM' }, { id: 'w2' }]),
    ])
    const graph = Rapid.actionJoin(['w1', 'w2'])(new Rapid.Graph(base))
    const members = shape(graph, 'r')
    expect(members).toHaveLength(2)
    expect(members[0]).toBe('abc')
    expect(members[1]).toBe('wM')
  })
})

describe('reverse of member ways', () => {
  it('swaps forward and backward on a way and keeps its place and the other roles', () => {
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('c', 2),
      way('w0', ['a', 'b']),
      way('w1', ['b', 'c']),
      route('r', [{ id: 'w0' }, { id: 'w1', role: 'forward' }, { id: 'w0', role: 'backward' }]),
    ])
    const graph = Rapid.actionReverse('w1')(new Rapid.Graph(base))
    expect(roles(graph, 'r')).toEqual(['', 'backward', 'backward'])
    expect((graph.entity('r') as Rapid.OsmRelation).members.map((m) => m.id)).toEqual(['w0', 'w1', 'w0'])
  })

  it('flips the role of each occurrence of a way that is used twice', () => {
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('c', 2),
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
      route('r', [{ id: 'w1', role: 'forward' }, { id: 'w2' }, { id: 'w1', role: 'backward' }]),
    ])
    const graph = Rapid.actionReverse('w1')(new Rapid.Graph(base))
    expect(roles(graph, 'r')).toEqual(['backward', '', 'forward'])
  })
})
