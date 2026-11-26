/**
 * Which open task comes after the one just worked on, so that "Next" stays in the same place (Tobias, 2026-11-26):
 * first the task whose line starts where this one's line ends (the way that follows in drawing direction, the
 * straightest if there are several), then the open task nearest to this one, and only for tasks without a geometry the
 * order of the file. Computed when the button is pressed, so it follows the edits: a way that was reversed is followed
 * the way it now runs, and lists loaded before this change follow it too.
 */
import { type Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
import type { Task } from '@osm-editor-kit/maid-tasks'
import { nextOpenIndex } from './list.ts'

/** A point as [lon, lat] */
type Pos = readonly [number, number]

/** The points of a task, and whether they are a line with a direction */
export type TaskShape = { points: readonly Pos[]; line: boolean }

/** A line that starts this close to where the last one ended continues it */
const JOIN_METRES = 1.5
/** Points looked at per task for the distance; longer geometries are thinned, which is close enough for "nearest" */
const MAX_POINTS = 60

/**
 * The shape of a task: the way as the edits left it when the task names one loaded way, else the file's geometry
 * (a line in its order, the outer ring of an area, a point).
 */
export function taskShape(task: Task, graph: Graph | undefined): TaskShape | undefined {
  const refs = task.properties.osm ?? []
  if (graph && refs.length === 1 && refs[0]?.startsWith('way/')) {
    const way = graph.hasEntity(`w${refs[0].slice(4)}`)
    const points = way instanceof OsmWay ? pointsOfWay(graph, way) : undefined
    if (way instanceof OsmWay && points && points.length > 1)
      return { points, line: !way.isClosed() }
  }
  const geometry = task.geometry
  switch (geometry.type) {
    case 'Point':
      return { points: [pos(geometry.coordinates)], line: false }
    case 'LineString':
      return { points: geometry.coordinates.map(pos), line: geometry.coordinates.length > 1 }
    case 'MultiLineString':
      return { points: geometry.coordinates.flat().map(pos), line: false }
    case 'Polygon':
      return { points: (geometry.coordinates[0] ?? []).map(pos), line: false }
    case 'MultiPolygon':
      return {
        points: geometry.coordinates.flatMap((rings) => rings[0] ?? []).map(pos),
        line: false,
      }
    default:
      return undefined
  }
}

/**
 * The open task to go to after `from`: the following line, else the nearest, else the next in file order. Undefined
 * when no other task is open (or `from` itself, when it is the only open one, as `nextOpenIndex`).
 */
export function nextNearIndex(
  statuses: readonly TaskStatus[],
  from: number | null,
  shapeOf: (index: number) => TaskShape | undefined,
): number | undefined {
  const inOrder = nextOpenIndex(statuses, from)
  if (from === null || inOrder === undefined || inOrder === from) return inOrder
  const here = shapeOf(from)
  if (!here || here.points.length === 0) return inOrder

  const end = here.points.at(-1)!
  const before = here.points.at(-2)
  let following: { index: number; turn: number } | undefined
  let nearest: { index: number; metres: number; toEnd: number } | undefined
  const mine = thin(here.points)
  statuses.forEach((status, index) => {
    if (status !== 'open' || index === from) return
    const shape = shapeOf(index)
    if (!shape || shape.points.length === 0) return
    if (here.line && shape.line && before && shape.points.length > 1) {
      if (metresBetween(end, shape.points[0]!) <= JOIN_METRES) {
        const turn = turnBetween(before, end, shape.points[1]!)
        if (!following || turn < following.turn) following = { index, turn }
      }
    }
    const theirs = thin(shape.points)
    let metres = Infinity
    let toEnd = Infinity
    for (const point of theirs) {
      toEnd = Math.min(toEnd, metresBetween(end, point))
      for (const own of mine) metres = Math.min(metres, metresBetween(own, point))
    }
    // equally near (touching at both ends): the one at this task's end goes on forwards
    if (!nearest || metres < nearest.metres || (metres === nearest.metres && toEnd < nearest.toEnd))
      nearest = { index, metres, toEnd }
  })
  return following?.index ?? nearest?.index ?? inOrder
}

function pointsOfWay(graph: Graph, way: OsmWay): Pos[] | undefined {
  const points: Pos[] = []
  for (const id of way.nodes) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return undefined
    points.push([node.loc[0], node.loc[1]])
  }
  return points
}

function pos(coordinate: readonly number[]): Pos {
  return [coordinate[0] ?? 0, coordinate[1] ?? 0]
}

function thin(points: readonly Pos[]): readonly Pos[] {
  if (points.length <= MAX_POINTS) return points
  const step = points.length / MAX_POINTS
  const kept = Array.from({ length: MAX_POINTS }, (_, i) => points[Math.floor(i * step)]!)
  kept.push(points.at(-1)!)
  return kept
}

/** Metres between two points, flat-earth: exact enough for the short distances that matter here */
function metresBetween(a: Pos, b: Pos): number {
  const x = (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180)
  const y = b[1] - a[1]
  return Math.hypot(x, y) * 111_320
}

/** How sharply a line turns at `at`, coming from `from` and going to `to`: 0 straight on, π back */
function turnBetween(from: Pos, at: Pos, to: Pos): number {
  const cos = Math.cos((at[1] * Math.PI) / 180)
  const inAngle = Math.atan2(at[1] - from[1], (at[0] - from[0]) * cos)
  const outAngle = Math.atan2(to[1] - at[1], (to[0] - at[0]) * cos)
  const turn = Math.abs(outAngle - inAngle) % (2 * Math.PI)
  return turn > Math.PI ? 2 * Math.PI - turn : turn
}
