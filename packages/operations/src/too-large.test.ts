// The `too_large` rule: an operation refuses a feature that is less than 80 % in view. The rule is
// iD's (percentContainedIn(map extent) < 0.8 in modules/operations/*.js), and Rapid has the same
// threshold. The sentences are iD's (core.yaml, operations.<name>.too_large). Views here are
// lon/lat rectangles, so the shares are plain areas: 4 of 5 is exactly 0.8.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { percentContainedIn } from './extent.ts'
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
