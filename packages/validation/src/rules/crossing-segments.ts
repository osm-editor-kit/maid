// A spatial index over the segments of the ways that `crossing_ways` compares, for one run. A query
// returns the segments whose box overlaps a box, so a crossing test only meets segments that can
// cross: a uniform grid of cells in degrees. The cell is about the length of a street segment
// (0.0005 degrees: about 34 m by 55 m in Berlin): a segment covers one to four cells, and a cell holds
// few segments of the ways that are not neighbours. Measured on the dense fixture, 0.002 degrees (the
// cell of `way-index.ts`) was 1.5 times slower than this, and 0.001 about 10 % slower. A segment that
// covers more than `MAX_CELLS` cells (a long one) sits in a list that every query tests.
// The grid is exact for crossings: two segments that cross have overlapping boxes, and the boxes are
// widened a little so that rounding can never hide a crossing.
import type { Graph, OsmWay } from '@osm-editor-kit/maid-model'
import { nodeLoc } from '../geo.ts'
import type { Box, Point } from '../geo.ts'

const CELL = 0.0005
const MAX_CELLS = 64
/** Degrees added to every side of a box (about a tenth of a millimetre) */
const EPSILON = 1e-9

/** One segment of a way: its end nodes, its ends in degrees, and its box (widened by `EPSILON`) */
export type Segment = { from: string; to: string; a: Point; b: Point; box: Box }

/** A segment in the index: the owner it was added with, its position in the owner's list, and the segment */
export type SegmentEntry<Owner> = {
  owner: Owner
  index: number
  segment: Segment
  /** The query that visited it last, so an entry in several cells is returned once */
  query: number
}

export type SegmentIndex<Owner> = {
  /** Adds the segments of one owner (in the order of its list: the index of each one is kept) */
  add(owner: Owner, segments: readonly Segment[]): void
  /** The entries whose box overlaps `box`, each once, in `out` (replaced, not appended) */
  near(box: Box, out: SegmentEntry<Owner>[]): void
}

/** The box of a segment between two points, widened by `EPSILON` */
export function segmentBox(a: Point, b: Point): Box {
  return {
    minLon: Math.min(a[0], b[0]) - EPSILON,
    minLat: Math.min(a[1], b[1]) - EPSILON,
    maxLon: Math.max(a[0], b[0]) + EPSILON,
    maxLat: Math.max(a[1], b[1]) + EPSILON,
  }
}

/** Whether two segments have an end node in common (they meet at a junction, so they do not cross) */
export function sharesNode(a: Segment, b: Segment) {
  return a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to
}

/** The segments of a way, in the order of its nodes. A closed way lists its first node again at the end. */
export function segmentsOf(way: OsmWay, graph: Graph) {
  const segments: Segment[] = []
  const nodes = way.nodes
  for (let i = 0; i + 1 < nodes.length; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]
    if (from === undefined || to === undefined) continue
    const a = nodeLoc(graph, from)
    const b = nodeLoc(graph, to)
    if (a && b) segments.push({ from, to, a, b, box: segmentBox(a, b) })
  }
  return segments
}

function cellRange(box: Box) {
  return [
    Math.floor(box.minLon / CELL),
    Math.floor(box.maxLon / CELL),
    Math.floor(box.minLat / CELL),
    Math.floor(box.maxLat / CELL),
  ] satisfies [number, number, number, number]
}

/** One number for a cell: the coordinates of cells are far below a million in absolute value */
function cellKey(x: number, y: number) {
  return x * 1_000_003 + y
}

function overlaps(a: Box, b: Box) {
  return (
    a.minLon <= b.maxLon && b.minLon <= a.maxLon && a.minLat <= b.maxLat && b.minLat <= a.maxLat
  )
}

function collect<Owner>(
  list: readonly SegmentEntry<Owner>[],
  box: Box,
  query: number,
  out: SegmentEntry<Owner>[],
) {
  for (const entry of list) {
    if (entry.query === query) continue
    entry.query = query
    if (overlaps(box, entry.segment.box)) out.push(entry)
  }
}

export function createSegmentIndex<Owner>(): SegmentIndex<Owner> {
  const cells = new Map<number, SegmentEntry<Owner>[]>()
  const large: SegmentEntry<Owner>[] = []
  let query = 0

  return {
    add(owner, segments) {
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index]
        if (!segment) continue
        const entry: SegmentEntry<Owner> = { owner, index, segment, query: 0 }
        const [x0, x1, y0, y1] = cellRange(segment.box)
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
          large.push(entry)
          continue
        }
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const key = cellKey(x, y)
            const list = cells.get(key)
            if (list) list.push(entry)
            else cells.set(key, [entry])
          }
        }
      }
    },
    near(box, out) {
      out.length = 0
      query++
      const x1 = Math.floor(box.maxLon / CELL)
      const y1 = Math.floor(box.maxLat / CELL)
      for (let x = Math.floor(box.minLon / CELL); x <= x1; x++) {
        for (let y = Math.floor(box.minLat / CELL); y <= y1; y++) {
          const list = cells.get(cellKey(x, y))
          if (list) collect(list, box, query, out)
        }
      }
      collect(large, box, query, out)
    },
  }
}
