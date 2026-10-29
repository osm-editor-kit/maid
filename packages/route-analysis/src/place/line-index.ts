import { distance, EARTH_RADIUS_M, nearestOnSegment, RAD } from '../geo.ts'
import type { Chain, ChainStep, LonLat, RouteInput } from '../types.ts'

/** Side of a grid cell, in metres */
const CELL_M = 250
/** Offsets that keep grid keys positive; cells up to about 500,000 km from the origin */
const KEY_OFFSET = 2 ** 21
const KEY_STRIDE = 2 ** 22

/** The nearest point of the line to a query point */
export type LineHit = {
  /** Metres along the line */
  at: number
  /** Metres from the query point */
  offset: number
  /** Index into `chain.pieces` */
  piece: number
}

/** An index over the main line: where each node lies on it, and what is near a point */
export type LineIndex = {
  /** Metres along the line of every node of the line; a node used twice keeps its first place */
  atOfNode: Map<string, number>
  /** The nearest point of the line within `radius` metres of `p`, or undefined */
  nearest(p: LonLat, radius: number): LineHit | undefined
}

/** One piece of the line between two nodes, in travel order */
type Segment = {
  a: LonLat
  b: LonLat
  /** Metres along the line at `a` */
  at: number
  length: number
  piece: number
}

/**
 * The travel order of a way's nodes for one step. An open way runs end to end, reversed when the step says so. A
 * closed way (first node = last node) gives the arc from `from` to `to`: forward in drawing direction, or backwards
 * when the step is reversed. Empty when the step's nodes are not in the way.
 */
export function travelNodes(way: readonly string[], step: ChainStep): readonly string[] {
  const n = way.length
  if (n > 2 && way[0] === way[n - 1]) {
    const ring = way.slice(0, -1)
    const m = ring.length
    const fi = ring.indexOf(step.from)
    const ti = ring.indexOf(step.to)
    if (fi < 0 || ti < 0) return []
    const dir = step.reversed ? -1 : 1
    const out = [ring[fi] ?? '']
    let i = fi
    do {
      i = (i + dir + m) % m
      out.push(ring[i] ?? '')
    } while (i !== ti)
    return out
  }
  return step.reversed ? [...way].reverse() : way
}

/**
 * Builds the index of a finished chain. Every node of every step gets its metres along the line. `nearest` looks at the
 * grid cells that the query circle touches, not at every segment: the grid is the part that keeps big routes fast.
 */
export function lineIndex(input: RouteInput, chain: Chain): LineIndex {
  const atOfNode = new Map<string, number>()
  const segments: Segment[] = []

  chain.pieces.forEach((piece, pieceIndex) => {
    for (const step of piece.steps) {
      const way = input.ways.get(step.wayId)
      if (!way) continue
      let cum = 0
      let prev: { id: string; pos: LonLat | undefined } | undefined
      for (const id of travelNodes(way, step)) {
        const pos = input.nodes.get(id)
        if (prev?.pos && pos) {
          const length = distance(prev.pos, pos)
          segments.push({ a: prev.pos, b: pos, at: step.at + cum, length, piece: pieceIndex })
          cum += length
        }
        if (!atOfNode.has(id)) atOfNode.set(id, step.at + cum)
        prev = { id, pos }
      }
    }
  })

  return buildGrid(segments, atOfNode)
}

/** Grid of segments, cut in metres around the mean latitude of the line */
function buildGrid(segments: Segment[], atOfNode: Map<string, number>): LineIndex {
  let latSum = 0
  for (const s of segments) latSum += s.a[1] + s.b[1]
  const lat0 = segments.length > 0 ? latSum / (2 * segments.length) : 0
  const ky = EARTH_RADIUS_M * RAD
  const kx = ky * Math.cos(lat0 * RAD)

  const cells = new Map<number, number[]>()
  segments.forEach((s, id) => {
    const x0 = Math.floor((s.a[0] * kx) / CELL_M)
    const x1 = Math.floor((s.b[0] * kx) / CELL_M)
    const y0 = Math.floor((s.a[1] * ky) / CELL_M)
    const y1 = Math.floor((s.b[1] * ky) / CELL_M)
    for (let ix = Math.min(x0, x1); ix <= Math.max(x0, x1); ix++) {
      for (let iy = Math.min(y0, y1); iy <= Math.max(y0, y1); iy++) {
        const key = cellKey(ix, iy)
        const list = cells.get(key)
        if (list) list.push(id)
        else cells.set(key, [id])
      }
    }
  })

  // A segment can sit in several cells of the query box: each is checked once per query.
  const seen = new Int32Array(segments.length)
  let query = 0

  return {
    atOfNode,
    nearest(p, radius) {
      if (!Number.isFinite(radius) || radius < 0) return undefined
      query++
      const px = p[0] * kx
      const py = p[1] * ky
      // the grid's x is metres at lat0; at the point's latitude a metre east is more (or fewer) of them
      const rx = radius * xStretch(kx, ky, p[1])
      const ix0 = Math.floor((px - rx) / CELL_M)
      const ix1 = Math.floor((px + rx) / CELL_M)
      const iy0 = Math.floor((py - radius) / CELL_M)
      const iy1 = Math.floor((py + radius) / CELL_M)
      let best: LineHit | undefined
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iy = iy0; iy <= iy1; iy++) {
          const list = cells.get(cellKey(ix, iy))
          if (!list) continue
          for (const id of list) {
            if (seen[id] === query) continue
            seen[id] = query
            const s = segments[id]
            if (!s) continue
            const hit = nearestOnSegment(p, s.a, s.b)
            if (hit.offset > radius) continue
            if (best === undefined || hit.offset < best.offset) {
              best = { at: s.at + hit.t * s.length, offset: hit.offset, piece: s.piece }
            }
          }
        }
      }
      return best
    },
  }
}

function cellKey(ix: number, iy: number): number {
  return (ix + KEY_OFFSET) * KEY_STRIDE + (iy + KEY_OFFSET)
}

/**
 * Grid units of x per metre east at `lat`, for a grid whose x is `kx` (metres per degree of longitude at its own
 * latitude). Above 1 north of that latitude on the northern half: the degrees of a metre grow as the meridians close.
 */
export function xStretch(kx: number, ky: number, lat: number): number {
  return kx / (ky * Math.max(Math.cos(lat * RAD), 1e-6))
}
