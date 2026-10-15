import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import {
  arrowFeatures,
  drawableColour,
  drawingKind,
  drawingOf,
  gapFeatures,
  groupFeatures,
  mapLabelOf,
  memberTravel,
  onSubRouteHovered,
  routeGapEnds,
  setSubRouteHovered,
  subRouteHovered,
  subRoutesOf,
  travelOf,
  wayPositions,
} from './relations-map-shapes.ts'

const context = new ModelContext()

type Member = { id: string; type?: 'node' | 'way' | 'relation'; role?: string }

function node(id: string, lon: number, lat: number) {
  return new OsmNode(context, { id, loc: [lon, lat], tags: {} })
}

function way(id: string, nodes: string[], tags: Record<string, string> = {}) {
  return new OsmWay(context, { id, nodes, tags })
}

function relation(id: string, tags: Record<string, string>, members: Member[] = []) {
  return new OsmRelation(context, {
    id,
    tags,
    members: members.map((m) => ({ id: m.id, type: m.type ?? 'way', role: m.role ?? '' })),
  })
}

function relationIn(graph: Graph, id: string): OsmRelation {
  const found = graph.hasEntity(id)
  if (!(found instanceof OsmRelation)) throw new Error(`no relation ${id}`)
  return found
}

/** A row of nodes along the equator: a at 0, b at 1, c at 2 ... so the ways are easy to read */
const LINE_NODES = {
  a: node('a', 0, 0),
  b: node('b', 1, 0),
  c: node('c', 2, 0),
  d: node('d', 3, 0),
  e: node('e', 4, 0),
}

/** A route of the given members (ways by id), its ways and nodes loaded into a graph. */
function route(
  members: Member[],
  ways: Record<string, string[]>,
  nodes = Object.values(LINE_NODES),
) {
  const graph = new Graph(context, [
    relation('r1', { type: 'route' }, members),
    ...nodes,
    ...Object.entries(ways).map(([id, ids]) => way(id, ids)),
  ])
  return { graph, relation: relationIn(graph, 'r1') }
}

describe('drawableColour and mapLabelOf', () => {
  it('takes hex colours and refuses named ones and empty values', () => {
    expect(drawableColour('#abc')).toBe('#abc')
    expect(drawableColour(' #AABBCC ')).toBe('#AABBCC')
    // a colour name counts when the browser knows it (no CSS in bun test: the check is passed in)
    expect(drawableColour('red')).toBeUndefined()
    expect(drawableColour('red', () => true)).toBe('red')
    expect(drawableColour('oklch(0.6 0.2 30)', () => true)).toBeUndefined()
    expect(drawableColour('#12345')).toBeUndefined()
    expect(drawableColour('')).toBeUndefined()
    expect(drawableColour(undefined)).toBeUndefined()
  })

  it('labels with the ref, else the name, else nothing', () => {
    expect(mapLabelOf({ ref: ' 12 ', name: 'Long name' })).toBe('12')
    expect(mapLabelOf({ name: 'Long name' })).toBe('Long name')
    expect(mapLabelOf({})).toBe('')
  })
})

describe('drawingKind', () => {
  it('is a route for type=route, a group for route_master, superroute, or relation members', () => {
    expect(drawingKind(relation('x', { type: 'route' }))).toBe('route')
    expect(drawingKind(relation('x', { type: 'route_master' }))).toBe('group')
    expect(drawingKind(relation('x', { type: 'superroute' }))).toBe('group')
    expect(drawingKind(relation('x', { type: 'boundary' }, [{ id: 'r2', type: 'relation' }]))).toBe(
      'group',
    )
    expect(drawingKind(relation('x', { type: 'boundary' }, [{ id: 'w1' }]))).toBeUndefined()
  })
})

describe('wayPositions', () => {
  it('gives the coordinates in node order, and nothing when a node is not loaded', () => {
    const { graph } = route([], { w1: ['a', 'b'] })
    expect(wayPositions(graph, way('w1', ['a', 'b']))).toEqual([
      [0, 0],
      [1, 0],
    ])
    expect(wayPositions(graph, way('w2', ['a', 'missing']))).toBeUndefined()
  })
})

describe('routeGapEnds', () => {
  it('gives no ends for a continuous route', () => {
    const { graph, relation } = route([{ id: 'w1' }, { id: 'w2' }], {
      w1: ['a', 'b'],
      w2: ['b', 'c'],
    })
    expect(routeGapEnds(graph, relation)).toEqual([])
  })

  it('gives the two nearest ends of a gap, with the earlier member index', () => {
    const { graph, relation } = route([{ id: 'w1' }, { id: 'w2' }], {
      w1: ['a', 'b'],
      w2: ['c', 'd'],
    })
    expect(routeGapEnds(graph, relation)).toEqual([{ index: 0, from: [1, 0], to: [2, 0] }])
  })

  it('takes the end of the second way that is nearest the first, not its far end', () => {
    // w2 runs from d back to c: its end nearer to b is c
    const { graph, relation } = route([{ id: 'w1' }, { id: 'w2' }], {
      w1: ['a', 'b'],
      w2: ['d', 'c'],
    })
    expect(routeGapEnds(graph, relation)).toEqual([{ index: 0, from: [1, 0], to: [2, 0] }])
  })

  it('skips a gap whose ends are not loaded, and stops and platforms are not part of it', () => {
    const { graph, relation } = route(
      [{ id: 'w1' }, { id: 'p1', role: 'platform' }, { id: 'w2' }],
      { w1: ['a', 'b'], p1: ['e', 'a'], w2: ['c', 'd'] },
    )
    expect(routeGapEnds(graph, relation)).toEqual([{ index: 0, from: [1, 0], to: [2, 0] }])
    const unloaded = route([{ id: 'w1' }, { id: 'w2' }], { w1: ['a', 'b'] })
    expect(routeGapEnds(unloaded.graph, unloaded.relation)).toEqual([])
  })
})

describe('travelOf and memberTravel', () => {
  const a = way('a', ['a', 'b'])
  const b = way('b', ['b', 'c'])
  const reversed = way('rev', ['d', 'c'])

  it('travels a way forward from the node it shares with the way before', () => {
    expect(travelOf(b, a, undefined, '')).toBe('forward')
  })

  it('travels a way backward when it is entered at its last node', () => {
    expect(travelOf(reversed, b, undefined, '')).toBe('backward')
  })

  it('uses the way after when the way before does not connect, and the role when neither does', () => {
    expect(travelOf(a, undefined, b, '')).toBe('forward')
    // c to b, then a: the route leaves the way at its last node, so it travels it forward
    expect(travelOf(way('x', ['c', 'b']), undefined, a, '')).toBe('forward')
    expect(travelOf(way('x', ['c', 'd']), undefined, undefined, 'backward')).toBe('backward')
    expect(travelOf(way('x', ['c', 'd']), undefined, undefined, '')).toBeUndefined()
  })

  it('gives no direction to a closed way, nor to a loop that meets both ends', () => {
    expect(travelOf(way('ring', ['a', 'b', 'c', 'a']), a, undefined, 'forward')).toBeUndefined()
    expect(
      travelOf(way('x', ['a', 'b']), way('y', ['b', 'a']), undefined, 'forward'),
    ).toBeUndefined()
  })

  it('gives each loaded member its travel, and leaves out the members it cannot tell', () => {
    const { graph, relation } = route(
      [{ id: 'w1' }, { id: 'w2' }, { id: 'w3', role: 'forward' }, { id: 'w4' }, { id: 'missing' }],
      { w1: ['a', 'b'], w2: ['c', 'b'], w3: ['d', 'e'], w4: ['x', 'y'] },
    )
    const travel = memberTravel(graph, relation)
    expect(travel.get(0)).toBe('forward')
    expect(travel.get(1)).toBe('backward')
    // w3 is across a gap from w2: its role says forward; w4 touches nothing and has no role
    expect(travel.get(2)).toBe('forward')
    expect(travel.has(3)).toBe(false)
    expect(travel.has(4)).toBe(false)
  })
})

describe('arrowFeatures', () => {
  it('draws a backward member reversed, so the arrows point along the route', () => {
    const { graph, relation } = route([{ id: 'w1' }, { id: 'w2' }], {
      w1: ['a', 'b'],
      w2: ['c', 'b'],
    })
    const collection = arrowFeatures(graph, relation)
    expect(collection.features.map((f) => f.geometry.coordinates)).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
    ])
  })

  it('draws nothing for a route whose members are all unloaded', () => {
    const { graph, relation } = route([{ id: 'w1' }], {})
    expect(arrowFeatures(graph, relation).features).toEqual([])
  })
})

describe('gapFeatures', () => {
  it('puts two point markers on each gap', () => {
    const { graph, relation } = route([{ id: 'w1' }, { id: 'w2' }], {
      w1: ['a', 'b'],
      w2: ['c', 'd'],
    })
    const points = gapFeatures(graph, relation).features
    expect(points.map((p) => p.geometry.coordinates)).toEqual([
      [1, 0],
      [2, 0],
    ])
    expect(points.every((p) => p.properties?.gap === 0)).toBe(true)
  })
})

describe('groupFeatures and subRoutesOf', () => {
  /**
   * A superroute with one own way (w9), and two sub-routes: r2 (ways w1, w2, colour green, ref 2) and r3
   * (way w3, colour blue, ref 3). r4 is not loaded. w2 is also an own member, to test the claim order.
   */
  function superroute() {
    const graph = new Graph(context, [
      relation('super', { type: 'route_master', colour: '#123456' }, [
        { id: 'w9', type: 'way' },
        { id: 'w2', type: 'way' },
        { id: 'r2', type: 'relation' },
        { id: 'r3', type: 'relation' },
        { id: 'r4', type: 'relation' },
      ]),
      relation('r2', { type: 'route', colour: '#00ff00', ref: '2' }, [{ id: 'w1' }, { id: 'w2' }]),
      relation('r3', { type: 'route', colour: '#0000ff', ref: '3', name: 'Long' }, [{ id: 'w3' }]),
      ...Object.values(LINE_NODES),
      way('w1', ['a', 'b']),
      way('w2', ['b', 'c']),
      way('w3', ['c', 'd']),
      way('w9', ['d', 'e']),
    ])
    return { graph, relation: relationIn(graph, 'super') }
  }

  it('splits the members into own ways and sub-route ways, and skips a sub-route not loaded', () => {
    const { graph, relation } = superroute()
    const { direct, subRoutes } = subRoutesOf(graph, relation)
    expect(direct).toEqual(['w9', 'w2'])
    expect(subRoutes.map((s) => [s.id, s.colour, s.label, s.ways])).toEqual([
      ['r2', '#00ff00', '2', ['w1', 'w2']],
      ['r3', '#0000ff', '3', ['w3']],
    ])
  })

  it('draws the own ways strong and the sub-route ways lighter when no sub-route is hovered', () => {
    const { graph, relation } = superroute()
    const { lines } = groupFeatures(graph, relation, null)
    // w9 and w2 are own ways: strong in the superroute colour; w1 and w3 are lighter in their sub-route colours
    expect(lines.features.length).toBe(4)
    expect(lines.features.find((f) => f.geometry.coordinates[0]?.[0] === 3)?.properties).toEqual({
      colour: '#123456',
      strong: 1,
    })
    expect(lines.features.find((f) => f.geometry.coordinates[0]?.[0] === 0)?.properties).toEqual({
      colour: '#00ff00',
      strong: 0,
    })
  })

  it('makes only the hovered sub-route strong, and takes its colour for a way it shares with the superroute', () => {
    const { graph, relation } = superroute()
    const { lines } = groupFeatures(graph, relation, 'r2')
    const props = lines.features.map((f) => f.properties)
    // w1 and w2 (both in r2) are strong in r2's colour; w9 and w3 are lighter
    expect(props.filter((p) => p?.strong === 1).map((p) => p?.colour)).toEqual([
      '#00ff00',
      '#00ff00',
    ])
    expect(props.filter((p) => p?.strong === 0).map((p) => p?.colour)).toEqual([
      '#123456',
      '#0000ff',
    ])
    expect(lines.features.length).toBe(4)
  })

  it('gives one label per sub-route, on its longest loaded way', () => {
    const { graph, relation } = superroute()
    const { labels } = groupFeatures(graph, relation, null)
    expect(labels.features.map((f) => [f.properties?.label, f.properties?.colour])).toEqual([
      ['2', '#00ff00'],
      ['3', '#0000ff'],
    ])
  })

  it('draws nothing for a plain relation, and the drawing of a route has gaps and arrows only', () => {
    const plain = new Graph(context, [relation('p', { type: 'boundary' }, [{ id: 'w1' }])])
    expect(drawingOf(plain, relationIn(plain, 'p'), null)).toBeUndefined()
    const routed = route([{ id: 'w1' }, { id: 'w2' }], { w1: ['a', 'b'], w2: ['c', 'd'] })
    const drawing = drawingOf(routed.graph, routed.relation, null)
    expect(drawing?.gaps.features.length).toBe(2)
    // across the gap neither way has a neighbour it meets and no role: no direction, so no arrows
    expect(drawing?.arrows.features.length).toBe(0)
    expect(drawing?.groups.features).toEqual([])
    const grouped = superroute()
    const group = drawingOf(grouped.graph, grouped.relation, null)
    expect(group?.gaps.features).toEqual([])
    expect(group?.groups.features.length).toBe(4)
  })
})

describe('the sub-route the sidebar points at', () => {
  it('tells its listeners when it changes, and stops when they unsubscribe', () => {
    let calls = 0
    const stop = onSubRouteHovered(() => calls++)
    setSubRouteHovered('r2')
    expect(subRouteHovered()).toBe('r2')
    setSubRouteHovered('r2')
    expect(calls).toBe(1)
    stop()
    setSubRouteHovered(null)
    expect(subRouteHovered()).toBeNull()
    expect(calls).toBe(1)
  })
})
