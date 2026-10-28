/**
 * The resize mode. A box in the selection's own axes (box.ts) has handles at its corners and edge midpoints; a drag of
 * one changes the box, and the map draws the selected features, and the ways connected to them, as they would be
 * (ResizeOnMap.tsx). The data does not change until the resize is kept, so no other edit can take the resize into its
 * own undo step, and nothing is to be put back when it ends. Shift keeps the proportions and Alt keeps the centre while
 * a handle is dragged; the panel's toggles do the same for touch, and a held key turns its toggle round. Enter, Apply in
 * the panel or a click outside the box keeps the result as one undo step; Escape, undo, another selection or an edit of
 * the features ends it without a change. The operation "Resize" starts the mode (`startResize`). Plan:
 * docs/research/drawing-tools/7-resize.md.
 */
import type { Graph } from '@osm-editor-kit/maid-model'
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import { actionMoveNodes, type ModuleMode } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { add, distance, sub, type Pt } from '../shared/vector.ts'
import {
  handleAt,
  HANDLES,
  resizeExtent,
  type Extent,
  type Handle,
  type ResizeOptions,
} from './box.ts'
import { resizeActions, resizeSnapshot } from './resize-store.ts'
import { axesPointOf, movesFor, previewOf, resizeBoxOf, type ResizeBox } from './resize.ts'
import { handleOf, HANDLE_HIT_LAYERS, insideBox } from './shapes.ts'

/** The mode's id: `exitModuleMode(MODE_ID)` ends only this mode */
export const MODE_ID = 'resize'

/**
 * Starts a resize of these features: the mode takes the pointer until it ends. The mode comes first, which finishes a
 * running Move or Rotate (K during a move resizes the moved features); nothing starts when the features then have no
 * box (the operation says why).
 * @param host - The editor and the engine the operation runs on
 * @param ids  - The selected features
 */
export function startResize(host: OperationHost, ids: readonly string[]): void {
  const { editor, engine } = host
  // entered before the store begins: entering ends another resize first, and that exit clears the store
  const mode = resizeMode(host)
  engine.enterModuleMode(mode)
  const { graph } = editor.history.staging
  const box = editor.history.hasWorkInProgress ? undefined : resizeBoxOf(graph, ids)
  if (!box || 'refused' in box) {
    engine.exitModuleMode(MODE_ID)
    return
  }
  resizeActions().begin(ids, box, previewOf(graph, box))
  mode.watch(ids, graph, box)
}

/** Whether two boxes are the same to a tenth of a millimetre: then there is nothing to keep */
function sameExtent(a: Extent, b: Extent): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-4
  return (
    close(a.minU, b.minU) && close(a.maxU, b.maxU) && close(a.minV, b.minV) && close(a.maxV, b.maxV)
  )
}

/**
 * Keeps the box as it is now as one undo step and ends the mode with the features still selected. A box that did not
 * change ends the mode with nothing changed.
 * @param host - The editor and the engine
 */
export function applyResize(host: OperationHost): void {
  const { box, extent, ids } = resizeSnapshot()
  const { editor, engine } = host
  if (!box || !extent || engine.moduleMode?.id !== MODE_ID) return
  // the mode ends first, so its watch does not see the commit as an edit from outside
  engine.exitModuleMode(MODE_ID)
  if (sameExtent(box.extent, extent)) return
  const moves = movesFor(box, extent)
  engine.change(() => {
    editor.history.perform(actionMoveNodes(moves))
    editor.history.commit({
      annotation:
        ids.length === 1 ? m.resize_annotation_one() : m.resize_annotation({ count: ids.length }),
      selectedIDs: [...ids],
    })
  })
}

/** Whether two lists hold the same ids, in any order */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/**
 * The mode for one selection. Its callbacks change the store; only `applyResize` changes the data. `watch` ends the
 * mode when the selection or a node of the box changes outside it (an undo, a merge, an edit in the inspector), since
 * the box would no longer fit.
 * @param   host - The editor and the engine
 * @return  The module mode
 */
function resizeMode(host: OperationHost): ModuleMode & {
  watch: (ids: readonly string[], graph: Graph, box: ResizeBox) => void
} {
  const { editor, engine } = host
  /**
   * The handle being dragged, the box when its drag started, and where the handle was from the pointer then (along the
   * box's axes): the handle keeps that offset, so a press beside it does not make the box jump
   */
  let drag: { handle: Handle; start: Extent; grip: Pt } | undefined
  let unwatch: (() => void) | undefined

  /** The keys a drag uses: the panel's toggles, each turned round by its key */
  const optionsOf = (modifiers: { shift: boolean; alt: boolean }): ResizeOptions => {
    const { proportional, centre } = resizeSnapshot()
    return { proportional: proportional !== modifiers.shift, centre: centre !== modifiers.alt }
  }

  /** Changes the box to follow the pointer; the map draws the features from it */
  const follow = (lon: number, lat: number, modifiers: { shift: boolean; alt: boolean }) => {
    const { box } = resizeSnapshot()
    if (!drag || !box) return
    resizeActions().show(
      resizeExtent(
        drag.start,
        drag.handle,
        add(axesPointOf(box, [lon, lat]), drag.grip),
        optionsOf(modifiers),
      ),
    )
  }

  return {
    id: MODE_ID,
    cursor: 'default',
    handleLayers: [...HANDLE_HIT_LAYERS],
    endsOnUndo: true,
    watch: (ids, graph, box) => {
      let seen = graph
      unwatch = engine.subscribe(() => {
        const now = editor.history.staging.graph
        const moved =
          now !== seen &&
          [...box.nodes.keys()].some((id) => now.hasEntity(id) !== graph.hasEntity(id))
        seen = now
        if (moved || !sameIds(engine.selection, ids)) engine.exitModuleMode(MODE_ID)
      })
    },
    onDragStart: (name, lon, lat) => {
      const { box, extent } = resizeSnapshot()
      if (!handleOf(name) || !box || !extent) return
      // the handle nearest the press, not the first one the map found: two handles of a small box overlap on screen
      const pointer = axesPointOf(box, [lon, lat])
      const away = (h: Handle) => distance(handleAt(extent, h), pointer)
      const handle = HANDLES.reduce((best, h) => (away(h) < away(best) ? h : best))
      drag = { handle, start: extent, grip: sub(handleAt(extent, handle), pointer) }
    },
    onDrag: (_name, lon, lat, info) => follow(lon, lat, info.modifiers),
    onDragEnd: (_name, lon, lat, info) => {
      follow(lon, lat, info.modifiers)
      drag = undefined
    },
    onClick: (lon, lat) => {
      const { box, extent } = resizeSnapshot()
      if (!box || !extent) return
      // a click outside the box keeps the result, as in a graphics program; inside it does nothing
      if (!insideBox(extent, axesPointOf(box, [lon, lat]))) applyResize(host)
    },
    onKey: (key) => {
      if (key === 'Enter') applyResize(host)
      // Backspace is taken too, so the editor does not delete the features being resized; it does nothing here
      return true
    },
    onExit: () => {
      // the data never changed: there is nothing to put back
      unwatch?.()
      unwatch = undefined
      drag = undefined
      resizeActions().end()
    },
  }
}
