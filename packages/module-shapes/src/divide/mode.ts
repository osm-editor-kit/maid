// The divide mode: the operation starts it (`startDivide`), the panel and the keys change the division (store.ts), and
// Enter applies it (`confirmDivision`) as one undo step. Escape ends it through the engine, and nothing is changed.
//
// The operation gets only the selection, not the engine, so the map content (DivideOnMap) binds the editor and the engine
// here when it mounts. Without a bound host the operation does nothing.
import type { Editor } from '@osm-editor-kit/maid-core'
import type { OperationContext } from '@osm-editor-kit/maid-operations'
import type { MaidEngine, ModuleMode } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { dividePlan } from './divide.ts'
import { divideActions, divideStore } from './store.ts'

/** The id of the mode: the engine's Escape and `exitModuleMode(id)` use it */
export const DIVIDE_MODE_ID = 'divide-area'

export type DivideHost = { editor: Editor; engine: MaidEngine }

let host: DivideHost | undefined

/** Set by the map content on mount, cleared on unmount */
export function bindDivideHost(next: DivideHost | undefined): void {
  host = next
}

/**
 * Starts the divide mode on the selected area. The mode is entered before the store begins, because entering ends
 * another divide mode first, and its exit clears the store.
 * @param context - The operation's context: the selected way is the area
 */
export function startDivide(context: OperationContext): void {
  const wayId = context.selected[0]
  if (!host || wayId === undefined) return
  host.engine.enterModuleMode(modeFor(host, wayId))
  divideActions.begin(wayId)
}

/**
 * Applies the division the store holds: plans it on the staging graph, and performs it as one undo step. A refusal is
 * shown in the panel, and the data is not changed. Applied: the parts are selected and the mode ends.
 * @param host - The editor and the engine
 */
export function confirmDivision(host: DivideHost): void {
  const { wayId, columns, rows } = divideStore.getState()
  if (wayId === undefined) return
  const { editor, engine } = host
  const plan = dividePlan(editor.history.staging.graph, wayId, columns, rows)
  if ('refused' in plan) {
    divideActions.refuse(plan.refused)
    return
  }
  editor.history.perform(plan.action)
  const parts = plan.parts(editor.history.staging.graph)
  editor.history.commit({
    annotation: m.divide_annotation({ count: parts.length }),
    selectedIDs: parts,
  })
  engine.exitModuleMode(DIVIDE_MODE_ID)
  // the shell selects the parts as it selects a drawing, so the sidebar shows them as one selection
  engine.announceDrawn(parts)
}

/** The mode: Enter applies; Escape (built in) ends it through onExit, which clears the store */
function modeFor(bound: DivideHost, wayId: string): ModuleMode {
  return {
    id: DIVIDE_MODE_ID,
    cursor: 'default',
    onKey: (key) => {
      if (key !== 'Enter') return false
      // the mode may have been left for another area by now: then nothing is applied
      if (divideStore.getState().wayId !== wayId) return false
      confirmDivision(bound)
      return true
    },
    onExit: () => divideActions.stop(),
  }
}
