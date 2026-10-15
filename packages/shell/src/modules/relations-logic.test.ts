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
  duplicateReason,
  geometryOfEntity,
  invalidReason,
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
  addSessionIDs,
  colourOf,
  cssSupportsColour,
  dotNeedsRing,
  groupDropMove,
  memberGroupKey,
  memberGroups,
  pasteOffersOf,
  type MemberRow,
  newRelationActions,
  pickerNames,
  placementOf,
  placementSentence,
  memberLabel,
  memberName,
  memberRows,
  membershipHint,
  membershipsOf,
  membersHeadline,
  moveTargets,
  relationLabel,
  roleSuggestions,
  routeGaps,
  routeJoins,
  sessionFirst,
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

describe('moveTargets', () => {
  /** Member rows as memberRows makes them, for the given members in order */
  function rowsOf(members: { type: 'node' | 'way'; role: string }[]): MemberRow[] {
    return members.map((member, index) => ({
      index,
      id: `m${index}`,
      type: member.type,
      role: member.role,
      loaded: true,
      label: undefined,
    }))
  }

  it('moves one step up or down, and has no target at the ends', () => {
    const moves = moveTargets(
      rowsOf([
        { type: 'way', role: '' },
        { type: 'way', role: '' },
        { type: 'way', role: '' },
      ]),
      { type: 'multipolygon' },
    )
    expect(moves.get(0)).toEqual({ down: 1 })
    expect(moves.get(1)).toEqual({ up: 0, down: 2 })
    expect(moves.get(2)).toEqual({ up: 1 })
  })

  it('a single member has no target', () => {
    expect(moveTargets(rowsOf([{ type: 'way', role: '' }]), {}).get(0)).toEqual({})
  })

  it('moves a route member past the member before or after it in its own group', () => {
    // 0 way, 1 stop, 2 way, 3 platform, 4 way: the ways 0, 2, 4 move among themselves, the stops 1, 3 among theirs
    const moves = moveTargets(
      rowsOf([
        { type: 'way', role: 'forward' },
        { type: 'node', role: 'stop' },
        { type: 'way', role: 'forward' },
        { type: 'way', role: 'platform' },
        { type: 'way', role: 'forward' },
      ]),
      { type: 'route' },
    )
    expect(moves.get(0)).toEqual({ down: 2 })
    expect(moves.get(2)).toEqual({ up: 0, down: 4 })
    expect(moves.get(4)).toEqual({ up: 2 })
    expect(moves.get(1)).toEqual({ down: 3 })
    expect(moves.get(3)).toEqual({ up: 1 })
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
      duplicateReason(),
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
    ).toBe(duplicateReason())
  })

  it('refuses a feature that fits none of the roles', () => {
    expect(cannotTakeReason(restriction, [area], rules(restrictionRoles, false))).toBe(
      invalidReason(),
    )
  })

  it('refuses the selection when one of several features fits no role', () => {
    expect(cannotTakeReason(restriction, [other, area], rules(restrictionRoles, false))).toBe(
      invalidReason(),
    )
  })

  it('allows a feature that fits one role, and a relation that has no member yet', () => {
    const empty = relation('r2', { type: 'restriction' })
    expect(cannotTakeReason(empty, [other], rules(restrictionRoles, false))).toBeUndefined()
  })

  it('reports the duplicate before the invalid member', () => {
    expect(
      cannotTakeReason(restriction, [onTheRelation, area], rules(restrictionRoles, false)),
    ).toBe(duplicateReason())
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

describe('addSessionIDs', () => {
  it('appends the touched relations once each, in the order they were first touched', () => {
    const first = addSessionIDs([], ['r2', 'r1'])
    expect(first).toEqual(['r2', 'r1'])
    expect(addSessionIDs(first, ['r3', 'r2', 'r3'])).toEqual(['r2', 'r1', 'r3'])
  })

  it('returns the same list when nothing is new', () => {
    const current = ['r2', 'r1']
    expect(addSessionIDs(current, ['r1'])).toBe(current)
    expect(addSessionIDs(current, [])).toBe(current)
  })
})

describe('sessionFirst', () => {
  const picker = [
    relation('r9', { type: 'route', name: 'Far away' }),
    relation('r5', { type: 'route', name: 'Near' }),
    relation('r7', { type: 'route', name: 'Other' }),
    relation('r3', { type: 'route', name: 'Session, touched second' }),
  ]

  it('puts the relations of the session first, in the order they were touched, then the rest in their order', () => {
    const ids = sessionFirst(picker, ['r3', 'r9']).map((item) => item.id)
    expect(ids).toEqual(['r3', 'r9', 'r5', 'r7'])
  })

  it('puts a session relation that comes last in the picker first, so the picker limit cannot hide it', () => {
    const offered = sessionFirst(picker, ['r3']).slice(0, 1)
    expect(offered.map((item) => item.id)).toEqual(['r3'])
  })

  it('leaves out a session id that is not among the picker relations (gone from the graph)', () => {
    const ids = sessionFirst(picker, ['r404', 'r7']).map((item) => item.id)
    expect(ids).toEqual(['r7', 'r9', 'r5', 'r3'])
  })

  it('counts a repeated session id once, at its first place', () => {
    const ids = sessionFirst(picker, ['r7', 'r5', 'r7']).map((item) => item.id)
    expect(ids).toEqual(['r7', 'r5', 'r9', 'r3'])
  })

  it('does not change the list it is given, and keeps the order when the session is empty', () => {
    const before = picker.map((item) => item.id)
    expect(sessionFirst(picker, []).map((item) => item.id)).toEqual(before)
    expect(picker.map((item) => item.id)).toEqual(before)
  })
})

describe('pickerNames', () => {
  it('shows only the label when the label is unique in the list', () => {
    const names = pickerNames([
      relation('r1', { type: 'route', name: 'Bus 1' }),
      relation('r2', { type: 'route', name: 'Bus 2' }),
    ])
    expect(names.get('r1')).toBe('Bus 1')
    expect(names.get('r2')).toBe('Bus 2')
  })

  it('adds the id after the label of every relation whose label repeats in the list', () => {
    const names = pickerNames([
      relation('r1', { type: 'route', name: 'Bus 1' }),
      relation('r2', { type: 'route', name: 'Bus 1' }),
      relation('r3', { type: 'route', name: 'Tram' }),
    ])
    expect(names.get('r1')).toBe('Bus 1 (r1)')
    expect(names.get('r2')).toBe('Bus 1 (r2)')
    expect(names.get('r3')).toBe('Tram')
  })

  it('counts the fallback label too: two relations without a name repeat their type', () => {
    const names = pickerNames([relation('r1', { type: 'site' }), relation('r2', { type: 'site' })])
    expect(names.get('r1')).toBe('site (r1)')
    expect(names.get('r2')).toBe('site (r2)')
  })
})

describe('groupDropMove', () => {
  // the shown list as a drag leaves it: each row keeps the member index it had before the drag
  const rows = (indexes: number[]) => indexes.map((index) => ({ index }))
  /** A drop in a list of one group: the group is the whole list, in data order before the drag */
  const dropIn = (after: { index: number }[], draggedIndex: number) =>
    groupDropMove(
      after,
      [...after].sort((a, b) => a.index - b.index),
      after,
      draggedIndex,
    )

  it('moves a member up or down to its place in the list after the drag', () => {
    expect(dropIn(rows([1, 0, 2]), 1)).toEqual({ from: 1, to: 0 })
    expect(dropIn(rows([0, 2, 1]), 1)).toEqual({ from: 1, to: 2 })
    expect(dropIn(rows([2, 0, 1]), 2)).toEqual({ from: 2, to: 0 })
  })

  it('makes no move when the member is where it was', () => {
    expect(dropIn(rows([0, 1, 2]), 1)).toBeUndefined()
    expect(dropIn(rows([0, 1, 2]), 2)).toBeUndefined()
  })

  it('makes no move for a member that is not in the list', () => {
    expect(dropIn(rows([0, 1, 2]), 7)).toBeUndefined()
  })

  it('gives the same order as the one move it names, for a drag across several places', () => {
    // members A B C D; A is dragged behind C: the list is B C A D
    const members = [
      { id: 'n1', type: 'node' as const, role: 'a' },
      { id: 'n2', type: 'node' as const, role: 'b' },
      { id: 'n3', type: 'node' as const, role: 'c' },
      { id: 'n4', type: 'node' as const, role: 'd' },
    ]
    const dragged = [1, 2, 0, 3].map((index) => ({ index }))
    const move = dropIn(dragged, 0)
    expect(move).toEqual({ from: 0, to: 2 })
    if (!move) throw new Error('the drop makes a move')
    const moved = relation('r1', { type: 'route' }, members).moveMember(move.from, move.to)
    expect(moved.members.map((member) => member.id)).toEqual(['n2', 'n3', 'n1', 'n4'])
  })
})

describe('route member groups', () => {
  const member = (type: 'node' | 'way' | 'relation', role: string) => ({ type, role })
  function rowsOf(members: { type: 'node' | 'way' | 'relation'; role: string }[]): MemberRow[] {
    return members.map((item, index) => ({
      index,
      id: `m${index}`,
      type: item.type,
      role: item.role,
      loaded: true,
      label: undefined,
    }))
  }

  it('lists a route as stops and ways, each in data order, and leaves out an empty group', () => {
    const rows = rowsOf([
      member('way', 'forward'),
      member('node', ''),
      member('way', ''),
      member('way', 'platform'),
      member('node', 'stop_entry_only'),
      member('way', 'backward'),
    ])
    const groups = memberGroups(rows, { type: 'route' })
    expect(groups.map((group) => group.key)).toEqual(['stops', 'ways'])
    expect(groups[0]?.rows.map((row) => row.index)).toEqual([1, 3, 4])
    expect(groups[1]?.rows.map((row) => row.index)).toEqual([0, 2, 5])
    expect(memberGroups(rowsOf([member('way', 'forward')]), { type: 'route' })).toEqual([
      { key: 'ways', rows: rowsOf([member('way', 'forward')]) },
    ])
  })

  it('counts point members of a route as stops, whatever their role', () => {
    expect(memberGroupKey({ type: 'route' }, { type: 'node', role: 'via' })).toBe('stops')
    expect(memberGroupKey({ type: 'route' }, { type: 'way', role: 'stop_exit_only' })).toBe('stops')
    expect(memberGroupKey({ type: 'route' }, { type: 'way', role: 'platform_entry_only' })).toBe(
      'stops',
    )
    expect(memberGroupKey({ type: 'route' }, { type: 'way', role: 'forward' })).toBe('ways')
    expect(memberGroupKey({ type: 'route' }, { type: 'relation', role: '' })).toBe('ways')
  })

  it('keeps other relations in one group, in data order, and no members in no group', () => {
    const rows = rowsOf([member('node', 'stop'), member('way', 'outer')])
    expect(memberGroups(rows, { type: 'multipolygon' })).toEqual([{ key: 'all', rows }])
    expect(memberGroupKey({ type: 'route_master' }, { type: 'node', role: 'stop' })).toBe('all')
    expect(memberGroups([], { type: 'route' })).toEqual([])
  })

  it('moves a member within its group: the drop lands next to the member before it in the group', () => {
    // data: 0 way, 1 stop, 2 way, 3 way. The ways shown as [0, 2, 3]; 3 is dragged to the top of the ways
    const shown = [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }]
    const before = [{ index: 0 }, { index: 2 }, { index: 3 }]
    expect(groupDropMove(shown, before, [{ index: 3 }, { index: 0 }, { index: 2 }], 3)).toEqual({
      from: 3,
      to: 0,
    })
    // 0 is dragged behind 2: it lands after 2 and the stop 1 keeps its place
    const dropped = groupDropMove(shown, before, [{ index: 2 }, { index: 0 }, { index: 3 }], 0)
    expect(dropped).toEqual({ from: 0, to: 2 })
    if (!dropped) throw new Error('the drop makes a move')
    const relationWith = relation(
      'r1',
      { type: 'route' },
      [0, 1, 2, 3].map((index) => ({ id: `m${index}`, type: 'way' as const, role: '' })),
    ).moveMember(dropped.from, dropped.to)
    expect(relationWith.members.map((item) => item.id)).toEqual(['m1', 'm2', 'm0', 'm3'])
  })

  it('makes no move when the group keeps its order, and none for a member alone in its group', () => {
    const shown = [{ index: 0 }, { index: 1 }, { index: 2 }]
    const before = [{ index: 0 }, { index: 2 }]
    expect(groupDropMove(shown, before, [{ index: 0 }, { index: 2 }], 2)).toBeUndefined()
    expect(groupDropMove(shown, [{ index: 1 }], [{ index: 1 }], 1)).toBeUndefined()
  })
})

describe('moveTargets within the groups of a route', () => {
  it('has no target past the end of a group, though the other group goes on', () => {
    const rows: MemberRow[] = [
      { index: 0, id: 'w0', type: 'way', role: '', loaded: true, label: undefined },
      { index: 1, id: 'n1', type: 'node', role: 'stop', loaded: true, label: undefined },
      { index: 2, id: 'w2', type: 'way', role: '', loaded: true, label: undefined },
    ]
    const moves = moveTargets(rows, { type: 'route' })
    expect(moves.get(0)).toEqual({ down: 2 })
    expect(moves.get(1)).toEqual({})
    expect(moves.get(2)).toEqual({ up: 0 })
  })
})

describe('colourOf and dotNeedsRing', () => {
  const withColour = (colour: string) => relation('r1', { type: 'route', colour })

  it('takes a hex colour as written, trimmed', () => {
    expect(colourOf(withColour('#ff0000'))).toBe('#ff0000')
    expect(colourOf(withColour('#F00'))).toBe('#F00')
    expect(colourOf(withColour('  #1e40af '))).toBe('#1e40af')
  })

  it('takes a colour name only when the browser knows it', () => {
    expect(colourOf(withColour('red'), () => true)).toBe('red')
    expect(colourOf(withColour('redd'), () => false)).toBeUndefined()
  })

  it('refuses a missing, empty, CSS-wide or invisible colour, and a value that is no colour', () => {
    const yes = () => true
    expect(colourOf(relation('r1', { type: 'route' }), yes)).toBeUndefined()
    expect(colourOf(withColour(''), yes)).toBeUndefined()
    expect(colourOf(withColour('inherit'), yes)).toBeUndefined()
    expect(colourOf(withColour('transparent'), yes)).toBeUndefined()
    expect(colourOf(withColour('#ff00'), () => false)).toBeUndefined()
    expect(colourOf(withColour('url(x)'), () => false)).toBeUndefined()
  })

  it('reports whether a value is a colour without a throw where there is no CSS', () => {
    expect(typeof cssSupportsColour('red')).toBe('boolean')
  })

  it('gives a hairline ring to light hex colours and to colour names, not to dark ones', () => {
    expect(dotNeedsRing('#ffffff')).toBe(true)
    expect(dotNeedsRing('#fff')).toBe(true)
    expect(dotNeedsRing('#ffff00')).toBe(true)
    expect(dotNeedsRing('red')).toBe(true)
    expect(dotNeedsRing('#000000')).toBe(false)
    expect(dotNeedsRing('#1e40af')).toBe(false)
    expect(dotNeedsRing('#ff0000')).toBe(false)
  })
})

describe('pasteOffersOf', () => {
  // w1 is the original, w1c its copy. r1 and r2 hold the original, r3 is copied with it, r4 holds the copy already,
  // r5 holds the original twice, and r2 has been settled.
  const graph = new Graph(context, [
    relation('r1', { type: 'route' }, [{ id: 'w1', type: 'way', role: 'forward' }]),
    relation('r2', { type: 'route' }, [{ id: 'w1', type: 'way', role: '' }]),
    relation('r3', { type: 'route' }, [{ id: 'w1', type: 'way', role: 'x' }]),
    relation('r4', { type: 'route' }, [
      { id: 'w1', type: 'way', role: 'a' },
      { id: 'w1c', type: 'way', role: 'b' },
    ]),
    relation('r5', { type: 'route' }, [
      { id: 'w1', type: 'way', role: 'a' },
      { id: 'w1', type: 'way', role: 'b' },
    ]),
    way('w1', ['a', 'b']),
    way('w1c', ['a', 'b']),
  ])

  it('offers each relation the original is in, with its role, once, and leaves out the rest', () => {
    const offers = pasteOffersOf(graph, 'w1c', 'w1', new Set(['r3']), ['r2'])
    expect(
      offers
        .map((offer) => `${offer.relation.id} ${offer.role}`)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['r1 forward', 'r5 a'])
  })

  it('offers nothing for a copy or an original that is not in the graph', () => {
    expect(pasteOffersOf(graph, 'w9', 'w1', new Set(), [])).toEqual([])
    expect(pasteOffersOf(graph, 'w1c', 'w9', new Set(), [])).toEqual([])
  })
})
