/**
 * The edit menu's "Cut": for one selected area, or one multipolygon, a line is drawn across it (mode.ts). The
 * operation itself makes no change: `run` is never called, `start` starts the mode.
 */
import { OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { cutCheck } from './cut.ts'
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

/** The edit menu's Cut. Its label and sentences are read when shown, in the page's language. */
export const cutOperation: Operation = {
  id: 'cut-area',
  get label() {
    return m.cut_label()
  },
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
    const refused = cutCheck(context.graph, wayId)
    return refused ? refusalText(refused.refused) : undefined
  },
  // not run: a cut is made in the mode that `start` starts
  run: () => ({ actions: [], annotation: m.cut_annotation() }),
  start: (context) => {
    const wayId = targetOf(context)
    if (wayId !== undefined) startCut(wayId)
  },
}
