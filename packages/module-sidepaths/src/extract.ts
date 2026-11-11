/**
 * Extract one side of a road (cycle track, sidewalk, or both as one path) into a new way parallel to the road, and set
 * that side of the road to `separate`. Port of iD-Radnetz's `actionExtractSidepath` (FixMyBerlin, ISC); the tag logic is
 * TILDA's `planExtraction`. The new way has new nodes of its own: connecting it to the network is left to the mapper.
 */
import { type Action, type Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import {
  type ExtractVariant,
  type JoinSigns,
  planExtraction,
  reverseTags,
  type SignRecommend,
} from '@tilda-geo/bicycle-infrastructure-tagging'
import { type Loc, lineLengthMetres, offsetLine } from './geometry.ts'
import type { Side } from './side-tags.ts'

/** Ways shorter than this are not extracted */
const MIN_LENGTH_METRES = 2

/** The tags of the TILDA packages may hold `undefined` values: an OSM entity has only set keys */
export function definedTags(
  tags: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) if (value !== undefined) result[key] = value
  return result
}

/** What the traffic sign rules give the package; without them it reads no signs */
export type SignRules = { recommend?: SignRecommend; joinSigns?: JoinSigns }

export type SidepathExtraction = {
  wayTags: Record<string, string>
  roadTags: Record<string, string>
  /** Metres from the road's centerline */
  offsetMetres: number
  /** `bicycle` on the road was not changed because it has another value */
  keptBicycle: string | undefined
  /** The new way runs against the road (its bikes ride against the road): it is drawn reversed */
  reversed: boolean
}

/**
 * `planExtraction` of the package, plus: a new way whose bikes ride only against the road (`oneway=-1`,
 * `oneway:bicycle=-1`) is drawn the other way round with its side and direction tags turned, because TILDA ignores
 * `oneway=-1` (iD-Radnetz's rule).
 */
export function planSidepathExtraction(
  road: Readonly<Record<string, string>>,
  variant: ExtractVariant,
  side: Side,
  rules: SignRules = {},
): SidepathExtraction {
  const plan = planExtraction(road, variant, side, rules)
  const wayTags = definedTags(plan.wayTags)
  const reversed = wayTags.oneway === '-1' || wayTags['oneway:bicycle'] === '-1'
  return {
    wayTags: reversed ? definedTags(reverseTags(wayTags)) : wayTags,
    roadTags: definedTags(plan.roadTags),
    offsetMetres: plan.offsetMeters,
    keptBicycle: plan.keptBicycle,
    reversed,
  }
}

/** Why a road cannot be extracted */
export type ExtractRefusal = 'not_a_way' | 'closed' | 'incomplete' | 'too_short'

export function roadLocs(graph: Graph, way: OsmWay): Loc[] | undefined {
  const locs: Loc[] = []
  for (const id of way.nodes) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return undefined
    locs.push([node.loc[0], node.loc[1]])
  }
  return locs
}

export function extractRefusal(graph: Graph, roadId: string): ExtractRefusal | undefined {
  const road = graph.hasEntity(roadId)
  if (!(road instanceof OsmWay)) return 'not_a_way'
  if (road.isClosed()) return 'closed'
  const locs = roadLocs(graph, road)
  if (!locs) return 'incomplete'
  if (lineLengthMetres(locs) < MIN_LENGTH_METRES) return 'too_short'
  return undefined
}

export type ExtractAction = Action & {
  /** The id of the new way: known before it runs, so the selection and a merge can name it */
  wayId: string
}

/** The action. Only run it when `extractRefusal` gives nothing. */
export function actionExtractSidepath(
  graph: Graph,
  roadId: string,
  variant: ExtractVariant,
  side: Side,
  rules: SignRules = {},
): ExtractAction {
  // the new way's id is made here, once, so that a preview and the real run name the same way
  const way = new OsmWay(graph.context, { nodes: [], tags: {} })
  const action = ((g: Graph) => {
    const road = g.entity(roadId) as OsmWay
    const plan = planSidepathExtraction(road.tags, variant, side, rules)
    const offset = offsetLine(roadLocs(g, road)!, plan.offsetMetres, side)
    // in the road's direction, or against it where its bikes ride against the road (`oneway=yes` then)
    if (plan.reversed) offset.reverse()
    const nodes = offset.map((loc) => new OsmNode(g.context, { loc }))
    g.replace(nodes)
    g.replace(way.update({ nodes: nodes.map((node) => node.id), tags: plan.wayTags }))
    g.replace(road.update({ tags: plan.roadTags }))
    return g.commit()
  }) as ExtractAction
  action.wayId = way.id
  return action
}
