/**
 * The cut mode. The line's points are handles on the map: a press on a point and a drag moves it; a press on a midpoint
 * between two points inserts a point there and drags it, so the line gets a corner; a click elsewhere moves the nearer
 * end to the click. Each change shows what the line makes: the two pieces, or the reason it is refused. Enter (or Apply
 * in the panel) cuts as one undo step; Escape (the engine's) leaves with nothing changed. The operation "Cut" starts the
 * mode (`startCut`), and gets the editor and the engine from its `start` (ADR 0011, hook 5).
 */
import { OsmNode, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import type { ModuleMode } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { cutActions, cutSnapshot } from './cut-store.ts'
import { cutPlan, type Loc } from './cut.ts'
import { defaultLine } from './default-line.ts'
import {
  handleOf,
  insertPoint,
  midpointOf,
  HANDLE_HIT_LAYERS,
  nearestEnd,
  replacePoint,
  type Line,
  type Ring,
} from './line.ts'

/** The mode's id: `exitModuleMode(MODE_ID)` ends only this mode */
export const MODE_ID = 'cut-area'

/**
 * Starts a cut of this closed way with the default line (default-line.ts): the mode takes the pointer until it ends.
 * The mode is entered before the store begins, because entering ends another cut first, and that exit clears the store.
 * Nothing starts when the way has no outline to draw a line across.
 * @param host  - The editor and the engine the operation runs on
 * @param wayId - The closed way to cut
 */
export function startCut(host: OperationHost, wayId: string): void {
  const { editor, engine } = host
  const line = defaultLine(editor.history.staging.graph, wayId)
  if (!line) return
  engine.enterModuleMode(cutMode(wayId, host))
  cutActions().begin(wayId)
  showLine(editor.history.staging.graph, wayId, line)
}

/**
 * Cuts the way along the line the store holds, as one undo step, and ends the mode with the two pieces selected. A line
 * that is refused is shown in the panel, and nothing is changed.
 * @param host  - The editor and the engine
 * @param wayId - The way being cut; nothing happens when the store holds another cut by now
 */
export function applyCut(host: OperationHost, wayId: string): void {
  const { wayId: current, points } = cutSnapshot()
  if (current !== wayId || !points) return
  const { editor, engine } = host
  const plan = cutPlan(editor.history.staging.graph, wayId, [...points])
  if ('refused' in plan) {
    cutActions().show(points, undefined, plan.refused)
    return
  }
  let pieces: string[] = []
  // `change` redraws once, and takes the step back if an action throws
  engine.change(() => {
    editor.history.perform(plan.action)
    pieces = plan.pieces(editor.history.staging.graph)
    editor.history.commit({ annotation: m.cut_annotation(), selectedIDs: pieces })
  })
  engine.exitModuleMode(MODE_ID)
  // the two pieces are selected, as after a drawing (the shell asks for a type only for one new way)
  engine.announceDrawn(pieces)
}

/**
 * Shows what the line makes on the graph: the two pieces it cuts the way into, or the reason it is refused. Only the
 * store changes; the graph is not written (the action runs on a copy).
 * @param graph  - The graph that holds the way
 * @param wayId  - The way being cut
 * @param points - The points of the line
 */
function showLine(graph: Graph, wayId: string, points: Line): void {
  const plan = cutPlan(graph, wayId, [...points])
  if ('refused' in plan) {
    cutActions().show(points, undefined, plan.refused)
    return
  }
  const after = plan.action(graph)
  cutActions().show(points, ringsOf(after, plan.pieces(after)), undefined)
}

/**
 * The outline of each way, as positions, closed. A way that is not in the graph is left out.
 * @param   graph - The graph that holds the ways
 * @param   ids   - The ways
 * @return  The rings, in the order of the ids
 */
function ringsOf(graph: Graph, ids: readonly string[]): Ring[] {
  const rings: Ring[] = []
  for (const id of ids) {
    const way = graph.hasEntity(id)
    if (!(way instanceof OsmWay)) continue
    const ring: Loc[] = []
    for (const nodeId of way.nodes) {
      const node = graph.hasEntity(nodeId)
      if (node instanceof OsmNode && node.loc) ring.push(node.loc)
    }
    rings.push(ring)
  }
  return rings
}

/**
 * The mode for one way. Its callbacks change the store and show the line; they never write the data.
 * @param   wayId - The closed way to cut
 * @param   host  - The editor and the engine
 * @return  The module mode
 */
function cutMode(wayId: string, host: OperationHost): ModuleMode {
  /** The point being dragged: the one pressed, or the one a press on a midpoint inserted. Undefined when none. */
  let dragged: number | undefined

  /** Shows the line with its points changed, as long as this way is still the one being cut */
  const showChange = (change: (points: Line) => Line) => {
    const { wayId: current, points } = cutSnapshot()
    if (current !== wayId || !points) return
    showLine(host.editor.history.staging.graph, wayId, change(points))
  }

  return {
    id: MODE_ID,
    cursor: 'crosshair',
    // a press on a midpoint or a point starts a drag (the handles are dots of the preview, CutOnMap.tsx, with hit areas)
    handleLayers: [...HANDLE_HIT_LAYERS],
    onDragStart: (name) => {
      const ref = handleOf(name)
      const { wayId: current, points } = cutSnapshot()
      if (!ref || current !== wayId || !points) return
      if (ref.kind === 'point') {
        dragged = ref.index
        return
      }
      // a midpoint becomes a point where it is; that point is the one dragged, from here on
      const at = midpointOf(points, ref.index)
      const index = ref.index + 1
      dragged = index
      showChange((line) => insertPoint(line, index, at))
    },
    onDrag: (_name, lon, lat) => {
      const index = dragged
      if (index !== undefined) showChange((line) => replacePoint(line, index, [lon, lat]))
    },
    onDragEnd: (_name, lon, lat) => {
      const index = dragged
      dragged = undefined
      if (index !== undefined) showChange((line) => replacePoint(line, index, [lon, lat]))
    },
    onClick: (lon, lat) => {
      const { points } = cutSnapshot()
      if (!points) return
      // a click moves the end nearer to it, so the other end stays where it is
      const end = nearestEnd(points, [lon, lat])
      showChange((line) => replacePoint(line, end, [lon, lat]))
    },
    onKey: (key) => {
      if (key === 'Enter') applyCut(host, wayId)
      // Backspace is taken too, so the editor does not delete the way being cut; it does nothing here
      return true
    },
    onExit: () => cutActions().end(),
  }
}
