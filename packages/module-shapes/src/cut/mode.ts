/**
 * The cut mode: the pointer on the map draws the line, Enter cuts, Backspace removes the last point, Escape (the
 * engine's) leaves with nothing changed. The operation "Cut" starts it (`startCut`), and gets the editor and the engine
 * from its `start` (ADR 0011, hook 5).
 */
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import type { ModuleMode, ModuleModeKey } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { cutActions } from './cut-store.ts'
import { cutPlan, cutPreview, type Loc } from './cut.ts'
import { clickedAt, withoutLast, withPoint } from './line.ts'

/** The mode's id: `exitModuleMode(MODE_ID)` ends only this mode */
export const MODE_ID = 'cut-area'

/**
 * Starts a cut of this closed way: the mode takes the pointer until it ends. The mode is entered before the store begins,
 * because entering ends another cut first, and that exit clears the store.
 * @param host  - The editor and the engine the operation runs on
 * @param wayId - The closed way to cut
 */
export function startCut(host: OperationHost, wayId: string): void {
  host.engine.enterModuleMode(cutMode(wayId, host))
  cutActions().begin(wayId)
}

/**
 * The mode for one way. Its points are kept here; the store mirrors them for the map.
 * @param   wayId   - The closed way to cut
 * @param   host    - The editor and the engine
 * @return  The module mode
 */
function cutMode(wayId: string, { editor, engine }: OperationHost): ModuleMode {
  let points: Loc[] = []

  /** The outcome of the points as they are: the chord a cut would make, or why it is refused */
  const show = () => {
    const outcome = cutPreview(editor.history.staging.graph, wayId, points)
    const chord = 'chord' in outcome ? outcome.chord : undefined
    // one point is no line yet: no reason is shown until the line has a segment
    const refusal = points.length >= 2 && 'refused' in outcome ? outcome.refused : undefined
    cutActions().setLine(points, chord, refusal)
  }

  /** Enter: cuts along the clicked points as one undo step, or keeps the mode and shows why it is refused */
  const finish = () => {
    const plan = cutPlan(editor.history.staging.graph, wayId, points)
    if ('refused' in plan) {
      cutActions().setRefusal(plan.refused)
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

  return {
    id: MODE_ID,
    cursor: 'crosshair',
    // a click lands on the node or the place on a way under it (ADR 0011, hook 4)
    snap: true,
    onClick: (lon, lat, info) => {
      points = withPoint(points, clickedAt(lon, lat, info.target))
      show()
    },
    onMove: (lon, lat) => cutActions().setPointer([lon, lat]),
    onKey: (key: ModuleModeKey) => {
      if (key === 'Enter') finish()
      else {
        points = withoutLast(points)
        show()
      }
      // taken even with no point: a Backspace must not delete the way that is being cut
      return true
    },
    onExit: () => cutActions().end(),
  }
}
