// The ways by bounding box, for `waysNear`. A grid of 0.002 degrees (about 135 m by 220 m in Berlin)
// keeps every way's box from one run to the next: a run recomputes only the boxes that changed, and
// a neighbour search tests the ways in the cells of its box instead of every way of the list.
// Neighbours come back in id order, so a result does not depend on the order in which the caller
// gives the ways (a loaded graph and an edited one list them in different orders).
import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { boxOf, boxesOverlap } from './geo.ts'
import type { Box, Point } from './geo.ts'

const CELL = 0.002
/** A way that covers more cells than this is kept in a list that every search tests */
const MAX_CELLS = 64

type Entry = {
  id: string
  /** The way object the box was made for: another object for the id means the way changed */
  way: OsmWay | undefined
  /** The box in degrees, from the nodes of the graph it was made for; `undefined` for no box */
  box: Box | undefined
  /** The keys of the cells it is in */
  cells: number[]
  /** Whether it is in the list of large ways instead of the cells */
  large: boolean
  /** The run that named it last: only the ways of the current run are neighbours */
  stamp: number
  /** The search that tested it last, so a way in several cells is tested once */
  query: number
}

/** The ways of a run, and the search for the ones whose box overlaps a way's box */
export type WayIndex = {
  /**
   * Starts a run: names the ways (`ways`, then the ways of `targets` that the list does not give)
   * and makes the boxes of the ones that are new or changed, in `graph`. Returns the run's stamp.
   */
  enter(graph: Graph, ways: Iterable<OsmWay>, targets: Iterable<string>): number
  /** The ways of the run whose box overlaps the box of `way` (in `graph`), without `way` itself, in id order */
  near(graph: Graph, way: OsmWay, stamp: number): OsmWay[]
  /** The box of this way must be made again: a node of it, or the way, changed */
  invalidate(id: string): void
  /** Forgets every box: the next run makes them all again */
  clear(): void
}

/** The box in degrees of a way's nodes in the graph, or `undefined` when none of them has a location */
export function boxOfWay(way: OsmWay, graph: Graph) {
  const points: Point[] = []
  for (const id of way.nodes) {
    const node = graph.hasEntity(id)
    if (node instanceof OsmNode && node.loc) points.push([node.loc[0], node.loc[1]])
  }
  return boxOf(points)
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

// The annotation makes the returned object be checked against the WayIndex interface
export function createWayIndex(): WayIndex {
  const entries = new Map<string, Entry>()
  const cells = new Map<number, Set<Entry>>()
  const large = new Set<Entry>()
  const dirty = new Set<Entry>()
  let stamp = 0
  let query = 0

  function detach(entry: Entry) {
    for (const key of entry.cells) cells.get(key)?.delete(entry)
    entry.cells = []
    large.delete(entry)
    entry.large = false
    entry.box = undefined
  }

  function attach(entry: Entry, graph: Graph) {
    const current = graph.hasEntity(entry.id)
    const box = current instanceof OsmWay ? boxOfWay(current, graph) : undefined
    entry.box = box
    if (!box) return
    const [x0, x1, y0, y1] = cellRange(box)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
      entry.large = true
      large.add(entry)
      return
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = cellKey(x, y)
        let set = cells.get(key)
        if (!set) {
          set = new Set()
          cells.set(key, set)
        }
        set.add(entry)
        entry.cells.push(key)
      }
    }
  }

  function enter(graph: Graph, ways: Iterable<OsmWay>, targets: Iterable<string>) {
    stamp++
    const name = (way: OsmWay) => {
      let entry = entries.get(way.id)
      if (!entry) {
        entry = {
          id: way.id,
          way: undefined,
          box: undefined,
          cells: [],
          large: false,
          stamp: 0,
          query: 0,
        }
        entries.set(way.id, entry)
        dirty.add(entry)
      }
      if (entry.stamp === stamp) return
      if (entry.way !== way) {
        entry.way = way
        dirty.add(entry)
      }
      entry.stamp = stamp
    }
    for (const way of ways) name(way)
    for (const id of targets) {
      const entity = graph.hasEntity(id)
      if (entity instanceof OsmWay) name(entity)
    }
    for (const entry of dirty) {
      detach(entry)
      attach(entry, graph)
    }
    dirty.clear()
    return stamp
  }

  function near(graph: Graph, way: OsmWay, runStamp: number) {
    const box = boxOfWay(way, graph)
    if (!box) return []
    query++
    const found: Entry[] = []
    const test = (entry: Entry) => {
      if (entry.query === query || entry.stamp !== runStamp || entry.id === way.id) return
      entry.query = query
      if (entry.box && boxesOverlap(box, entry.box)) found.push(entry)
    }
    const [x0, x1, y0, y1] = cellRange(box)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) cells.get(cellKey(x, y))?.forEach(test)
    }
    large.forEach(test)
    found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const out: OsmWay[] = []
    for (const entry of found) {
      const current = graph.hasEntity(entry.id)
      if (current instanceof OsmWay) out.push(current)
    }
    return out
  }

  return {
    enter,
    near,
    invalidate(id) {
      const entry = entries.get(id)
      if (entry) dirty.add(entry)
    },
    clear() {
      entries.clear()
      cells.clear()
      large.clear()
      dirty.clear()
    },
  }
}
