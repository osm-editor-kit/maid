import { levelsOf } from '@osm-editor-kit/maid-levels'
import { actionChangeTags, type Graph } from '@osm-editor-kit/maid-model'
import type { Rule } from '../types.ts'

export const MISSING_LEVEL_RULE_ID = 'missing_level'

/** Ways and relations where a level is expected: indoor features, shops and amenities, stations and platforms */
function wantsLevel(tags: Readonly<Record<string, string>>) {
  return (
    tags.indoor !== undefined ||
    tags.shop !== undefined ||
    tags.amenity !== undefined ||
    tags.public_transport !== undefined ||
    tags.railway === 'platform' ||
    tags.railway === 'station'
  )
}

/** Keys for which `layer` is the right tag, not `level`: a crossing way, a bridge, a tunnel, a building */
const LAYER_IS_RIGHT = [
  'highway',
  'waterway',
  'power',
  'bridge',
  'tunnel',
  'building',
  'building:part',
]

/**
 * A feature with `layer` but no `level`, where a level is expected (Tobias, 2026-10-21): a tagged point, or an
 * indoor feature, shop, amenity, station or platform. `layer` only says what is drawn above what where two features
 * cross; the floor is `level`, and the level mode reads only that (docs/research/indoor/tagging-model.md). The fix
 * offers the layer's value as the level, chosen by the person, never set on its own: the two often agree, not always.
 */
export const missingLevel: Rule = {
  id: MISSING_LEVEL_RULE_ID,
  label: 'Missing level',
  validate(entity) {
    const { tags } = entity
    const layer = tags.layer
    if (layer === undefined || !/^-?\d+$/.test(layer) || Number(layer) === 0) return []
    if (levelsOf(tags).levels.length > 0) return []
    if (entity.type === 'node' ? Object.keys(tags).length <= 1 : !wantsLevel(tags)) return []
    if (
      entity.type !== 'node' &&
      LAYER_IS_RIGHT.some((key) => tags[key] !== undefined && !wantsLevel(tags))
    )
      return []
    const name = tags.name ?? entity.id
    return [
      {
        id: `${MISSING_LEVEL_RULE_ID}:${entity.id}`,
        rule: MISSING_LEVEL_RULE_ID,
        severity: 'warning',
        message: `${name} has layer=${layer} but no level`,
        entityIds: [entity.id],
        fixes: [
          {
            id: `set_level:${layer}`,
            label: `Set level=${layer}`,
            annotation: `Set level=${layer}`,
            actions(graph: Graph) {
              const current = graph.hasEntity(entity.id)
              if (!current) return []
              return [actionChangeTags(entity.id, { ...current.tags, level: layer })]
            },
          },
        ],
      },
    ]
  },
}
