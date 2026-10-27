// Small inputs and chains for the placement tests: plain data, no model and no network.
import { distance } from '../geo.ts'
import type { Chain, ChainStep, Gap, LonLat, Piece, RouteInput, RouteMember } from '../types.ts'

/** A step of a test chain: a member index, optionally run against the drawing direction */
export type StepSpec = number | { index: number; reversed?: boolean }

/** A RouteInput from plain records; the tags default to a bicycle route */
export function makeInput(spec: {
  members: RouteMember[]
  ways?: Record<string, string[]>
  nodes?: Record<string, LonLat>
  tags?: Record<string, string>
  memberTags?: Record<string, Record<string, string>>
  outsideWays?: Record<string, number>
}): RouteInput {
  return {
    tags: spec.tags ?? { type: 'route', route: 'bicycle' },
    members: spec.members,
    ways: new Map(Object.entries(spec.ways ?? {})),
    nodes: new Map(Object.entries(spec.nodes ?? {})),
    memberTags: spec.memberTags ? new Map(Object.entries(spec.memberTags)) : undefined,
    outsideWays: spec.outsideWays ? new Map(Object.entries(spec.outsideWays)) : undefined,
  }
}

/**
 * Nodes `<prefix>0` to `<prefix><count - 1>` in a row from `start`, each `dLon`, `dLat` degrees further on.
 * At latitude 52 one thousandth of a degree of longitude is about 68 m.
 */
export function row(
  prefix: string,
  count: number,
  start: LonLat,
  dLon: number,
  dLat = 0,
): { ids: string[]; pos: Record<string, LonLat> } {
  const ids: string[] = []
  const pos: Record<string, LonLat> = {}
  for (let k = 0; k < count; k++) {
    const id = `${prefix}${k}`
    ids.push(id)
    pos[id] = [start[0] + k * dLon, start[1] + k * dLat]
  }
  return { ids, pos }
}

/** Member of the relation, with the id of a way, node or relation */
export function member(type: RouteMember['type'], id: string, role = ''): RouteMember {
  return { type, id, role }
}

/** Metres between two nodes; 0 when a position is not loaded */
function between(input: RouteInput, a: string, b: string): number {
  const pa = input.nodes.get(a)
  const pb = input.nodes.get(b)
  return pa && pb ? distance(pa, pb) : 0
}

/** Metres along a list of nodes; unloaded positions count as zero */
export function wayMetres(input: RouteInput, nodes: readonly string[]): number {
  let total = 0
  for (let k = 1; k < nodes.length; k++) total += between(input, nodes[k - 1] ?? '', nodes[k] ?? '')
  return total
}

/**
 * A chain of pieces. Each step runs along its way in drawing direction, or against it when `reversed`; its `from` is
 * the first node of the travel order. Gaps between pieces count as zero metres on the line.
 */
export function makeChain(
  input: RouteInput,
  pieces: StepSpec[][],
  linear: Chain['linear'] = 'yes',
  sortedOrder: number[] = [],
): Chain {
  const outPieces: Piece[] = []
  const gaps: Gap[] = []
  let at = 0
  pieces.forEach((specs, pi) => {
    const steps: ChainStep[] = []
    const pieceAt = at
    let pieceLength = 0
    for (const spec of specs) {
      const index = typeof spec === 'number' ? spec : spec.index
      const reversed = typeof spec === 'number' ? false : (spec.reversed ?? false)
      const wayId = input.members[index]?.id ?? ''
      const drawn = input.ways.get(wayId) ?? []
      const travel = reversed ? [...drawn].reverse() : drawn
      const length = wayMetres(input, travel)
      steps.push({
        index,
        wayId,
        reversed,
        from: travel[0] ?? '',
        to: travel[travel.length - 1] ?? '',
        length,
        at: pieceAt + pieceLength,
      })
      pieceLength += length
    }
    const prevLast = outPieces[pi - 1]?.steps.at(-1)
    const first = steps[0]
    if (prevLast && first) {
      gaps.push({
        after: pi - 1,
        from: prevLast.to,
        to: first.from,
        distance: between(input, prevLast.to, first.from),
        at: pieceAt,
      })
    }
    outPieces.push({ steps, at: pieceAt, length: pieceLength, parallel: [] })
    at = pieceAt + pieceLength
  })
  return { pieces: outPieces, linear, gaps, length: at, sortedOrder }
}
