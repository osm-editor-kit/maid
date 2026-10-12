import { OsmNode, OsmWay, actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { Fix, Issue, Rule } from '../types.ts'

/** Buildings that are probably someone's home, so their contact details are personal */
const privateBuildingValues: ReadonlySet<string> = new Set([
  'detached',
  'farm',
  'house',
  'houseboat',
  'residential',
  'semidetached_house',
  'static_caravan',
])

/** Tags that show a building is a business or a public place, so it is not private */
const publicKeys: ReadonlySet<string> = new Set([
  'amenity',
  'craft',
  'historic',
  'leisure',
  'office',
  'shop',
  'tourism',
])

/** Tags that may contain personally identifying information */
const personalTags: ReadonlySet<string> = new Set([
  'contact:email',
  'contact:fax',
  'contact:phone',
  'email',
  'fax',
  'phone',
])

/** "Remove the personal tags" of the entity, as one undo step */
function removePersonalTagsFix(entityId: string, keys: readonly string[]): Fix {
  const list = keys.join(', ')
  return {
    id: 'remove_personal_tags',
    label: `Remove ${list}`,
    annotation: `Removed ${list}`,
    actions(graph: Graph) {
      const entity = graph.hasEntity(entityId)
      if (!entity) return []
      const tags: Record<string, string> = { ...entity.tags }
      for (const key of keys) delete tags[key]
      return [actionChangeTags(entityId, tags)]
    },
  }
}

/** The first point of a feature, to show where the issue is */
function locationOf(entity: OsmEntity, graph: Graph): [number, number] | undefined {
  if (entity instanceof OsmNode) return entity.loc ? [entity.loc[0], entity.loc[1]] : undefined
  if (!(entity instanceof OsmWay)) return undefined
  const first = entity.first()
  const node = first ? graph.hasEntity(first) : undefined
  return node instanceof OsmNode && node.loc ? [node.loc[0], node.loc[1]] : undefined
}

/**
 * A house-like building with a phone number or email in its tags: probably someone's home, so the
 * contact details are personal data. Not flagged when the building is also a shop, office or other
 * public feature.
 */
export const privateData: Rule = {
  id: 'private_data',
  label: 'Private data',
  validate(entity, { graph }): Issue[] {
    const tags = entity.tags
    const building = tags.building
    if (!building || !privateBuildingValues.has(building)) return []
    for (const key of Object.keys(tags)) if (publicKeys.has(key)) return []

    const keys = Object.keys(tags).filter((key) => personalTags.has(key))
    if (keys.length === 0) return []

    const loc = locationOf(entity, graph)
    return [
      {
        id: `private_data:${entity.id}`,
        rule: 'private_data',
        severity: 'warning',
        message: `A private building (building=${building}) has personal contact data: ${keys.join(', ')}`,
        entityIds: [entity.id],
        ...(loc ? { loc } : {}),
        fixes: [removePersonalTagsFix(entity.id, keys)],
        data: { removed: keys },
      },
    ]
  },
}
