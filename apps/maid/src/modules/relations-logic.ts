// Pure functions behind the relations module: which relations are loaded, how they are named,
// and where an entity sits in them. No React here, so the tests can build graphs by hand.
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'

/** One place where an entity is a member: the relation, the position in its members, and the role. */
export type Membership = { relation: OsmRelation; index: number; role: string }

/** Keys that describe what a feature is, in the order they are preferred as a member's label. */
const MAIN_KEYS = [
  'highway',
  'railway',
  'waterway',
  'aeroway',
  'building',
  'amenity',
  'shop',
  'leisure',
  'landuse',
  'natural',
  'boundary',
  'public_transport',
  'route',
  'place',
  'man_made',
  'power',
  'barrier',
  'historic',
  'tourism',
  'office',
]

/** A tag value, or undefined when the tag is missing or empty. */
function tagValue(tags: Record<string, string>, key: string): string | undefined {
  const value = tags[key]?.trim()
  return value ? value : undefined
}

/**
 * Every relation the graph holds: the base data plus local edits. A local entry overrides the
 * base one, and an `undefined` local entry means the relation was deleted.
 */
export function loadedRelations(graph: Graph): OsmRelation[] {
  // runs when the sidebar draws: walk the maps, do not copy the ids of every node first
  const relations: OsmRelation[] = []
  for (const [id, entity] of graph.base.entities)
    if (entity instanceof OsmRelation && !graph.local.entities.has(id)) relations.push(entity)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmRelation) relations.push(entity)
  return relations
}

/**
 * A short name for a relation: `name`, else `ref` (with the `type` in front, "route 100"),
 * else the `type` tag, else "Relation".
 */
export function relationLabel(relation: OsmRelation): string {
  const tags = relation.tags
  const name = tagValue(tags, 'name')
  if (name) return name
  const ref = tagValue(tags, 'ref')
  const type = tagValue(tags, 'type')
  if (ref) return type ? `${type} ${ref}` : ref
  if (type) return type
  return 'Relation'
}

/**
 * A label for a member in the inspector: its `name`, else its main tag as `key=value`,
 * else undefined (the UI then shows only the type and id).
 */
export function memberLabel(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined
  const name = tagValue(tags, 'name')
  if (name) return name
  for (const key of MAIN_KEYS) {
    const value = tagValue(tags, key)
    if (value) return `${key}=${value}`
  }
  return undefined
}

/**
 * Every place where the entity is a member, in relation order and then member order.
 * An entity that is in one relation twice gets two entries.
 */
export function membershipsOf(graph: Graph, entityId: EntityID): Membership[] {
  const entity = graph.hasEntity(entityId)
  if (!entity) return []
  const result: Membership[] = []
  for (const relation of graph.parentRelations(entity)) {
    relation.members.forEach((member, index) => {
      if (member.id === entityId) result.push({ relation, index, role: member.role })
    })
  }
  return result
}

/**
 * The loaded relations an entity can be added to: not the entity itself and not a relation it
 * is already a member of. Sorted by label, then by id.
 */
export function joinableRelations(graph: Graph, entityId: EntityID): OsmRelation[] {
  const taken = new Set(membershipsOf(graph, entityId).map((m) => m.relation.id))
  // the label is worked out once per relation, not in every comparison of the sort
  return loadedRelations(graph)
    .filter((relation) => relation.id !== entityId && !taken.has(relation.id))
    .map((relation) => ({ relation, label: relationLabel(relation) }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.relation.id.localeCompare(b.relation.id))
    .map(({ relation }) => relation)
}
