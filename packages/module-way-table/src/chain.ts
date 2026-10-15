/**
 * The chain of ways around a selected way, for the table's columns. Pure: it reads the loaded graph only.
 *
 * Ported from Tobias's own code: `modules/way_table/chain.ts` of the Radnetz iD fork and `osm-way-chain`'s
 * `buildChain`, `neighborMatch` and `direction` (the street space editor). Rules, as the design lists them
 * (docs/research/way-table.md, 2.1):
 * - a walk starts at the reference and goes backward from its first node and forward from its last node;
 * - the candidates at an end node are the unseen ways that have this node as one of their two end nodes;
 * - same kind is preferred: when a candidate has the same kind (key and value of highway, cycleway, footway,
 *   path, railway or waterway), only those count; otherwise every candidate counts (the fallback lets a road
 *   change its highway class);
 * - a score breaks the tie: +100 same kind, +50 same name, +30 same ref. The best score wins;
 * - any tie is a junction (decided 2026-10-15, as the Radnetz fork): the walk stops and lists the candidates. A
 *   `choose` map, junction node to way id, continues the walk through the chosen way;
 * - a way that is seen once is never added again (loops end the walk); the reference counts as seen;
 * - each way is oriented in chain direction: `reversed` says it points against the reference's direction.
 *
 * Decisions where the design left room: the candidate filter is optional (an app restricts it, for example to
 * road-like ways); a node that is not loaded ends the walk with `unloaded`, and the walk does not guess the ways at it.
 */
import { type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import type { Direction } from './types.ts'

/** Ways shown on each side of the reference. The table asks for 3, with "show 3 more" later. */
export const DEFAULT_MAX_PER_SIDE = 3

/** The keys that define the kind of a way. The first one the way has is its kind. */
const KIND_KEYS = ['highway', 'cycleway', 'footway', 'path', 'railway', 'waterway'] as const

/** The kind of a way as `key=value`, or undefined for a way without a kind key */
export function kindOf(tags: Readonly<Record<string, string>>): string | undefined {
  for (const key of KIND_KEYS) {
    const value = tags[key]
    if (value) return `${key}=${value}`
  }
  return undefined
}

/** The default same-kind test: both ways have the same kind key and value */
export function sameKindWays(a: OsmWay, b: OsmWay): boolean {
  const kind = kindOf(a.tags)
  return kind !== undefined && kind === kindOf(b.tags)
}

/** Why a side of the chain ends: the limit, the end of the road, a junction, or a node that is not loaded */
export type StopReason = 'limit' | 'end' | 'junction' | 'unloaded'

export type ChainWay = {
  readonly id: string
  /** The way points against the reference's direction */
  readonly reversed: boolean
}

/** A side that stopped at a tie: the candidates the mapper can choose from */
export type ChainJunction = {
  readonly direction: Direction
  readonly nodeId: string
  readonly candidates: readonly string[]
}

export type WayChain = {
  readonly reference: string
  /** Left to right, in the reference's direction. The reference is at `centerIndex`. */
  readonly ways: readonly ChainWay[]
  readonly centerIndex: number
  readonly junctions: readonly ChainJunction[]
  readonly stops: Readonly<Record<Direction, StopReason>>
}

export type ChainOptions = {
  /** Ways per side (default `DEFAULT_MAX_PER_SIDE`) */
  readonly maxPerSide?: number
  /** Same-kind test between the way the walk is on and a candidate (default `sameKindWays`) */
  readonly sameKind?: (current: OsmWay, candidate: OsmWay) => boolean
  /** Ways that may continue the chain at all (default: every way). Apps use it to keep roads only. */
  readonly candidateFilter?: (candidate: OsmWay) => boolean
  /** Junction node id to the way id to continue through */
  readonly choose?: ReadonlyMap<string, string>
}

/** A way in the walk, with its nodes in chain direction */
type Step = { readonly way: OsmWay; readonly nodes: readonly string[]; readonly reversed: boolean }

function endNode(nodes: readonly string[], direction: Direction): string | undefined {
  return direction === 'forward' ? nodes[nodes.length - 1] : nodes[0]
}

function touches(way: OsmWay, nodeId: string): boolean {
  return way.nodes[0] === nodeId || way.nodes[way.nodes.length - 1] === nodeId
}

/**
 * Orients a way that touches the walk at `sharedNodeId`: its nodes run in chain direction, which means away from the
 * walk's end when the walk is at its last node, and towards it at the first node. Same rule as the Radnetz fork
 * and `orientNeighbor` of osm-way-chain.
 */
function orient(way: OsmWay, sharedNodeId: string, fromNodes: readonly string[]): Step {
  const fromEndsHere = fromNodes[fromNodes.length - 1] === sharedNodeId
  const wayEndsHere = way.nodes[way.nodes.length - 1] === sharedNodeId
  const reversed = fromEndsHere === wayEndsHere
  return { way, nodes: reversed ? [...way.nodes].reverse() : [...way.nodes], reversed }
}

/** The score of a candidate for the walk: same kind, same name, same ref */
function score(
  current: OsmWay,
  candidate: OsmWay,
  sameKind: NonNullable<ChainOptions['sameKind']>,
): number {
  let result = 0
  if (sameKind(current, candidate)) result += 100
  const name = candidate.tags.name
  if (name && name === current.tags.name) result += 50
  const ref = candidate.tags.ref
  if (ref && ref === current.tags.ref) result += 30
  return result
}

/** The ways that could continue the walk at a node: unseen, touching the node, same kind preferred */
function candidatesAt(
  graph: Graph,
  current: Step,
  nodeId: string,
  seen: ReadonlySet<string>,
  options: ChainOptions,
): OsmWay[] {
  const node = graph.hasEntity(nodeId)
  if (!node) return []
  const filter = options.candidateFilter
  const touching = graph
    .parentWays(node)
    .filter((way) => !seen.has(way.id) && touches(way, nodeId) && (!filter || filter(way)))
  const sameKind = options.sameKind ?? sameKindWays
  const same = touching.filter((way) => sameKind(current.way, way))
  return same.length > 0 ? same : touching
}

type Pick = { readonly way: OsmWay } | { readonly junction: readonly OsmWay[] } | undefined

/** The next way: the only candidate, the best scored one, or the chosen one at a tie; otherwise a junction */
function pickNext(
  current: Step,
  candidates: readonly OsmWay[],
  nodeId: string,
  options: ChainOptions,
): Pick {
  if (candidates.length === 0) return undefined
  const [only] = candidates
  if (candidates.length === 1 && only) return { way: only }

  const sameKind = options.sameKind ?? sameKindWays
  const scored = candidates.map((way) => ({ way, score: score(current.way, way, sameKind) }))
  const top = Math.max(...scored.map((s) => s.score))
  const best = scored.filter((s) => s.score === top)
  if (best.length === 1 && best[0]) return { way: best[0].way }

  const chosenId = options.choose?.get(nodeId)
  const chosen = candidates.find((way) => way.id === chosenId)
  if (chosen) return { way: chosen }
  return { junction: candidates }
}

type Side = { readonly steps: readonly Step[]; readonly stop: StopReason }

function walkSide(
  graph: Graph,
  start: Step,
  direction: Direction,
  max: number,
  seen: Set<string>,
  options: ChainOptions,
  junctions: ChainJunction[],
): Side {
  const steps: Step[] = []
  let current = start
  let stop: StopReason = 'limit'

  while (steps.length < max) {
    const nodeId = endNode(current.nodes, direction)
    if (nodeId === undefined) {
      stop = 'end'
      break
    }
    if (!graph.hasEntity(nodeId)) {
      stop = 'unloaded'
      break
    }

    const candidates = candidatesAt(graph, current, nodeId, seen, options)
    const picked = pickNext(current, candidates, nodeId, options)
    if (!picked) {
      stop = 'end'
      break
    }
    if ('junction' in picked) {
      junctions.push({ direction, nodeId, candidates: picked.junction.map((way) => way.id) })
      stop = 'junction'
      break
    }

    const step = orient(picked.way, nodeId, current.nodes)
    seen.add(step.way.id)
    steps.push(step)
    current = step
  }
  return { steps, stop }
}

/**
 * The chain around a way. Undefined when the reference is not a loaded way. Backward is walked first, then forward;
 * a way taken by one side is seen by the other, so the sides never share a way.
 */
export function buildWayChain(
  graph: Graph,
  referenceId: string,
  options: ChainOptions = {},
): WayChain | undefined {
  const reference = graph.hasEntity(referenceId)
  if (!(reference instanceof OsmWay)) return undefined

  const max = options.maxPerSide ?? DEFAULT_MAX_PER_SIDE
  const centre: Step = { way: reference, nodes: [...reference.nodes], reversed: false }
  const seen = new Set<string>([reference.id])
  const junctions: ChainJunction[] = []

  const backward = walkSide(graph, centre, 'backward', max, seen, options, junctions)
  const forward = walkSide(graph, centre, 'forward', max, seen, options, junctions)

  const ordered = [...backward.steps].reverse()
  return {
    reference: reference.id,
    ways: [...ordered, centre, ...forward.steps].map(({ way, reversed }) => ({
      id: way.id,
      reversed,
    })),
    centerIndex: backward.steps.length,
    junctions,
    stops: { backward: backward.stop, forward: forward.stop },
  }
}
