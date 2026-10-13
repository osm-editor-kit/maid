import type { Operation } from '@osm-editor-kit/maid-operations'
import { selectedRoads, tagChange, type Tags } from './shared.ts'

/**
 * The tags without the parking keys of a road: every `parking:*` key, the old schema's (`parking:lane:*`,
 * `parking:condition:*`) included. `amenity=parking` areas are not roads and are not touched.
 */
export function withoutParking(tags: Tags): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags))
    if (!key.startsWith('parking:')) next[key] = value
  return next
}

/** "Remove parking tags" of the selected roads: every `parking:*` key, one undo step. Offered when a road has one. */
export const removeParkingOperation: Operation = {
  id: 'parking-remove-tags',
  label: 'Remove parking tags',
  applies: (context) =>
    selectedRoads(context).some((road) =>
      Object.keys(road.tags).some((key) => key.startsWith('parking:')),
    ),
  disabled: () => undefined,
  run: (context) => tagChange(context, withoutParking, 'Removed the parking tags').result,
}
