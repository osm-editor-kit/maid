import { describe, expect, it } from 'bun:test'
import {
  actionMoveMember,
  type Action,
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import type { RelationRoles } from '@osm-editor-kit/maid-presets'
import {
  cannotTakeReason,
  connectedRelationIds,
  creationOrder,
  DUPLICATE_REASON,
  geometryOfEntity,
  INVALID_REASON,
  joinableRelations,
  relationRolesOf,
  roleFromText,
  roleLabel,
  roleOptionsFor,
  roleToAdd,
  type RelationRules,
  loadButtonLabel,
  loadedRelations,
  loadFailureSentence,
  loadingLabel,
  loadResultSentence,
  memberLoadPath,
  newRelationActions,
  placementOf,
  placementSentence,
  memberLabel,
  memberName,
  memberRows,
  membershipHint,
  membershipsOf,
  membersHeadline,
  moveTarget,
  relationLabel,
  roleSuggestions,
  routeGaps,
  routeJoins,
  sortNearbyFirst,
} from './relations-logic.ts'

const context = new ModelContext()

function relation(
  id: string,
  tags: Record<string, string>,
  members: { id: string; type: 'node' | 'way' | 'relation'; role: string }[] = [],
) {
  return new OsmRelation(context, { id, tags, members })
}

function way(id: string, nodes: string[], tags: Record<string, string> = {}) {
  return new OsmWay(context, { id, nodes, tags })
}

/** Runs the actions one after another on a staging copy of `base`, as the history does, and returns the result. */
function applyAll(base: Graph, actions: readonly Action[]) {
  return actions.reduce<Graph>((graph, action) => action(graph), new Graph(base))
}

function relationIn(graph: Graph, id: EntityID): OsmRelation {
  const found = graph.hasEntity(id)
  if (!(found instanceof OsmRelation)) throw new Error(`no relation ${id} in the graph`)
  return found
}

describe('loadedRelations', () => {
  it('lists the relations of the base data and skips other entities', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }),
      relation('r2', { name: 'Two' }),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmWay(context, { id: 'w1', nodes: ['n1'], tags: {} }),
    ])
    expect(
      loadedRelations(base)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['r1', 'r2'])
  })

  it('uses the local version of a relation that was edited, and drops a deleted one', () => {
    const base = new Graph(context, [
      relation('r1', { name: 'Old' }),
      relation('r2', { name: 'Gone' }),
    ])
    const local = new Graph(base)
    local.replace(relation('r1', { name: 'New' }))
    local.remove(base.entity('r2'))
    const relations = loadedRelations(local)
    expect(relations.map((r) => r.id)).toEqual(['r1'])
    expect(relations[0]?.tags.name).toBe('New')
  })

  it('includes a relation that only exists in the local edits', () => {
    const base = new Graph(context, [relation('r1', { name: 'Base' })])
    const local = new Graph(base)
    local.replace(relation('r9', { name: 'Added' }))
    expect(
      loadedRelations(local)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['r1', 'r9'])
  })
})

describe('relationLabel', () => {
  it('uses the name first', () => {
    expect(relationLabel(relation('r1', { name: 'Ring road', ref: 'A1', type: 'route' }))).toBe(
      'Ring road',
    )
  })

  it('uses the ref as iD does', () => {
    expect(relationLabel(relation('r1', { ref: '100', type: 'route' }))).toBe('100')
  })

  it('uses the type alone when there is no name or ref', () => {
    expect(relationLabel(relation('r1', { type: 'multipolygon' }))).toBe('multipolygon')
  })

  it('falls back to "Relation" and ignores blank tags', () => {
    expect(relationLabel(relation('r1', {}))).toBe('Relation')
    expect(relationLabel(relation('r1', { name: '  ', ref: '' }))).toBe('Relation')
  })

  it('uses the ref alone when there is no type', () => {
    expect(relationLabel(relation('r1', { ref: '7' }))).toBe('7')
  })
})

describe('memberLabel', () => {
  it('uses the name, else the main tag, else nothing', () => {
    expect(memberLabel({ name: 'Main Street', highway: 'residential' })).toBe('Main Street')
    expect(memberLabel({ highway: 'residential', source: 'survey' })).toBe('highway=residential')
    expect(memberLabel({ source: 'survey' })).toBeUndefined()
    expect(memberLabel(undefined)).toBeUndefined()
  })
})

describe('membershipsOf', () => {
  it('lists each parent relation with the member index and role', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: '' },
        { id: 'n1', type: 'node', role: 'stop' },
      ]),
      relation('r2', { type: 'site' }, [{ id: 'n1', type: 'node', role: 'member' }]),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmWay(context, { id: 'w1', nodes: ['n1'], tags: {} }),
    ])
    const found = membershipsOf(base, 'n1').map((m) => [m.relation.id, m.index, m.role])
    expect(found).toEqual([
      ['r1', 1, 'stop'],
      ['r2', 0, 'member'],
    ])
  })

  it('gives an entity that is in one relation twice two entries', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'n1', type: 'node', role: 'stop' },
        { id: 'w1', type: 'way', role: '' },
        { id: 'n1', type: 'node', role: 'platform' },
      ]),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmWay(context, { id: 'w1', nodes: ['n1'], tags: {} }),
    ])
    const found = membershipsOf(base, 'n1').map((m) => [m.index, m.role])
    expect(found).toEqual([
      [0, 'stop'],
      [2, 'platform'],
    ])
  })

  it('forgets a relation that was deleted in the local edits', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [{ id: 'n1', type: 'node', role: 'stop' }]),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
    ])
    const local = new Graph(base)
    local.remove(base.entity('r1'))
    expect(membershipsOf(local, 'n1')).toEqual([])
  })

  it('is empty for an entity that is in no relation or does not exist', () => {
    const base = new Graph(context, [new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} })])
    expect(membershipsOf(base, 'n1')).toEqual([])
    expect(membershipsOf(base, 'n404')).toEqual([])
  })
})

describe('joinableRelations', () => {
  it('leaves out the entity itself and the relations it is already in; the rest in creation order', () => {
    const base = new Graph(context, [
      relation('r1', { name: 'Zeta' }, [{ id: 'n1', type: 'node', role: '' }]),
      relation('r2', { name: 'Alpha' }),
      relation('r3', { ref: '5', type: 'route' }),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
    ])
    // iD: no label sort. The newest (highest id) first, as creationOrder gives
    expect(joinableRelations(base, ['n1']).map((r) => r.id)).toEqual(['r3', 'r2'])
  })

  it('leaves out a relation only when it holds every selected entity', () => {
    const base = new Graph(context, [
      relation('r1', {}, [{ id: 'n1', type: 'node', role: '' }]),
      relation('r2', {}, [
        { id: 'n1', type: 'node', role: '' },
        { id: 'n2', type: 'node', role: '' },
      ]),
      relation('r3', {}, [{ id: 'n2', type: 'node', role: '' }]),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n2', loc: [0, 0], tags: {} }),
    ])
    // r1 holds n1 only, r2 both, r3 n2 only: with both selected, r2 is left out
    expect(joinableRelations(base, ['n1', 'n2']).map((r) => r.id)).toEqual(['r3', 'r1'])
  })

  it('offers nothing for an empty selection', () => {
    const base = new Graph(context, [relation('r1', {})])
    expect(joinableRelations(base, [])).toEqual([])
  })

  it('puts the relations connected to the selection first', () => {
    const base = new Graph(context, [
      relation('r1', {}, [{ id: 'w9', type: 'way', role: '' }]),
      relation('r2', {}, [{ id: 'w1', type: 'way', role: '' }]),
      relation('r3', {}, [{ id: 'w8', type: 'way', role: '' }]),
      way('w1', ['a', 'b']),
      way('w8', ['x', 'y']),
      way('w9', ['b', 'z']),
      new OsmNode(context, { id: 'a', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'b', loc: [0, 0], tags: {} }),
    ])
    // w9 shares node b with the selected way w1, so r1 is connected; r3 is not
    expect(joinableRelations(base, ['w1']).map((r) => r.id)).toEqual(['r1', 'r3'])
  })
})

describe('connectedRelationIds', () => {
  it('finds the relations of the ways that share a node with a selected node', () => {
    const base = new Graph(context, [
      relation('r1', {}, [{ id: 'w1', type: 'way', role: '' }]),
      relation('r2', {}, [{ id: 'w2', type: 'way', role: '' }]),
      way('w1', ['n1', 'n2']),
      way('w2', ['n3', 'n4']),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n2', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n3', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n4', loc: [0, 0], tags: {} }),
    ])
    expect([...connectedRelationIds(base, ['n1'])]).toEqual(['r1'])
  })

  it('for a selected way, looks at the ways that share its nodes, not the selected way itself', () => {
    const base = new Graph(context, [
      relation('r1', {}, [{ id: 'w2', type: 'way', role: '' }]),
      relation('r2', {}, [{ id: 'w1', type: 'way', role: '' }]),
      way('w1', ['n1', 'n2']),
      way('w2', ['n2', 'n3']),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n2', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n3', loc: [0, 0], tags: {} }),
    ])
    // r1 holds w2, which touches w1 at n2; r2 holds only the selected w1 itself
    expect([...connectedRelationIds(base, ['w1'])]).toEqual(['r1'])
  })

  it('finds nothing when no way of a relation touches the selection, and ignores ids not in the graph', () => {
    const base = new Graph(context, [
      relation('r1', {}, [{ id: 'w9', type: 'way', role: '' }]),
      way('w9', ['q1', 'q2']),
      way('w1', ['n1', 'n2']),
      new OsmNode(context, { id: 'q1', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'q2', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'n2', loc: [0, 0], tags: {} }),
    ])
    expect([...connectedRelationIds(base, ['w1', 'n404'])]).toEqual([])
  })
})

describe('creationOrder', () => {
  it('puts the relations made here first, the newest of them first', () => {
    expect(creationOrder('r-1', 'r-3')).toBeGreaterThan(0)
    expect(creationOrder('r-3', 'r-1')).toBeLessThan(0)
    expect(creationOrder('r-1', 'r12')).toBeLessThan(0)
  })

  it('puts the loaded relations after them, the highest id first', () => {
    expect(creationOrder('r12', 'r7')).toBeLessThan(0)
    expect(creationOrder('r7', 'r12')).toBeGreaterThan(0)
    expect(creationOrder('r7', 'r7')).toBe(0)
  })
})

describe('sortNearbyFirst', () => {
  it('lists the connected relations first, then the others in creation order', () => {
    const relations = [
      relation('r5', {}),
      relation('r9', {}),
      relation('r-2', {}),
      relation('r3', {}),
      relation('r-1', {}),
    ]
    const sorted = sortNearbyFirst(relations, new Set(['r3', 'r5']))
    // among the new relations the more negative id (made later) comes first, as iD's creationOrder
    expect(sorted.map((r) => r.id)).toEqual(['r5', 'r3', 'r-2', 'r-1', 'r9'])
  })

  it('does not change the list it is given', () => {
    const relations = [relation('r1', {}), relation('r2', {})]
    sortNearbyFirst(relations, new Set(['r1']))
    expect(relations.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('keeps the creation order when nothing is connected', () => {
    const relations = [relation('r1', {}), relation('r4', {}), relation('r2', {})]
    expect(sortNearbyFirst(relations, new Set()).map((r) => r.id)).toEqual(['r4', 'r2', 'r1'])
  })
})

describe('newRelationActions', () => {
  it('makes an untagged relation with the entities as members, in order, with the role', () => {
    const base = new Graph(context, [
      way('w1', ['a', 'b']),
      new OsmNode(context, { id: 'a', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'b', loc: [0, 0], tags: {} }),
    ])
    const { relation: created, actions } = newRelationActions(
      base,
      [{ id: 'w1', type: 'way' }],
      'outer',
    )
    expect(created.id).toMatch(/^r-\d+$/)
    const after = applyAll(base, actions)
    const made = relationIn(after, created.id)
    expect(made.tags).toEqual({})
    expect(made.members).toEqual([{ id: 'w1', type: 'way', role: 'outer' }])
  })

  it('adds several entities in the order given, nodes and ways alike, with an empty role', () => {
    const base = new Graph(context, [
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
      new OsmNode(context, { id: 'a', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'b', loc: [0, 0], tags: {} }),
      new OsmNode(context, { id: 'c', loc: [0, 0], tags: {} }),
    ])
    const { relation: created, actions } = newRelationActions(
      base,
      [
        { id: 'w2', type: 'way' },
        { id: 'a', type: 'node' },
        { id: 'w1', type: 'way' },
      ],
      '',
    )
    const after = applyAll(base, actions)
    const made = relationIn(after, created.id)
    expect(made.members.map((m) => m.id).sort()).toEqual(['a', 'w1', 'w2'])
    expect(made.members.every((m) => m.role === '')).toBe(true)
    expect(made.members.find((m) => m.id === 'a')?.type).toBe('node')
  })
})

describe('memberLoadPath', () => {
  it('asks for a node by its own call and a way or a relation with /full, as iD does', () => {
    expect(memberLoadPath('n5')).toBe('/api/0.6/node/5.json')
    expect(memberLoadPath('w7')).toBe('/api/0.6/way/7/full.json')
    expect(memberLoadPath('r9')).toBe('/api/0.6/relation/9/full.json')
  })

  it('has no path for a feature made here (negative id) or an id that is not an element', () => {
    expect(memberLoadPath('n-1')).toBeUndefined()
    expect(memberLoadPath('r-3')).toBeUndefined()
    expect(memberLoadPath('x1')).toBeUndefined()
    expect(memberLoadPath('r')).toBeUndefined()
  })
})

describe('memberRows', () => {
  it('lists every member in order with its index, role and label, and keeps the ones not loaded', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: 'forward' },
        { id: 'w9', type: 'way', role: '' },
        { id: 'n1', type: 'node', role: 'stop' },
      ]),
      way('w1', ['a', 'b'], { name: 'Main Street' }),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: { highway: 'bus_stop' } }),
    ])
    const rows = memberRows(base, relationIn(base, 'r1'))
    expect(rows).toEqual([
      { index: 0, id: 'w1', type: 'way', role: 'forward', loaded: true, label: 'Main Street' },
      { index: 1, id: 'w9', type: 'way', role: '', loaded: false, label: undefined },
      { index: 2, id: 'n1', type: 'node', role: 'stop', loaded: true, label: 'highway=bus_stop' },
    ])
  })

  it('gives a member that occurs twice two rows with their own index', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: 'a' },
        { id: 'w1', type: 'way', role: 'b' },
      ]),
      way('w1', ['a', 'b']),
    ])
    expect(memberRows(base, relationIn(base, 'r1')).map((row) => [row.index, row.role])).toEqual([
      [0, 'a'],
      [1, 'b'],
    ])
  })
})

describe('membersHeadline', () => {
  it('says how many members, and how many are not loaded', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: '' },
        { id: 'w2', type: 'way', role: '' },
        { id: 'w3', type: 'way', role: '' },
      ]),
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
    ])
    expect(membersHeadline(memberRows(base, relationIn(base, 'r1')))).toBe(
      '3 members, 1 not loaded',
    )
  })

  it('leaves out the missing count when every member is loaded, and handles one and none', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [{ id: 'w1', type: 'way', role: '' }]),
      relation('r2', { type: 'route' }),
      way('w1', ['a', 'b']),
    ])
    expect(membersHeadline(memberRows(base, relationIn(base, 'r1')))).toBe('1 member')
    expect(membersHeadline(memberRows(base, relationIn(base, 'r2')))).toBe('0 members')
  })
})

describe('moveTarget', () => {
  it('moves one step up or down, and is undefined at the ends', () => {
    expect(moveTarget(3, 1, 'up')).toBe(0)
    expect(moveTarget(3, 1, 'down')).toBe(2)
    expect(moveTarget(3, 0, 'up')).toBeUndefined()
    expect(moveTarget(3, 2, 'down')).toBeUndefined()
    expect(moveTarget(1, 0, 'up')).toBeUndefined()
    expect(moveTarget(1, 0, 'down')).toBeUndefined()
  })
})

describe('moving members (the order the list shows after actionMoveMember)', () => {
  function orderOf(graph: Graph, relationID: EntityID) {
    return memberRows(graph, relationIn(graph, relationID)).map((row) => [row.id, row.role])
  }
  /** The graph after moving a member of r1, as an edit does it: on a local graph, not the base. */
  function moveIn(base: Graph, from: number, to: number): Graph {
    return actionMoveMember('r1', from, to)(new Graph(base))
  }

  it('keeps a member that is not loaded as it is when a loaded one moves past it', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: '' },
        { id: 'wM', type: 'way', role: 'forward' },
        { id: 'w3', type: 'way', role: '' },
      ]),
      way('w1', ['a', 'b']),
      way('w3', ['c', 'd']),
    ])
    // w1 moves down past wM: wM takes index 0 and keeps its id and role
    const down = moveIn(base, 0, 1)
    expect(orderOf(down, 'r1')).toEqual([
      ['wM', 'forward'],
      ['w1', ''],
      ['w3', ''],
    ])
    expect(memberRows(down, relationIn(down, 'r1'))[0]?.loaded).toBe(false)
    // w3 moves up past wM: the loaded members keep their order, wM keeps its entry
    const up = moveIn(base, 2, 1)
    expect(orderOf(up, 'r1')).toEqual([
      ['w1', ''],
      ['w3', ''],
      ['wM', 'forward'],
    ])
  })

  it('moves the occurrence at the given index when a member is in the relation twice', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: 'a' },
        { id: 'w2', type: 'way', role: '' },
        { id: 'w1', type: 'way', role: 'b' },
      ]),
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
    ])
    const moved = moveIn(base, 2, 1)
    expect(orderOf(moved, 'r1')).toEqual([
      ['w1', 'a'],
      ['w1', 'b'],
      ['w2', ''],
    ])
  })
})

describe('routeJoins and routeGaps', () => {
  /** A route of the given members (ways by id, with their nodes), loaded into a graph. */
  function route(
    members: { id: string; type?: 'way' | 'node'; role?: string }[],
    ways: Record<string, string[]>,
    type = 'route',
  ) {
    const graph = new Graph(context, [
      relation(
        'r1',
        { type },
        members.map((m) => ({ id: m.id, type: m.type ?? 'way', role: m.role ?? '' })),
      ),
      ...Object.entries(ways).map(([id, nodes]) => way(id, nodes)),
    ])
    return { graph, relation: relationIn(graph, 'r1') }
  }

  it('finds no gap in a continuous chain', () => {
    const { graph, relation } = route([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }], {
      w1: ['a', 'b'],
      w2: ['b', 'c'],
      w3: ['c', 'd'],
    })
    expect(routeGaps(graph, relation)).toEqual([])
    expect(routeJoins(graph, relation)).toEqual([
      { index: 0, join: 'connected' },
      { index: 1, join: 'connected' },
    ])
  })

  it('reports the index before a gap and nothing else', () => {
    const { graph, relation } = route([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }], {
      w1: ['a', 'b'],
      w2: ['c', 'd'],
      w3: ['d', 'e'],
    })
    expect(routeGaps(graph, relation)).toEqual([0])
  })

  it('judges a way that is in the route twice at each position', () => {
    const loop = route([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w1' }], {
      w1: ['a', 'b'],
      w2: ['b', 'c'],
      w3: ['c', 'a'],
    })
    expect(routeGaps(loop.graph, loop.relation)).toEqual([])
    const broken = route([{ id: 'w1' }, { id: 'w2' }, { id: 'w1' }], {
      w1: ['a', 'b'],
      w2: ['c', 'd'],
    })
    expect(routeGaps(broken.graph, broken.relation)).toEqual([0, 1])
  })

  it('connects a way to the next one anywhere along a roundabout', () => {
    // w3 starts at y, a node in the middle of the roundabout, not at one of its ends
    const joined = route([{ id: 'w1' }, { id: 'R' }, { id: 'w3' }], {
      w1: ['a', 'b'],
      R: ['b', 'x', 'y', 'z', 'b'],
      w3: ['y', 'e'],
    })
    expect(routeJoins(joined.graph, joined.relation)).toEqual([
      { index: 0, join: 'connected' },
      { index: 1, join: 'connected' },
    ])
    const apart = route([{ id: 'w1' }, { id: 'R' }, { id: 'w3' }], {
      w1: ['a', 'b'],
      R: ['b', 'x', 'y', 'z', 'b'],
      w3: ['q', 'r'],
    })
    expect(routeGaps(apart.graph, apart.relation)).toEqual([1])
  })

  it('skips stops, platforms and node members when it looks for the chain', () => {
    const { graph, relation } = route(
      [
        { id: 'w1' },
        { id: 'n1', type: 'node', role: 'stop' },
        { id: 'wp', role: 'platform' },
        { id: 'wq', role: 'platform_entry_only' },
        { id: 'w2' },
      ],
      { w1: ['a', 'b'], wp: ['x', 'y'], wq: ['x', 'z'], w2: ['b', 'c'] },
    )
    expect(routeJoins(graph, relation)).toEqual([{ index: 0, join: 'connected' }])
    expect(routeGaps(graph, relation)).toEqual([])
  })

  it('treats a member that is not loaded as unknown, not as a gap', () => {
    const { graph, relation } = route([{ id: 'w1' }, { id: 'wM' }, { id: 'w3' }], {
      w1: ['a', 'b'],
      w3: ['c', 'd'],
    })
    expect(routeJoins(graph, relation)).toEqual([
      { index: 0, join: 'unknown' },
      { index: 1, join: 'unknown' },
    ])
    expect(routeGaps(graph, relation)).toEqual([])
  })

  it('checks only routes: a route_master or a multipolygon has no chain', () => {
    const master = route(
      [{ id: 'w1' }, { id: 'w2' }],
      { w1: ['a', 'b'], w2: ['c', 'd'] },
      'route_master',
    )
    expect(routeGaps(master.graph, master.relation)).toEqual([])
    const polygon = route(
      [{ id: 'w1' }, { id: 'w2' }],
      { w1: ['a', 'b'], w2: ['c', 'd'] },
      'multipolygon',
    )
    expect(routeJoins(polygon.graph, polygon.relation)).toEqual([])
  })
})

describe('roleSuggestions', () => {
  it('offers the roles the members use, most frequent first, then the built-in roles of the type', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: 'forward' },
        { id: 'w2', type: 'way', role: 'backward' },
        { id: 'w3', type: 'way', role: 'forward' },
        { id: 'n1', type: 'node', role: 'stop' },
        { id: 'n2', type: 'node', role: 'stop' },
        { id: 'w4', type: 'way', role: '' },
      ]),
    ])
    expect(roleSuggestions(relationIn(base, 'r1'))).toEqual([
      'forward',
      'stop',
      'backward',
      'platform',
      'stop_entry_only',
      'stop_exit_only',
      'platform_entry_only',
      'platform_exit_only',
    ])
  })

  it('puts a role the members use before the built-in ones, and does not offer an empty role', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'multipolygon' }, [{ id: 'w1', type: 'way', role: 'north' }]),
    ])
    expect(roleSuggestions(relationIn(base, 'r1'))).toEqual(['north', 'outer', 'inner'])
  })

  it('offers the built-in roles of each type and nothing for an unknown type', () => {
    const types: [string, string[]][] = [
      ['restriction', ['from', 'via', 'to']],
      ['site', ['perimeter', 'entrance', 'label']],
      ['associatedStreet', ['street', 'house']],
      ['boundary', ['outer', 'inner', 'admin_centre', 'label']],
      ['constructor', []],
      ['something-else', []],
    ]
    for (const [type, expected] of types) {
      const base = new Graph(context, [relation('r1', { type }, [])])
      expect(roleSuggestions(relationIn(base, 'r1'))).toEqual(expected)
    }
  })
})

describe('placementOf and placementSentence', () => {
  const m = (id: string, role = '') => ({ id, role })

  it('finds an insertion in the middle, with its neighbours', () => {
    const placement = placementOf([m('w1'), m('w2')], [m('w1'), m('w9'), m('w2')], 'w9')
    expect(placement).toEqual({
      index: 1,
      count: 3,
      before: m('w1'),
      after: m('w2'),
    })
  })

  it('finds an insertion at the start and at the end', () => {
    expect(placementOf([m('w1'), m('w2')], [m('w9'), m('w1'), m('w2')], 'w9')).toEqual({
      index: 0,
      count: 3,
      before: undefined,
      after: m('w1'),
    })
    expect(placementOf([m('w1'), m('w2')], [m('w1'), m('w2'), m('w9')], 'w9')).toEqual({
      index: 2,
      count: 3,
      before: m('w2'),
      after: undefined,
    })
  })

  it('finds nothing when the change is not a single insertion, or the length is wrong', () => {
    // the add also moved w2 in front of w1
    expect(placementOf([m('w1'), m('w2')], [m('w2'), m('w1'), m('w9')], 'w9')).toBeUndefined()
    expect(placementOf([m('w1')], [m('w1'), m('w9'), m('w9')], 'w9')).toBeUndefined()
    expect(placementOf([m('w1')], [m('w1')], 'w9')).toBeUndefined()
  })

  it('writes the sentence for a middle, a start, an end and a relation of one member', () => {
    const name = (member: { id: string }) => member.id
    const middle = { index: 6, count: 12, before: m('w1'), after: m('w2') }
    expect(placementSentence(middle, name)).toBe('Added as member 7 of 12, between w1 and w2')
    expect(placementSentence({ ...middle, before: undefined }, name)).toBe(
      'Added as member 7 of 12, at the start',
    )
    expect(placementSentence({ ...middle, after: undefined }, name)).toBe(
      'Added as member 7 of 12, at the end',
    )
    expect(
      placementSentence({ index: 0, count: 1, before: undefined, after: undefined }, name),
    ).toBe('Added as the only member')
  })

  it('names a member by its label when it is loaded, and by its id when it is not', () => {
    const graph = new Graph(context, [
      way('w1', ['a', 'b'], { name: 'Main Street' }),
      way('w2', ['b', 'c']),
    ])
    expect(memberName(graph, m('w1'))).toBe('Main Street')
    expect(memberName(graph, m('w2'))).toBe('w2')
    expect(memberName(graph, m('w404'))).toBe('w404')
  })
})

describe('membershipHint', () => {
  it('warns about the only from or to way of a restriction', () => {
    const restriction = relation('r1', { type: 'restriction' }, [
      { id: 'w1', type: 'way', role: 'from' },
      { id: 'n5', type: 'node', role: 'via' },
      { id: 'w2', type: 'way', role: 'to' },
    ])
    expect(membershipHint(restriction, 0)).toBe('Deleting this way breaks the turn restriction')
    expect(membershipHint(restriction, 2)).toBe('Deleting this way breaks the turn restriction')
    expect(membershipHint(restriction, 1)).toBeUndefined()
  })

  it('says nothing for a from or to way when another member has the same role', () => {
    const restriction = relation('r1', { type: 'restriction' }, [
      { id: 'w1', type: 'way', role: 'from' },
      { id: 'w3', type: 'way', role: 'from' },
    ])
    expect(membershipHint(restriction, 0)).toBeUndefined()
  })

  it('warns about an outer way of a multipolygon, but not an inner one or a node', () => {
    const polygon = relation('r1', { type: 'multipolygon' }, [
      { id: 'w1', type: 'way', role: 'outer' },
      { id: 'w2', type: 'way', role: 'inner' },
      { id: 'n1', type: 'node', role: 'outer' },
    ])
    expect(membershipHint(polygon, 0)).toBe(
      'Deleting this way removes an outer ring of the multipolygon',
    )
    expect(membershipHint(polygon, 1)).toBeUndefined()
    expect(membershipHint(polygon, 2)).toBeUndefined()
    expect(membershipHint(polygon, 9)).toBeUndefined()
  })
})

describe('loading the missing members', () => {
  it('the button and the busy label count the members', () => {
    expect(loadButtonLabel(1)).toBe('Load the 1 missing member')
    expect(loadButtonLabel(12)).toBe('Load the 12 missing members')
    expect(loadingLabel(12)).toBe('Loading 12 members')
    expect(loadingLabel(1)).toBe('Loading 1 member')
  })

  it('nothing is said when every member came', () => {
    expect(loadResultSentence(5, 0)).toBeUndefined()
  })

  it('the API did not return the rest: loading again will not help', () => {
    expect(loadResultSentence(0, 3)).toBe('Loaded nothing: 3 members are not in the API.')
    expect(loadResultSentence(0, 1)).toBe('Loaded nothing: the missing member is not in the API.')
    expect(loadResultSentence(4, 1)).toBe('Loaded 4 members; the other member is not in the API.')
    expect(loadResultSentence(1, 2)).toBe('Loaded 1 member; 2 members are not in the API.')
  })

  it('a failure names the reason', () => {
    expect(loadFailureSentence('OSM API answered 404')).toBe(
      'Could not load the members: OSM API answered 404',
    )
  })
})

/**
 * A stub of the presets' relation rules: a restriction-like schema with `from` (label "von", a highway line),
 * `via` (no label, a vertex or a line) and `to` (label "nach", a highway line). Duplicates are off unless said.
 */
const restrictionRoles: RelationRoles = {
  from: {
    label: 'von',
    member: { role: 'from', geometry: ['line'], matchTags: [{ highway: '*' }] },
  },
  via: { label: '', member: { role: 'via', geometry: ['vertex', 'line'] } },
  to: {
    label: 'nach',
    member: { role: 'to', geometry: ['line'], matchTags: [{ highway: '*' }] },
  },
}

function rules(roles: RelationRoles, allowDuplicates = false): RelationRules {
  return { relationRoles: () => roles, allowsDuplicateMembers: () => allowDuplicates }
}

describe('relationRolesOf and roleLabel', () => {
  it('reads the roles from the presets, and none without presets', () => {
    expect(relationRolesOf(undefined, { type: 'restriction' })).toEqual({})
    expect(relationRolesOf(rules(restrictionRoles), { type: 'restriction' })).toBe(restrictionRoles)
  })

  it('shows the label of a role that has one, and the role itself when it has none', () => {
    expect(roleLabel(restrictionRoles, 'from')).toBe('von')
    expect(roleLabel(restrictionRoles, 'via')).toBe('via')
  })

  it('shows an unknown role as it is stored, and never a prototype property as a label', () => {
    expect(roleLabel(restrictionRoles, 'stop')).toBe('stop')
    expect(roleLabel({}, 'constructor')).toBe('constructor')
  })
})

describe('roleFromText', () => {
  it('stores the key of the role whose label is typed', () => {
    expect(roleFromText(restrictionRoles, 'von')).toBe('from')
    expect(roleFromText(restrictionRoles, ' nach ')).toBe('to')
  })

  it('keeps a key as it is, and an unknown role as typed (trimmed)', () => {
    expect(roleFromText(restrictionRoles, 'from')).toBe('from')
    expect(roleFromText(restrictionRoles, '  stop ')).toBe('stop')
  })

  it('never matches an empty label, and matches labels exactly (case counts)', () => {
    expect(roleFromText(restrictionRoles, '')).toBe('')
    expect(roleFromText(restrictionRoles, 'Von')).toBe('Von')
  })

  it('keeps the typed text when there is no schema', () => {
    expect(roleFromText({}, 'von')).toBe('von')
  })
})

describe('roleOptionsFor', () => {
  const suggestions = ['from', 'via', 'to', 'stop', 'forward']

  it('offers the schema roles that fit the geometry first, with their labels, then the rest', () => {
    expect(roleOptionsFor(suggestions, restrictionRoles, 'line')).toEqual([
      { role: 'from', label: 'von' },
      { role: 'via' },
      { role: 'to', label: 'nach' },
      { role: 'stop' },
      { role: 'forward' },
    ])
  })

  it('leaves out only the roles offered first: a schema role that does not fit keeps its label', () => {
    expect(roleOptionsFor(suggestions, restrictionRoles, 'vertex')).toEqual([
      { role: 'via' },
      { role: 'from', label: 'von' },
      { role: 'to', label: 'nach' },
      { role: 'stop' },
      { role: 'forward' },
    ])
  })

  it('offers every schema role when there is no geometry (no member, or several features)', () => {
    expect(roleOptionsFor(suggestions, restrictionRoles, undefined)).toEqual([
      { role: 'from', label: 'von' },
      { role: 'via' },
      { role: 'to', label: 'nach' },
      { role: 'stop' },
      { role: 'forward' },
    ])
  })

  it('offers nothing from the schema for a geometry no role takes, only the usual suggestions', () => {
    expect(roleOptionsFor(['stop'], restrictionRoles, 'area')).toEqual([{ role: 'stop' }])
    expect(roleOptionsFor(['from', 'to', 'stop'], restrictionRoles, 'area')).toEqual([
      { role: 'from', label: 'von' },
      { role: 'to', label: 'nach' },
      { role: 'stop' },
    ])
  })

  it('with no schema, only the usual suggestions, as before', () => {
    expect(roleOptionsFor(['stop', 'forward'], {}, 'line')).toEqual([
      { role: 'stop' },
      { role: 'forward' },
    ])
  })

  it('does not offer a role twice', () => {
    const options = roleOptionsFor(['from', 'from', 'via'], restrictionRoles, 'line')
    expect(options.map((option) => option.role)).toEqual(['from', 'via', 'to'])
  })
})

describe('roleToAdd', () => {
  const road = { geometry: 'line' as const, tags: { highway: 'primary' } }

  it('stores the typed role, and the key of a typed label', () => {
    expect(roleToAdd(restrictionRoles, 'von', road)).toBe('from')
    expect(roleToAdd(restrictionRoles, ' stop ', road)).toBe('stop')
  })

  it('takes the one role that fits when no role is typed', () => {
    expect(roleToAdd(restrictionRoles, '', { geometry: 'vertex', tags: {} })).toBe('via')
    // a line without a highway tag fits only the role without a tag rule
    expect(
      roleToAdd(restrictionRoles, '  ', { geometry: 'line', tags: { amenity: 'bench' } }),
    ).toBe('via')
  })

  it('leaves the role empty when several roles fit, or none does', () => {
    expect(roleToAdd(restrictionRoles, '', road)).toBe('')
    expect(roleToAdd(restrictionRoles, '', { geometry: 'area', tags: { building: 'yes' } })).toBe(
      '',
    )
  })

  it('leaves the role empty without a schema, as before', () => {
    expect(roleToAdd({}, '', road)).toBe('')
  })
})

describe('cannotTakeReason', () => {
  const restriction = relation('r1', { type: 'restriction' }, [
    { id: 'w1', type: 'way', role: 'from' },
  ])
  const onTheRelation = { id: 'w1', geometry: 'line' as const, tags: { highway: 'primary' } }
  const other = { id: 'w2', geometry: 'line' as const, tags: { highway: 'primary' } }
  const area = { id: 'w3', geometry: 'area' as const, tags: { building: 'yes' } }

  it('refuses nothing without presets', () => {
    expect(cannotTakeReason(restriction, [onTheRelation], undefined)).toBeUndefined()
  })

  it('refuses nothing for a relation with no schema, even one that already has the feature', () => {
    expect(cannotTakeReason(restriction, [onTheRelation], rules({}, true))).toBeUndefined()
  })

  it('refuses a feature that is a member already when the schema forbids duplicates', () => {
    expect(cannotTakeReason(restriction, [onTheRelation], rules(restrictionRoles, false))).toBe(
      DUPLICATE_REASON,
    )
  })

  it('allows the feature again when the schema allows duplicates', () => {
    expect(
      cannotTakeReason(restriction, [onTheRelation], rules(restrictionRoles, true)),
    ).toBeUndefined()
  })

  it('refuses when one of several features is a member already (duplicates forbidden)', () => {
    expect(
      cannotTakeReason(restriction, [other, onTheRelation], rules(restrictionRoles, false)),
    ).toBe(DUPLICATE_REASON)
  })

  it('refuses a feature that fits none of the roles', () => {
    expect(cannotTakeReason(restriction, [area], rules(restrictionRoles, false))).toBe(
      INVALID_REASON,
    )
  })

  it('refuses the selection when one of several features fits no role', () => {
    expect(cannotTakeReason(restriction, [other, area], rules(restrictionRoles, false))).toBe(
      INVALID_REASON,
    )
  })

  it('allows a feature that fits one role, and a relation that has no member yet', () => {
    const empty = relation('r2', { type: 'restriction' })
    expect(cannotTakeReason(empty, [other], rules(restrictionRoles, false))).toBeUndefined()
  })

  it('reports the duplicate before the invalid member', () => {
    expect(
      cannotTakeReason(restriction, [onTheRelation, area], rules(restrictionRoles, false)),
    ).toBe(DUPLICATE_REASON)
  })
})

describe('geometryOfEntity', () => {
  const graph = new Graph(context, [
    new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
    new OsmNode(context, { id: 'n2', loc: [0, 1], tags: {} }),
    new OsmNode(context, { id: 'n3', loc: [1, 1], tags: {} }),
    new OsmNode(context, { id: 'n4', loc: [1, 0], tags: {} }),
    new OsmNode(context, { id: 'n5', loc: [2, 2], tags: { highway: 'crossing' } }),
    way('w1', ['n1', 'n2'], { highway: 'primary' }),
    way('w2', ['n2', 'n3', 'n4', 'n2'], { building: 'yes' }),
    way('w3', ['n3', 'n4'], { area: 'yes' }),
    relation('r1', { type: 'multipolygon' }),
    relation('r2', { type: 'route' }),
  ])

  it('names a node a point, or a vertex when a way uses it', () => {
    expect(geometryOfEntity(graph, 'n1')).toBe('vertex')
    expect(geometryOfEntity(graph, 'n5')).toBe('point')
  })

  it('names a way an area when it is closed and an area, else a line', () => {
    expect(geometryOfEntity(graph, 'w1')).toBe('line')
    expect(geometryOfEntity(graph, 'w2')).toBe('area')
    expect(geometryOfEntity(graph, 'w3')).toBe('area')
  })

  it('names a multipolygon an area and any other relation a relation', () => {
    expect(geometryOfEntity(graph, 'r1')).toBe('area')
    expect(geometryOfEntity(graph, 'r2')).toBe('relation')
  })

  it('has no geometry for an entity that is not loaded', () => {
    expect(geometryOfEntity(graph, 'n404')).toBeUndefined()
  })
})
