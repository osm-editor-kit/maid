import type { Operation } from '@osm-editor-kit/maid-operations'
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
  const plan = (context: Parameters<Operation['run']>[0]) =>
    tagChange(
      context,
      (tags) => (hasParkingOn(tags, from) ? copySide(tags, from, to) : { ...tags }),
      `Copied the ${from} parking to the ${to} side`,
    )
  return {
    id: `parking-copy-${from}-to-${to}`,
    label: `Copy ${from} parking to the ${to} side`,
    applies: (context) => selectedRoads(context).some((road) => hasParkingOn(road.tags, from)),
    disabled: (context) =>
      plan(context).changes ? undefined : `The ${to} side already has the same parking tags.`,
    run: (context) => plan(context).result,
  }
}
