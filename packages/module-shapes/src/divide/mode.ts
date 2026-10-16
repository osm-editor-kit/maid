// The divide mode: the operation starts it (`startDivide`), the panel and the keys change the division (divide-store.ts),
// and Enter applies it (`confirmDivision`) as one undo step. Escape ends it through the engine, and nothing is changed.
// The operation gets the editor and the engine from its `start` (ADR 0011, hook 5).
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import type { ModuleMode } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { divideActions, divideSnapshot } from './divide-store.ts'
import { dividePlan } from './divide.ts'

/** The id of the mode: the engine's Escape and `exitModuleMode(id)` use it */
export const DIVIDE_MODE_ID = 'divide-area'

/**
 * Starts the divide mode on the selected area. The mode is entered before the store begins, because entering ends
 * another divide mode first, and its exit clears the store.
 * @param host  - The editor and the engine the operation runs on
 * @param wayId - The area to divide
 */
export function startDivide(host: OperationHost, wayId: string): void {
  host.engine.enterModuleMode(modeFor(host, wayId))
  divideActions().begin(wayId)
}

/**
 * Applies the division the store holds: plans it on the staging graph, and performs it as one undo step. A refusal is
 * shown in the panel, and the data is not changed. Applied: the parts are selected and the mode ends.
 * @param host - The editor and the engine
 */
export function confirmDivision(host: OperationHost): void {
  const { wayId, columns, rows } = divideSnapshot()
  if (wayId === undefined) return
  const { editor, engine } = host
  const plan = dividePlan(editor.history.staging.graph, wayId, columns, rows)
  if ('refused' in plan) {
    divideActions().refuse(plan.refused)
    return
  }
  let parts: string[] = []
  // `change` redraws once, and takes the step back if an action throws
  engine.change(() => {
    editor.history.perform(plan.action)
    parts = plan.parts(editor.history.staging.graph)
    editor.history.commit({
      annotation: m.divide_annotation({ count: parts.length }),
      selectedIDs: parts,
    })
  })
  engine.exitModuleMode(DIVIDE_MODE_ID)
  // the shell selects the parts as it selects a drawing, so the sidebar shows them as one selection
  engine.announceDrawn(parts)
}

/** The mode: Enter applies; Escape (built in) ends it through onExit, which clears the store */
function modeFor(host: OperationHost, wayId: string): ModuleMode {
  return {
    id: DIVIDE_MODE_ID,
    cursor: 'default',
    onKey: (key) => {
      if (key !== 'Enter') return false
      // the mode may have been left for another area by now: then nothing is applied
      if (divideSnapshot().wayId !== wayId) return false
      confirmDivision(host)
      return true
    },
    onExit: () => divideActions().stop(),
  }
}
