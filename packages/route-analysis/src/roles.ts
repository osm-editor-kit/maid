import type { MemberInfo, MemberKind, PointKind, RouteInput, RouteMember } from './types.ts'

// Roles from the OSM wiki (Relation:route, the approved Recreational_route_relation_roles proposal) and the roles
// Maid suggests (ROLES_BY_TYPE in packages/shell/src/modules/relations-logic.ts). See docs/research/relation-overview.md.

/** Way roles of the main line */
const MAIN_WAY_ROLES = new Set([
  '',
  'main',
  'forward',
  'backward',
  'hail_and_ride',
  'reverse',
  'north',
  'south',
  'east',
  'west',
  'link',
])

/** Way and relation roles of side lines */
export const BRANCH_ROLES = new Set(['alternative', 'excursion', 'approach', 'connection'])

const STOP_ROLE = /^stop(_entry_only|_exit_only)?$/
const PLATFORM_ROLE = /^platform(_entry_only|_exit_only)?$/

const POINT_ROLES: Readonly<Record<string, PointKind>> = {
  guidepost: 'guidepost',
  milestone: 'milestone',
  information: 'information',
  station: 'station',
  start: 'start',
  start_stop: 'start',
  stop: 'end',
  route_marker: 'other',
  parking: 'other',
  '': 'other',
}

/** What kind of point a node is, from its role first, then from its tags */
export function pointKindOf(
  role: string,
  tags: Readonly<Record<string, string>> | undefined,
): PointKind {
  const fromRole = POINT_ROLES[role]
  if (fromRole && fromRole !== 'other') return fromRole
  if (
    tags?.information === 'guidepost' ||
    (tags?.tourism === 'information' && tags.information === 'guidepost')
  )
    return 'guidepost'
  if (tags?.highway === 'milestone') return 'milestone'
  return 'other'
}

function isKnownPointRole(role: string) {
  return role in POINT_ROLES
}

function isLoaded(input: RouteInput, member: RouteMember) {
  if (member.type === 'way') return input.ways.has(member.id)
  if (member.type === 'node') return input.nodes.has(member.id)
  return true
}

/** One kind per member. A role the overview does not know never drops a member: it is listed as `other` or `point`. */
export function classifyMembers(input: RouteInput): MemberInfo[] {
  const transit = isTransit(input.tags)
  return input.members.map((member, index): MemberInfo => {
    const role = member.role.trim()
    let kind: MemberKind
    let knownRole = true
    if (member.type === 'relation') {
      kind = 'subroute'
      knownRole = role === '' || MAIN_WAY_ROLES.has(role) || BRANCH_ROLES.has(role)
    } else if (!isLoaded(input, member)) {
      kind = 'unloaded'
      knownRole =
        MAIN_WAY_ROLES.has(role) ||
        BRANCH_ROLES.has(role) ||
        STOP_ROLE.test(role) ||
        PLATFORM_ROLE.test(role) ||
        isKnownPointRole(role)
    } else if (PLATFORM_ROLE.test(role)) kind = 'platform'
    else if (member.type === 'node' && transit && STOP_ROLE.test(role)) kind = 'stop'
    else if (member.type === 'node') {
      kind = 'point'
      knownRole = isKnownPointRole(role) || STOP_ROLE.test(role)
    } else if (MAIN_WAY_ROLES.has(role)) kind = 'main'
    else if (BRANCH_ROLES.has(role)) kind = 'branch'
    else {
      kind = 'other'
      knownRole = false
    }
    const info: MemberInfo = { index, member, kind, knownRole }
    if (kind === 'point') info.pointKind = pointKindOf(role, input.memberTags?.get(member.id))
    return info
  })
}

/** Public transport routes: `stop` on a node is a stop position, not the end of a fitness trail */
export function isTransit(tags: Readonly<Record<string, string>>) {
  return /^(bus|trolleybus|tram|train|subway|light_rail|monorail|ferry|share_taxi|coach|minibus|funicular)$/.test(
    tags.route ?? '',
  )
}

/** Routes where junction hints for guideposts make sense */
export function isWaymarked(tags: Readonly<Record<string, string>>) {
  return /^(hiking|foot|walking|bicycle|mtb|horse|running|inline_skates|ski|canoe)$/.test(
    tags.route ?? '',
  )
}
