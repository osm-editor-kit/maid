// Pure functions behind the relations module: which relations are loaded, how they are named,
// and where an entity sits in them. No React here, so the tests can build graphs by hand.
import { OsmRelation, OsmWay, type Graph, type OsmRelationMember } from '@osm-editor-kit/maid-model'

/** One place where an entity is a member: the relation, the position in its members, and the role. */
export type Membership = { relation: OsmRelation; index: number; role: string }

/** A member as the relation holds it: the entity and the role. Used to compare before and after an add. */
export type MemberRef = { id: EntityID; role: string }

/** One line of a relation's member list: the member at `index`, and whether its entity is in the graph. */
export type MemberRow = {
  index: number
  id: EntityID
  type: OsmRelationMember['type']
  role: string
  loaded: boolean
  /** The `memberLabel` of the loaded entity; undefined when it is not loaded or has no main tag */
  label: string | undefined
}

/** How a way member joins the next way member of a route. `unknown` when one of them is not loaded. */
export type RouteJoin = 'connected' | 'gap' | 'unknown'

/** Roles the built-in suggestions offer for each relation type (after the roles the relation uses). */
const ROLES_BY_TYPE = new Map<string, readonly string[]>([
  ['multipolygon', ['outer', 'inner']],
  ['boundary', ['outer', 'inner', 'admin_centre', 'label']],
  [
    'route',
    [
      'forward',
      'backward',
      'stop',
      'platform',
      'stop_entry_only',
      'stop_exit_only',
      'platform_entry_only',
      'platform_exit_only',
    ],
  ],
  ['restriction', ['from', 'via', 'to']],
  ['site', ['perimeter', 'entrance', 'label']],
  ['associatedStreet', ['street', 'house']],
])

/** Roles of stop and platform members (also the PTv2 variants such as `stop_entry_only`). They are not part of a route's way chain. */
const STOP_OR_PLATFORM_ROLE = /^(stop|platform)(_|$)/

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

/**
 * The members of a relation in their order, each with its position (0-based `index`), its role,
 * and whether its entity is in the graph. A member that is not loaded keeps its row.
 */
export function memberRows(graph: Graph, relation: OsmRelation): MemberRow[] {
  return relation.members.map((member, index) => {
    const entity = graph.hasEntity(member.id)
    return {
      index,
      id: member.id,
      type: member.type,
      role: member.role,
      loaded: entity !== undefined,
      label: entity ? memberLabel(entity.tags) : undefined,
    }
  })
}

/** How many of the rows are not loaded. */
export function notLoadedCount(rows: readonly MemberRow[]): number {
  return rows.filter((row) => !row.loaded).length
}

/** The headline of the Members section: "40 members, 12 not loaded" (the second part only if some are missing). */
export function membersHeadline(rows: readonly MemberRow[]): string {
  const count = `${rows.length} ${rows.length === 1 ? 'member' : 'members'}`
  const missing = notLoadedCount(rows)
  return missing > 0 ? `${count}, ${missing} not loaded` : count
}

/** The index a member moves to with one step, or undefined when it is at the end already. */
export function moveTarget(
  count: number,
  index: number,
  direction: 'up' | 'down',
): number | undefined {
  const target = direction === 'up' ? index - 1 : index + 1
  return target >= 0 && target < count ? target : undefined
}

/** The way members of a route, in order, with their index in `relation.members`. Stops, platforms and nodes are left out. */
type ChainLink = { index: number; way: OsmWay | undefined }

/** The nodes where a way can meet another: its two ends, or every node of a closed way (a roundabout). */
function touchPoints(way: OsmWay): EntityID[] {
  if (way.isClosed()) return way.nodes
  return [way.first(), way.last()].filter((node): node is EntityID => node !== undefined)
}

/** Whether two loaded ways share a point where they meet. */
function joinOf(a: OsmWay | undefined, b: OsmWay | undefined): RouteJoin {
  if (!a || !b || a.nodes.length === 0 || b.nodes.length === 0) return 'unknown'
  const atB = new Set(touchPoints(b))
  return touchPoints(a).some((node) => atB.has(node)) ? 'connected' : 'gap'
}

/**
 * For each pair of consecutive way members of a route (stops, platforms and node members are
 * skipped), whether they connect: keyed by the index of the earlier member. Only `type=route`
 * is checked; other relations, including `route_master`, return nothing.
 */
export function routeJoins(
  graph: Graph,
  relation: OsmRelation,
): { index: number; join: RouteJoin }[] {
  if (tagValue(relation.tags, 'type') !== 'route') return []
  const chain: ChainLink[] = []
  relation.members.forEach((member, index) => {
    if (member.type !== 'way' || STOP_OR_PLATFORM_ROLE.test(member.role)) return
    const entity = graph.hasEntity(member.id)
    chain.push({ index, way: entity instanceof OsmWay ? entity : undefined })
  })
  const joins: { index: number; join: RouteJoin }[] = []
  let previous: ChainLink | undefined
  for (const link of chain) {
    if (previous) joins.push({ index: previous.index, join: joinOf(previous.way, link.way) })
    previous = link
  }
  return joins
}

/** The indexes of the members after which a route has a gap: the ends of the two ways do not meet. */
export function routeGaps(graph: Graph, relation: OsmRelation): number[] {
  return routeJoins(graph, relation)
    .filter((entry) => entry.join === 'gap')
    .map((entry) => entry.index)
}

/**
 * The roles offered for a relation's members: the roles its members already use (most frequent
 * first, then the order they first appear), then the built-in roles of its type. No duplicates,
 * no empty role. Needs no network.
 */
export function roleSuggestions(relation: OsmRelation): string[] {
  const counts = new Map<string, number>()
  for (const member of relation.members) {
    if (member.role === '') continue
    counts.set(member.role, (counts.get(member.role) ?? 0) + 1)
  }
  // Map keeps insertion order and the sort is stable, so ties keep the order of first use
  const used = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([role]) => role)
  const builtIn = ROLES_BY_TYPE.get(tagValue(relation.tags, 'type') ?? '') ?? []
  return [...new Set([...used, ...builtIn])]
}

/**
 * Where a member went after an add: compares the members before and after, and finds the one
 * insertion that turns `before` into `after` for `entityID`. Undefined when no single insertion
 * explains the change (for example when the add also moved other members).
 */
export type Placement = {
  /** 0-based position of the new member in `after` */
  index: number
  count: number
  /** The member just before it, if any */
  before: MemberRef | undefined
  /** The member just after it, if any */
  after: MemberRef | undefined
}

export function placementOf(
  before: readonly MemberRef[],
  after: readonly MemberRef[],
  entityID: EntityID,
): Placement | undefined {
  if (after.length !== before.length + 1) return undefined
  for (let k = 0; k < after.length; k++) {
    if (after[k]?.id !== entityID) continue
    if (sameWithoutIndex(after, before, k)) {
      return {
        index: k,
        count: after.length,
        before: k > 0 ? after[k - 1] : undefined,
        after: after[k + 1],
      }
    }
  }
  return undefined
}

/** Whether `after` without its element at `skip` holds the same members, in the same order, as `before`. */
function sameWithoutIndex(
  after: readonly MemberRef[],
  before: readonly MemberRef[],
  skip: number,
): boolean {
  for (let i = 0; i < before.length; i++) {
    const a = after[i < skip ? i : i + 1]
    const b = before[i]
    if (!a || !b || a.id !== b.id || a.role !== b.role) return false
  }
  return true
}

/** A member's name in a sentence: its label (name or main tag) if it is loaded, else its id. */
export function memberName(graph: Graph, member: MemberRef): string {
  const entity = graph.hasEntity(member.id)
  return (entity && memberLabel(entity.tags)) || member.id
}

/**
 * The line under "Add to a relation" that says where the way went:
 * "Added as member 7 of 12, between A and B", "... at the start" or "... at the end".
 */
export function placementSentence(
  placement: Placement,
  name: (member: MemberRef) => string,
): string {
  const position = `member ${placement.index + 1} of ${placement.count}`
  if (placement.count === 1) return 'Added as the only member'
  if (placement.before && placement.after)
    return `Added as ${position}, between ${name(placement.before)} and ${name(placement.after)}`
  if (placement.after) return `Added as ${position}, at the start`
  return `Added as ${position}, at the end`
}

/**
 * A warning for a membership whose removal breaks something, or undefined. Information only:
 * the edit is not blocked.
 */
export function membershipHint(relation: OsmRelation, index: number): string | undefined {
  const member = relation.members[index]
  if (!member || member.type !== 'way') return undefined
  const type = tagValue(relation.tags, 'type')
  if (type === 'restriction' && (member.role === 'from' || member.role === 'to')) {
    const sameRole = relation.members.filter((m) => m.role === member.role).length
    if (sameRole === 1) return 'Deleting this way breaks the turn restriction'
  }
  if (type === 'multipolygon' && member.role === 'outer')
    return 'Deleting this way removes an outer ring of the multipolygon'
  return undefined
}
