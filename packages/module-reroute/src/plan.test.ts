import { describe, expect, it } from 'bun:test'
import type { Graph, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import {
  bicycleProfile,
  buildRoutingGraph,
  findRoute,
  footProfile,
  snapToGraph,
  type Profile,
  type RouteResult,
  type SplitPoint,
} from '@osm-editor-kit/maid-routing'
import { applyAll, graphOf, member, node, relation, way } from './plan-test-helpers.ts'
import {
  planReroute,
  stretchesBetween,
  type PlanInput,
  type PlanResult,
  type ReroutePlan,
} from './plan.ts'

type Entities = Parameters<typeof graphOf>[0]

/** Longitude of the node n1..n5 on the street (about 68 m apart), at lat 52.5 */
function lon(i: number): number {
  return 13.4 + (i - 1) * 0.001
}

/**
 * A street n0..n6 on lat 52.5: w0 (n0-n1), w1 (n1-n5, the road the route runs on), w6 (n5-n6).
 * Cycleway nodes c2..c4 lie 11 m north of the street, between n1 and n5, not joined to the road.
 * The relation r1 is a bicycle route on w0, w1, w6.
 */
function streetEntities(
  members = [member('w0'), member('w1'), member('w6')],
  route = 'bicycle',
): Entities {
  return [
    node('n0', 13.399, 52.5),
    node('n1', lon(1), 52.5),
    node('n2', lon(2), 52.5),
    node('n3', lon(3), 52.5),
    node('n4', lon(4), 52.5),
    node('n5', lon(5), 52.5),
    node('n6', 13.405, 52.5),
    node('c2', lon(2), 52.5001),
    node('c3', lon(3), 52.5001),
    node('c4', lon(4), 52.5001),
    way('w0', ['n0', 'n1'], { highway: 'residential' }),
    way('w1', ['n1', 'n2', 'n3', 'n4', 'n5'], { highway: 'secondary' }),
    way('w6', ['n5', 'n6'], { highway: 'residential' }),
    relation('r1', members, { type: 'route', route }),
  ]
}

/** The entities with the relation `r1` replaced by `rel` */
function withRelation(entities: Entities, rel: OsmRelation): Entities {
  return [...entities.filter((entity) => entity.id !== rel.id), rel]
}

/** The router's answer from `from` (a node) to `to` (a node id, or a point on the map) */
function routeOf(
  entities: Entities,
  profile: Profile,
  from: string,
  to: string | [number, number],
): RouteResult {
  const rg = buildRoutingGraph(graphOf(entities), profile)
  if (typeof to === 'string') return findRoute(rg, { node: from }, { node: to })
  const snap = snapToGraph(rg, to[0], to[1])
  if (!snap) throw new Error(`no way at ${to.join(', ')}`)
  return findRoute(rg, { node: from }, { snap })
}

/** The plan for the stretch `from..to` of relation `relationId`, with the ids the preview would show */
function planFor(
  graph: Graph,
  route: RouteResult,
  from: number,
  to: number,
  extra: Partial<PlanInput> = {},
  relationId = 'r1',
): PlanResult {
  const rel = graph.entity(relationId) as OsmRelation
  return planReroute({
    graph,
    relationId,
    stretch: { from, to },
    expectedIds: rel.members.slice(from, to + 1).map((m) => m.id),
    route,
    ...extra,
  })
}

/** The plan, or a failing test with the refusal's detail */
function okPlan(result: PlanResult): ReroutePlan {
  if (!result.ok) throw new Error(`plan refused: ${result.reason}: ${result.detail}`)
  return result
}

function relOf(graph: Graph, id = 'r1'): OsmRelation {
  return graph.entity(id) as OsmRelation
}

function wayOf(graph: Graph, id: string): OsmWay {
  return graph.entity(id) as OsmWay
}

describe('stretchesBetween', () => {
  it('finds every stretch that starts and ends with the two ways', () => {
    const rel = relation('rx', [member('a'), member('b'), member('a'), member('b')], {
      type: 'route',
    })
    expect(stretchesBetween(rel, 'a', 'b')).toEqual([
      { from: 0, to: 1 },
      { from: 0, to: 3 },
      { from: 2, to: 3 },
    ])
  })
})

describe('planReroute: a route moved onto a parallel one-way cycleway', () => {
  const cycleway = way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], { highway: 'cycleway', oneway: 'yes' })
  const entities = [...streetEntities(), cycleway]

  it('replaces the road with the cycleway, with forward, and keeps the members outside the stretch', () => {
    const route = routeOf(entities, bicycleProfile, 'n1', 'n5')
    expect(route.ok && route.segments).toMatchObject([{ wayId: 'wc', forward: true }])

    const graph = graphOf(entities)
    const plan = okPlan(planFor(graph, route, 1, 1))
    const after = applyAll(graph, plan.actions)

    expect(relOf(after).members).toEqual([
      member('w0'),
      member('wc', 'way', 'forward'),
      member('w6'),
    ])
    expect(plan.removedMembers).toEqual([{ index: 1, id: 'w1', type: 'way', role: '' }])
    expect(plan.addedMembers).toEqual([
      { segment: 0, index: 1, id: 'wc', fromWayId: 'wc', role: 'forward' },
    ])
    expect(plan.splitWays).toEqual([])
    expect(plan.rolesToAsk).toEqual([])
    expect(plan.otherRelationsTouched).toEqual([])
    expect(plan.pointsToReview).toEqual([])
    expect(plan.lengthM).toBeGreaterThan(0)
  })

  it('plans on a copy: the graph it is given is unchanged', () => {
    const graph = graphOf(entities)
    const route = routeOf(entities, bicycleProfile, 'n1', 'n5')
    okPlan(planFor(graph, route, 1, 1))
    expect(relOf(graph).members.map((m) => m.id)).toEqual(['w0', 'w1', 'w6'])
    expect(wayOf(graph, 'wc').nodes).toEqual(['n1', 'c2', 'c3', 'c4', 'n5'])
  })
})

describe('planReroute: a split in the middle of the cycleway', () => {
  const cycleway = way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], { highway: 'cycleway', oneway: 'yes' })
  const entities = [...streetEntities(), cycleway]
  // the middle of the segment c2-c3, on the cycleway: the route ends there, the road has no node
  const turn: [number, number] = [(lon(2) + lon(3)) / 2, 52.5001]

  it('adds a node at the snapped point, splits the way there and routes on the first part', () => {
    const route = routeOf(entities, bicycleProfile, 'n1', turn)
    expect(route.ok && route.splits).toMatchObject([{ wayId: 'wc', segment: 1 }])

    const graph = graphOf(entities)
    const plan = okPlan(planFor(graph, route, 1, 1))
    expect(plan.splitWays).toHaveLength(1)
    const split = plan.splitWays[0]!
    expect(split.wayId).toBe('wc')
    expect(split.segment).toBe(0)

    const after = applyAll(graph, plan.actions)
    const newNode = after.entity(split.nodeId) as OsmNode
    expect(newNode.loc![0]).toBeCloseTo(turn[0], 6)
    expect(newNode.loc![1]).toBeCloseTo(turn[1], 6)

    const routed = plan.addedMembers[0]!
    expect(routed.fromWayId).toBe('wc')
    expect(relOf(after).members).toEqual([
      member('w0'),
      member(routed.id, 'way', 'forward'),
      member('w6'),
    ])
    expect(wayOf(after, routed.id).nodes).toEqual(['n1', 'c2', split.nodeId])

    // the other part keeps the rest of the cycleway
    const other = split.newWayId === routed.id ? split.wayId : split.newWayId
    expect(wayOf(after, other).nodes).toEqual([split.nodeId, 'c3', 'c4', 'n5'])
  })
})

describe('planReroute: a route that starts and ends inside one way', () => {
  it('splits the way twice and routes on the part between the two new nodes', () => {
    const cycleway = way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], {
      highway: 'cycleway',
      oneway: 'yes',
    })
    const entities = [...streetEntities(), cycleway]
    const rg = buildRoutingGraph(graphOf(entities), bicycleProfile)
    const start = snapToGraph(rg, (lon(2) + lon(3)) / 2, 52.5001)
    const end = snapToGraph(rg, (lon(3) + lon(4)) / 2, 52.5001)
    if (!start || !end) throw new Error('no way at the points')
    const route = findRoute(rg, { snap: start }, { snap: end })
    expect(route.ok && route.splits.map((s) => s.segment)).toEqual([1, 2])

    const graph = graphOf(entities)
    const plan = okPlan(planFor(graph, route, 1, 1))
    expect(plan.splitWays).toHaveLength(2)
    const after = applyAll(graph, plan.actions)

    const routed = plan.addedMembers[0]!
    expect(relOf(after).members).toEqual([
      member('w0'),
      member(routed.id, 'way', 'forward'),
      member('w6'),
    ])
    const nodeA = plan.splitWays[0]!.nodeId
    const nodeB = plan.splitWays[1]!.nodeId
    expect(wayOf(after, routed.id).nodes).toEqual([nodeA, 'c3', nodeB])
    // the two parts either side of the route are not in the route
    const ids = plan.splitWays.flatMap((s) => [s.wayId, s.newWayId])
    expect(new Set(ids).size).toBe(3)
    expect(new Set(ids.filter((id) => id !== routed.id)).size).toBe(2)
  })
})

describe('planReroute: road kinds and the roles', () => {
  it('leaves the role empty on a two-way cycleway', () => {
    const entities = [
      ...streetEntities(),
      way('wt', ['n1', 'c2', 'c3', 'c4', 'n5'], { highway: 'cycleway' }),
    ]
    const route = routeOf(entities, bicycleProfile, 'n1', 'n5')
    expect(route.ok && route.segments[0]!.wayId).toBe('wt')

    const graph = graphOf(entities)
    const plan = okPlan(planFor(graph, route, 1, 1))
    expect(relOf(applyAll(graph, plan.actions)).members).toEqual([
      member('w0'),
      member('wt'),
      member('w6'),
    ])
    expect(plan.rolesToAsk).toEqual([])
  })

  it('leaves every role empty on a hiking route, even on a way one-way for walkers', () => {
    const entities = withRelation(
      [
        ...streetEntities(),
        way('wp', ['n1', 'c2', 'c3', 'c4', 'n5'], { highway: 'path', 'oneway:foot': 'yes' }),
      ],
      relation('r1', [member('w0'), member('w1'), member('w6')], {
        type: 'route',
        route: 'hiking',
      }),
    )
    const route = routeOf(entities, footProfile, 'n1', 'n5')
    expect(route.ok && route.segments[0]!.wayId).toBe('wp')

    const graph = graphOf(entities)
    const plan = okPlan(planFor(graph, route, 1, 1))
    expect(relOf(applyAll(graph, plan.actions)).members).toEqual([
      member('w0'),
      member('wp'),
      member('w6'),
    ])
    expect(plan.rolesToAsk).toEqual([])
  })

  it("asks for the role of a sidewalk, and uses the mapper's choice when given", () => {
    const entities = [
      ...streetEntities(),
      way('ws', ['n1', 'c2', 'c3', 'c4', 'n5'], {
        highway: 'footway',
        footway: 'sidewalk',
        bicycle: 'designated',
      }),
    ]
    const route = routeOf(entities, bicycleProfile, 'n1', 'n5')
    expect(route.ok && route.segments[0]!.wayId).toBe('ws')

    const graph = graphOf(entities)
    const asked = okPlan(planFor(graph, route, 1, 1))
    expect(asked.rolesToAsk).toEqual([
      {
        segment: 0,
        wayId: 'ws',
        options: ['', 'forward', 'backward'],
        suggested: '',
        reason: expect.stringContaining('sidewalk') as unknown as string,
      },
    ])

    const chosen = okPlan(planFor(graph, route, 1, 1, { roleChoices: { 0: 'forward' } }))
    expect(chosen.rolesToAsk).toEqual([])
    expect(relOf(applyAll(graph, chosen.actions)).members[1]).toEqual(
      member('ws', 'way', 'forward'),
    )
  })
})

describe('planReroute: point members in the stretch', () => {
  it('keeps the stops in the stretch and flags the one far from the new path', () => {
    const cycleway = way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], {
      highway: 'cycleway',
      oneway: 'yes',
    })
    const stopNear = node('s1', lon(3), 52.50008) // about 2 m from the cycleway
    const stopFar = node('s2', lon(3), 52.5005) // about 44 m from the cycleway
    const entities = withRelation(
      [...streetEntities(), cycleway, stopNear, stopFar],
      relation(
        'r1',
        [
          member('w0'),
          member('w1'),
          member('s1', 'node', 'stop'),
          member('s2', 'node', 'platform'),
          member('w6'),
        ],
        { type: 'route', route: 'bicycle' },
      ),
    )
    const route = routeOf(entities, bicycleProfile, 'n1', 'n5')
    expect(route.ok && route.segments[0]!.wayId).toBe('wc')

    const graph = graphOf(entities)
    const plan = okPlan(planFor(graph, route, 1, 4))
    const near = plan.pointsToReview.find((p) => p.id === 's1')!
    const far = plan.pointsToReview.find((p) => p.id === 's2')!
    expect(near.far).toBe(false)
    expect(near.distanceM!).toBeLessThan(25)
    expect(far.far).toBe(true)
    expect(far.distanceM!).toBeGreaterThan(25)

    // the stops stay in the list, with their roles, between the outside members
    const members = relOf(applyAll(graph, plan.actions)).members
    expect(members).toHaveLength(4)
    expect(members[0]).toEqual(member('w0'))
    expect(members.slice(1)).toEqual(
      expect.arrayContaining([
        member('wc', 'way', 'forward'),
        member('s1', 'node', 'stop'),
        member('s2', 'node', 'platform'),
      ]),
    )
    expect(plan.removedMembers.map((m) => m.id)).toEqual(['w1', 'w6'])
  })
})

describe('planReroute: other relations of a split way', () => {
  it('gives the new part of a split way to the other relations that hold it, next to the old part', () => {
    const cycleway = way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], {
      highway: 'cycleway',
      oneway: 'yes',
    })
    const entities = [
      ...streetEntities(),
      cycleway,
      relation('r2', [member('w0'), member('wc')], { type: 'route', route: 'bicycle' }),
    ]
    const turn: [number, number] = [(lon(2) + lon(3)) / 2, 52.5001]
    const route = routeOf(entities, bicycleProfile, 'n1', turn)

    const graph = graphOf(entities)
    const plan = okPlan(planFor(graph, route, 1, 1))
    expect(plan.otherRelationsTouched).toEqual(['r2'])

    const split = plan.splitWays[0]!
    const members = relOf(applyAll(graph, plan.actions), 'r2').members
    const ids = members.map((m) => m.id)
    expect(ids).toHaveLength(3)
    expect(ids).toEqual(expect.arrayContaining(['w0', split.wayId, split.newWayId]))
    const positions = [split.wayId, split.newWayId].map((id) => ids.indexOf(id))
    expect(Math.abs(positions[0]! - positions[1]!)).toBe(1)
    expect(
      members
        .filter((m) => m.id === split.wayId || m.id === split.newWayId)
        .every((m) => m.role === ''),
    ).toBe(true)
  })

  it('refuses when a split way is also a member of the route outside the stretch', () => {
    const cycleway = way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], {
      highway: 'cycleway',
      oneway: 'yes',
    })
    const entities = withRelation(
      [...streetEntities(), cycleway],
      relation('r1', [member('w1'), member('wc')], { type: 'route', route: 'bicycle' }),
    )
    const turn: [number, number] = [(lon(2) + lon(3)) / 2, 52.5001]
    const route = routeOf(entities, bicycleProfile, 'n1', turn)
    expect(planFor(graphOf(entities), route, 0, 0)).toMatchObject({
      ok: false,
      reason: 'split-way-used-outside',
    })
  })
})

describe('planReroute: refusals', () => {
  it('refuses a relation that changed since the preview', () => {
    const entities = [
      ...streetEntities(),
      way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], { highway: 'cycleway' }),
    ]
    const route = routeOf(entities, bicycleProfile, 'n1', 'n5')
    const result = planFor(graphOf(entities), route, 1, 1, { expectedIds: ['w9'] })
    expect(result).toMatchObject({ ok: false, reason: 'relation-changed' })
  })

  it('refuses a route with a way that is not loaded', () => {
    const cycleway = way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], { highway: 'cycleway' })
    const route = routeOf([...streetEntities(), cycleway], bicycleProfile, 'n1', 'n5')
    expect(planFor(graphOf(streetEntities()), route, 1, 1)).toMatchObject({
      ok: false,
      reason: 'way-not-loaded',
    })
  })

  it('refuses a stretch that does not start and end with ways', () => {
    const entities = streetEntities([member('w0'), member('n1', 'node'), member('w1')])
    const route = routeOf(
      [...entities, way('wc', ['n1', 'c2', 'c3', 'c4', 'n5'], { highway: 'cycleway' })],
      bicycleProfile,
      'n1',
      'n5',
    )
    expect(planFor(graphOf(entities), route, 1, 2)).toMatchObject({
      ok: false,
      reason: 'bad-stretch',
    })
  })

  it('refuses a split of a closed way', () => {
    const entities = [
      ...streetEntities(),
      way('wl', ['c2', 'c3', 'c4', 'c2'], { highway: 'cycleway' }),
    ]
    const split: SplitPoint = {
      wayId: 'wl',
      segment: 0,
      t: 0.5,
      loc: [(lon(2) + lon(3)) / 2, 52.5001],
    }
    const route: RouteResult = {
      ok: true,
      segments: [
        { wayId: 'wl', fromIndex: 0, toIndex: 0, forward: true, lengthM: 10, endSplit: split },
      ],
      splits: [split],
      lengthM: 10,
      cost: 10,
      expanded: 0,
    }
    expect(planFor(graphOf(entities), route, 1, 1)).toMatchObject({
      ok: false,
      reason: 'closed-way-split',
    })
  })

  it('refuses a route the router did not find', () => {
    const route: RouteResult = { ok: false, reason: 'no-path', expanded: 3 }
    expect(planFor(graphOf(streetEntities()), route, 1, 1)).toMatchObject({
      ok: false,
      reason: 'no-route',
    })
  })
})
