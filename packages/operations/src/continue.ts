// Continue: draws on from the end of a line, as iD's operation of that name (modules/operations/continue.js,
// ISC, © iD contributors). The selection is one vertex, or that vertex and one line. The rules and the texts
// are iD's, with two differences: a line with area=yes is no candidate (the drawing tool only continues lines),
// and iD's removal of fixme=continue and noexit=yes from the vertex is not done yet.
import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import type { OperationHost } from './index.ts'
import type { Operation, OperationContext } from './types.ts'

/** iD's sentences for the two reasons it cannot run (en/core.yaml, operations.continue) */
const NOT_ELIGIBLE = 'No line can be continued here.'
const MULTIPLE = 'Several lines can be continued here. Add one to the selection to continue.'

/** The selected vertex and the line selected with it, if any. Undefined for any other selection. */
function selectionOf(context: OperationContext) {
  if (context.selected.length < 1 || context.selected.length > 2) return undefined
  let vertex: OsmNode | undefined
  let line: OsmWay | undefined
  for (const id of context.selected) {
    const entity = context.graph.hasEntity(id)
    if (entity instanceof OsmNode && vertex === undefined) vertex = entity
    else if (entity instanceof OsmWay && line === undefined) line = entity
    else return undefined
  }
  return vertex ? { vertex, line } : undefined
}

/** A line that can be continued: open, and not an area (the drawing tool continues lines only) */
function isOpenLine(way: OsmWay) {
  return !way.isClosed() && way.tags.area !== 'yes'
}

/** The open lines that start or end at the vertex. iD's `parent.affix(vertex)`: first or last node. */
function linesEndingAt(graph: Graph, vertex: OsmNode): OsmWay[] {
  return graph
    .parentWays(vertex)
    .filter(
      (way): way is OsmWay =>
        way instanceof OsmWay &&
        isOpenLine(way) &&
        (way.nodes[0] === vertex.id || way.nodes[way.nodes.length - 1] === vertex.id),
    )
}

/** What would be continued: the lines at the vertex, or only the selected line when one is selected (as iD) */
function candidatesOf(context: OperationContext) {
  const selection = selectionOf(context)
  if (!selection) return []
  const lines = linesEndingAt(context.graph, selection.vertex)
  return selection.line ? lines.filter((way) => way.id === selection.line?.id) : lines
}

/** The Continue operation. The edit menu and the key A call `start`, which starts the line drawing from that end. */
export const continueOperation: Operation = {
  id: 'continue',
  label: 'Continue',
  icon: 'iD-operation-continue',
  shortcut: 'a',
  group: 'structure',
  applies: (context) => {
    const selection = selectionOf(context)
    return selection !== undefined && linesEndingAt(context.graph, selection.vertex).length > 0
  },
  disabled: (context) => {
    if (!selectionOf(context)) return undefined
    const count = candidatesOf(context).length
    if (count === 0) return NOT_ELIGIBLE
    if (count > 1) return MULTIPLE
    return undefined
  },
  // not run: the drawing starts in the mode that `start` starts, and nothing is changed until a line is drawn
  run: () => ({ actions: [], annotation: 'Continued a line' }),
  start: (context, host: OperationHost) => {
    const candidates = candidatesOf(context)
    const vertex = selectionOf(context)?.vertex
    const line = candidates[0]
    if (candidates.length !== 1 || !line || !vertex) return
    // the line is named, so that the drawing continues exactly this one (a vertex may lie on several ways)
    const { engine } = host
    if (!engine.setMode('draw-line')) return
    if (!engine.draw.startAt(vertex.id, line.id)) engine.setMode('browse')
  },
}
