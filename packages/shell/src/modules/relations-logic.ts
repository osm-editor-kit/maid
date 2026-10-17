import { m } from '@osm-editor-kit/maid-i18n'
import {
  actionAddEntity,
  actionAddMember,
  actionDeleteMembers,
  OsmRelation,
  OsmWay,
  type Action,
  type Graph,
  type OsmRelationMember,
} from '@osm-editor-kit/maid-model'
import {
  validRelationRoles,
  type Geometry,
  type Presets,
  type RelationRoles,
  type Tags,
} from '@osm-editor-kit/maid-presets'
// Pure functions behind the relations module: which relations are loaded, how they are named,
// and where an entity sits in them. No React here, so the tests can build graphs by hand.
import { labelOf } from '@osm-editor-kit/maid-renderer'
import { isArea } from '@osm-editor-kit/maid-style'
import { routeJoins as validationRouteJoins } from '@osm-editor-kit/maid-validation'

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
export function relationLabel(relation: OsmRelation): string {
  return (
    labelOf(relation.tags).trim() || tagValue(relation.tags, 'type') || m.relations_fallback_name()
  )
}

/**
 * The name of each relation in the picker: its label, and its id after the label only when another relation in
 * the same list has the same label (iD's PR 10942). The ids are there to tell same-named relations apart; in a list
 * of different names they would be noise for newcomers. The id is also shown on hover where the picker is not a select.
 */
export function pickerNames(relations: readonly OsmRelation[]) {
  const counts = new Map<string, number>()
  for (const relation of relations) {
    const label = relationLabel(relation)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return new Map<EntityID, string>(
    relations.map((relation): [EntityID, string] => {
      const label = relationLabel(relation)
      return [relation.id, (counts.get(label) ?? 0) > 1 ? `${label} (${relation.id})` : label]
    }),
  )
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
 * The relations that got a member in this session (`current`) with the ones touched now added at the end, each once,
 * in the order they were first touched. Returns `current` itself when nothing is new.
 */
export function addSessionIDs(current: readonly EntityID[], touched: readonly EntityID[]) {
  const fresh = [...new Set(touched)].filter((id) => !current.includes(id))
  return fresh.length === 0 ? current : [...current, ...fresh]
}

/**
 * The relations that got a member in this session go to the top of the picker, in the order they were first touched,
 * as iD's PR 11588 keeps them: also the ones far from the feature. The rest keep their order. `relations` are the
 * picker's relations, which come from the graph, so a relation that is gone from it is not listed. Returns a new list.
 */
export function sessionFirst(relations: readonly OsmRelation[], sessionIDs: readonly EntityID[]) {
  const rank = new Map<EntityID, number>()
  sessionIDs.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index)
  })
  const inSession = relations
    .filter((relation) => rank.has(relation.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  return [...inSession, ...relations.filter((relation) => !rank.has(relation.id))]
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
 * Loads one member that is not in the data: the engine's `loadEntity` (tile-loader.ts), which resolves with how
 * many entities were new. The members section draws no download button until one is given.
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
export function membersHeadline(rows: readonly MemberRow[]): string {
  const members = membersOf(rows.length)
  const missing = notLoadedCount(rows)
  return missing > 0 ? m.relations_members_headline({ members, missing }) : members
}

/** "1 member" or "3 members" */
function membersOf(count: number): string {
  return count === 1 ? m.relations_member_one() : m.relations_member_other({ count })
}

/** The button that loads the missing members: "Load the 12 missing members" */
export function loadButtonLabel(missing: number): string {
  return missing === 1
    ? m.relations_load_missing_one()
    : m.relations_load_missing_other({ count: missing })
}

/** The button while the members load: "Loading 12 members" */
export function loadingLabel(missing: number): string {
  return m.relations_loading({ members: membersOf(missing) })
}

/**
 * The line under the button after a load, when some members are still not loaded: the API did not
 * return them, so loading again will not help. Undefined when all are loaded (the button is gone).
 */
export function loadResultSentence(added: number, left: number): string | undefined {
  if (left === 0) return undefined
  if (added === 0)
    return left === 1
      ? m.relations_load_nothing_one()
      : m.relations_load_nothing_other({ count: left })
  return left === 1
    ? m.relations_load_partial_one({ added: membersOf(added) })
    : m.relations_load_partial_other({ added: membersOf(added), count: left })
}

/** The line under the button when a load failed: the message says why ("OSM API answered 404") */
export function loadFailureSentence(message: string): string {
  return m.relations_load_failed({ message })
}

/** Where the move buttons send a member: the member before it (up) or after it (down) in its own group. */
export type MemberMoves = { up?: number; down?: number }

/**
 * The move targets of every member, by its index, in the terms of actionMoveMember. A member moves past the member
 * before or after it in its own group (stops among stops, ways among ways), so the other group keeps its place. A
 * member at the end of its group has no target that way. For a relation with one group this is one step.
 */
export function moveTargets(rows: readonly MemberRow[], tags: Tags): Map<number, MemberMoves> {
  const moves = new Map<number, MemberMoves>()
  const previous = new Map<MemberGroupKey, number>()
  for (const row of rows) {
    const key = memberGroupKey(tags, row)
    const before = previous.get(key)
    moves.set(row.index, { up: before })
    if (before !== undefined) moves.set(before, { ...moves.get(before), down: row.index })
    previous.set(key, row.index)
  }
  return moves
}

/**
 * The move a drop makes, in the terms of actionMoveMember, when the dragged member moved within its group.
 * `shown` is the list in data order (each row with its member index), `before` the group's rows in the order
 * they had, `after` the group's rows as the drag left them, and `draggedIndex` the member that was dragged.
 * The member goes right after the member before it in the group (or before the one after it, at the top of the
 * group), so members of the other group between them keep their place. Undefined when the group's order did
 * not change (no edit, no undo step) or the member is not in the group.
 */
export function groupDropMove(
  shown: readonly { index: number }[],
  before: readonly { index: number }[],
  after: readonly { index: number }[],
  draggedIndex: number,
) {
  const at = after.findIndex((row) => row.index === draggedIndex)
  if (at < 0) return undefined
  if (before.length === after.length && before.every((row, i) => row.index === after[i]?.index))
    return undefined
  const rest = shown.filter((row) => row.index !== draggedIndex)
  // actionMoveMember takes the place the item ends at, counted in the list without it
  const previous = after[at - 1]
  const next = after[at + 1]
  const to = previous
    ? rest.findIndex((row) => row.index === previous.index) + 1
    : rest.findIndex((row) => row.index === next?.index)
  if (to < 0) return undefined
  return { from: draggedIndex, to }
}

/** The part of the members list a member is shown in: the stops of a route, its ways (every other member), or all. */
export type MemberGroupKey = 'stops' | 'ways' | 'all'

export type MemberGroup = { key: MemberGroupKey; rows: MemberRow[] }

/** The group a member of a relation is listed in: for a `type=route`, its stops or its ways; otherwise all of them. */
export function memberGroupKey(tags: Tags, row: Pick<MemberRow, 'type' | 'role'>): MemberGroupKey {
  if (tagValue(tags, 'type') !== 'route') return 'all'
  return isStopRow(row) ? 'stops' : 'ways'
}

/**
 * The members of a relation in groups, as the list shows them: a `type=route` has "stops" and "ways", each in data
 * order; other relations have one group. An empty group is left out. The rows keep their data order and index.
 */
export function memberGroups(rows: readonly MemberRow[], tags: Tags): MemberGroup[] {
  const keys: MemberGroupKey[] = ['stops', 'ways', 'all']
  return keys
    .map((key) => ({ key, rows: rows.filter((row) => memberGroupKey(tags, row) === key) }))
    .filter((group) => group.rows.length > 0)
}

/** Whether a member of a route is a stop or platform: a point member, or a role of the stop and platform kind. */
function isStopRow(row: Pick<MemberRow, 'type' | 'role'>) {
  return row.type === 'node' || STOP_OR_PLATFORM_ROLE.test(row.role)
}

/** A colour as `colour=*` writes it: `#rgb` or `#rrggbb`. Other colours need the browser to know them. */
const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** CSS-wide keywords and the colours that cannot mark a relation (no colour, or none that shows). */
const NO_COLOUR = new Set(['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'transparent'])

/** Whether the browser reads the value as a colour. False where there is no CSS (tests, Node). */
export function cssSupportsColour(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('color', value)
    : false
}

/**
 * The colour of a relation from its `colour` tag, when the tag is a valid CSS colour (a hex value or a colour name the
 * browser knows, `supports`); undefined otherwise, so a stray value never reaches a style. The value is returned as
 * written, trimmed.
 */
export function colourOf(
  relation: OsmRelation,
  supports: (value: string) => boolean = cssSupportsColour,
): string | undefined {
  const value = relation.tags.colour?.trim()
  if (!value || NO_COLOUR.has(value.toLowerCase())) return undefined
  if (HEX_COLOUR.test(value)) return value
  return supports(value) ? value : undefined
}

/**
 * Whether a dot of this colour needs a hairline ring to be seen on the sidebar's white: a light hex colour. A colour
 * name is not measured here, so it gets the ring too (a ring on a dark colour is hardly visible).
 */
export function dotNeedsRing(colour: string) {
  if (!HEX_COLOUR.test(colour)) return true
  const digits = colour.slice(1)
  const full = digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits
  const channel = (at: number) => linear(Number.parseInt(full.slice(at, at + 2), 16) / 255)
  // relative luminance (WCAG); above this a dot is hard to see on white
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.6
}

/** One sRGB channel in 0..1, as linear light (WCAG) */
function linear(value: number) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/**
 * The relations an "Also add" offer is made for after a paste: each relation the original feature is a member of,
 * where the copy is not a member yet and the offer was not settled (`settled`, the relations added or dismissed).
 * A relation that was copied too is left out: the copy is already in its copy. One offer per relation, with the
 * role the original had there.
 */
export function pasteOffersOf(
  graph: Graph,
  copyID: EntityID,
  originalID: EntityID,
  copiedOriginals: ReadonlySet<EntityID>,
  settled: readonly EntityID[],
): PasteOffer[] {
  if (!graph.hasEntity(copyID)) return []
  const seen = new Set<EntityID>()
  const offers: PasteOffer[] = []
  for (const membership of membershipsOf(graph, originalID)) {
    const { relation } = membership
    if (seen.has(relation.id)) continue
    seen.add(relation.id)
    if (copiedOriginals.has(relation.id) || settled.includes(relation.id)) continue
    if (relation.members.some((member) => member.id === copyID)) continue
    offers.push({ relation, role: membership.role })
  }
  return offers
}

/** An "Also add" offer: the relation, and the role the original had in it */
export type PasteOffer = { relation: OsmRelation; role: string }

/**
 * For each pair of consecutive way members of a route (stops, platforms and node members are skipped), whether they
 * connect, keyed by the index of the earlier member. The rule is the validation's (`route_gap`), so the sidebar, the
 * map and the Issues list find the same gaps. Only `type=route` is checked.
 */
export function routeJoins(graph: Graph, relation: OsmRelation) {
  return validationRouteJoins(graph, relation).map(({ index, join }) => ({ index, join }))
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
 * The part of the presets this module reads: the roles of a relation and whether it takes a member twice.
 * Undefined presets (not made yet) mean no schema: everything behaves as before the schema was read.
 */
export type RelationRules = Pick<Presets, 'relationRoles' | 'allowsDuplicateMembers'>

/** The roles of a relation with their labels and member rules; none without presets or without a schema. */
export function relationRolesOf(presets: RelationRules | undefined, tags: Tags): RelationRoles {
  return presets ? presets.relationRoles(tags) : {}
}

/**
 * The text a role shows as: its translated label when the schema has one (iD's `displayRole`), else the role
 * itself. An unknown role shows as it is stored.
 */
export function roleLabel(roles: RelationRoles, role: string) {
  const definition = Object.hasOwn(roles, role) ? roles[role] : undefined
  return definition?.label || role
}

/**
 * The role a typed text stands for: the key of the role whose label it is (iD's changeRole), so typing the
 * label stores the key. A key, or text that is no label, stays as typed (trimmed). The first role with that
 * label wins.
 */
export function roleFromText(roles: RelationRoles, text: string) {
  const typed = text.trim()
  for (const [role, { label }] of Object.entries(roles)) {
    if (label !== '' && label === typed) return role
  }
  return typed
}

/** One suggestion for a role input: the role, and its label when the schema has one (shown in place of the key). */
export type RoleOption = { role: string; label?: string }

/**
 * The suggestions for a role input, as iD's member editor builds them. First the schema's roles that fit the
 * geometry (`validRelationRoles`; a role without a label is offered by its key), then `suggestions` (from
 * `roleSuggestions`) without the roles already offered. `geometry` undefined (no member, or several features
 * with different geometries) offers every role of the schema.
 */
export function roleOptionsFor(
  suggestions: readonly string[],
  roles: RelationRoles,
  geometry: Geometry | undefined,
): RoleOption[] {
  const fitting = validRelationRoles(roles, geometry, undefined)
  const fromSchema: RoleOption[] = Object.entries(fitting).map(([role, { label }]) =>
    label ? { role, label } : { role },
  )
  const offered = new Set(Object.keys(fitting))
  // a role used by the relation that the schema knows keeps its label, even where it does not fit this geometry
  const rest: RoleOption[] = suggestions
    .filter((role) => !offered.has(role))
    .map((role) => {
      const label = Object.hasOwn(roles, role) ? roles[role]?.label : undefined
      return label ? { role, label } : { role }
    })
  return [...fromSchema, ...rest]
}

/**
 * The role one feature gets when it is added to a relation (iD's actionAddMembers). A typed role wins (a label
 * is turned into its key). With no role typed, the feature gets the role when exactly one role of the schema fits
 * it (its geometry and tags); with none or several, it gets '' as today. Decided per feature.
 */
export function roleToAdd(
  roles: RelationRoles,
  typed: string,
  feature: { geometry: Geometry; tags: Tags },
) {
  const text = typed.trim()
  if (text !== '') return roleFromText(roles, text)
  const fitting = Object.keys(validRelationRoles(roles, feature.geometry, feature.tags))
  return fitting.length === 1 ? (fitting[0] ?? '') : ''
}

/**
 * The reason a relation cannot take the features (iD's "Already a member"). A function, not a constant: the text
 * follows the locale at the time it is shown.
 */
export function duplicateReason(): string {
  return m.relations_reason_duplicate()
}
/** The reason a relation cannot take the features, when one of them fits none of its roles (iD's invalid member). */
export function invalidReason(): string {
  return m.relations_reason_invalid()
}

/** A feature that is to be added: what its member rules look at. An EntityInfo has all of it. */
export type FeatureForRules = { id: string; geometry: Geometry; tags: Tags }

/**
 * Why a relation cannot take the features, or undefined when it can (iD's isDuplicateMembership and
 * isInvalidMembership). A relation whose schema says `allowDuplicateMembers: false` already has one of the
 * features as a member: duplicate. A relation with a schema where one feature fits no role: invalid. Duplicate
 * is checked first. Without a schema nothing is refused.
 */
export function cannotTakeReason(
  relation: OsmRelation,
  features: readonly FeatureForRules[],
  presets: RelationRules | undefined,
): string | undefined {
  if (!presets) return undefined
  const ids = new Set(features.map((feature) => feature.id))
  if (
    relation.members.some((member) => ids.has(member.id)) &&
    !presets.allowsDuplicateMembers(relation.tags)
  )
    return duplicateReason()
  const roles = presets.relationRoles(relation.tags)
  if (Object.keys(roles).length === 0) return undefined
  const someFitsNoRole = features.some(
    (feature) =>
      Object.keys(validRelationRoles(roles, feature.geometry, feature.tags)).length === 0,
  )
  return someFitsNoRole ? invalidReason() : undefined
}

/**
 * Whether adding `candidateId` to the relation would put the relation inside itself: the candidate is the relation, or
 * a relation that holds it as a member, directly or further down. Only what is loaded is followed.
 */
export function wouldContainItself(graph: Graph, relationId: EntityID, candidateId: EntityID) {
  const seen = new Set<EntityID>()
  const holds = (id: EntityID): boolean => {
    if (id === relationId) return true
    if (seen.has(id)) return false
    seen.add(id)
    const entity = graph.hasEntity(id)
    if (!(entity instanceof OsmRelation)) return false
    return entity.members.some((member) => member.type === 'relation' && holds(member.id))
  }
  return holds(candidateId)
}

/**
 * The geometry of a loaded entity as the inspector names it (the same rules as the renderer's entityInfo): a
 * node is a vertex when a way uses it, else a point; a way is an area or a line; a relation is an area when it is
 * a multipolygon, else a relation. Undefined when the entity is not loaded.
 */
export function geometryOfEntity(graph: Graph, id: EntityID): Geometry | undefined {
  const entity = graph.hasEntity(id)
  if (!entity) return undefined
  if (entity instanceof OsmRelation)
    return tagValue(entity.tags, 'type') === 'multipolygon' ? 'area' : 'relation'
  if (entity instanceof OsmWay) {
    const last = entity.nodes[entity.nodes.length - 1]
    const closed = entity.nodes.length > 2 && entity.nodes[0] === last
    return isArea(entity.tags, closed) ? 'area' : 'line'
  }
  return graph.parentWays(entity).length > 0 ? 'vertex' : 'point'
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
export function placementSentence(
  placement: Placement,
  name: (member: MemberRef) => string,
): string {
  const index = placement.index + 1
  const count = placement.count
  if (count === 1) return m.relations_placed_only()
  if (placement.before && placement.after)
    return m.relations_placed_between({
      index,
      count,
      before: name(placement.before),
      after: name(placement.after),
    })
  if (placement.after) return m.relations_placed_start({ index, count })
  return m.relations_placed_end({ index, count })
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
    if (sameRole === 1) return m.relations_hint_restriction()
  }
  if (type === 'multipolygon' && member.role === 'outer') return m.relations_hint_outer()
  return undefined
}

/**
 * One relation that holds at least one of several selected features: a line of the multi-selection's list (iD PR 11949).
 * `count` is how many of the selected features it holds, `total` how many are selected. `roles` are the distinct roles
 * they have in it, in the order they first appear: one role, or several, which the list shows as "mixed".
 */
export type MultiMembership = {
  relation: OsmRelation
  count: number
  total: number
  roles: string[]
}

/**
 * Every relation that holds at least one of the selected features. Those that hold all of them come first, each group
 * in creation order (`creationOrder`). A feature that is selected twice counts once. Needs no presets.
 */
export function multiMembershipsOf(graph: Graph, ids: readonly EntityID[]): MultiMembership[] {
  const selected = [...new Set(ids)]
  const found = new Map<EntityID, { relation: OsmRelation; held: Set<EntityID>; roles: string[] }>()
  for (const id of selected) {
    for (const { relation, role } of membershipsOf(graph, id)) {
      const entry = found.get(relation.id) ?? { relation, held: new Set<EntityID>(), roles: [] }
      entry.held.add(id)
      if (!entry.roles.includes(role)) entry.roles.push(role)
      found.set(relation.id, entry)
    }
  }
  const total = selected.length
  return [...found.values()]
    .map(({ relation, held, roles }) => ({ relation, count: held.size, total, roles }))
    .sort(
      (a, b) =>
        Number(b.count === total) - Number(a.count === total) ||
        creationOrder(a.relation.id, b.relation.id),
    )
}

/** The memberships that hold every selected feature: the relations "Remove from relation" takes them out of. */
export function sharedMemberships(memberships: readonly MultiMembership[]) {
  return memberships.filter((membership) => membership.count === membership.total)
}

/** A selected feature as the plans need it: its id and type (for the member) and what the member rules look at. */
export type PlanFeature = FeatureForRules & { type: OsmRelationMember['type'] }

/** The selected features of the graph, in the order given. An id that is not loaded is left out. */
export function planFeaturesOf(graph: Graph, ids: readonly EntityID[]): PlanFeature[] {
  const features: PlanFeature[] = []
  for (const id of new Set(ids)) {
    const entity = graph.hasEntity(id)
    const geometry = geometryOfEntity(graph, id)
    const type = entity?.type
    if (!entity || geometry === undefined) continue
    if (type !== 'node' && type !== 'way' && type !== 'relation') continue
    features.push({ id, type, geometry, tags: entity.tags })
  }
  return features
}

/**
 * What adding the features to a relation takes, as "Add the others" and "Add to relation…" do it: the actions that add
 * each feature the relation does not hold yet, with the role `roleToAdd` gives it (one undo step when performed
 * together). `reason` is why the relation cannot take them (`cannotTakeReason`); then there are no actions.
 */
export function planAddOthers(
  relation: OsmRelation,
  features: readonly PlanFeature[],
  presets: RelationRules | undefined,
): { missing: number; reason: string | undefined; actions: Action[] } {
  const held = new Set(relation.members.map((member) => member.id))
  const missing = features.filter((feature) => !held.has(feature.id))
  if (missing.length === 0) return { missing: 0, reason: undefined, actions: [] }
  const reason = cannotTakeReason(relation, missing, presets)
  if (reason !== undefined) return { missing: missing.length, reason, actions: [] }
  const roles = relationRolesOf(presets, relation.tags)
  return {
    missing: missing.length,
    reason: undefined,
    actions: missing.map((feature) =>
      actionAddMember(relation.id, {
        id: feature.id,
        type: feature.type,
        role: roleToAdd(roles, '', feature),
      }),
    ),
  }
}

/**
 * What taking the features out of a relation takes, as "Remove all" and "Remove from relation" do it: one action that
 * deletes every member among them (the last one first, so the positions of the others stay right). Nothing when none
 * of them is a member.
 */
export function planRemoveFrom(relation: OsmRelation, ids: readonly EntityID[]): Action[] {
  const selected = new Set(ids)
  const indexes: number[] = []
  relation.members.forEach((member, index) => {
    if (selected.has(member.id)) indexes.push(index)
  })
  return indexes.length === 0 ? [] : [actionDeleteMembers(relation.id, indexes)]
}

/**
 * The relation "Add to relation…" adds the features to: the last of the session's relations (`sessionIDs`, the first
 * touched first) that the graph holds and that can take them (`planAddOthers` has actions for it). Undefined when no
 * session relation can.
 */
export function addTargetOf(
  graph: Graph,
  sessionIDs: readonly EntityID[],
  features: readonly PlanFeature[],
  presets: RelationRules | undefined,
): OsmRelation | undefined {
  for (let index = sessionIDs.length - 1; index >= 0; index--) {
    const id = sessionIDs[index]
    if (id === undefined) continue
    const relation = graph.hasEntity(id)
    if (!(relation instanceof OsmRelation)) continue
    if (planAddOthers(relation, features, presets).actions.length > 0) return relation
  }
  return undefined
}
