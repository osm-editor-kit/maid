/**
 * What the climbing section reads from the data: the kind of a climbing feature, a crag's routes in member order, the
 * crags a route is in and the crags near it. Pure functions of the graph, no React.
 *
 * The model (iD's tagging schema, OpenClimbing, the wiki; docs/research/climbing.md, "Data model"):
 * area (`type=site`, `climbing=area`) → crags (`type=site`, `climbing=crag`, or a point) → routes (lines with
 * `climbing=route`, or start points with `climbing=route_bottom`). Roles are empty; the order of the members is the
 * order of the routes on the rock, left to right, as OpenClimbing numbers them.
 */
import {
  actionAddEntity,
  actionAddMember,
  type Graph,
  OsmNode,
  OsmRelation,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import { gradeOf, stylesOf, type Grade, type Style } from './grades.ts'

type Tags = Readonly<Record<string, string>>

export type ClimbingKind = 'area' | 'crag' | 'route' | 'route_bottom' | 'route_top'

/** The climbing kind of a feature from its tags, or undefined when it is none */
export function kindOf(tags: Tags): ClimbingKind | undefined {
  const value = tags.climbing
  if (
    value === 'area' ||
    value === 'crag' ||
    value === 'route' ||
    value === 'route_bottom' ||
    value === 'route_top'
  )
    return value
  // a route relation of the schema (`type=route`, `route=climbing`) is a route too
  if (tags.type === 'route' && tags.route === 'climbing') return 'route'
  return undefined
}

/** Whether a kind is a single route (a line, a start point, a route relation) */
export function isRoute(kind: ClimbingKind | undefined) {
  return kind === 'route' || kind === 'route_bottom'
}

export type RouteRow = {
  id: EntityID
  /** 1-based position in the crag, as the routes are numbered on a topo */
  number: number
  name: string | undefined
  grade: Grade | undefined
  length: string | undefined
  bolts: string | undefined
  styles: Style[]
  /** False when the member is not loaded */
  loaded: boolean
}

/** A crag's routes in member order. Members that are not routes (a photo point, a parking) are left out. */
export function cragRoutes(graph: Graph, crag: OsmRelation): RouteRow[] {
  const rows: RouteRow[] = []
  for (const member of crag.members) {
    const entity = graph.hasEntity(member.id)
    if (!entity) {
      rows.push({
        id: member.id,
        number: rows.length + 1,
        name: undefined,
        grade: undefined,
        length: undefined,
        bolts: undefined,
        styles: [],
        loaded: false,
      })
      continue
    }
    if (!isRoute(kindOf(entity.tags))) continue
    rows.push({
      id: entity.id,
      number: rows.length + 1,
      name: entity.tags.name,
      grade: gradeOf(entity.tags),
      length: entity.tags['climbing:length'],
      bolts: entity.tags['climbing:bolts'],
      styles: stylesOf(entity.tags),
      loaded: true,
    })
  }
  return rows
}

export type CragRow = { id: EntityID; name: string | undefined; routes: number }

/** An area's crags in member order, each with its number of routes */
export function areaCrags(graph: Graph, area: OsmRelation): CragRow[] {
  const rows: CragRow[] = []
  for (const member of area.members) {
    const entity = graph.hasEntity(member.id)
    if (!entity || kindOf(entity.tags) !== 'crag') continue
    const routes = entity instanceof OsmRelation ? cragRoutes(graph, entity).length : 0
    rows.push({ id: entity.id, name: entity.tags.name, routes })
  }
  return rows
}

/** The crags (and areas) a feature is a member of */
export function parentsOf(graph: Graph, id: EntityID, kind: 'crag' | 'area'): OsmRelation[] {
  const entity = graph.hasEntity(id)
  if (!entity) return []
  return graph.parentRelations(entity).filter((relation) => kindOf(relation.tags) === kind)
}

/** A point for a feature: a node's place, a way's first node (the foot of a route), a relation's first located member */
export function placeOf(graph: Graph, id: EntityID, depth = 0): [number, number] | undefined {
  const entity = graph.hasEntity(id)
  if (entity instanceof OsmNode) return entity.loc
  if (entity instanceof OsmWay) {
    const first = entity.nodes[0]
    return first ? placeOf(graph, first, depth + 1) : undefined
  }
  if (entity instanceof OsmRelation && depth < 3) {
    for (const member of entity.members) {
      const place = placeOf(graph, member.id, depth + 1)
      if (place) return place
    }
  }
  return undefined
}

/** Metres between two places (equirectangular: good enough within a crag) */
export function metresBetween(a: [number, number], b: [number, number]) {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const dx = (b[0] - a[0]) * Math.cos(lat) * 111_320
  const dy = (b[1] - a[1]) * 110_540
  return Math.hypot(dx, dy)
}

/** Every loaded relation with `climbing=<kind>`: the base data with the local edits over it */
export function loadedClimbingRelations(graph: Graph, kind: 'crag' | 'area'): OsmRelation[] {
  const result: OsmRelation[] = []
  for (const [id, entity] of graph.base.entities)
    if (
      entity instanceof OsmRelation &&
      !graph.local.entities.has(id) &&
      kindOf(entity.tags) === kind
    )
      result.push(entity)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmRelation && kindOf(entity.tags) === kind) result.push(entity)
  return result
}

export type NearbyCrag = { relation: OsmRelation; metres: number }

/** The loaded crag relations within `radius` metres of a feature, nearest first, not the ones it is in already */
export function nearbyCrags(graph: Graph, id: EntityID, radius = 500, limit = 5): NearbyCrag[] {
  const here = placeOf(graph, id)
  if (!here) return []
  const inside = new Set(parentsOf(graph, id, 'crag').map((crag) => crag.id))
  const result: NearbyCrag[] = []
  for (const relation of loadedClimbingRelations(graph, 'crag')) {
    if (inside.has(relation.id)) continue
    const there = placeOf(graph, relation.id)
    if (!there) continue
    const metres = metresBetween(here, there)
    if (metres <= radius) result.push({ relation, metres })
  }
  return result.sort((a, b) => a.metres - b.metres).slice(0, limit)
}

/** The member type of an entity id (`n1`, `w2`, `r3`) */
function memberType(id: EntityID): 'node' | 'way' | 'relation' {
  return id.startsWith('n') ? 'node' : id.startsWith('w') ? 'way' : 'relation'
}

/** Adds a route (or a crag) to the end of a crag (or an area): the next route on the rock, with an empty role */
export function addToRelationAction(relationId: EntityID, memberId: EntityID) {
  return actionAddMember(relationId, { id: memberId, type: memberType(memberId), role: '' })
}

/**
 * A new crag relation with this route as its first member, named after nothing yet (the person names it in the
 * inspector, where the new relation is selected). The tags are the schema's `type/site/climbing/crag` addTags.
 */
export function newCragActions(graph: Graph, memberId: EntityID) {
  const crag = new OsmRelation(graph.context, {
    tags: { type: 'site', site: 'climbing', climbing: 'crag', sport: 'climbing' },
  })
  return { crag, actions: [actionAddEntity(crag), addToRelationAction(crag.id, memberId)] }
}
