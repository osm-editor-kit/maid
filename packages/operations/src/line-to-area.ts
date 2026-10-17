// Treat as area: a closed line that says nothing about what it is gets `area=yes`, so that the type search
// offers the area presets. Maid's own operation, not in iD. Headless, like the rest of this package.
import { OsmWay, actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from './types.ts'

/**
 * Keys that say nothing about what a way is, so a closed way with only these is still a line: the sources, notes,
 * fixme and created_by (the editors add them), and description. `source`, `note` and `fixme` also count with a
 * suffix (`source:name`, `note:en`). Any other key is a feature's tag: `area=yes` would change its meaning.
 */
export function isNonFeatureKey(key: string): boolean {
  if (key === 'created_by' || key === 'description') return true
  return ['source', 'note', 'fixme'].some(
    (prefix) => key === prefix || key.startsWith(`${prefix}:`),
  )
}

/** The one selected way, when it is a closed line that is not an area yet and has no feature tags */
function closedLineOf(context: OperationContext): OsmWay | undefined {
  if (context.selected.length !== 1) return undefined
  const id = context.selected[0]
  const entity = id === undefined ? undefined : context.graph.hasEntity(id)
  if (!(entity instanceof OsmWay)) return undefined
  if (!entity.isClosed() || entity.isDegenerate() || entity.isArea()) return undefined
  return Object.keys(entity.tags).every(isNonFeatureKey) ? entity : undefined
}

/**
 * Treat as area: the closed line gets `area=yes`, as one undo step. Its tags stay as they are. When a preset is
 * chosen later, the presets remove the `area=yes` again where the preset's tags make an area by themselves
 * (presets.ts, withPresetTags), so it is only a step on the way.
 */
export const lineToAreaOperation: Operation = {
  id: 'line-to-area',
  label: 'Treat as area',
  icon: 'iD-icon-area',
  applies: (context) => closedLineOf(context) !== undefined,
  disabled: () => undefined,
  run: (context) => {
    const way = closedLineOf(context)
    if (!way) throw new Error('The line-to-area operation does not apply to this selection')
    return {
      actions: [actionChangeTags(way.id, { ...way.tags, area: 'yes' })],
      annotation: 'Treated a closed line as an area',
    }
  },
}
