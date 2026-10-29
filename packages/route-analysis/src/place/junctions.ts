import { distance, EARTH_RADIUS_M, RAD } from '../geo.ts'
import type {
  AnalysisOptions,
  Chain,
  Junction,
  LonLat,
  MemberInfo,
  PlacedPoint,
  RouteInput,
} from '../types.ts'
import { type LineIndex, xStretch } from './line-index.ts'

/** A junction gets a guidepost within this many metres, unless the options say otherwise */
const DEFAULT_GUIDEPOST_RADIUS_M = 50

/**
 * The main-line nodes where other loaded ways (not members) meet the line, in order of `at`. Each one names the nearest
 * guidepost member within `options.guidepostRadius` metres, if there is one. Without `outsideWays` there are none.
 */
export function findJunctions(
  input: RouteInput,
  members: readonly MemberInfo[],
  _chain: Chain,
  index: LineIndex,
  points: readonly PlacedPoint[],
  options: AnalysisOptions,
): Junction[] {
  const outside = input.outsideWays
  if (!outside) return []
  const radius = options.guidepostRadius ?? DEFAULT_GUIDEPOST_RADIUS_M
  const guideposts = guidepostGrid(members, points, radius)
  const out: Junction[] = []
  for (const [node, at] of index.atOfNode) {
    const count = outside.get(node) ?? 0
    if (count < 1) continue
    const junction: Junction = { node, at, outside: count }
    const pos = input.nodes.get(node)
    const guidepost = pos ? guideposts.nearest(pos, radius) : undefined
    if (guidepost !== undefined) junction.guidepost = guidepost
    out.push(junction)
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Guideposts with a position, in a grid whose cells are as wide as the search radius */
type GuidepostGrid = {
  /** The member index of the nearest guidepost within `radius` metres of `pos`, or undefined */
  nearest(pos: LonLat, radius: number): number | undefined
}

function guidepostGrid(
  members: readonly MemberInfo[],
  points: readonly PlacedPoint[],
  radius: number,
): GuidepostGrid {
  const posts: { index: number; loc: LonLat }[] = []
  for (const p of points) {
    if (p.loc && members[p.index]?.pointKind === 'guidepost')
      posts.push({ index: p.index, loc: p.loc })
  }
  let latSum = 0
  for (const post of posts) latSum += post.loc[1]
  const lat0 = posts.length > 0 ? latSum / posts.length : 0
  const ky = EARTH_RADIUS_M * RAD
  const kx = ky * Math.cos(lat0 * RAD)
  const cell = Math.max(radius, 1)
  const cells = new Map<string, number[]>()
  posts.forEach((post, k) => {
    const key = cellKey(
      Math.floor((post.loc[0] * kx) / cell),
      Math.floor((post.loc[1] * ky) / cell),
    )
    const list = cells.get(key)
    if (list) list.push(k)
    else cells.set(key, [k])
  })
  return {
    nearest(pos, r) {
      const cx = Math.floor((pos[0] * kx) / cell)
      const cy = Math.floor((pos[1] * ky) / cell)
      // the grid's x is metres at lat0: away from it the radius spans more or fewer cells east and west
      const nx = Math.max(1, Math.ceil((r * xStretch(kx, ky, pos[1])) / cell))
      let best: number | undefined
      let bestDistance = Infinity
      for (let ix = cx - nx; ix <= cx + nx; ix++) {
        for (let iy = cy - 1; iy <= cy + 1; iy++) {
          for (const k of cells.get(cellKey(ix, iy)) ?? []) {
            const post = posts[k]
            if (!post) continue
            const d = distance(pos, post.loc)
            if (d <= r && d < bestDistance) {
              bestDistance = d
              best = post.index
            }
          }
        }
      }
      return best
    },
  }
}

function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`
}
