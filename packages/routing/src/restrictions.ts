// Turn restrictions as forbidden transitions: from one way, over a via node, onto another way.
//
// Read from `type=restriction` relations with `restriction=no_*` or `only_*`, and the `from`, `via`
// (a node) and `to` members. `except=` that lists the profile's value (`bicycle`) lifts the
// restriction for that profile. Foot profiles ignore restrictions altogether (the profile says so).
//
// Skipped, and counted in `skipped`: via-way restrictions (a via way needs a sequence of transitions,
// not one), `restriction=` kinds other than `no_*` and `only_*`, relations with missing members, and
// relations whose from or via is not in the routing graph (not loaded, or not routable for the profile),
// and `no_*` relations whose to is not (nothing to forbid). An `only_*` whose to is not in the graph is
// kept with `NO_WAY`: every other exit is forbidden. A restriction over a via node that is not a graph
// node is not needed: two routable ways that meet at a node always make that node a graph node.
import type { OsmRelation } from '@osm-editor-kit/maid-model'

/** The `to` of an `only_*` restriction whose way the profile does not route: no exit matches it, so every exit is forbidden */
export const NO_WAY = -1

export interface Restriction {
  /** Way index of the way the traffic comes from */
  from: number
  /** Way index of the way it goes to (for `only_*`, the only way it may take); `NO_WAY` when that way is not routable */
  to: number
  /** `only_*`: every other exit from `from` at the via node is forbidden */
  only: boolean
}

export type RestrictionSkip = 'except' | 'unknown-kind' | 'via-way' | 'no-members' | 'not-in-graph'

export interface RestrictionTable {
  /** The restrictions by via node index */
  byVia: Map<number, Restriction[]>
  applied: number
  skipped: Record<RestrictionSkip, number>
}

export interface RestrictionProfile {
  restrictions: boolean
  exceptValue: string | undefined
}

export interface RestrictionLookup {
  node(id: EntityID): number | undefined
  way(id: EntityID): number | undefined
}

/** True when the transition from way `from` over node `via` onto way `to` is forbidden */
export function isForbidden(
  byVia: Map<number, Restriction[]>,
  via: number,
  from: number,
  to: number,
): boolean {
  const list = byVia.get(via)
  if (list === undefined) return false
  for (const r of list) {
    if (r.from !== from) continue
    if (r.only ? r.to !== to : r.to === to) return true
  }
  return false
}

export function buildRestrictions(
  relations: readonly OsmRelation[],
  lookup: RestrictionLookup,
  profile: RestrictionProfile,
): RestrictionTable {
  const table: RestrictionTable = {
    byVia: new Map(),
    applied: 0,
    skipped: { except: 0, 'unknown-kind': 0, 'via-way': 0, 'no-members': 0, 'not-in-graph': 0 },
  }
  if (!profile.restrictions) return table

  for (const relation of relations) {
    const tags = relation.tags
    if (tags.type !== 'restriction') continue
    const kind = tags.restriction ?? ''
    const only = kind.startsWith('only_')
    if (!only && !kind.startsWith('no_')) {
      table.skipped['unknown-kind']++
      continue
    }
    if (profile.exceptValue !== undefined) {
      const except = (tags.except ?? '').split(';').map((value) => value.trim())
      if (except.includes(profile.exceptValue)) {
        table.skipped.except++
        continue
      }
    }

    let fromId: EntityID | undefined
    let toId: EntityID | undefined
    let viaId: EntityID | undefined
    let viaWay = false
    for (const member of relation.members) {
      if (member.role === 'from' && member.type === 'way') fromId ??= member.id
      else if (member.role === 'to' && member.type === 'way') toId ??= member.id
      else if (member.role === 'via' && member.type === 'node') viaId ??= member.id
      else if (member.role === 'via' && member.type === 'way') viaWay = true
    }
    if (viaWay && viaId === undefined) {
      table.skipped['via-way']++
      continue
    }
    if (fromId === undefined || toId === undefined || viaId === undefined) {
      table.skipped['no-members']++
      continue
    }

    const from = lookup.way(fromId)
    const to = lookup.way(toId)
    const via = lookup.node(viaId)
    // An `only_*` onto a way the profile does not route still forbids every other exit: the router must not take them
    if (from === undefined || via === undefined || (to === undefined && !only)) {
      table.skipped['not-in-graph']++
      continue
    }

    const list = table.byVia.get(via) ?? []
    list.push({ from, to: to ?? NO_WAY, only })
    table.byVia.set(via, list)
    table.applied++
  }
  return table
}
