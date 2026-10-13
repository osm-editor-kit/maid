import { describe, expect, it } from 'bun:test'
import {
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  RulesetSchema,
  actionSplit,
  osmIntersection,
  type Action,
  type Intersection,
  type Turn,
} from '@osm-editor-kit/maid-model'
import { isJunction } from './is-junction.ts'
import { junctionSketch, junctionTurns } from './junction.ts'
import { cycleTurn, turnStateOf, type RemovedTurn } from './turns.ts'

const box = { width: 400, height: 300, padding: 36 }
const road = { highway: 'residential' }

function apply(actions: readonly Action[], graph: Graph): Graph {
  return actions.reduce((current, action) => action(current), new Graph(graph))
}

function wayOf(graph: Graph, id: string): OsmWay {
  const way = graph.entity(id)
  if (!(way instanceof OsmWay)) throw new Error(`${id} is not a way`)
  return way
}

function relationOf(graph: Graph, id: string): OsmRelation {
  const relation = graph.entity(id)
  if (!(relation instanceof OsmRelation)) throw new Error(`${id} is not a relation`)
  return relation
}

function restrictionsOf(graph: Graph, wayID: string): OsmRelation[] {
  return graph.parentRelations(graph.entity(wayID)).filter((relation) => relation.isRestriction())
}

/**
 * A side road that meets a through road: `main` runs west to east through `c` and is one way (not split there),
 * `side` leaves `c` to the north. The vertex has two ways and three arms.
 */
function tJunction(mainTags: Record<string, string> = road) {
  const context = new ModelContext()
  const graph = new Graph(context, [
    new OsmNode(context, { id: 'c', loc: [0, 0] }),
    new OsmNode(context, { id: 'w', loc: [-0.0002, 0] }),
    new OsmNode(context, { id: 'e', loc: [0.0002, 0] }),
    new OsmNode(context, { id: 'n', loc: [0, 0.0002] }),
    new OsmWay(context, { id: 'main', nodes: ['w', 'c', 'e'], tags: mainTags }),
    new OsmWay(context, { id: 'side', nodes: ['c', 'n'], tags: road }),
  ])
  return { context, graph }
}

/**
 * Two junctions 0.0001 degrees (11 m) apart: `a` and `b`, joined by `w_via`. `w_in` reaches `a` from the south,
 * `w_outA` leaves `a` to the west, `w_outB` leaves `b` to the north, `w_outE` leaves `b` to the east. The way ids
 * start with `w`, as the model tells a path's ways from its nodes by that letter.
 */
function twoJunctions() {
  const context = new ModelContext()
  const graph = new Graph(context, [
    new OsmNode(context, { id: 'a', loc: [0, 0] }),
    new OsmNode(context, { id: 'b', loc: [0.0001, 0] }),
    new OsmNode(context, { id: 's', loc: [0, -0.0002] }),
    new OsmNode(context, { id: 'w', loc: [-0.0002, 0] }),
    new OsmNode(context, { id: 'n', loc: [0.0001, 0.0002] }),
    new OsmNode(context, { id: 'e', loc: [0.0003, 0] }),
    new OsmWay(context, { id: 'w_in', nodes: ['s', 'a'], tags: road }),
    new OsmWay(context, { id: 'w_outA', nodes: ['a', 'w'], tags: road }),
    new OsmWay(context, { id: 'w_via', nodes: ['a', 'b'], tags: road }),
    new OsmWay(context, { id: 'w_outB', nodes: ['b', 'n'], tags: road }),
    new OsmWay(context, { id: 'w_outE', nodes: ['b', 'e'], tags: road }),
  ])
  return { context, graph }
}

function intersectionAt(context: ModelContext, graph: Graph, id: string): Intersection {
  const result = osmIntersection(context, graph, id, 30)
  if (!result) throw new Error('no intersection')
  return result
}

function turnBetween(intersection: Intersection, from: string, to: string, maxVia = 0): Turn {
  const turn = intersection.turns(from, maxVia).find((candidate) => candidate.to.way === to)
  if (!turn) throw new Error(`no turn ${from} -> ${to}`)
  return turn
}

describe('isJunction: arms, not ways', () => {
  it('is true where a side road meets a through road that is not split there', () => {
    expect(isJunction(tJunction().graph, 'c')).toBe(true)
  })

  it('is true where two through roads cross, and false in the middle of one road', () => {
    const context = new ModelContext()
    const graph = new Graph(context, [
      new OsmNode(context, { id: 'c', loc: [0, 0] }),
      new OsmNode(context, { id: 'w', loc: [-0.0002, 0] }),
      new OsmNode(context, { id: 'e', loc: [0.0002, 0] }),
      new OsmNode(context, { id: 'n', loc: [0, 0.0002] }),
      new OsmNode(context, { id: 's', loc: [0, -0.0002] }),
      new OsmNode(context, { id: 'm', loc: [0.0001, 0] }),
      new OsmWay(context, { id: 'h', nodes: ['w', 'c', 'm', 'e'], tags: road }),
      new OsmWay(context, { id: 'v', nodes: ['n', 'c', 's'], tags: road }),
    ])
    expect(isJunction(graph, 'c')).toBe(true)
    expect(isJunction(graph, 'm')).toBe(false)
  })

  it('is false where only footways and paths meet, and where a road meets two footways', () => {
    const context = new ModelContext()
    const nodes = [
      new OsmNode(context, { id: 'c', loc: [0, 0] }),
      new OsmNode(context, { id: 'w', loc: [-0.0002, 0] }),
      new OsmNode(context, { id: 'e', loc: [0.0002, 0] }),
      new OsmNode(context, { id: 'n', loc: [0, 0.0002] }),
    ]
    const ways = (first: string) => [
      new OsmWay(context, { id: 'w1', nodes: ['c', 'w'], tags: { highway: first } }),
      new OsmWay(context, { id: 'w2', nodes: ['c', 'e'], tags: { highway: 'footway' } }),
      new OsmWay(context, { id: 'w3', nodes: ['c', 'n'], tags: { highway: 'path' } }),
    ]
    expect(isJunction(new Graph(context, [...nodes, ...ways('footway')]), 'c')).toBe(false)
    expect(isJunction(new Graph(context, [...nodes, ...ways('residential')]), 'c')).toBe(false)
  })
})

describe('junctionSketch: what iD shows its field for', () => {
  it('is undefined where the intersection has fewer than three ways (a bend)', () => {
    const context = new ModelContext()
    const graph = new Graph(context, [
      new OsmNode(context, { id: 'c', loc: [0, 0] }),
      new OsmNode(context, { id: 'w', loc: [-0.0002, 0] }),
      new OsmNode(context, { id: 'n', loc: [0, 0.0002] }),
      new OsmWay(context, { id: 'w1', nodes: ['c', 'w'], tags: road }),
      new OsmWay(context, { id: 'w2', nodes: ['c', 'n'], tags: road }),
    ])
    const intersection = osmIntersection(context, graph, 'c', 30)
    expect(intersection && junctionSketch(intersection, 'c', 30, box)).toBeFalsy()
  })

  it('gives each road its heading from the junction: north 0, east 90, west 270', () => {
    const { context, graph } = tJunction()
    const i = intersectionAt(context, graph, 'c')
    const sketch = junctionSketch(i, 'c', 30, box)!
    expect(sketch.roads).toHaveLength(3)
    const headings = sketch.roads.map((item) => Math.round(item.heading)).sort((a, b) => a - b)
    expect(headings).toEqual([0, 90, 270])
  })

  it('offers a oneway that leaves the junction as a road, but not as FROM', () => {
    // the model reads oneway from the schema's rulesets: without them every road counts as two-way
    const context = new ModelContext()
    const schema = new RulesetSchema(context)
    schema.merge({
      assetID: 'test',
      scopes: [
        {
          scope: 'osm',
          rulesets: { oneway_forward: { include: [{ key: 'oneway', value: 'yes' }] } },
        },
      ],
    })
    context.systems.schema = schema
    const graph = new Graph(context, [
      new OsmNode(context, { id: 'c', loc: [0, 0] }),
      new OsmNode(context, { id: 'w', loc: [-0.0002, 0] }),
      new OsmNode(context, { id: 'e', loc: [0.0002, 0] }),
      new OsmNode(context, { id: 'n', loc: [0, 0.0002] }),
      new OsmWay(context, { id: 'ww', nodes: ['c', 'w'], tags: road }),
      new OsmWay(context, { id: 'we', nodes: ['c', 'e'], tags: road }),
      new OsmWay(context, { id: 'away', nodes: ['c', 'n'], tags: { ...road, oneway: 'yes' } }),
    ])
    const i = intersectionAt(context, graph, 'c')
    const sketch = junctionSketch(i, 'c', 30, box)!
    const from = Object.fromEntries(sketch.roads.map((item) => [item.id, item.canBeFrom]))
    expect(from).toEqual({ ww: true, we: true, away: false })
    // into the oneway is a turn, out of it is none, and it has no U-turn
    expect(junctionTurns(sketch, i, 'away', 0, 80)).toEqual([])
    expect(
      junctionTurns(sketch, i, 'ww', 0, 80)
        .map((turn) => turn.to)
        .sort(),
    ).toEqual(['away', 'we', 'ww'])
  })
})

describe('the relation a click writes', () => {
  it('has type=restriction, the kind from the geometry, and the members from, via node, to in that order', () => {
    const { context, graph } = tJunction()
    const i = intersectionAt(context, graph, 'c')
    // from the side road (coming from the north, heading south) to the east arm: a left turn
    const east = i.turns('side', 0).find((turn) => wayOf(i.graph, turn.to.way).nodes.includes('e'))!
    const step = cycleTurn(i, east, 'side', [])!
    const after = apply(step.actions, graph)
    const [relation] = restrictionsOf(after, 'side')
    expect(relation!.tags).toEqual({ type: 'restriction', restriction: 'no_left_turn' })
    expect(relation!.members.map((member) => `${member.role}:${member.type}`)).toEqual([
      'from:way',
      'via:node',
      'to:way',
    ])
    expect(relation!.members[1]!.id).toBe('c')
    expect(relation!.isValidRestriction()).toBe(true)
  })

  it('names the turn to the other arm a right turn: the kind is geometry, whatever side the country drives on (iD)', () => {
    const { context, graph } = tJunction()
    const i = intersectionAt(context, graph, 'c')
    const west = i.turns('side', 0).find((turn) => wayOf(i.graph, turn.to.way).nodes.includes('w'))!
    const after = apply(cycleTurn(i, west, 'side', [])!.actions, graph)
    expect(restrictionsOf(after, 'side')[0]!.tags.restriction).toBe('no_right_turn')
  })

  it('splits the through road at the junction in the same step, so that the to member ends at the via node', () => {
    const { context, graph } = tJunction()
    const i = intersectionAt(context, graph, 'c')
    expect(i.ways).toHaveLength(3)
    const east = i.turns('side', 0).find((turn) => wayOf(i.graph, turn.to.way).nodes.includes('e'))!
    const after = apply(cycleTurn(i, east, 'side', [])!.actions, graph)
    const to = restrictionsOf(after, 'side')[0]!.memberByRole('to')!
    const toWay = wayOf(after, to.id)
    expect(toWay.nodes.includes('c')).toBe(true)
    expect(toWay.nodes.includes('w')).toBe(false)
    // and the FROM road the person chose is still the same road after the step
    const next = intersectionAt(context, after, 'c')
    expect(turnStateOf(turnBetween(next, 'side', to.id))).toBe('restricted')
  })

  it('only -> allowed leaves out a remembered turn whose road is gone', () => {
    const { context, graph } = tJunction()
    const first = intersectionAt(context, graph, 'c')
    const east = first.turns('side', 0).find((candidate) => !candidate.u)!
    const no = apply(cycleTurn(first, east, 'side', [])!.actions, graph)
    const second = intersectionAt(context, no, 'c')
    const restricted = second.turns('side', 0).find((candidate) => candidate.restrictionID)!
    const only = apply(cycleTurn(second, restricted, 'side', [])!.actions, no)
    const third = intersectionAt(context, only, 'c')
    const onlyTurn = third.turns('side', 0).find((candidate) => candidate.only && candidate.direct)!

    const gone: RemovedTurn = {
      key: 'gone',
      path: ['side', 'c', 'w-gone'],
      from: { node: 'n', way: 'side', vertex: 'c' },
      via: { node: 'c' },
      to: { node: 'x', way: 'w-gone', vertex: 'c' },
      u: false,
      restrictionType: 'no_left_turn',
    }
    const step = cycleTurn(third, onlyTurn, 'side', [gone])!
    // the split is done already: what is left is deleting the turn, and nothing is restored
    expect(step.actions).toHaveLength(1)
    const after = apply(step.actions, only)
    expect(restrictionsOf(after, 'side')).toEqual([])
  })
})

describe('via ways', () => {
  it('offers the turns through one via way only when via ways are allowed', () => {
    const { context, graph } = twoJunctions()
    const i = intersectionAt(context, graph, 'a')
    const direct = i.turns('w_in', 0).map((turn) => turn.to.way)
    expect(direct.sort()).toEqual(['w_in', 'w_outA', 'w_via'])
    const far = i.turns('w_in', 1).map((turn) => turn.to.way)
    expect(far.sort()).toEqual(['w_in', 'w_outA', 'w_outB', 'w_outE', 'w_via'])
  })

  it('writes a via way restriction with the members from, via way, to', () => {
    const { context, graph } = twoJunctions()
    const i = intersectionAt(context, graph, 'a')
    const step = cycleTurn(i, turnBetween(i, 'w_in', 'w_outB', 1), 'w_in', [])!
    const after = apply(step.actions, graph)
    const [relation] = restrictionsOf(after, 'w_in')
    expect(relation!.members.map((member) => `${member.role}:${member.id}`)).toEqual([
      'from:w_in',
      'via:w_via',
      'to:w_outB',
    ])
    expect(relation!.isValidRestriction()).toBe(true)
    const next = intersectionAt(context, after, 'a')
    expect(turnStateOf(turnBetween(next, 'w_in', 'w_outB', 1))).toBe('restricted')
    expect(turnStateOf(turnBetween(next, 'w_in', 'w_outE', 1))).toBe('allowed')
  })

  it('draws one arrow per key, also where an ONLY restriction makes several walks end in the same turn', () => {
    const { context, graph } = twoJunctions()
    const first = intersectionAt(context, graph, 'a')
    const no = apply(
      cycleTurn(first, turnBetween(first, 'w_in', 'w_via'), 'w_in', [])!.actions,
      graph,
    )
    const second = intersectionAt(context, no, 'a')
    const only = apply(
      cycleTurn(second, turnBetween(second, 'w_in', 'w_via'), 'w_in', [])!.actions,
      no,
    )
    const third = intersectionAt(context, only, 'a')
    const sketch = junctionSketch(third, 'a', 30, box)!
    for (const from of sketch.roads.filter((item) => item.canBeFrom)) {
      const keys = junctionTurns(sketch, third, from.id, 2, 80).map((turn) => turn.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('a member road is split later', () => {
  it('keeps the restriction valid: the from member is the part that still reaches the via node', () => {
    const context = new ModelContext()
    const graph = new Graph(context, [
      new OsmNode(context, { id: 'c', loc: [0, 0] }),
      new OsmNode(context, { id: 'mid', loc: [0, 0.0001] }),
      new OsmNode(context, { id: 'n', loc: [0, 0.0002] }),
      new OsmNode(context, { id: 'e', loc: [0.0002, 0] }),
      new OsmNode(context, { id: 'w', loc: [-0.0002, 0] }),
      new OsmWay(context, { id: 'north', nodes: ['n', 'mid', 'c'], tags: road }),
      new OsmWay(context, { id: 'east', nodes: ['c', 'e'], tags: road }),
      new OsmWay(context, { id: 'west', nodes: ['c', 'w'], tags: road }),
    ])
    const i = intersectionAt(context, graph, 'c')
    const restricted = apply(
      cycleTurn(i, turnBetween(i, 'north', 'east'), 'north', [])!.actions,
      graph,
    )
    const before = restrictionsOf(restricted, 'north')[0]!

    const split = actionSplit(['mid'])(new Graph(restricted))
    const relation = relationOf(split, before.id)
    expect(relation.isValidRestriction()).toBe(true)
    expect(relation.members.map((member) => member.role)).toEqual(['from', 'via', 'to'])
    const from = wayOf(split, relation.memberByRole('from')!.id)
    expect(from.nodes.includes('c')).toBe(true)
    expect(from.nodes.includes('n')).toBe(false)

    // and the junction still shows the turn as restricted, from the part next to it
    const next = intersectionAt(context, split, 'c')
    expect(turnStateOf(turnBetween(next, from.id, 'east'))).toBe('restricted')
  })
})
