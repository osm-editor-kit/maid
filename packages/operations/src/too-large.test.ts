// The `too_large` rule: an operation refuses a feature that is less than 80 % in view. The rule is
// iD's (percentContainedIn(map extent) < 0.8 in modules/operations/*.js), and Rapid has the same
// threshold. The sentences are iD's (core.yaml, operations.<name>.too_large). Views here are
// lon/lat rectangles, so the shares are plain areas: 4 of 5 is exactly 0.8.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { percentContainedIn, percentInPolygon } from './extent.ts'
import {
  circularizeOperation,
  deleteOperation,
  disconnectOperation,
  extractOperation,
  reflectLongOperation,
  reflectShortOperation,
  squareOperation,
  straightenOperation,
} from './operations.ts'
import type { Extent, Operation, OperationContext } from './types.ts'

const context = new ModelContext()

const node = (id: string, lon: number, lat: number, tags: Record<string, string> = {}) =>
  new OsmNode(context, { id, loc: [lon, lat], tags })
const way = (id: string, nodes: string[], tags: Record<string, string> = {}) =>
  new OsmWay(context, { id, nodes, tags })
const relation = (
  id: string,
  members: { id: string; type: 'node' | 'way' | 'relation'; role: string }[],
  tags: Record<string, string>,
) => new OsmRelation(context, { id, members, tags })

const graphOf = (...entities: OsmEntity[]) => new Graph(context, entities)

/** A view from its west, south, east and north edges */
const view = (west: number, south: number, east: number, north: number): Extent => ({
  min: [west, south],
  max: [east, north],
})
const at = (graph: Graph, selected: string[], viewExtent?: Extent): OperationContext => ({
  graph,
  selected,
  viewExtent,
})

/** Everything in view */
const ALL = view(-1, -1, 10, 10)
/** Covers 4 of the 5 units of width of a quad from 0 to 5, so 80 % of it: allowed */
const EIGHTY = view(0, 0, 4, 1)
/** Covers 3.95 of 5: 79 %, too large */
const SEVENTY_NINE = view(0, 0, 3.95, 1)
/** Nothing of a feature at 9 to 14 is in view */
const NOT_IN_VIEW = EIGHTY

/**
 * A way of four corners from `x0` to `x0 + width`, 0 to 1 high, with a corner of about 84 degrees
 * (squarish, not square). Closed: a ring. Each node is `${id}-0` to `${id}-3`.
 */
function quad(
  id: string,
  x0: number,
  width: number,
  closed = false,
  tags: Record<string, string> = {},
): OsmEntity[] {
  const corners: [number, number][] = [
    [x0, 0],
    [x0 + width, 0],
    [x0 + width, 1],
    [x0 + 0.1, 1],
  ]
  const ids = corners.map((_, i) => `${id}-${i}`)
  const nodes = corners.map(([lon, lat], i) => node(`${id}-${i}`, lon, lat))
  return [...nodes, way(id, closed ? [...ids, `${id}-0`] : ids, tags)]
}

/** A line from (x0, 0) through (x0 + 2.5, 0.5) to (x0 + 5, 0): a bend of about 11 degrees */
function bentLine(id: string, x0: number): OsmEntity[] {
  const n0 = node(`${id}-0`, x0, 0)
  const n1 = node(`${id}-1`, x0 + 2.5, 0.5)
  const n2 = node(`${id}-2`, x0 + 5, 0)
  return [n0, n1, n2, way(id, [`${id}-0`, `${id}-1`, `${id}-2`])]
}

/** Two ways through one vertex, each with two other ends: a vertex that can be disconnected */
function junction(id: string, lon: number, lat: number): OsmEntity[] {
  return [
    node(id, lon, lat),
    node(`${id}-a`, lon, lat),
    node(`${id}-b`, lon, lat),
    node(`${id}-c`, lon, lat),
    node(`${id}-d`, lon, lat),
    way(`${id}-w1`, [`${id}-a`, id, `${id}-b`]),
    way(`${id}-w2`, [`${id}-c`, id, `${id}-d`]),
  ]
}

const TOO_LARGE_DELETE =
  "This feature can't be deleted because not enough of it is currently visible."
const TOO_LARGE_DELETE_SEVERAL =
  "These features can't be deleted because not enough of them are currently visible."
const TOO_LARGE_CIRCLE = "This can't be made round because not enough of it is currently visible."
const TOO_LARGE_CIRCLE_SEVERAL =
  "These can't be made round because not enough of them are currently visible."
const TOO_LARGE_SQUARE = "This can't be made square because not enough of it is currently visible."
const TOO_LARGE_SQUARE_SEVERAL =
  "These can't be made square because not enough of them are currently visible."
const TOO_LARGE_STRAIGHTEN =
  "This can't be straightened because not enough of it is currently visible."
const TOO_LARGE_STRAIGHTEN_SEVERAL =
  "These can't be straightened because not enough of them are currently visible."
const TOO_LARGE_DISCONNECT =
  "This can't be disconnected because not enough of it is currently visible."
const TOO_LARGE_DISCONNECT_SEVERAL =
  "These can't be disconnected because not enough of them are currently visible."
const TOO_LARGE_FLIP =
  "This feature can't be flipped because not enough of it is currently visible."
const TOO_LARGE_FLIP_SEVERAL =
  "These features can't be flipped because not enough of them are currently visible."
const TOO_LARGE_EXTRACT =
  "A point can't be extracted because not enough of this feature is visible."
const TOO_LARGE_EXTRACT_SEVERAL =
  "Points can't be extracted because not enough of these features are visible."

describe('the share of a feature in view', () => {
  it('is the part of the extent that lies in the view, by area (Rapid: 0.25 and 0.5)', () => {
    const a = view(0, 0, 4, 1)
    const b = view(3, 0, 4, 2)
    expect(percentContainedIn(a, b)).toBe(0.25)
    expect(percentContainedIn(b, a)).toBe(0.5)
  })

  it('a point counts as all in view when it lies in the view, and none when it does not', () => {
    expect(percentContainedIn(view(0.5, 0.5, 0.5, 0.5), ALL)).toBe(1)
    expect(percentContainedIn(view(9, 9, 9, 9), EIGHTY)).toBe(0)
  })

  it('an extent that only touches the view from outside has no share in it', () => {
    expect(percentContainedIn(view(4, 0, 5, 1), EIGHTY)).toBe(0)
  })
})

describe('too large: delete', () => {
  const op: Operation = deleteOperation

  it('a point outside the view is too large, a point in view is not', () => {
    const far = graphOf(node('n1', 9, 9))
    expect(op.disabled(at(far, ['n1'], NOT_IN_VIEW))).toBe(TOO_LARGE_DELETE)
    const near = graphOf(node('n1', 1, 0.5))
    expect(op.disabled(at(near, ['n1'], NOT_IN_VIEW))).toBeUndefined()
  })

  it('a way with 80 % in view is allowed, with 79 % it is too large', () => {
    const graph = graphOf(...quad('w1', 0, 5))
    expect(op.applies(at(graph, ['w1']))).toBe(true)
    expect(op.disabled(at(graph, ['w1'], EIGHTY))).toBeUndefined()
    expect(op.disabled(at(graph, ['w1'], SEVENTY_NINE))).toBe(TOO_LARGE_DELETE)
    expect(op.disabled(at(graph, ['w1'], ALL))).toBeUndefined()
  })

  it('a selection is measured by its union: a point just outside, with a way in view, is allowed', () => {
    const graph = graphOf(...quad('w1', 0, 5), node('p1', 5.2, 0.5))
    const inView = view(0, 0, 5, 1)
    expect(op.disabled(at(graph, ['w1', 'p1'], inView))).toBeUndefined()
    expect(op.disabled(at(graph, ['p1'], inView))).toBe(TOO_LARGE_DELETE)
  })

  it('several features too large give the plural sentence', () => {
    const graph = graphOf(node('n1', 9, 9), node('n2', 9.5, 9.5))
    expect(op.disabled(at(graph, ['n1', 'n2'], NOT_IN_VIEW))).toBe(TOO_LARGE_DELETE_SEVERAL)
  })

  it('the view comes before the relation reason: iD checks it first', () => {
    const graph = graphOf(
      ...quad('w1', 9, 5),
      relation('r1', [{ id: 'w1', type: 'way', role: '' }], { type: 'route' }),
    )
    expect(op.disabled(at(graph, ['w1'], NOT_IN_VIEW))).toBe(TOO_LARGE_DELETE)
    expect(op.disabled(at(graph, ['w1']))).toBe(
      "This feature can't be deleted because it is part of a larger relation. You must remove it from the relation first.",
    )
  })

  it('without a view extent nothing is too large', () => {
    const graph = graphOf(node('n1', 9, 9))
    expect(op.disabled(at(graph, ['n1']))).toBeUndefined()
  })
})

describe('too large: make round', () => {
  const op: Operation = circularizeOperation

  it('a closed way with 80 % in view is allowed, with 79 % it is too large', () => {
    const graph = graphOf(...quad('w1', 0, 5, true))
    expect(op.applies(at(graph, ['w1']))).toBe(true)
    expect(op.disabled(at(graph, ['w1'], EIGHTY))).toBeUndefined()
    expect(op.disabled(at(graph, ['w1'], SEVENTY_NINE))).toBe(TOO_LARGE_CIRCLE)
    expect(op.disabled(at(graph, ['w1'], ALL))).toBeUndefined()
  })

  it('a way outside the view is too large, and without a view it never is', () => {
    const graph = graphOf(...quad('w1', 9, 5, true))
    expect(op.disabled(at(graph, ['w1'], NOT_IN_VIEW))).toBe(TOO_LARGE_CIRCLE)
    expect(op.disabled(at(graph, ['w1']))).toBeUndefined()
  })

  it('several ways too large give the plural sentence', () => {
    const graph = graphOf(...quad('w1', 0, 5, true), ...quad('w2', 9, 5, true))
    expect(op.disabled(at(graph, ['w1', 'w2'], EIGHTY))).toBe(TOO_LARGE_CIRCLE_SEVERAL)
  })

  it('a reason from the action comes before the view: an open way is not a loop, wherever it is', () => {
    const graph = graphOf(...quad('w1', 9, 5, false))
    expect(op.disabled(at(graph, ['w1'], NOT_IN_VIEW))).toBe(
      "This can't be made round because it is not a loop.",
    )
  })
})

describe('too large: square', () => {
  const op: Operation = squareOperation

  it('a closed way with 80 % in view is allowed, with 79 % it is too large', () => {
    const graph = graphOf(...quad('w1', 0, 5, true))
    expect(op.disabled(at(graph, ['w1'], ALL))).toBeUndefined()
    expect(op.applies(at(graph, ['w1']))).toBe(true)
    expect(op.disabled(at(graph, ['w1'], EIGHTY))).toBeUndefined()
    expect(op.disabled(at(graph, ['w1'], SEVENTY_NINE))).toBe(TOO_LARGE_SQUARE)
  })

  it('a way outside the view is too large, and without a view it never is', () => {
    const graph = graphOf(...quad('w1', 9, 5, true))
    expect(op.disabled(at(graph, ['w1'], NOT_IN_VIEW))).toBe(TOO_LARGE_SQUARE)
    expect(op.disabled(at(graph, ['w1']))).toBeUndefined()
  })

  it('several ways too large give the plural sentence', () => {
    const graph = graphOf(...quad('w1', 0, 5, true), ...quad('w2', 9, 5, true))
    expect(op.disabled(at(graph, ['w1', 'w2'], EIGHTY))).toBe(TOO_LARGE_SQUARE_SEVERAL)
  })
})

describe('too large: straighten', () => {
  const op: Operation = straightenOperation

  it('a line with 80 % in view is allowed, with 79 % it is too large', () => {
    const graph = graphOf(...bentLine('w1', 0))
    expect(op.disabled(at(graph, ['w1'], ALL))).toBeUndefined()
    expect(op.applies(at(graph, ['w1']))).toBe(true)
    expect(op.disabled(at(graph, ['w1'], EIGHTY))).toBeUndefined()
    expect(op.disabled(at(graph, ['w1'], SEVENTY_NINE))).toBe(TOO_LARGE_STRAIGHTEN)
  })

  it('a line outside the view is too large, and without a view it never is', () => {
    const graph = graphOf(...bentLine('w1', 9))
    expect(op.disabled(at(graph, ['w1'], NOT_IN_VIEW))).toBe(TOO_LARGE_STRAIGHTEN)
    expect(op.disabled(at(graph, ['w1']))).toBeUndefined()
  })

  it('three points outside the view give the plural sentence; without a view they are not too large', () => {
    const graph = graphOf(node('a', 9, 0), node('b', 9.5, 0.2), node('c', 10, 0))
    expect(op.applies(at(graph, ['a', 'b', 'c']))).toBe(true)
    expect(op.disabled(at(graph, ['a', 'b', 'c'], NOT_IN_VIEW))).toBe(TOO_LARGE_STRAIGHTEN_SEVERAL)
    expect(op.disabled(at(graph, ['a', 'b', 'c']))).toBeUndefined()
  })

  it('with two of its nodes picked, only those two nodes must be in view', () => {
    // the line runs on to a node at 9, far outside; the picked nodes at 0 and 5 are in view
    const graph = graphOf(
      node('w1-0', 0, 0),
      node('w1-1', 2.5, 0.5),
      node('w1-2', 5, 0),
      node('w1-far', 9, 0),
      way('w1', ['w1-0', 'w1-1', 'w1-2', 'w1-far']),
    )
    const picked = view(-1, -1, 5.5, 1)
    expect(op.disabled(at(graph, ['w1', 'w1-0', 'w1-2'], picked))).toBeUndefined()
    expect(op.disabled(at(graph, ['w1'], picked))).toBe(TOO_LARGE_STRAIGHTEN)
  })
})

describe('too large: disconnect', () => {
  const op: Operation = disconnectOperation

  it('one vertex outside the view is too large, one in view is not', () => {
    const outside = graphOf(...junction('v1', 9, 9))
    expect(op.disabled(at(outside, ['v1'], NOT_IN_VIEW))).toBe(TOO_LARGE_DISCONNECT)
    const inside = graphOf(...junction('v1', 1, 0.5))
    expect(op.disabled(at(inside, ['v1'], NOT_IN_VIEW))).toBeUndefined()
  })

  it('several vertices: their union is measured, and too large gives the plural sentence', () => {
    const graph = graphOf(...junction('v1', 9, 9), ...junction('v2', 0.5, 0.5))
    expect(op.disabled(at(graph, ['v1', 'v2'], NOT_IN_VIEW))).toBe(TOO_LARGE_DISCONNECT_SEVERAL)
    expect(op.disabled(at(graph, ['v1', 'v2'], ALL))).toBeUndefined()
  })

  it('ways that share two nodes: the shared nodes are the extent, 80 % is allowed', () => {
    // w1 and w2 share s1 at (0, 0) and s2 at (5, 1): the extent is 0 to 5 by 0 to 1
    const graph = graphOf(
      node('s1', 0, 0),
      node('s2', 5, 1),
      node('x1', 1, 0.5),
      node('x2', 2, 0.5),
      node('x3', 3, 0.5),
      node('y1', 1, 0.5),
      node('y2', 2, 0.5),
      node('y3', 3, 0.5),
      way('w1', ['x1', 's1', 'x2', 's2', 'x3']),
      way('w2', ['y1', 's1', 'y2', 's2', 'y3']),
    )
    expect(op.applies(at(graph, ['w1', 'w2']))).toBe(true)
    expect(op.disabled(at(graph, ['w1', 'w2'], EIGHTY))).toBeUndefined()
    expect(op.disabled(at(graph, ['w1', 'w2'], SEVENTY_NINE))).toBe(TOO_LARGE_DISCONNECT_SEVERAL)
  })

  it('without a view extent nothing is too large', () => {
    const graph = graphOf(...junction('v1', 9, 9))
    expect(op.disabled(at(graph, ['v1']))).toBeUndefined()
  })
})

describe('too large: flip long and flip short', () => {
  // three loose nodes: the extent is 0 to 5 by 0 to 1
  const threeNodes = (x0: number) => [node('a', x0, 0), node('b', x0 + 5, 0), node('c', x0 + 5, 1)]

  for (const op of [reflectLongOperation, reflectShortOperation]) {
    it(`${op.id}: 80 % in view is allowed, 79 % is too large, the plural sentence for three`, () => {
      const graph = graphOf(...threeNodes(0))
      expect(op.applies(at(graph, ['a', 'b', 'c']))).toBe(true)
      expect(op.disabled(at(graph, ['a', 'b', 'c'], EIGHTY))).toBeUndefined()
      expect(op.disabled(at(graph, ['a', 'b', 'c'], SEVENTY_NINE))).toBe(TOO_LARGE_FLIP_SEVERAL)
    })

    it(`${op.id}: nodes outside the view are too large, and without a view they never are`, () => {
      const graph = graphOf(...threeNodes(9))
      expect(op.disabled(at(graph, ['a', 'b', 'c'], NOT_IN_VIEW))).toBe(TOO_LARGE_FLIP_SEVERAL)
      expect(op.disabled(at(graph, ['a', 'b', 'c']))).toBeUndefined()
    })
  }

  it('one way in view is flipped with the singular sentence', () => {
    const graph = graphOf(...quad('w1', 9, 5))
    expect(reflectLongOperation.disabled(at(graph, ['w1'], NOT_IN_VIEW))).toBe(TOO_LARGE_FLIP)
  })
})

describe('too large: extract', () => {
  const op: Operation = extractOperation

  it('a tagged point outside the view is too large, one in view is not', () => {
    const outside = graphOf(
      node('p1', 9, 9, { amenity: 'bench' }),
      way('w1', ['p1', 'q1']),
      node('q1', 9.1, 9.1),
    )
    expect(op.disabled(at(outside, ['p1'], NOT_IN_VIEW))).toBe(TOO_LARGE_EXTRACT)
    expect(op.disabled(at(outside, ['p1']))).toBeUndefined()
    const inside = graphOf(
      node('p1', 1, 0.5, { amenity: 'bench' }),
      way('w1', ['p1', 'q1']),
      node('q1', 1.1, 0.6),
    )
    expect(op.disabled(at(inside, ['p1'], NOT_IN_VIEW))).toBeUndefined()
  })

  it('an area with 80 % in view is allowed, with 79 % it is too large', () => {
    const graph = graphOf(...quad('a1', 0, 5, true, { area: 'yes' }))
    expect(op.applies(at(graph, ['a1']))).toBe(true)
    expect(op.disabled(at(graph, ['a1'], EIGHTY))).toBeUndefined()
    expect(op.disabled(at(graph, ['a1'], SEVENTY_NINE))).toBe(TOO_LARGE_EXTRACT)
  })

  it('several points too large give the plural sentence', () => {
    const graph = graphOf(
      node('p1', 9, 9, { amenity: 'bench' }),
      way('w1', ['p1', 'q1']),
      node('q1', 9.1, 9.1),
      node('p2', 9.2, 9.2, { amenity: 'waste_basket' }),
      way('w2', ['p2', 'q2']),
      node('q2', 9.3, 9.3),
    )
    expect(op.disabled(at(graph, ['p1', 'p2'], NOT_IN_VIEW))).toBe(TOO_LARGE_EXTRACT_SEVERAL)
  })
})

describe('new features are exempt, as in Rapid (!isNew && tooLarge)', () => {
  // ids with a minus are new, as the model gives them before a save: `n-1`, `w-1`
  /** A quad of new nodes n-first.. and a new way w-way, closed when asked; 0 to 1 high, from x0 */
  function newQuad(first: number, wayNo: number, x0: number, width: number, closed = false) {
    const corners: [number, number][] = [
      [x0, 0],
      [x0 + width, 0],
      [x0 + width, 1],
      [x0 + 0.1, 1],
    ]
    const ids = corners.map((_, i) => `n-${first + i}`)
    const nodes = corners.map(([lon, lat], i) => node(ids[i] ?? '', lon, lat))
    return [...nodes, way(`w-${wayNo}`, closed ? [...ids, ids[0] ?? ''] : ids)]
  }

  it('delete: new points and ways far outside the view can be deleted', () => {
    const graph = graphOf(node('n-1', 9, 9), node('n-2', 9.5, 9.5), way('w-1', ['n-1', 'n-2']))
    expect(deleteOperation.disabled(at(graph, ['n-1'], NOT_IN_VIEW))).toBeUndefined()
    expect(deleteOperation.disabled(at(graph, ['n-1', 'n-2'], NOT_IN_VIEW))).toBeUndefined()
    expect(deleteOperation.disabled(at(graph, ['w-1'], NOT_IN_VIEW))).toBeUndefined()
  })

  it('delete: a saved feature far out stays too large, also next to new ones', () => {
    const graph = graphOf(node('n-1', 9, 9), node('n1', 9.5, 9.5))
    expect(deleteOperation.disabled(at(graph, ['n1'], NOT_IN_VIEW))).toBe(TOO_LARGE_DELETE)
    expect(deleteOperation.disabled(at(graph, ['n-1', 'n1'], NOT_IN_VIEW))).toBe(
      TOO_LARGE_DELETE_SEVERAL,
    )
  })

  it('straighten: a new line far out is not too large; the same line saved is', () => {
    const fresh = graphOf(
      node('n-1', 9, 0),
      node('n-2', 11.5, 0.5),
      node('n-3', 14, 0),
      way('w-1', ['n-1', 'n-2', 'n-3']),
    )
    expect(straightenOperation.applies(at(fresh, ['w-1'], NOT_IN_VIEW))).toBe(true)
    expect(straightenOperation.disabled(at(fresh, ['w-1'], NOT_IN_VIEW))).toBeUndefined()
    const saved = graphOf(
      node('n1', 9, 0),
      node('n2', 11.5, 0.5),
      node('n3', 14, 0),
      way('w1', ['n1', 'n2', 'n3']),
    )
    expect(straightenOperation.disabled(at(saved, ['w1'], NOT_IN_VIEW))).toBe(TOO_LARGE_STRAIGHTEN)
  })

  it('square and make round: a new closed way far out is not too large', () => {
    const graph = graphOf(...newQuad(10, 2, 9, 5, true))
    expect(squareOperation.disabled(at(graph, ['w-2'], NOT_IN_VIEW))).toBeUndefined()
    expect(circularizeOperation.disabled(at(graph, ['w-2'], NOT_IN_VIEW))).toBeUndefined()
    const saved = graphOf(...quad('w1', 9, 5, true))
    expect(squareOperation.disabled(at(saved, ['w1'], NOT_IN_VIEW))).toBe(TOO_LARGE_SQUARE)
  })

  it('disconnect: a new vertex far out can be disconnected, a saved one cannot', () => {
    const fresh = graphOf(
      node('n-20', 9, 9),
      node('n-21', 9, 9),
      node('n-22', 9, 9),
      node('n-23', 9, 9),
      node('n-24', 9, 9),
      way('w-3', ['n-21', 'n-20', 'n-22']),
      way('w-4', ['n-23', 'n-20', 'n-24']),
    )
    expect(disconnectOperation.applies(at(fresh, ['n-20'], NOT_IN_VIEW))).toBe(true)
    expect(disconnectOperation.disabled(at(fresh, ['n-20'], NOT_IN_VIEW))).toBeUndefined()
    expect(
      disconnectOperation.disabled(at(graphOf(...junction('v1', 9, 9)), ['v1'], NOT_IN_VIEW)),
    ).toBe(TOO_LARGE_DISCONNECT)
  })

  it('extract: a new tagged point far out is not too large', () => {
    const graph = graphOf(
      node('n-30', 9, 9, { amenity: 'bench' }),
      way('w-5', ['n-30', 'n-31']),
      node('n-31', 9.1, 9.1),
    )
    expect(extractOperation.applies(at(graph, ['n-30'], NOT_IN_VIEW))).toBe(true)
    expect(extractOperation.disabled(at(graph, ['n-30'], NOT_IN_VIEW))).toBeUndefined()
  })

  it('flip: new nodes far out are not too large', () => {
    const graph = graphOf(node('n-41', 9, 0), node('n-42', 14, 0), node('n-43', 14, 1))
    for (const op of [reflectLongOperation, reflectShortOperation]) {
      expect(op.disabled(at(graph, ['n-41', 'n-42', 'n-43'], NOT_IN_VIEW))).toBeUndefined()
    }
  })
})

/** A view turned by 45 degrees: the square |lon| + |lat| <= 1, as its corners */
const TURNED: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]
/** The same square, clockwise */
const TURNED_CLOCKWISE: [number, number][] = [...TURNED].reverse()
/** A box view as its corners, counter-clockwise from the south-west */
const boxPolygon = (extent: Extent): [number, number][] => [
  [extent.min[0], extent.min[1]],
  [extent.max[0], extent.min[1]],
  [extent.max[0], extent.max[1]],
  [extent.min[0], extent.max[1]],
]
/** The view as the context's polygon only */
const atPolygon = (
  graph: Graph,
  selected: string[],
  polygon: [number, number][],
): OperationContext => ({ graph, selected, viewPolygon: polygon })
/** A closed way of four nodes, `r` out from (cx, cy) on each side */
const square = (id: string, cx: number, cy: number, r: number): OsmEntity[] => {
  const corners: [number, number][] = [
    [cx - r, cy - r],
    [cx + r, cy - r],
    [cx + r, cy + r],
    [cx - r, cy + r],
  ]
  const ids = corners.map((_, i) => `${id}-${i}`)
  return [
    ...corners.map(([lon, lat], i) => node(`${id}-${i}`, lon, lat)),
    way(id, [...ids, `${id}-0`]),
  ]
}

const deleteOp: Operation = deleteOperation

describe('the share in a view polygon, for a box view (the same numbers as the box)', () => {
  it('a rectangle polygon gives the shares of percentContainedIn, in either winding', () => {
    const a = view(0, 0, 4, 1)
    const b = view(3, 0, 4, 2)
    expect(percentInPolygon(a, boxPolygon(b))).toBe(percentContainedIn(a, b))
    expect(percentInPolygon(b, boxPolygon(a))).toBe(percentContainedIn(b, a))
    expect(percentInPolygon(a, [...boxPolygon(b)].reverse())).toBe(percentContainedIn(a, b))
    expect(percentInPolygon(a, boxPolygon(b))).toBe(0.25)
    expect(percentInPolygon(b, boxPolygon(a))).toBe(0.5)
  })

  it('exactly 80 % is allowed and 79 % is too large, through the polygon too', () => {
    const feature = view(0, 0, 5, 1)
    expect(percentInPolygon(feature, boxPolygon(EIGHTY))).toBe(0.8)
    expect(percentInPolygon(feature, boxPolygon(SEVENTY_NINE))).toBeCloseTo(0.79, 12)
    const graph = graphOf(...quad('w1', 0, 5))
    expect(deleteOp.disabled(atPolygon(graph, ['w1'], boxPolygon(EIGHTY)))).toBeUndefined()
    expect(deleteOp.disabled(atPolygon(graph, ['w1'], boxPolygon(SEVENTY_NINE)))).toBe(
      TOO_LARGE_DELETE,
    )
  })

  it('a point and a line count as the box does: in view when all of it is, edges included', () => {
    expect(percentInPolygon(view(0.5, 0.5, 0.5, 0.5), boxPolygon(ALL))).toBe(1)
    expect(percentInPolygon(view(9, 9, 9, 9), boxPolygon(EIGHTY))).toBe(0)
    expect(percentInPolygon(view(0, 0.5, 4, 0.5), boxPolygon(EIGHTY))).toBe(1)
    expect(percentInPolygon(view(0, 0.5, 4.5, 0.5), boxPolygon(EIGHTY))).toBe(0)
  })
})

describe('too large on a turned view (a square turned 45 degrees)', () => {
  it('a feature in the corner of the bounding box, outside the turned view, is too large', () => {
    const graph = graphOf(...square('w1', 0.8, 0.8, 0.1))
    expect(deleteOp.disabled(atPolygon(graph, ['w1'], TURNED))).toBe(TOO_LARGE_DELETE)
    expect(deleteOp.disabled(atPolygon(graph, ['w1'], TURNED_CLOCKWISE))).toBe(TOO_LARGE_DELETE)
  })

  it('a feature at the centre is not too large', () => {
    const graph = graphOf(...square('w1', 0, 0, 0.1))
    expect(deleteOp.disabled(atPolygon(graph, ['w1'], TURNED))).toBeUndefined()
    expect(deleteOp.disabled(atPolygon(graph, ['w1'], TURNED_CLOCKWISE))).toBeUndefined()
  })

  it('a point in the corner is too large, a point at the centre is not', () => {
    const corner = graphOf(node('n1', 0.9, 0.9))
    expect(deleteOp.disabled(atPolygon(corner, ['n1'], TURNED))).toBe(TOO_LARGE_DELETE)
    const centre = graphOf(node('n1', 0, 0))
    expect(deleteOp.disabled(atPolygon(centre, ['n1'], TURNED))).toBeUndefined()
  })

  it('a box half in the turned view has 3/4 of its area in it', () => {
    // x from 0 to 1, y from -0.5 to 0.5: the part with |x| + |y| <= 1 is 3/4 of the box
    expect(percentInPolygon(view(0, -0.5, 1, 0.5), TURNED)).toBeCloseTo(0.75, 12)
    expect(percentInPolygon(view(0, -0.5, 1, 0.5), TURNED_CLOCKWISE)).toBeCloseTo(0.75, 12)
  })

  it('a point on the edge is in view, a box that touches the view only at a corner is not', () => {
    // the edge from (1, 0) to (0, 1)
    expect(percentInPolygon(view(0.5, 0.5, 0.5, 0.5), TURNED)).toBe(1)
    // the box from x 1 to 2 meets the view only at its corner (1, 0)
    expect(percentInPolygon(view(1, -0.1, 2, 0.1), TURNED)).toBe(0)
  })

  it('a line counts as in view only when all of it is in the polygon', () => {
    expect(percentInPolygon(view(0, 0, 0.5, 0), TURNED)).toBe(1)
    expect(percentInPolygon(view(0, 0, 1.5, 0), TURNED)).toBe(0)
  })

  it('the polygon is used instead of the box when both are in the context', () => {
    const graph = graphOf(node('n1', 0.9, 0.9))
    const both: OperationContext = { graph, selected: ['n1'], viewExtent: ALL, viewPolygon: TURNED }
    expect(deleteOp.disabled(both)).toBe(TOO_LARGE_DELETE)
  })
})
