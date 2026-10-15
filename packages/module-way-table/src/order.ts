/**
 * The column order of several selected features (docs/research/way-table.md, 4.10). Pure.
 *
 * - Chain: when the selected ways form one chain (they share end nodes, by the chain rules, and the walk from the
 *   first selected way reaches all of them), the chain order.
 * - Axis: otherwise, along the main axis of their centres (principal direction of the centres, oriented west to east,
 *   or south to north when the axis is vertical). Ties go to the selection order. Needs every way to have a
 *   location: a way with a missing node falls back to the selection order.
 * - Selection: otherwise, or with one way.
 *
 * Nodes and relations in the selection are not columns: they are counted in `notWays`. Beyond `COLUMN_CAP` the table
 * shows the first ones and says how many are hidden.
 */
import { type Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { buildWayChain } from './chain.ts'

/** The most columns the table shows at once */
export const COLUMN_CAP = 24

export type OrderBasis = 'chain' | 'axis' | 'selection'

export type ColumnOrder = {
  /** Every way of the selection, in column order */
  readonly ids: readonly string[]
  /** What the order follows; the table's header says it */
  readonly by: OrderBasis
  /** The first `COLUMN_CAP` of `ids` */
  readonly shown: readonly string[]
  /** How many ways are not shown */
  readonly hidden: number
  /** Selected features that are not ways (nodes, relations) */
  readonly notWays: number
}

/** The centre of a way: the mean of its node locations (lon, lat). Undefined if a node is missing or has no location. */
function centreOf(
  graph: Graph,
  way: OsmWay,
): { readonly lon: number; readonly lat: number } | undefined {
  let sumLon = 0
  let sumLat = 0
  let count = 0
  for (const nodeId of new Set(way.nodes)) {
    const node = graph.hasEntity(nodeId)
    const loc = node instanceof OsmNode ? node.loc : undefined
    if (!loc) return undefined
    sumLon += loc[0]
    sumLat += loc[1]
    count++
  }
  if (count === 0) return undefined
  return { lon: sumLon / count, lat: sumLat / count }
}

/**
 * Orders the centres along their principal axis. Returns the ids in order, or undefined when a centre is unknown.
 * Ties (equal projections) keep the selection order.
 */
function alongAxis(graph: Graph, ways: readonly OsmWay[]): string[] | undefined {
  const centres: { id: string; lon: number; lat: number }[] = []
  for (const way of ways) {
    const c = centreOf(graph, way)
    if (!c) return undefined
    centres.push({ id: way.id, ...c })
  }
  // Scale longitude by the cosine of the mean latitude, so that distances are similar in both directions.
  const meanLat = centres.reduce((sum, c) => sum + c.lat, 0) / centres.length
  const scale = Math.cos((meanLat * Math.PI) / 180)
  const xy = centres.map((c) => ({ id: c.id, x: c.lon * scale, y: c.lat }))

  const mx = xy.reduce((sum, p) => sum + p.x, 0) / xy.length
  const my = xy.reduce((sum, p) => sum + p.y, 0) / xy.length
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of xy) {
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  let dx = Math.cos(angle)
  let dy = Math.sin(angle)
  // Point the axis east when it is mostly horizontal, north when it is mostly vertical.
  const along = Math.abs(dx) >= Math.abs(dy) ? dx : dy
  if (along < 0) {
    dx = -dx
    dy = -dy
  }

  const projected = xy.map((p, index) => ({
    id: p.id,
    index,
    t: (p.x - mx) * dx + (p.y - my) * dy,
  }))
  projected.sort((a, b) => {
    const diff = a.t - b.t
    if (Math.abs(diff) > 1e-12) return diff
    return a.index - b.index
  })
  return projected.map((p) => p.id)
}

/** The order of the selected features, first selected first. See the module comment. */
export function orderColumns(
  graph: Graph,
  selectedIds: readonly string[],
  cap: number = COLUMN_CAP,
): ColumnOrder {
  const ways: OsmWay[] = []
  for (const id of selectedIds) {
    const entity = graph.hasEntity(id)
    if (entity instanceof OsmWay) ways.push(entity)
  }
  const notWays = selectedIds.length - ways.length
  const selectionOrder = ways.map((way) => way.id)

  let ids = selectionOrder
  let by: OrderBasis = 'selection'
  const first = ways[0]
  if (first && ways.length > 1) {
    const members = new Set(selectionOrder)
    const chain = buildWayChain(graph, first.id, {
      maxPerSide: ways.length,
      candidateFilter: (way) => members.has(way.id),
    })
    const chainIds = chain ? chain.ways.map((way) => way.id) : []
    if (chainIds.length === ways.length) {
      ids = chainIds
      by = 'chain'
    } else {
      const axis = alongAxis(graph, ways)
      if (axis) {
        ids = axis
        by = 'axis'
      }
    }
  }

  const shown = ids.slice(0, cap)
  return { ids, by, shown, hidden: ids.length - shown.length, notWays }
}
