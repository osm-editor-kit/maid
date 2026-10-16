import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import type { OperationContext } from '@osm-editor-kit/maid-operations'
import { divideOperation, fourCornerAreaOf } from './operation.ts'

const context = new ModelContext()

const ORIGIN = [13.4, 52.5] as const
const R = 6378137
const DEG = Math.PI / 180
const KX = R * Math.cos(ORIGIN[1] * DEG) * DEG
const KY = R * DEG

/** A position `x` metres east and `y` metres north of the origin */
function at(x: number, y: number): [number, number] {
  return [ORIGIN[0] + x / KX, ORIGIN[1] + y / KY]
}

/**
 * A graph with one closed way `w1` through the nodes at the given positions, in order (the way closes on its first node).
 * `open` leaves the way open; `extra` adds entities.
 */
function graphOf(
  corners: [number, number][],
  options: { open?: boolean; extra?: OsmEntity[] } = {},
): Graph {
  const nodes = corners.map(([x, y], i) => new OsmNode(context, { id: `n${i + 1}`, loc: at(x, y) }))
  const ids = nodes.map((node) => node.id)
  const way = new OsmWay(context, {
    id: 'w1',
    nodes: options.open ? ids : [...ids, ...ids.slice(0, 1)],
    tags: { building: 'yes' },
  })
  return new Graph(context, [...nodes, way, ...(options.extra ?? [])])
}

const RECTANGLE: [number, number][] = [
  [0, 0],
  [40, 0],
  [40, 20],
  [0, 20],
]
const CONCAVE: [number, number][] = [
  [0, 0],
  [40, 0],
  [10, 10],
  [0, 20],
]
const PENTAGON: [number, number][] = [
  [0, 0],
  [40, 0],
  [40, 20],
  [20, 30],
  [0, 20],
]

/** The operation's context: the graph and the selection */
function contextOf(graph: Graph, selected: string[]): OperationContext {
  return { graph, selected }
}

describe('divideOperation: when it is offered', () => {
  it('applies to one closed way with four corners', () => {
    const graph = graphOf(RECTANGLE)
    expect(divideOperation.applies(contextOf(graph, ['w1']))).toBe(true)
    expect(fourCornerAreaOf(contextOf(graph, ['w1']))).toBe('w1')
  })

  it('does not apply to a way with five corners', () => {
    expect(divideOperation.applies(contextOf(graphOf(PENTAGON), ['w1']))).toBe(false)
  })

  it('does not apply to an open way, to two ways, or to nothing', () => {
    const open = graphOf(RECTANGLE, { open: true })
    expect(divideOperation.applies(contextOf(open, ['w1']))).toBe(false)
    const closed = graphOf(RECTANGLE)
    expect(divideOperation.applies(contextOf(closed, ['w1', 'n1']))).toBe(false)
    expect(divideOperation.applies(contextOf(closed, []))).toBe(false)
  })

  it('does not apply to a node', () => {
    expect(divideOperation.applies(contextOf(graphOf(RECTANGLE), ['n1']))).toBe(false)
  })

  it('has its id, label and icon, and no key', () => {
    expect(divideOperation.id).toBe('divide-area')
    expect(divideOperation.label).toBe('Divide')
    expect(divideOperation.icon).toBe('fas-th')
    expect(divideOperation.shortcut).toBeUndefined()
  })
})

describe('divideOperation: when it cannot run now', () => {
  it('is not disabled for an area that can be divided', () => {
    expect(divideOperation.disabled(contextOf(graphOf(RECTANGLE), ['w1']))).toBeUndefined()
  })

  it('says why for a concave area', () => {
    const reason = divideOperation.disabled(contextOf(graphOf(CONCAVE), ['w1']))
    expect(typeof reason).toBe('string')
    expect(reason?.length).toBeGreaterThan(10)
  })

  it('says why for an area that is a member of a relation', () => {
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon' },
      members: [{ id: 'w1', type: 'way', role: 'outer' }],
    })
    const graph = graphOf(RECTANGLE, { extra: [relation] })
    expect(typeof divideOperation.disabled(contextOf(graph, ['w1']))).toBe('string')
  })
})

describe('divideOperation: run', () => {
  it('returns no actions, since the mode makes the change', () => {
    const result = divideOperation.run(contextOf(graphOf(RECTANGLE), ['w1']))
    expect(result.actions).toEqual([])
  })
})
