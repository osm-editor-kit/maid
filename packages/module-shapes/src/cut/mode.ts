/**
 * The cut mode: the pointer on the map draws the line, Enter cuts, Backspace removes the last point, Escape (the
 * engine's) leaves with nothing changed. The operation "Cut" starts it (`startCut`); the map content binds the editor
 * and the engine when it mounts, because an operation's `start` is given neither (ADR 0011, hook 5).
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { MaidEngine, ModuleMode, ModuleModeKey } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { cutPlan, cutPreview, type Loc } from './cut.ts'
import { clickedAt, withoutLast, withPoint } from './line.ts'
import { cutActions } from './store.ts'

/** The mode's id: `exitModuleMode(MODE_ID)` ends only this mode */
export const MODE_ID = 'cut-area'

/** What the mode works with: the editor's data and the engine's pointer */
export type CutBinding = { editor: Editor; engine: MaidEngine }

let bound: CutBinding | undefined

/**
 * Gives the mode the editor and the engine, or takes them back (undefined) when the map goes.
 * @param binding - The editor and the engine of the map, or undefined
 */
export function bindCut(binding: CutBinding | undefined): void {
  bound = binding
}

/**
 * Starts a cut of this closed way: the mode takes the pointer until it ends. Does nothing when no map is bound (no
 * engine to draw with), so an operation asked without a map does nothing.
 * @param wayId - The closed way to cut
 */
export function startCut(wayId: string): void {
  const binding = bound
  if (!binding) return
  cutActions.begin(wayId)
  binding.engine.enterModuleMode(cutMode(wayId, binding))
}

/**
 * The mode for one way. Its points are kept here; the store mirrors them for the map.
 * @param   wayId  - The closed way to cut
 * @param   binding - The editor and the engine
 * @return  The module mode
 */
function cutMode(wayId: string, { editor, engine }: CutBinding): ModuleMode {
  let points: Loc[] = []

  /** The outcome of the points as they are: the chord a cut would make, or why it is refused */
  const show = () => {
    const outcome = cutPreview(editor.history.staging.graph, wayId, points)
    const chord = 'chord' in outcome ? outcome.chord : undefined
    // one point is no line yet: no reason is shown until the line has a segment
    const refusal = points.length >= 2 && 'refused' in outcome ? outcome.refused : undefined
    cutActions.setLine(points, chord, refusal)
  }

  /** Enter: cuts along the clicked points as one undo step, or keeps the mode and shows why it is refused */
  const finish = () => {
    const plan = cutPlan(editor.history.staging.graph, wayId, points)
    if ('refused' in plan) {
      cutActions.setRefusal(plan.refused)
      return
    }
    editor.history.perform(plan.action)
    const pieces = plan.pieces(editor.history.staging.graph)
    editor.history.commit({ annotation: m.cut_annotation(), selectedIDs: pieces })
    engine.exitModuleMode(MODE_ID)
    // the two pieces are selected, as after a drawing (the shell asks for a type only for one new way)
    engine.announceDrawn(pieces)
  }

  return {
    id: MODE_ID,
    cursor: 'crosshair',
    // a click lands on the node or the place on a way under it (ADR 0011, hook 4)
    snap: true,
    onClick: (lon, lat, info) => {
      points = withPoint(points, clickedAt(lon, lat, info.target))
      show()
    },
    onMove: (lon, lat) => cutActions.setPointer([lon, lat]),
    onKey: (key: ModuleModeKey) => {
      if (key === 'Enter') finish()
      else {
        points = withoutLast(points)
        show()
      }
      // taken even with no point: a Backspace must not delete the way that is being cut
      return true
    },
    onExit: () => cutActions.end(),
  }
}
