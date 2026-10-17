/**
 * The edit menu's "Cut": for one selected area, or one multipolygon, a line is drawn across it (mode.ts). The
 * operation itself makes no change: `run` is never called, `start` starts the mode.
 */
import { OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext, OperationHost } from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { cutCheck, type CutRefusal } from './cut.ts'
import { startCut } from './mode.ts'
import { refusalText } from './texts.ts'

/** The one selected entity, when exactly one is selected */
function single(context: OperationContext) {
  if (context.selected.length !== 1) return undefined
  return context.graph.hasEntity(context.selected[0]!)
}

/** Whether a way is the outer member of a multipolygon */
function isOuterOfMultipolygon(graph: Graph, way: OsmWay): boolean {
  return graph
    .parentRelations(way)
    .some((relation) => relation.isMultipolygon() && relation.memberById(way.id)?.role === 'outer')
}

/**
 * The way a cut of the selection cuts: the selected area itself, or the outer member of the selected multipolygon.
 * @param   context - The selection and the data
 * @return  The way's id, or undefined when the selection has no outline (a multipolygon without an outer member)
 */
function targetOf(context: OperationContext): string | undefined {
  const entity = single(context)
  if (entity instanceof OsmRelation) return entity.membersByRole('outer')[0]?.id
  return entity?.id
}

/**
 * The outline checks of each way, kept with the objects they read. An edit makes a new object for each thing it changes,
 * so a check is reused exactly while nothing it read has changed.
 */
const checks = new WeakMap<OsmWay, { reads: readonly unknown[]; refused: CutRefusal | undefined }>()

/**
 * Why a way cannot be cut before any line is drawn, as `cutCheck` says. The menu asks each time it opens, so the answer
 * is kept while the way is unchanged. The check reads the way, its nodes, its parent relations and their members; a change
 * to any of them gives a new object, so comparing these objects is enough.
 * @param   graph  - The graph that holds the way
 * @param   wayId  - The way (for a multipolygon, its outer way)
 * @return  The refusal, or undefined when a line could be drawn across the way
 */
function refusedOf(graph: Graph, wayId: string): CutRefusal | undefined {
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay)) return cutCheck(graph, wayId)?.refused
  const parents = graph.parentRelations(way)
  const reads: unknown[] = [
    way,
    ...way.nodes.map((id) => graph.hasEntity(id)),
    ...parents.flatMap((relation) => [
      relation,
      ...relation.members.map((member) => graph.hasEntity(member.id)),
    ]),
  ]
  const kept = checks.get(way)
  if (
    kept &&
    kept.reads.length === reads.length &&
    kept.reads.every((read, i) => read === reads[i])
  )
    return kept.refused
  const refused = cutCheck(graph, wayId)?.refused
  checks.set(way, { reads, refused })
  return refused
}

/** The edit menu's Cut. Its label and sentences are read when shown, in the page's language. */
export const cutOperation: Operation = {
  id: 'cut-area',
  get label() {
    return m.cut_label()
  },
  group: 'structure',
  icon: 'iD-operation-split',
  applies: (context) => {
    const entity = single(context)
    if (entity instanceof OsmRelation) return entity.isMultipolygon()
    if (entity instanceof OsmWay)
      return entity.isClosed() && (entity.isArea() || isOuterOfMultipolygon(context.graph, entity))
    return false
  },
  disabled: (context) => {
    const wayId = targetOf(context)
    if (wayId === undefined) return m.cut_no_outline()
    const refused = refusedOf(context.graph, wayId)
    return refused ? refusalText(refused) : undefined
  },
  // not run: a cut is made in the mode that `start` starts
  run: () => ({ actions: [], annotation: m.cut_annotation() }),
  start: (context, host: OperationHost) => {
    const wayId = targetOf(context)
    if (wayId !== undefined) startCut(host, wayId)
  },
}
