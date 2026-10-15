/**
 * The areas (buildings) that adjoin a selected area, for the table's columns. Pure, loaded data only.
 *
 * Design (docs/research/way-table.md, 4.9): two areas adjoin when they share an edge, that is two consecutive nodes.
 * A shared corner (one node) does not count in v1. The neighbour across the reference's first shared edge in node
 * order is the left one, the last other one is the right one (decided here; the design says "the other side").
 * A third neighbour is not a column. From each side the walk goes on across the shared edges of the way it reached,
 * and stops at a junction (two or more unseen neighbours), at the end, or at the limit.
 *
 * Output has the same shape as the way chain. Areas have no directional tags, so `reversed` is always false.
 */
import { type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import {
  DEFAULT_MAX_PER_SIDE,
  type ChainJunction,
  type StopReason,
  type WayChain,
} from './chain.ts'
import type { Direction } from './types.ts'

export type AreaChainOptions = {
  /** Areas per side (default `DEFAULT_MAX_PER_SIDE`) */
  readonly maxPerSide?: number
  /** Which ways count as neighbours (default: closed ways with a `building` tag other than `no`) */
  readonly isNeighbour?: (way: OsmWay) => boolean
}

export function isBuildingArea(way: OsmWay): boolean {
  const building = way.tags.building
  return way.isClosed() && building !== undefined && building !== '' && building !== 'no'
}

/** The key of an edge between two nodes, the same for both directions */
function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** The edges of a way in node order. A closed way's last node is its first, so its last edge closes the ring. */
function edgesOf(nodes: readonly string[]): string[] {
  const edges: string[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    if (a !== undefined && b !== undefined && a !== b) edges.push(edgeKey(a, b))
  }
  return edges
}

/** The first shared node of two edge lists, for the junction record */
function sharedNodeOf(a: readonly string[], b: readonly string[]): string | undefined {
  const ends = new Set(b.flatMap((key) => key.split('|')))
  return a.flatMap((key) => key.split('|')).find((node) => ends.has(node))
}

/** The areas that share an edge with `way`, by id, not counting `way` nor the ids in `exclude` */
function neighboursOf(
  graph: Graph,
  way: OsmWay,
  isNeighbour: (way: OsmWay) => boolean,
  exclude: ReadonlySet<string>,
): OsmWay[] {
  const edges = new Set(edgesOf(way.nodes))
  const found = new Map<string, OsmWay>()
  for (const nodeId of new Set(way.nodes)) {
    const node = graph.hasEntity(nodeId)
    if (!node) continue
    for (const other of graph.parentWays(node)) {
      if (other.id === way.id || exclude.has(other.id) || found.has(other.id)) continue
      if (!isNeighbour(other)) continue
      if (edgesOf(other.nodes).some((edge) => edges.has(edge))) found.set(other.id, other)
    }
  }
  return [...found.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

type Side = { readonly ways: readonly OsmWay[]; readonly stop: StopReason }

/** Walks away from the reference across shared edges, starting with `first`, up to `max` areas */
function walkAreas(
  graph: Graph,
  first: OsmWay | undefined,
  direction: Direction,
  max: number,
  seen: Set<string>,
  isNeighbour: (way: OsmWay) => boolean,
  junctions: ChainJunction[],
): Side {
  const ways: OsmWay[] = []
  let stop: StopReason = 'end'
  let current = first

  while (current) {
    if (ways.length >= max) {
      stop = 'limit'
      break
    }
    seen.add(current.id)
    ways.push(current)

    const onward = neighboursOf(graph, current, isNeighbour, seen)
    if (onward.length === 0) {
      stop = 'end'
      break
    }
    const [next] = onward
    if (onward.length > 1 && next) {
      const nodeId =
        sharedNodeOf(edgesOf(current.nodes), edgesOf(next.nodes)) ?? current.nodes[0] ?? ''
      junctions.push({ direction, nodeId, candidates: onward.map((way) => way.id) })
      stop = 'junction'
      break
    }
    current = next
  }
  return { ways, stop }
}

/**
 * The chain of areas around a closed way. Undefined when the reference is not a loaded closed way.
 */
export function buildAreaChain(
  graph: Graph,
  referenceId: string,
  options: AreaChainOptions = {},
): WayChain | undefined {
  const reference = graph.hasEntity(referenceId)
  if (!(reference instanceof OsmWay) || !reference.isClosed()) return undefined

  const max = options.maxPerSide ?? DEFAULT_MAX_PER_SIDE
  const isNeighbour = options.isNeighbour ?? isBuildingArea
  const seen = new Set<string>([reference.id])
  const junctions: ChainJunction[] = []

  // Neighbours across the reference's own edges, in the order of its edges: left is the first, right the last.
  const edgeIndex = new Map<string, number>()
  edgesOf(reference.nodes).forEach((edge, index) => {
    if (!edgeIndex.has(edge)) edgeIndex.set(edge, index)
  })
  const adjoining = neighboursOf(graph, reference, isNeighbour, new Set())
    .map((way) => {
      const indexes = edgesOf(way.nodes).flatMap((edge) => edgeIndex.get(edge) ?? [])
      return { way, first: Math.min(...indexes) }
    })
    .sort((a, b) => a.first - b.first || (a.way.id < b.way.id ? -1 : 1))
    .map((entry) => entry.way)

  const left = adjoining[0]
  const last = adjoining.length > 1 ? adjoining[adjoining.length - 1] : undefined

  const backward = walkAreas(graph, left, 'backward', max, seen, isNeighbour, junctions)
  const rightStart = last && !seen.has(last.id) ? last : undefined
  const forward = walkAreas(graph, rightStart, 'forward', max, seen, isNeighbour, junctions)

  const steps = [...[...backward.ways].reverse(), reference, ...forward.ways]
  return {
    reference: reference.id,
    ways: steps.map((way) => ({ id: way.id, reversed: false })),
    centerIndex: backward.ways.length,
    junctions,
    stops: { backward: backward.stop, forward: forward.stop },
  }
}
