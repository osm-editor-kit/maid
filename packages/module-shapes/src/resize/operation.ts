/**
 * The edit menu's "Resize": a box with handles around the selection (mode.ts). The operation itself makes no change:
 * `run` is never called, `start` starts the mode. Its tooltip lists the keys a drag reads (`hints`).
 */
import {
  isTooLargeToEdit,
  type Operation,
  type OperationContext,
  type OperationHost,
} from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { sentenceOf } from '../shared/refusals.ts'
import { startResize } from './mode.ts'
import { resizeApplies, resizeBoxOf, type ResizeRefusal } from './resize.ts'

const refusalText = sentenceOf<ResizeRefusal>({
  incomplete: () => m.resize_refused_incomplete(),
  too_thin: () => m.resize_refused_too_thin(),
})

/** The edit menu's Resize. Its label, hints and sentences are read when shown, in the page's language. */
export const resizeOperation: Operation = {
  id: 'resize',
  get label() {
    return m.resize_label()
  },
  // the sprites have no arrows that point out to the corners; these four arrows to the middle are the nearest
  icon: 'fas-compress-arrows-alt',
  shortcut: 'k',
  group: 'position',
  hints: () => [
    { keys: 'Shift', text: m.resize_hint_proportional() },
    { keys: 'Alt', text: m.resize_hint_centre() },
  ],
  applies: (context: OperationContext) => resizeApplies(context.graph, context.selected),
  disabled: (context) => {
    // as iD's scale: not when too little of it is in view
    if (isTooLargeToEdit(context, context.selected)) return m.resize_refused_too_large()
    const box = resizeBoxOf(context.graph, context.selected)
    return 'refused' in box ? refusalText(box.refused) : undefined
  },
  // not run: a resize is made in the mode that `start` starts
  run: () => ({ actions: [], annotation: m.resize_annotation_one() }),
  start: (context, host: OperationHost) => startResize(host, context.selected),
}
