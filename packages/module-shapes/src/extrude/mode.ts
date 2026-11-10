/**
 * The extrude mode. Each side of the selected way has a handle in its middle (ExtrudeOnMap.tsx); a drag of one pulls the
 * side out or in at a right angle to itself, and the map draws the way as it would be. Letting go keeps the pull as one
 * undo step and the mode stays on with the way as it is now, so the next side can be pulled, as in JOSM. A click on the
 * outline adds a corner there (its own undo step), to bound the part of a wall to pull. The panel's toggle, or a held
 * Shift, moves the side without new corners. Escape, Enter, Done, a click away from the way or another selection end the
 * mode; undo and redo work as usual and the handles follow the data. The operation "Extrude" starts the mode
 * (`startExtrude`). Plan: docs/research/drawing-tools/9-extrude.md.
 */
import { actionAddMidpoint, OsmNode, type Graph } from '@osm-editor-kit/maid-model'
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import type { ModuleMode } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { toMetres } from '../shared/metres.ts'
import { distance, dot, sub, type Pt } from '../shared/vector.ts'
import { extrudeActions, extrudeSnapshot } from './extrude-store.ts'
import {
  extrude,
  extrudeAction,
  extrudeWayOf,
  MIN_DISTANCE,
  sidesOf,
  type ExtrudeHow,
  type Side,
} from './extrude.ts'
import { HANDLE_HIT_LAYERS, sideIndexOf } from './shapes.ts'

/** The mode's id: `exitModuleMode(MODE_ID)` ends only this mode */
export const MODE_ID = 'extrude'

/**
 * Starts an extrude of one way: the mode takes the pointer until it ends. Nothing starts while another edit is under
 * way, or when the way is not complete (the operation says why).
 * @param host - The editor and the engine the operation runs on
 * @param id   - The selected way
 */
export function startExtrude(host: OperationHost, id: string): void {
  const { editor, engine } = host
  const mode = extrudeMode(host, id)
  // entered before the store is filled: entering ends another extrude first, and that exit clears the store
  engine.enterModuleMode(mode)
  if (editor.history.hasWorkInProgress || !mode.refresh()) {
    engine.exitModuleMode(MODE_ID)
    return
  }
  mode.watch()
}

/** Ends the extrude: the pulls are already kept, so this only leaves the mode */
export function endExtrude(host: OperationHost): void {
  host.engine.exitModuleMode(MODE_ID)
}

/**
 * The mode for one way. Its callbacks change the store, and the data when a pull ends or a corner is added; `watch`
 * keeps the handles on the way as it changes (a pull, an undo, an edit in the inspector) and ends the mode when the way
 * is gone or no longer the selection.
 * @param   host  - The editor and the engine
 * @param   wayId - The way
 * @return  The module mode
 */
function extrudeMode(
  host: OperationHost,
  wayId: string,
): ModuleMode & { refresh: () => boolean; watch: () => void } {
  const { editor, engine } = host
  /** The side being pulled and where the pointer was when the pull started, in the way's metres */
  let drag: { side: Side; start: Pt } | undefined
  let unwatch: (() => void) | undefined
  let seen: Graph | undefined

  /** The way and its sides from the data as it is now; false when the way can no longer be extruded */
  const refresh = (): boolean => {
    const graph = editor.history.staging.graph
    seen = graph
    const way = extrudeWayOf(graph, wayId)
    if ('refused' in way) return false
    extrudeActions().show(way, sidesOf(way))
    return true
  }

  /** How a pull changes the way: the panel's toggle, turned round by a held Shift */
  const howOf = (shift: boolean): ExtrudeHow =>
    extrudeSnapshot().moveSide !== shift ? 'move' : 'corners'

  /** The pull for the pointer at this place; undefined without a drag */
  const pullAt = (lon: number, lat: number, shift: boolean) => {
    const { way } = extrudeSnapshot()
    if (!drag || !way) return undefined
    const moved = sub(toMetres(way.frame, [lon, lat]), drag.start)
    const pulled = dot(moved, drag.side.normal)
    return {
      side: drag.side,
      distance: pulled,
      result: extrude(way, drag.side, pulled, howOf(shift)),
    }
  }

  /** Keeps a change as one undo step, with the way still selected */
  const keep = (action: (graph: Graph) => Graph, annotation: string) => {
    engine.change(() => {
      editor.history.perform(action)
      editor.history.commit({ annotation, selectedIDs: [wayId] })
    })
  }

  return {
    id: MODE_ID,
    cursor: 'default',
    handleLayers: [...HANDLE_HIT_LAYERS],
    // a click on the outline adds a corner: the place on the way under the pointer comes with the click
    snap: true,
    refresh,
    watch: () => {
      unwatch = engine.subscribe(() => {
        const selection = engine.selection
        if (selection.length !== 1 || selection[0] !== wayId) {
          engine.exitModuleMode(MODE_ID)
          return
        }
        if (editor.history.staging.graph === seen || drag) return
        if (!refresh()) engine.exitModuleMode(MODE_ID)
      })
    },
    onDragStart: (name, lon, lat) => {
      const { way, sides } = extrudeSnapshot()
      if (sideIndexOf(name) === undefined || !way || sides.length === 0) return
      // the side whose middle is nearest the press, not the first handle the map found: handles of short sides overlap
      const start = toMetres(way.frame, [lon, lat])
      const side = sides.reduce((best, s) =>
        distance(s.middle, start) < distance(best.middle, start) ? s : best,
      )
      drag = { side, start }
    },
    onDrag: (_name, lon, lat, info) => {
      extrudeActions().pull(pullAt(lon, lat, info.modifiers.shift))
    },
    onDragEnd: (_name, lon, lat, info) => {
      const pull = pullAt(lon, lat, info.modifiers.shift)
      const { way } = extrudeSnapshot()
      drag = undefined
      extrudeActions().pull(undefined)
      if (!pull || !way || Math.abs(pull.distance) < MIN_DISTANCE) return
      keep(extrudeAction(way, pull.result), m.extrude_annotation())
    },
    onClick: (_lon, _lat, info) => {
      const target = info.target
      if (target?.type === 'way' && target.wayId === wayId) {
        const corner = new OsmNode(editor.history.staging.graph.context, { loc: target.loc })
        keep(
          actionAddMidpoint({ loc: target.loc, edge: target.edge }, corner),
          m.extrude_corner_annotation(),
        )
        return
      }
      // a click on a corner of the way does nothing; anywhere else ends the extrude, as a click outside Resize's box
      const onCorner =
        target?.type === 'node' && extrudeSnapshot().way?.nodes.includes(target.id) === true
      if (!onCorner) endExtrude(host)
    },
    onKey: (key) => {
      if (key === 'Enter') endExtrude(host)
      // Backspace is taken too, so the editor does not delete the way being extruded; it does nothing here
      return true
    },
    onExit: () => {
      unwatch?.()
      unwatch = undefined
      drag = undefined
      extrudeActions().end()
    },
  }
}
