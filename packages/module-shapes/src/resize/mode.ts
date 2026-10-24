/**
 * The resize mode. A box in the selection's own axes (box.ts) has handles at its corners and edge midpoints; a drag of
 * one changes the box, and the selected features follow it in the history's work in progress, as Rotate moves them, so
 * the map shows the real result (connected features stretch along). Shift keeps the proportions and Alt keeps the
 * centre while a handle is dragged; the panel's toggles do the same for touch, and a held key turns its toggle round.
 * Enter, Apply in the panel or a click outside the box keeps the result as one undo step; Escape (the engine's) puts
 * everything back. The operation "Resize" starts the mode (`startResize`). Plan: docs/research/drawing-tools/7-resize.md.
 */
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import { actionMoveNodes, type ModuleMode } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { add, sub, type Pt } from '../shared/vector.ts'
import { handleAt, resizeExtent, type Extent, type Handle, type ResizeOptions } from './box.ts'
import { resizeActions, resizeSnapshot } from './resize-store.ts'
import { axesPointOf, movesFor, resizeBoxOf } from './resize.ts'
import { handleOf, HANDLE_HIT_LAYERS, insideBox } from './shapes.ts'

/** The mode's id: `exitModuleMode(MODE_ID)` ends only this mode */
export const MODE_ID = 'resize'

/**
 * Starts a resize of these features: the mode takes the pointer until it ends. Nothing starts when they have no box
 * (the operation says why), or when the history holds work in progress that is not ours: Escape would take it back.
 * @param host - The editor and the engine the operation runs on
 * @param ids  - The selected features
 */
export function startResize(host: OperationHost, ids: readonly string[]): void {
  const { editor, engine } = host
  if (editor.history.hasWorkInProgress) return
  const box = resizeBoxOf(editor.history.staging.graph, ids)
  if ('refused' in box) return
  // entered before the store begins: entering ends another resize first, and that exit clears the store
  engine.enterModuleMode(resizeMode(host))
  resizeActions().begin(ids, box)
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
  if (sameExtent(box.extent, extent)) {
    engine.exitModuleMode(MODE_ID)
    return
  }
  const moves = movesFor(box, extent)
  // the mode's work in progress is replaced by the final positions and committed as one step; `change` redraws once.
  // The commit leaves no work in progress, so the mode's onExit has nothing to take back.
  engine.change(() => {
    editor.history.revert()
    editor.history.perform(actionMoveNodes(moves))
    editor.history.commit({
      annotation:
        ids.length === 1 ? m.resize_annotation_one() : m.resize_annotation({ count: ids.length }),
      selectedIDs: [...ids],
    })
  })
  engine.exitModuleMode(MODE_ID)
}

/**
 * The mode for one selection. Its callbacks change the store and the work in progress; only `applyResize` commits.
 * @param   host - The editor and the engine
 * @return  The module mode
 */
function resizeMode(host: OperationHost): ModuleMode {
  const { editor, engine } = host
  /**
   * The handle being dragged, the box when its drag started, and where the handle was from the pointer then (along the
   * box's axes): the handle keeps that offset, so a press beside it does not make the box jump
   */
  let drag: { handle: Handle; start: Extent; grip: Pt } | undefined

  /** The keys a drag uses: the panel's toggles, each turned round by its key */
  const optionsOf = (modifiers: { shift: boolean; alt: boolean }): ResizeOptions => {
    const { proportional, centre } = resizeSnapshot()
    return { proportional: proportional !== modifiers.shift, centre: centre !== modifiers.alt }
  }

  /** Changes the box to follow the pointer, and moves the features with it (work in progress, no commit) */
  const follow = (lon: number, lat: number, modifiers: { shift: boolean; alt: boolean }) => {
    const { box } = resizeSnapshot()
    if (!drag || !box) return
    const extent = resizeExtent(
      drag.start,
      drag.handle,
      add(axesPointOf(box, [lon, lat]), drag.grip),
      optionsOf(modifiers),
    )
    resizeActions().show(extent)
    // every step places the nodes from where they were when the resize started, so nothing adds up
    const moves = movesFor(box, extent)
    engine.change(() => editor.history.perform(actionMoveNodes(moves)), false)
  }

  return {
    id: MODE_ID,
    cursor: 'default',
    handleLayers: [...HANDLE_HIT_LAYERS],
    onDragStart: (name, lon, lat) => {
      const handle = handleOf(name)
      const { box, extent } = resizeSnapshot()
      if (!handle || !box || !extent) return
      drag = {
        handle,
        start: extent,
        grip: sub(handleAt(extent, handle), axesPointOf(box, [lon, lat])),
      }
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
      // Escape, another mode, undo, another edit: whatever the box did is taken back (a kept resize left none)
      if (editor.history.hasWorkInProgress) engine.change(() => editor.history.revert())
      drag = undefined
      resizeActions().end()
    },
  }
}
