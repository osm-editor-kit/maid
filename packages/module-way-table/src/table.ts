/**
 * The model of the table for a selection (docs/research/way-table.md, 4.1, 4.2, 4.10 and 4.12). Pure: it reads the
 * loaded graph and says what the grid shows; the view draws it.
 *
 * - No way selected: a hint (a node, a relation, a way that is not loaded, or nothing).
 * - One way: its chain of ways (buildWayChain), or for a closed building its neighbours (buildAreaChain). The
 *   reference is the way itself.
 * - Several ways: they are the columns, in the order of orderColumns (chain, axis or selection). The reference is the
 *   first selected way. Columns get their direction from the chain of the selection when they form one.
 *
 * A column without a read-only answer is read-only: the table writes only where the editor says a feature may change.
 */
import { type Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { buildAreaChain, isBuildingArea } from './area-chain.ts'
import { buildWayChain, type WayChain } from './chain.ts'
import { COLUMN_CAP, type OrderBasis, orderColumns } from './order.ts'
import type { Column, Tags } from './types.ts'

export type HintReason = 'none' | 'node' | 'relation' | 'missing'

/** A column with its header text: the name, else the ref, else the highway value, else the id */
export type TableColumn = Column & { readonly label: string }

export type TableView = {
  readonly kind: 'table'
  readonly mode: 'way' | 'area' | 'several'
  readonly referenceId: string
  readonly columns: readonly TableColumn[]
  /** The chain of one feature (its stops and junctions); undefined for several features */
  readonly chain: WayChain | undefined
  /** What the order of several features follows; undefined for one feature */
  readonly order: OrderBasis | undefined
  /** Selected ways beyond the cap, not shown */
  readonly hidden: number
  /** Selected features that are not ways */
  readonly notWays: number
}

export type TableModel = { readonly kind: 'hint'; readonly reason: HintReason } | TableView

export type TableOptions = {
  /** Ways per side of a chain (the table asks for 3 at first) */
  readonly maxPerSide: number
  /** Junction node id to the way id that continues through it */
  readonly choose?: ReadonlyMap<string, string> | undefined
  /** True for a feature that may not change. Absent: every feature is read-only. */
  readonly isReadOnly?: ((id: string) => boolean) | undefined
}

/** The text of a way in the table: its name, else its ref, else its highway value, else its id */
export function labelOf(tags: Tags, id: string): string {
  return tags.name || tags.ref || tags.highway || id
}

function hintOf(graph: Graph, id: string): HintReason {
  const entity = graph.hasEntity(id)
  if (entity instanceof OsmNode) return 'node'
  if (entity) return 'relation'
  if (id.startsWith('n')) return 'node'
  if (id.startsWith('r')) return 'relation'
  if (id.startsWith('w')) return 'missing'
  return 'none'
}

function columnOf(
  graph: Graph,
  id: string,
  reversed: boolean,
  options: TableOptions,
): TableColumn[] {
  const entity = graph.hasEntity(id)
  if (!(entity instanceof OsmWay)) return []
  return [
    {
      id,
      tags: entity.tags,
      reversed,
      readOnly: options.isReadOnly ? options.isReadOnly(id) : true,
      label: labelOf(entity.tags, id),
    },
  ]
}

function singleTable(graph: Graph, way: OsmWay, notWays: number, options: TableOptions): TableView {
  const area = way.isClosed() && isBuildingArea(way)
  const chain = area
    ? buildAreaChain(graph, way.id, { maxPerSide: options.maxPerSide })
    : buildWayChain(graph, way.id, { maxPerSide: options.maxPerSide, choose: options.choose })
  // a loaded way always has a chain; the fallback keeps the reference alone
  const ways = chain?.ways ?? [{ id: way.id, reversed: false }]
  const columns = ways.flatMap((item) => columnOf(graph, item.id, item.reversed, options))
  return {
    kind: 'table',
    mode: area ? 'area' : 'way',
    referenceId: way.id,
    columns,
    chain,
    order: undefined,
    hidden: 0,
    notWays,
  }
}

function severalTable(
  graph: Graph,
  first: OsmWay,
  ways: readonly OsmWay[],
  selected: readonly string[],
  options: TableOptions,
): TableView {
  const order = orderColumns(graph, selected, COLUMN_CAP)
  // the direction of each column: from the chain of the selection when it forms one, else every column is forward
  const reversedOf = new Map<string, boolean>()
  if (order.by === 'chain') {
    const members = new Set(ways.map((way) => way.id))
    const chain = buildWayChain(graph, first.id, {
      maxPerSide: ways.length,
      candidateFilter: (way) => members.has(way.id),
    })
    for (const item of chain?.ways ?? []) reversedOf.set(item.id, item.reversed)
  }
  const columns = order.shown.flatMap((id) =>
    columnOf(graph, id, reversedOf.get(id) ?? false, options),
  )
  return {
    kind: 'table',
    mode: 'several',
    referenceId: first.id,
    columns,
    chain: undefined,
    order: order.by,
    hidden: order.hidden,
    notWays: order.notWays,
  }
}

/** What the table shows for the selected ids (in selection order). Reads the loaded graph only. */
export function buildTable(
  graph: Graph,
  selected: readonly string[],
  options: TableOptions,
): TableModel {
  const first = selected[0]
  if (first === undefined) return { kind: 'hint', reason: 'none' }
  const ways = selected.flatMap((id) => {
    const entity = graph.hasEntity(id)
    return entity instanceof OsmWay ? [entity] : []
  })
  const [way] = ways
  if (way === undefined) return { kind: 'hint', reason: hintOf(graph, first) }
  if (ways.length === 1) return singleTable(graph, way, selected.length - 1, options)
  return severalTable(graph, way, ways, selected, options)
}
