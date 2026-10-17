// Which operations of a list are hidden for a selection because another one supersedes them (`Operation.supersedes`).
// The menu and the keys ask here, so both show and run the same operation.
import type { Operation, OperationContext } from './types.ts'

/**
 * The ids of the operations of `list` that are superseded for this selection: every operation that lists them and
 * applies to the selection. Whether the superseding one is enabled does not matter: the one shown is the superseding
 * one, with its reason (one Merge in the menu, one run for the key, never two).
 */
export function supersededIDs(list: readonly Operation[], context: OperationContext): Set<string> {
  const hidden = new Set<string>()
  for (const operation of list) {
    if (!operation.supersedes?.length || !operation.applies(context)) continue
    for (const id of operation.supersedes) hidden.add(id)
  }
  return hidden
}

/** The operations of `list` that apply to this selection and are not superseded, in the list's order: the edit menu's */
export function visibleOperations(
  list: readonly Operation[],
  context: OperationContext,
): Operation[] {
  const hidden = supersededIDs(list, context)
  return list.filter((operation) => operation.applies(context) && !hidden.has(operation.id))
}
