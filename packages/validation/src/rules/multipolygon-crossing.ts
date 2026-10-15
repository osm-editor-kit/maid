import { OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { properIntersection } from '../geo.ts'
import type { Point } from '../geo.ts'
import type { Issue, Rule } from '../types.ts'
import { createSegmentIndex, segmentsOf, sharesNode } from './crossing-segments.ts'
import type { Segment, SegmentEntry } from './crossing-segments.ts'

// Ported from iD's crossing_ways (ISC, © iD contributors), at commit 0194f3926: its `waysToCheck` takes a relation's
// outer and inner ways, which Maid's crossing_ways does not do. iD issue 7766 is about crossing rings that go unreported.
// The segments and the grid are the ones `crossing_ways` uses (`crossing-segments.ts`): a ring's segments are compared
// only with the segments of the rings before it, so a large area stays fast.
// Cut: a way crossing itself (a self-intersection), and any fix: the place is shown, and the person decides.

const rule = 'multipolygon_crossing'

/** A member way of the multipolygon that is a ring of its geometry: its role, and its segments */
type Ring = { way: OsmWay; role: string; segments: Segment[] }

/** One side of a crossing: the ring and the segment that crosses */
type Side = { ring: Ring; segment: Segment }

/** A crossing of two segments of two rings, at this point */
type Crossing = { point: Point; first: Side; second: Side }

/**
 * The member ways that make the geometry of a multipolygon: those with the role outer, inner, or none (as iD's
 * waysToCheck). A way that is not loaded is skipped, as is a way listed twice.
 */
function ringsOf(relation: OsmRelation, graph: Graph): Ring[] {
  const rings: Ring[] = []
  const seen = new Set<string>()
  for (const member of relation.members) {
    if (member.type !== 'way') continue
    const role = member.role || ''
    if (role !== '' && role !== 'outer' && role !== 'inner') continue
    if (seen.has(member.id)) continue
    seen.add(member.id)
    const way = graph.hasEntity(member.id)
    if (!(way instanceof OsmWay)) continue
    rings.push({ way, role, segments: segmentsOf(way, graph) })
  }
  return rings
}

/**
 * Every point where a segment of one ring crosses a segment of another, each pair of rings once. A ring is compared
 * with the rings before it, which are all in the index when it is checked: the index's box test selects the candidates.
 * Segments that share an end node are a junction, and a touch at an end point is not a proper crossing.
 */
function crossingsOf(rings: Ring[]): Crossing[] {
  const index = createSegmentIndex<Ring>()
  const candidates: SegmentEntry<Ring>[] = []
  const found: Crossing[] = []
  for (const ring of rings) {
    for (const segment of ring.segments) {
      index.near(segment.box, candidates)
      for (const entry of candidates) {
        const other = entry.segment
        if (sharesNode(segment, other)) continue
        const point = properIntersection(segment.a, segment.b, other.a, other.b)
        if (point)
          found.push({
            point,
            first: { ring: entry.owner, segment: other },
            second: { ring, segment },
          })
      }
    }
    index.add(ring, ring.segments)
  }
  return found
}

/** "the outer way w1", or "the way w1" for a member without a role */
function describe(ring: Ring) {
  return ring.role ? `the ${ring.role} way ${ring.way.id}` : `the way ${ring.way.id}`
}

/**
 * One issue per crossing, at the point. The sides are sorted by way id and the segments are named by their nodes, so
 * the id does not depend on the order of the members.
 */
function issueFor(relation: OsmRelation, crossing: Crossing): Issue {
  const swap = crossing.first.ring.way.id > crossing.second.ring.way.id
  const low = swap ? crossing.second : crossing.first
  const high = swap ? crossing.first : crossing.second
  const key = (side: Side) => `${side.ring.way.id}@${side.segment.from}-${side.segment.to}`
  return {
    id: `${rule}:${relation.id}:${key(low)}:${key(high)}`,
    rule,
    severity: 'warning',
    message: `${capitalized(describe(low.ring))} crosses ${describe(high.ring)} in the multipolygon ${relation.id}, so the area is broken`,
    entityIds: [relation.id, low.ring.way.id, high.ring.way.id],
    loc: crossing.point,
    fixes: [],
    data: {
      ways: [low.ring.way.id, high.ring.way.id],
      roles: [low.ring.role, high.ring.role],
    },
  }
}

function capitalized(text: string) {
  return `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`
}

/**
 * Crossing rings of a multipolygon: the outer and inner ways (and the ways without a role) whose segments cross
 * without a shared node, so the area has no defined inside. Checked on the relation: the validator checks the
 * relations of every changed way (`entitiesToValidate`), so a moved node reaches its multipolygon. Only the loaded
 * members are compared; an incomplete multipolygon gives nothing for the ways that are missing.
 */
export const multipolygonCrossing: Rule = {
  id: rule,
  label: 'Crossing multipolygon rings',
  validate(entity, { graph }) {
    if (!(entity instanceof OsmRelation) || !entity.isMultipolygon()) return []
    const rings = ringsOf(entity, graph)
    if (rings.length < 2) return []
    return crossingsOf(rings).map((crossing) => issueFor(entity, crossing))
  },
}
