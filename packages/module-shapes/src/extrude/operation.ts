/**
 * The edit menu's "Extrude" (J): handles on the sides of the selected way, pulled out or in (mode.ts). The operation
 * itself makes no change: `run` is never called, `start` starts the mode. Its tooltip lists the key a drag reads.
 */
import {
  isTooLargeToEdit,
  type Operation,
  type OperationContext,
  type OperationHost,
} from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { sentenceOf } from '../shared/refusals.ts'
import { extrudeApplies, extrudeWayOf, type ExtrudeRefusal } from './extrude.ts'
import { startExtrude } from './mode.ts'

const refusalText = sentenceOf<ExtrudeRefusal>({
  incomplete: () => m.extrude_refused_incomplete(),
})

/** The edit menu's Extrude. Its label, hint and sentences are read when shown, in the page's language. */
export const extrudeOperation: Operation = {
  id: 'extrude',
  get label() {
    return m.extrude_label()
  },
  // the sprites have no arrow out of a wall; an arrow up out of a circle is the nearest
  icon: 'fas-chevron-circle-up',
  shortcut: 'j',
  group: 'position',
  hints: () => [
    { keys: 'Shift', text: m.extrude_hint_move() },
    { keys: 'Alt', text: m.extrude_hint_free() },
  ],
  applies: (context: OperationContext) => extrudeApplies(context.graph, context.selected),
  disabled: (context) => {
    if (isTooLargeToEdit(context, context.selected)) return m.extrude_refused_too_large()
    const way = extrudeWayOf(context.graph, context.selected[0]!)
    return 'refused' in way ? refusalText(way.refused) : undefined
  },
  // not run: the pulls are made in the mode that `start` starts
  run: () => ({ actions: [], annotation: m.extrude_annotation() }),
  start: (context, host: OperationHost) => startExtrude(host, context.selected[0]!),
}
