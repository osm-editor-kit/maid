import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity } from '@osm-editor-kit/maid-model'
import {
  circularizeOperation,
  defaultOperations,
  disconnectOperation,
  extractOperation,
  mergeOperation,
  reflectLongOperation,
  reflectShortOperation,
  reverseOperation,
  splitOperation,
  squareOperation,
  straightenOperation,
} from './operations.ts'
import type { Operation, OperationContext, OperationResult } from './types.ts'

const context = new ModelContext()

// Coordinates are [lon, lat] near the equator, where the Mercator projection is close to a
// uniform scale: angles and distances in degrees behave like the map's angles and distances.
function node(id: string, lon: number, lat: number, tags: Record<string, string> = {}): OsmNode {
  return new OsmNode(context, { id, loc: [lon, lat], tags })
}

function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

function at(selected: string[], graph: Graph): OperationContext {
  return { graph, selected }
}

/** Applies the actions of a result in order, as the editor does */
function apply(graph: Graph, result: OperationResult): Graph {
  return result.actions.reduce<Graph>((g, action: Action) => action(g), graph)
}

/**
 * Checks that the operation applies and is not disabled, then runs it. The editor passes a head
 * graph (a copy of the base graph) to operations and to actions, so the tests do the same.
 */
function run(
  op: Operation,
  base: Graph,
  selected: string[],
): { result: OperationResult; after: Graph; select: string[] | undefined } {
  const ctx = at(selected, new Graph(base))
  expect(op.applies(ctx)).toBe(true)
  expect(op.disabled(ctx)).toBeUndefined()
  const result = op.run(ctx)
  const after = apply(new Graph(base), result)
  return { result, after, select: result.select?.(after) }
}

/** The way with this id in the graph, or a failing expectation */
function wayIn(graph: Graph, id: string): OsmWay {
  const entity = graph.entity(id)
  expect(entity).toBeInstanceOf(OsmWay)
  if (!(entity instanceof OsmWay)) throw new Error(`${id} is not a way`)
  return entity
}

/** The location of a node in the graph */
function locOf(graph: Graph, id: string): [number, number] {
  const entity = graph.entity(id)
  if (!(entity instanceof OsmNode) || !entity.loc) throw new Error(`${id} has no location`)
  return [entity.loc[0], entity.loc[1]]
}

/** Angle in degrees at `b` between the segments to `a` and to `c` */
function angleAt(a: [number, number], b: [number, number], c: [number, number]): number {
  const [ax, ay] = [a[0] - b[0], a[1] - b[1]]
  const [cx, cy] = [c[0] - b[0], c[1] - b[1]]
  const cos = (ax * cx + ay * cy) / (Math.hypot(ax, ay) * Math.hypot(cx, cy))
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

describe('the operation list', () => {
  it('offers the operations in iD menu order with their keys', () => {
    expect(defaultOperations.map((op) => [op.id, op.label, op.shortcut])).toEqual([
      ['continue', 'Continue', 'a'],
      ['reverse', 'Reverse', 'v'],
      ['split', 'Split', 'x'],
      ['merge', 'Merge', 'c'],
      ['straighten', 'Straighten', 's'],
      ['square', 'Square', 'q'],
      ['circularize', 'Make round', 'o'],
      ['line-to-area', 'Treat as area', undefined],
      ['disconnect', 'Disconnect', 'd'],
      ['extract', 'Extract', 'e'],
      ['reflect-long', 'Flip long', 't'],
      ['reflect-short', 'Flip short', 'y'],
      ['delete', 'Delete', undefined],
    ])
  })
})

describe('reverse', () => {
  const line = graphOf(
    node('n1', 0, 0),
    node('n2', 0.001, 0),
    node('n3', 0.002, 0),
    way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
  )

  it('reverses the node order of a line', () => {
    const { result, after } = run(reverseOperation, line, ['w1'])
    expect(wayIn(after, 'w1').nodes).toEqual(['n3', 'n2', 'n1'])
    expect(result.annotation).toBe('Reversed a line')
  })

  it('reverses the direction tag of a node', () => {
    const signal = graphOf(node('n1', 0, 0, { direction: 'forward' }))
    const { after, result } = run(reverseOperation, signal, ['n1'])
    expect(after.entity('n1').tags.direction).toBe('backward')
    expect(result.annotation).toBe('Reversed a point')
  })

  it('does not apply to an area or to a point without a direction', () => {
    const area = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.001, 0.001),
      way('w1', ['n1', 'n2', 'n3', 'n1'], { area: 'yes' }),
    )
    expect(reverseOperation.applies(at(['w1'], area))).toBe(false)
    expect(reverseOperation.applies(at(['n1'], line))).toBe(false)
  })

  it('has no disabled state: iD never disables reverse', () => {
    expect(reverseOperation.disabled(at(['w1'], line))).toBeUndefined()
  })
})

describe('split', () => {
  const road = graphOf(
    node('n1', 0, 0),
    node('n2', 0.001, 0),
    node('n3', 0.002, 0),
    node('n4', 0.003, 0),
    way('w1', ['n1', 'n2', 'n3', 'n4'], { highway: 'residential' }),
  )

  it('splits every way through the selected vertex, selecting the vertex and both ways', () => {
    const { after, result, select } = run(splitOperation, road, ['n2'])
    const ways = after.parentWays(after.entity('n2'))
    expect(ways).toHaveLength(2)
    const nodeLists = ways.map((w) => w.nodes.join(',')).sort()
    expect(nodeLists).toEqual(['n1,n2', 'n2,n3,n4'])
    expect(result.annotation).toBe('Split a line')
    expect(select).toContain('n2')
    expect(select).toHaveLength(3)
  })

  it('does not apply to a way without a selected vertex', () => {
    expect(splitOperation.applies(at(['w1'], road))).toBe(false)
  })

  it('is disabled at the end of a line: nothing can be split there', () => {
    const ctx = at(['n1'], road)
    expect(splitOperation.applies(ctx)).toBe(true)
    expect(splitOperation.disabled(ctx)).toBe("Lines can't be split at their beginning or end.")
  })
})

describe('merge', () => {
  const chain = graphOf(
    node('n1', 0, 0),
    node('n2', 0.001, 0),
    node('n3', 0.002, 0),
    node('n4', 0.1, 0.1),
    node('n5', 0.2, 0.1),
    way('w1', ['n1', 'n2'], { highway: 'residential' }),
    way('w2', ['n2', 'n3'], { highway: 'residential' }),
    way('w3', ['n4', 'n5'], { highway: 'residential' }),
  )

  it('joins two lines that share an end node into one line', () => {
    const { after, result, select } = run(mergeOperation, chain, ['w1', 'w2'])
    const survivors = select ?? []
    expect(survivors).toHaveLength(1)
    const [survivor] = survivors
    expect(survivor).toBeDefined()
    if (survivor === undefined) return
    expect(wayIn(after, survivor).nodes).toEqual(['n1', 'n2', 'n3'])
    expect(result.annotation).toBe('Merged 2 lines')
  })

  it('does not apply to a single line', () => {
    expect(mergeOperation.applies(at(['w1'], chain))).toBe(false)
  })

  it('is disabled for two lines whose ends do not meet', () => {
    const ctx = at(['w1', 'w3'], chain)
    expect(mergeOperation.applies(ctx)).toBe(true)
    expect(mergeOperation.disabled(ctx)).toBe(
      "These features can't be merged because their endpoints aren't connected.",
    )
  })
})

describe('straighten', () => {
  // The middle node is 0.00005 degrees off the line, well inside the 20% tolerance
  const bent = graphOf(
    node('n1', 0, 0),
    node('n2', 0.001, 0.00005),
    node('n3', 0.002, 0),
    way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
  )

  it('removes the bend of a line', () => {
    const { after, result } = run(straightenOperation, bent, ['w1'])
    expect(wayIn(after, 'w1').nodes).toEqual(['n1', 'n3'])
    expect(result.annotation).toBe('Straightened a line')
  })

  it('does not apply to a closed way', () => {
    const ring = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.001, 0.001),
      way('w1', ['n1', 'n2', 'n3', 'n1'], { building: 'yes' }),
    )
    expect(straightenOperation.applies(at(['w1'], ring))).toBe(false)
  })

  it('is disabled when the line bends too much', () => {
    const kinked = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0.001),
      node('n3', 0.002, 0),
      way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
    )
    const ctx = at(['w1'], kinked)
    expect(straightenOperation.applies(ctx)).toBe(true)
    expect(straightenOperation.disabled(ctx)).toBe('This line bends too much to be straightened.')
  })
})

describe('square', () => {
  // A skewed rectangle: the corner at (0.0023, 0.002) is pulled away from a right angle
  const skewed = graphOf(
    node('n1', 0, 0),
    node('n2', 0.002, 0),
    node('n3', 0.0023, 0.002),
    node('n4', 0, 0.002),
    way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { building: 'yes' }),
  )

  it('makes every corner of a closed way a right angle', () => {
    const { after, result } = run(squareOperation, skewed, ['w1'])
    expect(result.annotation).toBe('Squared the corners of a feature')
    const corners = wayIn(after, 'w1')
      .nodes.slice(0, -1)
      .map((id) => locOf(after, id))
    expect(corners).toHaveLength(4)
    // Tolerance 0.1 degree. Before, the skewed corners measure 98.5 and 81.5 degrees; after squaring
    // the largest deviation is about 0.005 degrees (measured once when the test was written).
    const tolerance = 0.1
    corners.forEach((corner, i) => {
      const prev = corners[(i + corners.length - 1) % corners.length]
      const next = corners[(i + 1) % corners.length]
      if (!prev || !next) throw new Error('missing corner')
      expect(Math.abs(angleAt(prev, corner, next) - 90)).toBeLessThan(tolerance)
    })
  })

  it('does not apply to a point that is not on a way', () => {
    expect(squareOperation.applies(at(['n1'], graphOf(node('n1', 0, 0))))).toBe(false)
  })

  it('squares one corner of a way', () => {
    const { result } = run(squareOperation, skewed, ['n3'])
    expect(result.annotation).toBe('Squared a corner')
  })

  it('is disabled for the endpoint of a line', () => {
    const line = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.002, 0.0005),
      way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
    )
    const ctx = at(['n1'], line)
    expect(squareOperation.applies(ctx)).toBe(true)
    expect(squareOperation.disabled(ctx)).toBe("This can't be squared because it is an endpoint.")
  })
})

describe('make round', () => {
  const square = graphOf(
    node('n1', 0, 0),
    node('n2', 0.002, 0),
    node('n3', 0.002, 0.002),
    node('n4', 0, 0.002),
    way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { building: 'yes' }),
  )

  it('turns a closed way into a circle', () => {
    const { after, result } = run(circularizeOperation, square, ['w1'])
    expect(result.annotation).toBe('Made a feature circular')
    const ring = wayIn(after, 'w1')
      .nodes.slice(0, -1)
      .map((id) => locOf(after, id))
    expect(ring.length).toBeGreaterThan(4)
    const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length
    const cy = ring.reduce((sum, p) => sum + p[1], 0) / ring.length
    const radii = ring.map((p) => Math.hypot(p[0] - cx, p[1] - cy))
    const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length
    // every node within 2% of the mean radius
    for (const r of radii) expect(Math.abs(r - mean) / mean).toBeLessThan(0.02)
  })

  it('does not apply to a point', () => {
    expect(circularizeOperation.applies(at(['n1'], square))).toBe(false)
  })

  it('is disabled for a line that is not a loop', () => {
    const line = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.002, 0.0005),
      way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
    )
    const ctx = at(['w1'], line)
    expect(circularizeOperation.applies(ctx)).toBe(true)
    expect(circularizeOperation.disabled(ctx)).toBe(
      "This can't be made round because it is not a loop.",
    )
  })
})

describe('disconnect', () => {
  // n2 is an interior node of both roads: a crossing
  const crossing = graphOf(
    node('n1', 0, 0),
    node('n2', 0.001, 0),
    node('n3', 0.002, 0),
    node('n4', 0.001, -0.001),
    node('n5', 0.001, 0.001),
    way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
    way('w2', ['n4', 'n2', 'n5'], { highway: 'residential' }),
  )

  it('separates the ways at a shared vertex, which gets a new node on one of them', () => {
    const { after, result } = run(disconnectOperation, crossing, ['n2'])
    expect(result.annotation).toBe('Disconnected features')
    const withN2 = [wayIn(after, 'w1'), wayIn(after, 'w2')].filter((w) => w.nodes.includes('n2'))
    expect(withN2).toHaveLength(1)
    const other = [wayIn(after, 'w1'), wayIn(after, 'w2')].find((w) => !w.nodes.includes('n2'))
    expect(other?.nodes).toHaveLength(3)
    expect(
      other?.nodes.some((id) => id !== 'n1' && id !== 'n3' && id !== 'n4' && id !== 'n5'),
    ).toBe(true)
  })

  it('separates two ways that share a node from each other', () => {
    const chain = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.002, 0),
      way('w1', ['n1', 'n2'], { highway: 'residential' }),
      way('w2', ['n2', 'n3'], { highway: 'residential' }),
    )
    const { after, result } = run(disconnectOperation, chain, ['w1', 'w2'])
    expect(result.annotation).toBe('Disconnected features from each other')
    expect(wayIn(after, 'w1').nodes).toContain('n2')
    expect(wayIn(after, 'w2').nodes).not.toContain('n2')
  })

  it('does not apply to a point without ways', () => {
    expect(disconnectOperation.applies(at(['n9'], graphOf(node('n9', 0, 0))))).toBe(false)
  })

  it('is disabled at the endpoint of a single line, where nothing is connected', () => {
    const ctx = at(['n1'], crossing)
    expect(disconnectOperation.applies(ctx)).toBe(true)
    expect(disconnectOperation.disabled(ctx)).toBe(
      "There aren't enough lines or areas here to disconnect.",
    )
  })
})

describe('extract', () => {
  const signal = graphOf(
    node('n1', 0, 0),
    node('n2', 0.001, 0, { highway: 'traffic_signals' }),
    node('n3', 0.002, 0),
    way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
  )

  it('detaches a tagged vertex from its way as a free point, which is selected', () => {
    const { after, result, select } = run(extractOperation, signal, ['n2'])
    expect(result.annotation).toBe('Extracted a point')
    // the original node keeps its tags and becomes the free point; the way gets an untagged replacement
    expect(select).toEqual(['n2'])
    expect(after.entity('n2').tags).toEqual({ highway: 'traffic_signals' })
    const nodes = wayIn(after, 'w1').nodes
    expect(nodes).toHaveLength(3)
    expect(nodes).not.toContain('n2')
    const replacement = nodes[1]
    expect(replacement).toBeDefined()
    if (replacement === undefined) return
    expect(after.entity(replacement).tags).toEqual({})
    expect(locOf(after, replacement)).toEqual(locOf(after, 'n2'))
  })

  it('does not apply to a vertex without tags of its own', () => {
    expect(extractOperation.applies(at(['n1'], signal))).toBe(false)
  })

  it('does not apply to a tagged point that belongs to no way', () => {
    const lone = graphOf(node('n9', 0, 0, { amenity: 'bench' }))
    expect(extractOperation.applies(at(['n9'], lone))).toBe(false)
  })

  it('has no disabled state: iD disables extract only for the viewport', () => {
    expect(extractOperation.disabled(at(['n2'], signal))).toBeUndefined()
  })
})

describe('flip', () => {
  // A long rectangle lying along the equator, 4 wide and 1 high, with one corner cut off so that
  // a flip is visible: n3 sits at three quarters of the top edge.
  //   n4 ------- n3
  //   |            \
  //   n1 --------- n2
  const shape = graphOf(
    node('n1', 0, 0),
    node('n2', 0.0004, 0),
    node('n3', 0.0003, 0.0001),
    node('n4', 0, 0.0001),
    way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { area: 'yes' }),
  )

  it('mirrors along the long axis: top and bottom swap, left and right stay', () => {
    const { after, result } = run(reflectLongOperation, shape, ['w1'])
    expect(result.annotation).toBe('Flipped a feature')
    // n3 was at the top right of the cut corner; flipped over the horizontal middle it is at the bottom
    expect(locOf(after, 'n3')[0]).toBeCloseTo(0.0003, 6)
    expect(locOf(after, 'n3')[1]).toBeLessThan(locOf(after, 'n2')[1])
    expect(locOf(after, 'n1')[0]).toBeCloseTo(0, 6)
  })

  it('mirrors along the short axis: left and right swap', () => {
    const { after } = run(reflectShortOperation, shape, ['w1'])
    // n1 and n4 were the left side; now they are the right side
    expect(locOf(after, 'n1')[0]).toBeGreaterThan(locOf(after, 'n2')[0])
    expect(locOf(after, 'n4')[1]).toBeCloseTo(0.0001, 6)
  })

  it('does not apply to a single node', () => {
    expect(reflectLongOperation.applies(at(['n1'], new Graph(shape)))).toBe(false)
  })
})
