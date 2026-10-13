import type { Operation } from '@osm-editor-kit/maid-operations'
import { readSide } from '../sides.ts'
import { hasParkingOn, selectedRoads, tagChange, withSides, type Tags } from './shared.ts'

/**
 * The tags with the values of the left and the right side exchanged, for each suffix. The way itself is not reversed
 * (the reverse operation does that and also swaps these keys). What both sides share stays as it is.
 */
export function swapSides(tags: Tags): Record<string, string> {
  return withSides(tags, (side, suffix) =>
    readSide(tags, side === 'left' ? 'right' : 'left', suffix),
  )
}

const hasParking = (tags: Tags) => hasParkingOn(tags, 'left') || hasParkingOn(tags, 'right')

/**
 * "Swap parking sides": the left and right parking exchange. Offered for roads with parking tags; disabled when the
 * two sides already say the same.
 */
export const swapSidesOperation: Operation = {
  id: 'parking-swap-sides',
  label: 'Swap the parking sides',
  applies: (context) => selectedRoads(context).some((road) => hasParking(road.tags)),
  disabled: (context) =>
    tagChange(context, swapSides, '').changes
      ? undefined
      : 'The left and right sides have the same parking tags, so swapping changes nothing.',
  run: (context) => tagChange(context, swapSides, 'Swapped the parking sides').result,
}
