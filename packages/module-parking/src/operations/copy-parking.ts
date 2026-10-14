import type { Operation } from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { readSide } from '../sides.ts'
import {
  hasParkingOn,
  selectedRoads,
  tagChange,
  withSides,
  type RealSide,
  type Tags,
} from './shared.ts'

/**
 * The tags with the `to` side set to what `from` has, for each suffix: its value, or none where `from` has none (so
 * the old restriction or reason of the `to` side does not survive). Equal sides are written as `both`.
 */
export function copySide(tags: Tags, from: RealSide, _to: RealSide): Record<string, string> {
  return withSides(tags, (_side, suffix) => readSide(tags, from, suffix))
}

/**
 * "Copy parking to the other side": one operation per direction. It replaces the other side's parking tags with those
 * of this side. Offered for roads that have parking tags on the side; disabled when the copy changes nothing.
 */
export function copyParkingOperation(from: RealSide, to: RealSide): Operation {
  // the texts of one direction, read when they are shown or made (the page's language)
  const texts = from === 'left' ? LEFT_TO_RIGHT : RIGHT_TO_LEFT
  const plan = (context: Parameters<Operation['run']>[0]) =>
    tagChange(
      context,
      (tags) => (hasParkingOn(tags, from) ? copySide(tags, from, to) : { ...tags }),
      texts.annotation(),
    )
  return {
    id: `parking-copy-${from}-to-${to}`,
    get label() {
      return texts.label()
    },
    applies: (context) => selectedRoads(context).some((road) => hasParkingOn(road.tags, from)),
    disabled: (context) => (plan(context).changes ? undefined : texts.disabled()),
    run: (context) => plan(context).result,
  }
}

type CopyTexts = { label: () => string; annotation: () => string; disabled: () => string }

const LEFT_TO_RIGHT: CopyTexts = {
  label: () => m.operation_copy_left_right_label(),
  annotation: () => m.operation_copy_left_right_annotation(),
  disabled: () => m.operation_copy_left_right_disabled(),
}

const RIGHT_TO_LEFT: CopyTexts = {
  label: () => m.operation_copy_right_left_label(),
  annotation: () => m.operation_copy_right_left_annotation(),
  disabled: () => m.operation_copy_right_left_disabled(),
}
