import {
  actionAddEntity,
  actionAddMember,
  OsmRelation,
  OsmWay,
  type Action,
  type Graph,
  type OsmRelationMember,
} from '@osm-editor-kit/maid-model'
// Pure functions behind the relations module: which relations are loaded, how they are named,
// and where an entity sits in them. No React here, so the tests can build graphs by hand.
import { labelOf } from '@osm-editor-kit/maid-renderer'

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
function tagValue(tags: Record<string, string>, key: string) {
  const value = tags[key]?.trim()
  return value ? value : undefined
}

/**
 * Every relation the graph holds: the base data plus local edits. A local entry overrides the
 * base one, and an `undefined` local entry means the relation was deleted.
 */
export function loadedRelations(graph: Graph) {
  // runs when the sidebar draws: walk the maps, do not copy the ids of every node first
  const relations: OsmRelation[] = []
  for (const [id, entity] of graph.base.entities)
    if (entity instanceof OsmRelation && !graph.local.entities.has(id)) relations.push(entity)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmRelation) relations.push(entity)
  return relations
}

/**
 * A short name for a relation: the text iD shows (`labelOf`: name, else for a route its network, ref and
 * direction, else the ref), else the `type` tag, else "Relation".
 */
export function relationLabel(relation: OsmRelation) {
  return labelOf(relation.tags).trim() || tagValue(relation.tags, 'type') || 'Relation'
}

/**
 * A label for a member in the inspector: its `name`, else its main tag as `key=value`,
 * else undefined (the UI then shows only the type and id).
 */
export function memberLabel(tags: Record<string, string> | undefined) {
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
export function membershipsOf(graph: Graph, entityId: EntityID) {
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
 * The loaded relations the given entities can be added to, in the order of iD's membership editor
 * (`sortNearbyFirst`). Not the entities themselves, and not a relation that already holds all of them.
 */
export function joinableRelations(graph: Graph, entityIds: readonly EntityID[]) {
  if (entityIds.length === 0) return []
  const own = new Set(entityIds)
  const candidates = loadedRelations(graph).filter(
    (relation) =>
      !own.has(relation.id) &&
      !entityIds.every((id) => relation.members.some((member) => member.id === id)),
  )
  return sortNearbyFirst(candidates, connectedRelationIds(graph, entityIds))
}

/**
 * The relations that a selection touches, as iD's membership editor finds them (`getConnectedRelations`):
 * a relation that holds a way which shares a node with a selected node or way. For a selected way, the
 * ways that share one of its nodes are looked at; the selected ways themselves are left out.
 */
export function connectedRelationIds(graph: Graph, ids: readonly EntityID[]) {
  const selected = new Set(ids)
  const connected = new Set<EntityID>()
  for (const id of ids) {
    const entity = graph.hasEntity(id)
    if (!entity) continue
    const ways = new Map<EntityID, OsmWay>()
    if (entity.type === 'node') {
      for (const way of graph.parentWays(entity)) ways.set(way.id, way)
    } else if (entity instanceof OsmWay) {
      for (const nodeID of entity.nodes) {
        const node = graph.hasEntity(nodeID)
        if (!node) continue
        for (const way of graph.parentWays(node)) if (!selected.has(way.id)) ways.set(way.id, way)
      }
    }
    for (const way of ways.values())
      for (const relation of graph.parentRelations(way)) connected.add(relation.id)
  }
  return connected
}

/**
 * iD's `osmRelation.creationOrder`: relations made here (negative ids) first, the newest first; then the
 * loaded ones, the highest id first. Ids are `r123` or `r-1`.
 */
export function creationOrder(a: EntityID, b: EntityID) {
  const aID = Number(a.slice(1))
  const bID = Number(b.slice(1))
  if (aID < 0 || bID < 0) return aID - bID
  return bID - aID
}

/**
 * The order of the relations offered for a selection, as iD's membership editor sorts them: the relations
 * connected to the selection first (`connected`, from `connectedRelationIds`), then the rest in creation order.
 * Stable for equal keys; the input is not changed.
 */
export function sortNearbyFirst(
  relations: readonly OsmRelation[],
  connected: ReadonlySet<EntityID>,
) {
  return [...relations].sort((a, b) => {
    const aConnected = connected.has(a.id)
    const bConnected = connected.has(b.id)
    if (aConnected !== bConnected) return aConnected ? -1 : 1
    return creationOrder(a.id, b.id)
  })
}

/**
 * The actions that make a new relation with the given entities as its members, as iD's "New relation…" does:
 * an empty relation, then each entity added with the role. Performed together, they are one undo step.
 * The relation is new (its id is `r-N`) and is returned with the actions.
 */
export function newRelationActions(
  graph: Graph,
  members: readonly { id: EntityID; type: OsmRelationMember['type'] }[],
  role: string,
) {
  const relation = new OsmRelation(graph.context, {})
  const actions: Action[] = [actionAddEntity(relation)]
  for (const member of members)
    actions.push(actionAddMember(relation.id, { id: member.id, type: member.type, role }))
  return { relation, actions }
}

/**
 * Loads one member that is not in the data: the engine's call, which resolves with how many entities
 * were new. There is no such call in the engine yet (it loads whole relations, `loadRelation`); the
 * members section is built against this type and draws no download button until one is given.
 */
export type LoadMember = (id: EntityID) => Promise<{ added: number }>

/**
 * The API path that loads one member, as iD's `loadEntity` asks for it: a node by its own call, a way or
 * a relation with `/full` (its nodes or members). Undefined for an id that is not in OSM (`n-1`, a new
 * feature) or is not an element id.
 */
export function memberLoadPath(id: EntityID) {
  const match = /^([nwr])(\d+)$/.exec(id)
  if (!match) return undefined
  const letter = match[1]
  const osmID = match[2]
  if (letter === 'n') return `/api/0.6/node/${osmID}.json`
  const type = letter === 'w' ? 'way' : 'relation'
  return `/api/0.6/${type}/${osmID}/full.json`
}

/**
 * The members of a relation in their order, each with its position (0-based `index`), its role,
 * and whether its entity is in the graph. A member that is not loaded keeps its row.
 */
export function memberRows(graph: Graph, relation: OsmRelation) {
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
export function notLoadedCount(rows: readonly MemberRow[]) {
  return rows.filter((row) => !row.loaded).length
}

/** The headline of the Members section: "40 members, 12 not loaded" (the second part only if some are missing). */
export function membersHeadline(rows: readonly MemberRow[]) {
  const count = `${rows.length} ${rows.length === 1 ? 'member' : 'members'}`
  const missing = notLoadedCount(rows)
  return missing > 0 ? `${count}, ${missing} not loaded` : count
}

/** "1 member" or "3 members" */
function membersOf(count: number) {
  return `${count} ${count === 1 ? 'member' : 'members'}`
}

/** The button that loads the missing members: "Load the 12 missing members" */
export function loadButtonLabel(missing: number) {
  return `Load the ${missing} missing ${missing === 1 ? 'member' : 'members'}`
}

/** The button while the members load: "Loading 12 members" */
export function loadingLabel(missing: number) {
  return `Loading ${membersOf(missing)}`
}

/**
 * The line under the button after a load, when some members are still not loaded: the API did not
 * return them, so loading again will not help. Undefined when all are loaded (the button is gone).
 */
export function loadResultSentence(added: number, left: number) {
  if (left === 0) return undefined
  const notInAPI = left === 1 ? 'is not in the API' : 'are not in the API'
  if (added === 0)
    return `Loaded nothing: ${left === 1 ? 'the missing member' : `${left} members`} ${notInAPI}.`
  return `Loaded ${membersOf(added)}; ${left === 1 ? 'the other member' : `${left} members`} ${notInAPI}.`
}

/** The line under the button when a load failed: the message says why ("OSM API answered 404") */
export function loadFailureSentence(message: string) {
  return `Could not load the members: ${message}`
}

/** The index a member moves to with one step, or undefined when it is at the end already. */
export function moveTarget(count: number, index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  return target >= 0 && target < count ? target : undefined
}

/** The way members of a route, in order, with their index in `relation.members`. Stops, platforms and nodes are left out. */
type ChainLink = { index: number; way: OsmWay | undefined }

/** The nodes where a way can meet another: its two ends, or every node of a closed way (a roundabout). */
function touchPoints(way: OsmWay) {
  if (way.isClosed()) return way.nodes
  return [way.first(), way.last()].filter((node): node is EntityID => node !== undefined)
}

/** Whether two loaded ways share a point where they meet. */
function joinOf(a: OsmWay | undefined, b: OsmWay | undefined) {
  if (!a || !b || a.nodes.length === 0 || b.nodes.length === 0) return 'unknown'
  const atB = new Set(touchPoints(b))
  return touchPoints(a).some((node) => atB.has(node)) ? 'connected' : 'gap'
}

/**
 * For each pair of consecutive way members of a route (stops, platforms and node members are
 * skipped), whether they connect: keyed by the index of the earlier member. Only `type=route`
 * is checked; other relations, including `route_master`, return nothing.
 */
export function routeJoins(graph: Graph, relation: OsmRelation) {
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
export function routeGaps(graph: Graph, relation: OsmRelation) {
  return routeJoins(graph, relation)
    .filter((entry) => entry.join === 'gap')
    .map((entry) => entry.index)
}

/**
 * The roles offered for a relation's members: the roles its members already use (most frequent
 * first, then the order they first appear), then the built-in roles of its type. No duplicates,
 * no empty role. Needs no network.
 */
export function roleSuggestions(relation: OsmRelation) {
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
) {
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
function sameWithoutIndex(after: readonly MemberRef[], before: readonly MemberRef[], skip: number) {
  for (let i = 0; i < before.length; i++) {
    const a = after[i < skip ? i : i + 1]
    const b = before[i]
    if (!a || !b || a.id !== b.id || a.role !== b.role) return false
  }
  return true
}

/** A member's name in a sentence: its label (name or main tag) if it is loaded, else its id. */
export function memberName(graph: Graph, member: MemberRef) {
  const entity = graph.hasEntity(member.id)
  return (entity && memberLabel(entity.tags)) || member.id
}

/**
 * The line under "Add to a relation" that says where the way went:
 * "Added as member 7 of 12, between A and B", "... at the start" or "... at the end".
 */
export function placementSentence(placement: Placement, name: (member: MemberRef) => string) {
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
export function membershipHint(relation: OsmRelation, index: number) {
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
