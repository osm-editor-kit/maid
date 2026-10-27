import type {
  AnalysisOptions,
  Chain,
  LonLat,
  MemberInfo,
  PlacedPoint,
  RouteInput,
} from '../types.ts'
import type { LineIndex } from './line-index.ts'

/** A point further than this from the line is not placed at all */
const SEARCH_RADIUS_M = 2000
/** The first, cheap search: a point this close is found in the one cell around it */
const NEAR_RADIUS_M = 100
/** A stop or platform this far before the largest place listed before it is out of sequence */
const SEQUENCE_TOLERANCE_M = 10

/**
 * Places the points, stops and platforms of the relation on the line, one entry per such member in member order. A
 * node is placed where it is; a platform way at the average of its nodes. Members of other kinds, unloaded members and
 * relations get no entry. `options` is part of the common signature of the analysis; nothing here reads it.
 */
export function placePoints(
  input: RouteInput,
  members: readonly MemberInfo[],
  chain: Chain,
  index: LineIndex,
  _options: AnalysisOptions,
): PlacedPoint[] {
  const sequenced = chain.linear === 'yes' || chain.linear === 'sorted'
  const out: PlacedPoint[] = []
  let largestAt: number | undefined
  for (const info of members) {
    if (info.kind !== 'point' && info.kind !== 'stop' && info.kind !== 'platform') continue
    const loc = locationOf(input, info)
    const point: PlacedPoint = { index: info.index, outOfSequence: false }
    if (loc) point.loc = loc
    // most points stand beside the line: a small search first, the wide one only when that finds nothing
    const hit = loc
      ? (index.nearest(loc, NEAR_RADIUS_M) ?? index.nearest(loc, SEARCH_RADIUS_M))
      : undefined
    if (hit) {
      point.at = hit.at
      point.offset = hit.offset
      point.piece = hit.piece
    }
    if (info.kind !== 'point' && hit) {
      point.outOfSequence =
        sequenced && largestAt !== undefined && hit.at < largestAt - SEQUENCE_TOLERANCE_M
      largestAt = largestAt === undefined ? hit.at : Math.max(largestAt, hit.at)
    }
    out.push(point)
  }
  return out
}

/** Where a member is: its node, or the average of the nodes of its way. Undefined when not loaded. */
function locationOf(input: RouteInput, info: MemberInfo): LonLat | undefined {
  const { type, id } = info.member
  if (type === 'node') return input.nodes.get(id)
  if (type !== 'way') return undefined
  const way = input.ways.get(id)
  if (!way) return undefined
  // a closed way repeats its first node at the end: count it once
  const n = way.length > 2 && way[0] === way[way.length - 1] ? way.length - 1 : way.length
  let sx = 0
  let sy = 0
  let count = 0
  for (let k = 0; k < n; k++) {
    const pos = input.nodes.get(way[k] ?? '')
    if (!pos) continue
    sx += pos[0]
    sy += pos[1]
    count++
  }
  return count > 0 ? [sx / count, sy / count] : undefined
}
