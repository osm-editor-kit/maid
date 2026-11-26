import { getLocale } from '@osm-editor-kit/maid-i18n'
/**
 * "Bike lane out of a segregated path" (tagging 0.9.0, `planLaneFromSegregatedPath`): a way mapped as a segregated
 * foot and cycle path that is really a sidewalk next to a painted bike lane on the carriageway. The way stays and
 * becomes `highway=footway` + `footway=sidewalk`; the lane becomes a line of its own between road and sidewalk
 * (`line`, the road gets `cycleway:<side>=separate`) or is tagged on the road (`centerline`). The road is the one the
 * package picks from the ways nearby (`pickSidepathRoad`), the side from the geometry (`wayPlacement`).
 */
import { type Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Operation, OperationChanges, OperationContext } from '@osm-editor-kit/maid-operations'
import {
  canPlanLaneFromSegregatedPath,
  isRoad,
  type LaneFromPathPlan,
  type LaneFromPathTarget,
  pickSidepathRoad,
  planLaneFromSegregatedPath,
  renderMessage,
  wayPlacement,
} from '@tilda-geo/bicycle-infrastructure-tagging'
import { locsOf, waysOf } from './find.ts'
import { distanceToLineMetres, type Loc, offsetLine } from './geometry.ts'
import { m } from './messages.ts'

/** Roads farther than this from the path are not looked at (the package's own limit is 25 m) */
const SEARCH_METRES = 30

type Found = {
  path: OsmWay
  pathLocs: Loc[]
  road: OsmWay
  side: 'left' | 'right'
  along: boolean
  /** Metres between the path's middle and the road line */
  apart: number
}

function pathOf(context: OperationContext): OsmWay | undefined {
  const [id] = context.selected
  if (context.selected.length !== 1 || !id?.startsWith('w')) return undefined
  const way = context.graph.hasEntity(id)
  return way instanceof OsmWay && !way.isClosed() && canPlanLaneFromSegregatedPath({ ...way.tags })
    ? way
    : undefined
}

/** The path, its road and where it lies; undefined when no road runs along it */
function find(graph: Graph, path: OsmWay): Found | undefined {
  const pathLocs = locsOf(graph, path)
  if (!pathLocs || pathLocs.length < 2) return undefined
  const roads: { id: string; tags: Record<string, string>; coords: Loc[] }[] = []
  for (const other of waysOf(graph)) {
    if (other.id === path.id || !isRoad({ ...other.tags })) continue
    const coords = locsOf(graph, other)
    if (!coords || coords.length < 2) continue
    if (Math.min(...pathLocs.map((loc) => distanceToLineMetres(loc, coords))) > SEARCH_METRES)
      continue
    roads.push({ id: other.id, tags: { ...other.tags }, coords })
  }
  const picked = pickSidepathRoad(pathLocs, roads)
  const placement = picked && wayPlacement(pathLocs, picked.coords)
  const road = picked && graph.hasEntity(picked.id)
  if (!picked || !placement || !(road instanceof OsmWay)) return undefined
  const middle = pathLocs[Math.floor(pathLocs.length / 2)]!
  return { path, pathLocs, road, ...placement, apart: distanceToLineMetres(middle, picked.coords) }
}

/** Found once per graph and path: the edit menu asks on every move of the pointer */
const cache = new WeakMap<Graph, Map<string, Found | undefined>>()

function cachedFind(graph: Graph, path: OsmWay): Found | undefined {
  let byPath = cache.get(graph)
  if (!byPath) {
    byPath = new Map()
    cache.set(graph, byPath)
  }
  if (!byPath.has(path.id)) byPath.set(path.id, find(graph, path))
  return byPath.get(path.id)
}

function planOf(found: Found, target: LaneFromPathTarget): LaneFromPathPlan {
  return planLaneFromSegregatedPath(
    { ...found.path.tags },
    { ...found.road.tags },
    {
      roadSide: found.side,
      pathAlongRoad: found.along,
      target,
    },
  )
}

const language = () => (getLocale() === 'de' ? 'de' : 'en')

function laneOperation(target: LaneFromPathTarget): Operation {
  const label = () =>
    target === 'line' ? m.lane_from_path_line_label() : m.lane_from_path_centerline_label()
  return {
    id: `lane-from-path-${target}`,
    get label() {
      return label()
    },
    icon: 'iD-operation-extract',
    group: 'structure',
    applies: (context) => pathOf(context) !== undefined,
    disabled: (context) => {
      const path = pathOf(context)
      if (!path) return undefined
      return cachedFind(context.graph, path) ? undefined : m.lane_from_path_no_road()
    },
    changes: (context): OperationChanges => {
      const path = pathOf(context)
      const found = path && cachedFind(context.graph, path)
      const title = label()
      if (!found) return { title, features: [], submit: title }
      const plan = planOf(found, target)
      const review = plan.review.map((message) => renderMessage(message, language()))
      return {
        title:
          review.length > 0 ? `${title}. ${m.lane_from_path_review()} ${review.join(' ')}` : title,
        features: [
          {
            id: found.path.id,
            label: m.lane_from_path_path(),
            before: found.path.tags,
            after: definedTags(plan.footwayTags),
          },
          {
            id: found.road.id,
            label: m.lane_from_path_road(),
            before: found.road.tags,
            after: definedTags(plan.roadTags),
          },
        ],
        submit: title,
      }
    },
    run: (context) => {
      const found = cachedFind(context.graph, pathOf(context)!)!
      const plan = planOf(found, target)
      const lane = new OsmWay(context.graph.context, { nodes: [], tags: {} })
      return {
        actions: [
          (graph: Graph) => {
            graph.replace(found.path.update({ tags: definedTags(plan.footwayTags) }))
            graph.replace(found.road.update({ tags: definedTags(plan.roadTags) }))
            if (target === 'line' && plan.laneTags) {
              // halfway between path and road line, on the road's side of the path, drawn as the road runs
              const towardRoad = found.along === (found.side === 'right') ? 'left' : 'right'
              const locs = offsetLine(found.pathLocs, found.apart / 2, towardRoad)
              if (!found.along) locs.reverse()
              const nodes = locs.map((loc) => new OsmNode(graph.context, { loc }))
              graph.replace(nodes)
              graph.replace(
                lane.update({
                  nodes: nodes.map((node) => node.id),
                  tags: definedTags(plan.laneTags),
                }),
              )
            }
            return graph.commit()
          },
        ],
        annotation: m.lane_from_path_annotation(),
        select: () => (target === 'line' ? [lane.id] : [found.path.id]),
      }
    },
  }
}

function definedTags(tags: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

export const laneFromPathOperations: readonly Operation[] = [
  laneOperation('line'),
  laneOperation('centerline'),
]
