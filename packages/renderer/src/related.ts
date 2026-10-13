/**
 * Pure helpers for relations on the map: which entities a relation covers, and where their loaded
 * geometry is. No MapLibre here, so they are tested on plain objects (related.test.ts).
 */

/** A member as a relation holds it: the only part of it these helpers read */
export type MemberRef = { readonly id: string; readonly type: string }

/** The members of a relation by its id; undefined when the relation is not loaded */
export type MembersOf = (relationId: string) => readonly MemberRef[] | undefined

/**
 * The entities a relation covers on the map: its members, and the members of its member relations
 * one level down (a multipolygon inside a boundary), not further. The relation itself is left out.
 * Each id is listed once, in the order the members give them. Members that are not loaded are
 * listed too: the caller finds them by id when they arrive.
 */
export function relatedIds(relationId: string, membersOf: MembersOf) {
  const out = new Set<string>()
  const direct = membersOf(relationId) ?? []
  for (const member of direct) if (member.id !== relationId) out.add(member.id)
  for (const member of direct) {
    if (member.type !== 'relation' || member.id === relationId) continue
    for (const inner of membersOf(member.id) ?? []) if (inner.id !== relationId) out.add(inner.id)
  }
  return [...out]
}

/** Where the loaded geometry of entities is */
export type GeometryOf = {
  /** lon, lat of a node; undefined when the node is not loaded */
  loc(nodeId: string): readonly [number, number] | undefined
  /** The nodes of a way; undefined when the way is not loaded */
  nodesOf(wayId: string): readonly string[] | undefined
  membersOf: MembersOf
}

/** West, south, east, north */
export type Bounds = [west: number, south: number, east: number, north: number]

/**
 * The bounds of the loaded geometry of some entities: a node is its point, a way is its nodes, and
 * a relation stands for the entities relatedIds gives for it. Entities that are not loaded add
 * nothing. Undefined when none of them has a loaded point.
 */
export function boundsOf(ids: readonly string[], geometry: GeometryOf): Bounds | undefined {
  const targets = new Set<string>()
  for (const id of ids) {
    if (id[0] === 'r')
      for (const related of relatedIds(id, geometry.membersOf)) targets.add(related)
    else targets.add(id)
  }
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const include = (nodeId: string) => {
    const loc = geometry.loc(nodeId)
    if (!loc) return
    const [lon, lat] = loc
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  for (const id of targets) {
    switch (id.charAt(0)) {
      case 'n':
        include(id)
        break
      case 'w':
        for (const nodeId of geometry.nodesOf(id) ?? []) include(nodeId)
        break
    }
  }
  return west <= east ? [west, south, east, north] : undefined
}
