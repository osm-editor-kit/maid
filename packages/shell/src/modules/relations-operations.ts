import type { Editor } from '@osm-editor-kit/maid-core'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import {
  addTargetOf,
  multiMembershipsOf,
  planAddOthers,
  planFeaturesOf,
  planRemoveFrom,
  sharedMemberships,
  type PlanFeature,
} from './relations-logic.ts'
import { currentSessionRelationIDs } from './relations-session-store.ts'

// The two edit-menu operations of the relations module (iD's membership editor, for the selection): "Add to relation…"
// and "Remove from relation". They use the same plans as the relations section of a multi-selection, so the menu and the
// section do the same thing, and each runs as one undo step. Neither opens a picker: an operation only returns actions.

/** The selected features, as the plans take them (an id that is not loaded is left out) */
function featuresOf(context: OperationContext): PlanFeature[] {
  return planFeaturesOf(context.graph, context.selected)
}

/** The session relation "Add to relation…" adds the selection to (see addTargetOf), or undefined */
function targetOf(context: OperationContext, editor: Editor) {
  return addTargetOf(
    context.graph,
    currentSessionRelationIDs(),
    featuresOf(context),
    editor.presets,
  )
}

/** The relations that hold every selected feature (the ones "Remove from relation" can take them out of) */
function sharedOf(context: OperationContext) {
  return sharedMemberships(multiMembershipsOf(context.graph, context.selected))
}

/**
 * The operations the relations module puts in the edit menu. `editor` is read when they run, so the presets are the ones
 * loaded by then. The labels are read when they are shown, so the menu follows the locale.
 */
export function relationOperations(editor: Editor): Operation[] {
  const add: Operation = {
    id: 'add-to-relation',
    get label() {
      return m.relations_op_add()
    },
    icon: 'iD-icon-relation',
    // the target is the session's most recent relation that can take the selection; none: disabled, with the reason
    applies: (context) =>
      context.selected.length > 0 &&
      context.selected.every((id) => context.graph.hasEntity(id) !== undefined),
    disabled: (context) =>
      targetOf(context, editor) === undefined ? m.relations_op_add_reason() : undefined,
    run: (context) => {
      const features = featuresOf(context)
      const target = targetOf(context, editor)
      return {
        actions: target ? planAddOthers(target, features, editor.presets).actions : [],
        annotation: features.length === 1 ? m.relations_undo_add() : m.relations_undo_add_many(),
      }
    },
  }
  const remove: Operation = {
    id: 'remove-from-relation',
    get label() {
      return m.relations_op_remove()
    },
    icon: 'iD-icon-relation',
    // offered when every selected feature is in one relation at least
    applies: (context) => sharedOf(context).length > 0,
    // with several shared relations the menu cannot say which one: the relations section does
    disabled: (context) =>
      sharedOf(context).length > 1 ? m.relations_op_remove_several() : undefined,
    run: (context) => {
      const [only] = sharedOf(context)
      return {
        actions: only ? planRemoveFrom(only.relation, context.selected) : [],
        annotation:
          context.selected.length === 1
            ? m.relations_undo_remove()
            : m.relations_undo_remove_many(),
      }
    },
  }
  return [add, remove]
}
