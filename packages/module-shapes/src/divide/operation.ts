// The edit menu's "Divide": offered for one selected closed way with four corners. It starts the divide mode (start), which
// asks for the rows and columns and makes the one undo step. Plan: docs/research/drawing-tools/5-grid-and-rows.md.
import type { Operation, OperationContext, OperationHost } from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { cornersOfWay, dividePlan } from './divide.ts'
import { refusalText } from './division.ts'
import { startDivide } from './mode.ts'

/** The selected area, when exactly one way is selected and it has four corners; otherwise undefined */
export function fourCornerAreaOf(context: OperationContext): string | undefined {
  if (context.selected.length !== 1) return undefined
  const [wayId] = context.selected
  if (wayId === undefined || cornersOfWay(context.graph, wayId) === undefined) return undefined
  return wayId
}

export const divideOperation: Operation = {
  id: 'divide-area',
  get label() {
    return m.divide_label()
  },
  group: 'structure',
  // iD's sprite of a grid of cells
  icon: 'fas-th',
  applies(context) {
    return fourCornerAreaOf(context) !== undefined
  },
  disabled(context) {
    const wayId = fourCornerAreaOf(context)
    if (wayId === undefined) return undefined
    // the smallest division (two parts) says whether any division of this area is possible at all
    const plan = dividePlan(context.graph, wayId, 2, 1)
    if (!('refused' in plan)) return undefined
    if (plan.refused === 'nothing_to_do' || plan.refused === 'too_many_parts') return undefined
    return refusalText(plan.refused)
  },
  // never called: the mode makes the change (ADR 0011, hook 5)
  run() {
    return { actions: [], annotation: '' }
  },
  start: (context, host: OperationHost) => {
    const wayId = fourCornerAreaOf(context)
    if (wayId !== undefined) startDivide(host, wayId)
  },
}
