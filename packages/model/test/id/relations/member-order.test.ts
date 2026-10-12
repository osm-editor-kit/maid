// Member order of relations: adding, removing, moving and changing members, with real-data cases that iD's
// own tests do not cover (a member used twice, a route with members that are not loaded, a stop among ways).
// Expected orders come from the geometry and from the mapping rules, not from what the code returns.
// Adopted in spirit from iD's actions/add_member.js, delete_member.js, change_member.js (ISC, © iD contributors).
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

/** The member ids of a relation, in order. */
function ids(graph: Rapid.Graph, relationID: string): string[] {
  return (graph.entity(relationID) as Rapid.OsmRelation).members.map((m) => m.id)
}
/** The roles of a relation's members, in order. */
function roles(graph: Rapid.Graph, relationID: string): string[] {
  return (graph.entity(relationID) as Rapid.OsmRelation).members.map((m) => m.role)
}
/** The members of a relation as a node string per way (`abc`), and the id for anything not loaded. */
function shape(graph: Rapid.Graph, relationID: string): string[] {
  return (graph.entity(relationID) as Rapid.OsmRelation).members.map((m) => {
    const entity = graph.hasEntity(m.id)
    return entity instanceof Rapid.OsmWay ? entity.nodes.join('') : m.id
  })
}

describe('adding a way to a route', () => {
  // four ways along a line: w1 a-b, w2 b-c, w3 c-d, w4 d-e
  const line = () => [
    pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), pt('e', 4),
    way('w1', ['a', 'b']), way('w2', ['b', 'c']), way('w3', ['c', 'd']), way('w4', ['d', 'e']),
  ]
  const add = (graph: Rapid.Graph, relationID: string, wayID: string, role = '') =>
    Rapid.actionAddMember(relationID, { id: wayID, type: 'way', role })(graph)

  it('appends a way that continues the route at its end', () => {
    const base = new Rapid.Graph(context, [...line(), route('r', [{ id: 'w1' }, { id: 'w2' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w3'), 'r')).toEqual(['w1', 'w2', 'w3'])
  })

  it('puts a way that continues the route at its start first', () => {
    const base = new Rapid.Graph(context, [...line(), route('r', [{ id: 'w2' }, { id: 'w3' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w1'), 'r')).toEqual(['w1', 'w2', 'w3'])
  })

  it('fills the gap between two members that it joins', () => {
    const base = new Rapid.Graph(context, [...line(), route('r', [{ id: 'w1' }, { id: 'w3' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w2'), 'r')).toEqual(['w1', 'w2', 'w3'])
  })

  it('places a way that closes a loop after the last member', () => {
    // a loop a-b-c-d-a: w4 closes it, so it goes last and the loop order is kept
    const nodes = [pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3), way('x1', ['a', 'b']), way('x2', ['b', 'c']), way('x3', ['c', 'd']), way('x4', ['d', 'a'])]
    const base = new Rapid.Graph(context, [...nodes, route('r', [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'x4'), 'r')).toEqual(['x1', 'x2', 'x3', 'x4'])
  })

  it('puts a platform way at the front, as the public transport v2 scheme asks', () => {
    const base = new Rapid.Graph(context, [...line(), route('r', [{ id: 'w1' }])])
    const graph = Rapid.actionAddMember('r', { id: 'w4', type: 'way', role: 'platform' })(new Rapid.Graph(base))
    expect(ids(graph, 'r')).toEqual(['w4', 'w1'])
  })

  it('keeps a stop node before the ways of a public transport route', () => {
    const base = new Rapid.Graph(context, [
      ...line(),
      pt('s', 0.5),
      route('r', [{ id: 'w1' }, { id: 'w2' }]),
    ])
    const graph = Rapid.actionAddMember('r', { id: 's', type: 'node', role: 'stop' })(new Rapid.Graph(base))
    expect(ids(graph, 'r')).toEqual(['s', 'w1', 'w2'])
  })

  // F-relations-1: adding a way moved a member that is not loaded behind the ways after it. Data: route
  // [w1 a-b, wM (not loaded), w3 c-d], add w2 b-c. Before the fix the result was [w1, w2, w3, wM]. Reading iD's
  // add_member.ts, iD has the same join code (not run), so this goes beyond iD. Maid: differs from Rapid here (F-relations-1).
  it('keeps the entries of the members that are not loaded in their order when it fills a gap', () => {
    const base = new Rapid.Graph(context, [...line(), route('r', [{ id: 'w1' }, { id: 'wM' }, { id: 'w3' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w2'), 'r')).toEqual(['w1', 'w2', 'wM', 'w3'])
  })

  it('keeps a missing member at the start of the route in front', () => {
    const base = new Rapid.Graph(context, [...line(), route('r', [{ id: 'wM' }, { id: 'w1' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w2'), 'r')).toEqual(['wM', 'w1', 'w2'])
  })

  it('appends after a missing member at the end without moving it', () => {
    const base = new Rapid.Graph(context, [...line(), route('r', [{ id: 'w1' }, { id: 'wM' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w4'), 'r')).toEqual(['w1', 'wM', 'w4'])
  })

  // F-relations-2: addWayMember regrouped the members by type (nodes first, ways, then relations), so a
  // sub-relation between two ways moved to the end. Data: [w1, R (subarea), w3], add w2. Before the fix the
  // result was [w1, w2, w3, R]. iD has the same join code. Maid: differs from Rapid here (F-relations-2).
  it('keeps a relation member between the ways it was between', () => {
    const subarea = new Rapid.OsmRelation(context, { id: 'R', tags: { type: 'multipolygon' }, members: [] })
    const base = new Rapid.Graph(context, [...line(), subarea, route('r', [{ id: 'w1' }, { id: 'R', type: 'relation' }, { id: 'w3' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w2'), 'r')).toEqual(['w1', 'w2', 'R', 'w3'])
  })

  it('keeps a relation member after the ways when it was last', () => {
    const subarea = new Rapid.OsmRelation(context, { id: 'R', tags: { type: 'multipolygon' }, members: [] })
    const base = new Rapid.Graph(context, [...line(), subarea, route('r', [{ id: 'w1' }, { id: 'w3' }, { id: 'R', type: 'relation' }])])
    expect(ids(add(new Rapid.Graph(base), 'r', 'w2'), 'r')).toEqual(['w1', 'w2', 'w3', 'R'])
  })

  it('removes the first of two entries of the same member by index 0', () => {
    const base = new Rapid.Graph(context, [
      pt('n1', 0),
      way('w1', ['a', 'b']),
      route('r', [{ id: 'n1', type: 'node', role: 'stop' }, { id: 'w1' }, { id: 'n1', type: 'node', role: 'platform' }]),
    ])
    const graph = Rapid.actionDeleteMember('r', 0)(new Rapid.Graph(base))
    expect(roles(graph, 'r')).toEqual(['', 'platform'])
  })

  it('keeps the members that are not loaded, and their order, when a loaded member is removed', () => {
    const base = new Rapid.Graph(context, [
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
      route('r', [{ id: 'w1' }, { id: 'wM' }, { id: 'w2' }]),
    ])
    expect(ids(Rapid.actionDeleteMember('r', 0)(new Rapid.Graph(base)), 'r')).toEqual(['wM', 'w2'])
    expect(ids(Rapid.actionDeleteMember('r', 2)(new Rapid.Graph(base)), 'r')).toEqual(['w1', 'wM'])
  })

  it('removes a member way from the route when the way is deleted, and keeps the others in order', () => {
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('c', 2), pt('d', 3),
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
      way('w3', ['c', 'd']),
      route('r', [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }]),
    ])
    expect(ids(Rapid.actionDeleteWay('w2')(new Rapid.Graph(base)), 'r')).toEqual(['w1', 'w3'])
  })

  it('deletes the route when its last member is removed (iD behaviour, kept on purpose)', () => {
    const base = new Rapid.Graph(context, [way('w1', ['a', 'b']), route('r', [{ id: 'w1' }])])
    const graph = Rapid.actionDeleteMember('r', 0)(new Rapid.Graph(base))
    expect(graph.hasEntity('r')).toBeUndefined()
  })
})

describe('moving and changing members', () => {
  it('moves a member one place down and keeps the others in order', () => {
    const base = new Rapid.Graph(context, [
      way('w1', ['a', 'b']), way('w2', ['b', 'c']), way('w3', ['c', 'd']),
      route('r', [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }]),
    ])
    expect(ids(Rapid.actionMoveMember('r', 0, 1)(new Rapid.Graph(base)), 'r')).toEqual(['w2', 'w1', 'w3'])
  })

  it('moves a loaded member past a member that is not loaded, without changing the missing one', () => {
    const base = new Rapid.Graph(context, [
      way('w1', ['a', 'b']), way('w2', ['b', 'c']),
      route('r', [{ id: 'w1' }, { id: 'wM' }, { id: 'w2' }]),
    ])
    const members = ids(Rapid.actionMoveMember('r', 2, 0)(new Rapid.Graph(base)), 'r')
    expect(members).toEqual(['w2', 'w1', 'wM'])
  })

  it('changes the role of one entry when the member occurs twice', () => {
    const base = new Rapid.Graph(context, [
      pt('n1', 0),
      way('w1', ['a', 'b']),
      route('r', [{ id: 'n1', type: 'node', role: 'stop' }, { id: 'w1' }, { id: 'n1', type: 'node', role: 'stop' }]),
    ])
    const graph = Rapid.actionChangeMember('r', { id: 'n1', type: 'node', role: 'platform' }, 2)(new Rapid.Graph(base))
    expect(roles(graph, 'r')).toEqual(['stop', '', 'platform'])
  })

  it('shows the shape of a route with a missing member in the test helper', () => {
    const base = new Rapid.Graph(context, [way('w1', ['a', 'b']), route('r', [{ id: 'w1' }, { id: 'wM' }])])
    expect(shape(base, 'r')).toEqual(['ab', 'wM'])
  })
})
